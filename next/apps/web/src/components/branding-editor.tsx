/**
 * Report branding (task 13): the agency name and logo on client reports and their share links.
 * Lazy-loaded in Settings → Organization. Owners and admins edit; members see what's set.
 */
import { LOGO_MAX_BYTES, LOGO_TYPES, type OrgBranding } from '@pulse/contracts';
import { canManage, type Role } from '@pulse/contracts/constants';
import { Banner, Button, Skeleton, TextField } from '@pulse/ui';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Panel } from './pulse';

export const brandingQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'branding'],
    queryFn: ({ signal }) => api<OrgBranding>('/branding', { signal }),
  });

export type LogoProblem = 'type' | 'size' | undefined;

/** The same limits the API enforces, checked before uploading so people hear about them sooner. */
export function logoProblem(file: { type: string; size: number }): LogoProblem {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > LOGO_MAX_BYTES || file.size === 0) return 'size';
  return undefined;
}

async function uploadLogo(file: File): Promise<OrgBranding> {
  const res = await fetch('/api/v1/branding/logo', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': file.type },
    body: file,
  });
  const body = (await res.json().catch(() => null)) as
    (OrgBranding & { error?: { code: ApiError['code']; message: string } }) | null;
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'internal', body?.error?.message ?? '');
  return body as OrgBranding;
}

const KB = 1024;

export default function BrandingEditor({ orgId, role }: { orgId: string; role: Role }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const manage = canManage(role);
  const { data, isLoading, isError } = useQuery(brandingQuery(orgId));
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<LogoProblem | 'server'>();
  const set = (b: OrgBranding) => qc.setQueryData(brandingQuery(orgId).queryKey, b);

  const saveName = useMutation({
    mutationFn: (agencyName: string) =>
      api<OrgBranding>('/branding', { method: 'PUT', body: { agencyName } }),
    onSuccess: (b) => {
      set(b);
      setName(null);
      void qc.invalidateQueries({ queryKey: ['orgs', orgId, 'reports'] });
    },
  });
  const logo = useMutation({
    mutationFn: uploadLogo,
    onSuccess: (b) => {
      set(b);
      void qc.invalidateQueries({ queryKey: ['orgs', orgId, 'reports'] });
    },
    onError: (err) =>
      setProblem(
        err instanceof ApiError && err.status === 413
          ? 'size'
          : err instanceof ApiError && err.status === 415
            ? 'type'
            : 'server',
      ),
  });
  const removeLogo = useMutation({
    mutationFn: () => api<OrgBranding>('/branding/logo', { method: 'DELETE' }),
    onSuccess: (b) => {
      set(b);
      void qc.invalidateQueries({ queryKey: ['orgs', orgId, 'reports'] });
    },
  });

  if (isLoading) return <Skeleton className="h-48" />;
  if (isError || !data) return <Banner tone="bad" title={t('errors.generic.body')} />;
  const value = name ?? data.agencyName ?? '';
  const limits = t('branding.logo.limits', { kb: LOGO_MAX_BYTES / KB });

  return (
    <Panel id="settings-branding" title={t('branding.title')}>
      <p className="max-w-prose text-sm text-text-muted">{t('branding.body')}</p>
      <form
        className="grid max-w-md gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveName.mutate(value);
        }}
      >
        {saveName.isSuccess ? <Banner tone="good" title={t('common.saved')} /> : null}
        {saveName.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
        <TextField
          label={t('branding.agencyName')}
          description={t('branding.agencyName.hint')}
          value={value}
          onChange={setName}
          maxLength={80}
          isDisabled={!manage}
        />
        {manage ? (
          <div>
            <Button
              type="submit"
              variant="secondary"
              isPending={saveName.isPending}
              pendingLabel={t('common.saving')}
              isDisabled={value.trim() === (data.agencyName ?? '')}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : null}
      </form>

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold">{t('branding.logo')}</h3>
        {data.logo ? (
          <div className="flex w-fit items-center rounded-md border border-border bg-surface p-3">
            <img
              src={data.logo.url}
              alt={t('branding.logo.alt')}
              className="max-h-16 max-w-48 object-contain"
            />
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t('branding.logo.none')}</p>
        )}
        <p className="text-[0.8125rem] text-text-muted">{limits}</p>
        <div role="status">
          {problem ? (
            <Banner
              tone="bad"
              title={
                problem === 'type'
                  ? t('branding.logo.badType')
                  : problem === 'size'
                    ? t('branding.logo.tooBig', { kb: LOGO_MAX_BYTES / KB })
                    : t('errors.generic.body')
              }
            />
          ) : logo.isSuccess ? (
            <Banner tone="good" title={t('branding.logo.saved')} />
          ) : null}
        </div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            <FileTrigger
              acceptedFileTypes={[...LOGO_TYPES]}
              onSelect={(files) => {
                const file = files?.[0];
                if (!file) return;
                const p = logoProblem(file);
                setProblem(p);
                if (!p) logo.mutate(file);
              }}
            >
              <Button
                variant="secondary"
                isPending={logo.isPending}
                pendingLabel={t('branding.logo.uploading')}
              >
                <ImageUp size={16} aria-hidden="true" />
                {data.logo ? t('branding.logo.replace') : t('branding.logo.upload')}
              </Button>
            </FileTrigger>
            {data.logo ? (
              <Button
                variant="danger-ghost"
                onPress={() => {
                  setProblem(undefined);
                  removeLogo.mutate();
                }}
                isPending={removeLogo.isPending}
                pendingLabel={t('common.saving')}
              >
                <Trash2 size={16} aria-hidden="true" />
                {t('branding.logo.remove')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
