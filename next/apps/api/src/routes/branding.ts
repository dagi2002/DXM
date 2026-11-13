import { randomBytes } from 'node:crypto';
import {
  BrandingUpdate,
  LOGO_MAX_BYTES,
  canManage,
  canWorkOnReports,
  sniffLogoType,
  type LogoType,
  type OrgBranding,
  type ReportBrand,
} from '@pulse/contracts';
import { auditLog, eq, newId, orgBranding, sql, withOrg, type OrgBrandingRow, type Tx } from '@pulse/db';
import { assertKey, type BlobStore } from '@pulse/storage';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';

/**
 * Report branding (task 13): the agency name and logo on client reports and share links.
 *
 * Logos are uploaded as the raw request body, capped at LOGO_MAX_BYTES while streaming, and their
 * type is read from the bytes (PNG, JPEG or WebP; never SVG). They live in the BlobStore under
 * the org's own prefix and are only ever served through these routes: the signed-in org's own
 * logo here, and a share link's logo on the public route (scoped by the token).
 */

export const LOGO_PATH = '/api/v1/branding/logo';
const EXT: Record<LogoType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** `orgs/{org}/branding/logo_{random}.{ext}` — a fresh key per upload, so caches never go stale. */
export function logoObjectKey(orgId: string, type: LogoType) {
  const key = `orgs/${orgId}/branding/logo_${randomBytes(8).toString('hex')}.${EXT[type]}`;
  assertKey(key);
  return key;
}

const version = (d: Date | null) => (d ? d.getTime().toString(36) : '0');

export function toBranding(row: OrgBrandingRow | undefined): OrgBranding {
  return {
    agencyName: row?.agencyName ?? null,
    logo:
      row?.logoKey && row.logoType && row.logoBytes
        ? { url: `${LOGO_PATH}?v=${version(row.logoUpdatedAt)}`, type: row.logoType, bytes: row.logoBytes }
        : null,
  };
}

/** What a report shows, or null when the org has no branding. */
export function toReportBrand(
  b: { agencyName: string | null; hasLogo: boolean; logoUpdatedAt: Date | null } | undefined,
  logoPath: string,
): ReportBrand | null {
  if (!b || (!b.agencyName && !b.hasLogo)) return null;
  return {
    agencyName: b.agencyName,
    logoUrl: b.hasLogo ? `${logoPath}?v=${version(b.logoUpdatedAt)}` : null,
  };
}

export async function loadBranding(tx: Tx) {
  const [row] = await tx.select().from(orgBranding).limit(1);
  return row;
}

/** Serves logo bytes with the stored, checked type. Nothing is sniffed by the browser. */
export function sendLogo(c: Context<AppEnv>, data: Uint8Array, type: string, cacheControl: string) {
  c.header('content-type', type);
  c.header('cache-control', cacheControl);
  c.header('x-content-type-options', 'nosniff');
  c.header('content-disposition', 'inline');
  // The API's default CSP is `default-src 'none'`: an image needs nothing more.
  return c.body(data as Uint8Array<ArrayBuffer>);
}

export function brandingRoutes(deps: AppDeps & { blobs: BlobStore }) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps));

  const audit = (tx: Tx, c: Context<AppEnv>, action: string, metadata = {}) =>
    tx.insert(auditLog).values({
      id: newId('aud'),
      orgId: c.get('orgId')!,
      actorUserId: c.get('user')!.id,
      action,
      targetType: 'organization',
      targetId: c.get('orgId')!,
      metadata,
      ip: c.get('clientIp'),
    });

  /** Reports are the team's: client viewers see branding on share links only. */
  r.get('/', async (c) => {
    if (!canWorkOnReports(c.get('role'))) throw forbidden();
    const row = await withOrg(deps.db, c.get('orgId')!, loadBranding);
    return c.json(toBranding(row));
  });

  r.put('/', async (c) => {
    if (!canManage(c.get('role'))) throw forbidden();
    const { agencyName } = BrandingUpdate.parse(await c.req.json());
    const orgId = c.get('orgId')!;
    const row = await withOrg(deps.db, orgId, async (tx) => {
      const [saved] = await tx
        .insert(orgBranding)
        .values({ orgId, agencyName })
        .onConflictDoUpdate({ target: orgBranding.orgId, set: { agencyName, updatedAt: new Date() } })
        .returning();
      await audit(tx, c, 'branding.update', { agencyName });
      return saved;
    });
    return c.json(toBranding(row));
  });

  r.get('/logo', async (c) => {
    if (!canWorkOnReports(c.get('role'))) throw forbidden();
    const row = await withOrg(deps.db, c.get('orgId')!, loadBranding);
    if (!row?.logoKey || !row.logoType) throw notFound('Logo');
    const data = await deps.blobs.get(row.logoKey);
    if (!data) throw notFound('Logo');
    return sendLogo(c, data, row.logoType, 'private, max-age=86400');
  });

  r.put(
    '/logo',
    bodyLimit({
      maxSize: LOGO_MAX_BYTES,
      onError: () => {
        throw new ApiError(413, 'payload_too_large', 'Logo is too large', { maxBytes: LOGO_MAX_BYTES });
      },
    }),
    async (c) => {
      if (!canManage(c.get('role'))) throw forbidden();
      const data = new Uint8Array(await c.req.arrayBuffer());
      if (data.byteLength === 0) throw new ApiError(400, 'bad_request', 'Send the logo as the request body');
      if (data.byteLength > LOGO_MAX_BYTES)
        throw new ApiError(413, 'payload_too_large', 'Logo is too large', { maxBytes: LOGO_MAX_BYTES });
      const type = sniffLogoType(data);
      if (!type)
        throw new ApiError(415, 'unsupported_media_type', 'Logo must be a PNG, JPEG or WebP image', {
          types: ['image/png', 'image/jpeg', 'image/webp'],
        });
      const orgId = c.get('orgId')!;
      const key = logoObjectKey(orgId, type);
      await deps.blobs.put(key, data);
      let previous: string | null = null;
      try {
        const row = await withOrg(deps.db, orgId, async (tx) => {
          const before = await loadBranding(tx);
          previous = before?.logoKey ?? null;
          const now = new Date();
          const logo = { logoKey: key, logoType: type, logoBytes: data.byteLength, logoUpdatedAt: now };
          const [saved] = await tx
            .insert(orgBranding)
            .values({ orgId, ...logo })
            .onConflictDoUpdate({ target: orgBranding.orgId, set: { ...logo, updatedAt: now } })
            .returning();
          await audit(tx, c, 'branding.logo', { type, bytes: data.byteLength });
          return saved;
        });
        if (previous && previous !== key) await deps.blobs.delete(previous).catch(() => undefined);
        return c.json(toBranding(row));
      } catch (err) {
        await deps.blobs.delete(key).catch(() => undefined);
        throw err;
      }
    },
  );

  r.delete('/logo', async (c) => {
    if (!canManage(c.get('role'))) throw forbidden();
    const orgId = c.get('orgId')!;
    const { row, previous } = await withOrg(deps.db, orgId, async (tx) => {
      const before = await loadBranding(tx);
      if (!before?.logoKey) return { row: before, previous: null };
      const [saved] = await tx
        .update(orgBranding)
        .set({ logoKey: null, logoType: null, logoBytes: null, logoUpdatedAt: null, updatedAt: new Date() })
        .where(eq(orgBranding.orgId, orgId))
        .returning();
      await audit(tx, c, 'branding.logo_removed');
      return { row: saved, previous: before.logoKey };
    });
    if (previous) await deps.blobs.delete(previous).catch(() => undefined);
    return c.json(toBranding(row));
  });

  return r;
}

/** Branding for one share link (SECURITY DEFINER: reads across orgs, but only for this hash). */
export async function sharedBrand(db: AppDeps['db'], tokenHash: string) {
  const res = await db.execute<{
    agency_name: string | null;
    logo_key: string | null;
    logo_type: string | null;
    logo_updated_at: Date | string | null;
  }>(sql`select * from pulse_shared_report_brand(${tokenHash})`);
  return res.rows[0];
}
