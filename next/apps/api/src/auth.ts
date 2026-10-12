import type { ServerEnv } from '@pulse/config';
import type { Db } from '@pulse/db';
import { eq, schema } from '@pulse/db';
import { isLocale, type Locale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization, twoFactor } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access';
import type { Mailer } from '@pulse/mail';

/** Header the API sets from the real socket/proxy chain; Better Auth trusts only this one. */
export const CLIENT_IP_HEADER = 'x-pulse-client-ip';

const ac = createAccessControl(defaultStatements);
/** Client viewers can see the sites shared with them and nothing else (ADR-004). */
const clientViewer = ac.newRole({ organization: [], member: [], invitation: [], team: [], ac: [] });

export const orgRoles = {
  owner: ac.newRole(ownerAc.statements),
  admin: ac.newRole(adminAc.statements),
  member: ac.newRole(memberAc.statements),
  client_viewer: clientViewer,
};

const asLocale = (v: unknown): Locale => (isLocale(v) ? v : 'en');

export function authOptions(deps: { db: Db; env: ServerEnv; mailer: Mailer }) {
  const { db, env, mailer } = deps;
  const isProd = env.NODE_ENV === 'production';

  return {
    appName: 'DXM Pulse',
    baseURL: env.API_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL, ...env.TRUSTED_ORIGINS],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    user: {
      additionalFields: {
        locale: { type: 'string', defaultValue: 'en', input: true },
        calendar: { type: 'string', defaultValue: 'gregorian', input: true },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days, sliding
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const locale = asLocale((user as { locale?: unknown }).locale);
        await mailer.send({
          to: user.email,
          subject: t(locale, 'email.reset.subject'),
          text: t(locale, 'email.reset.body', { url }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const locale = asLocale((user as { locale?: unknown }).locale);
        await mailer.send({
          to: user.email,
          subject: t(locale, 'email.verify.subject'),
          text: t(locale, 'email.verify.body', { url }),
        });
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    plugins: [
      organization({
        ac,
        roles: orgRoles,
        creatorRole: 'owner',
        invitationExpiresIn: 60 * 60 * 24 * 7,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
          const locale = asLocale((inviter.user as { locale?: unknown }).locale);
          const url = `${env.APP_URL}/accept-invitation/${id}`;
          await mailer.send({
            to: email,
            subject: t(locale, 'email.invite.subject', { inviter: inviter.user.name, org: org.name }),
            text: t(locale, 'email.invite.body', { org: org.name, url }),
          });
        },
      }),
      twoFactor({
        issuer: 'DXM Pulse',
        // 30 s TOTP, 6 digits (authenticator-app defaults). Setup is only "on" after the first
        // code verifies, so a half-finished enrollment can't lock anyone out.
        backupCodeOptions: { amount: 10, length: 10 },
        twoFactorCookieMaxAge: 60 * 10,
        trustDeviceMaxAge: 60 * 60 * 24 * 30,
      }),
      magicLink({
        expiresIn: 60 * 10,
        sendMagicLink: async ({ email, url }) => {
          // A magic link proves only the inbox. For accounts with two-factor on, that would skip the
          // second factor, so we send a "use your password and code" note instead. The HTTP response
          // is identical either way, so this reveals nothing about the account.
          const [owner] = await db
            .select({ twoFactorEnabled: schema.user.twoFactorEnabled, locale: schema.user.locale })
            .from(schema.user)
            .where(eq(schema.user.email, email.toLowerCase()))
            .limit(1);
          if (owner?.twoFactorEnabled) {
            const locale = asLocale(owner.locale);
            await mailer.send({
              to: email,
              subject: t(locale, 'email.magic2fa.subject'),
              text: t(locale, 'email.magic2fa.body', { url: `${env.APP_URL}/sign-in` }),
            });
            return;
          }
          // The recipient may not have an account yet; English with Amharic follow-up is a v1.x item.
          await mailer.send({
            to: email,
            subject: t('en', 'email.magic.subject'),
            text: t('en', 'email.magic.body', { url }),
          });
        },
      }),
    ],
    rateLimit: {
      enabled: env.NODE_ENV !== 'test',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 5 },
        '/sign-in/magic-link': { window: 60, max: 5 },
        // A 6-digit code has 10^6 values: keep guessing slow (the plugin also locks the account
        // after 10 consecutive failures and burns a challenge after 5).
        '/two-factor/verify-totp': { window: 60, max: 10 },
        '/two-factor/verify-backup-code': { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: 'pulse',
      useSecureCookies: isProd,
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

export function createAuth(deps: { db: Db; env: ServerEnv; mailer: Mailer }) {
  return betterAuth(authOptions(deps));
}

export type Auth = ReturnType<typeof createAuth>;
