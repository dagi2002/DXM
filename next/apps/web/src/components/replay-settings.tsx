/**
 * Replay sample rate for one site (task 13): the share of consented visits that get recorded.
 * Lazy-loaded in the site's Replays tab. Owners and admins change it; everyone else reads it.
 */
import type { Site } from '@pulse/contracts';
import type { Locale } from '@pulse/i18n';
import { formatMetric } from '@pulse/metrics';
import { Banner, Select } from '@pulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { siteQuery } from '../lib/queries';
import { Panel } from './pulse';

/** The offered rates, highest first. A site keeps any other stored value as its own option. */
export const SAMPLE_RATES = [1, 0.5, 0.25, 0.1, 0] as const;

export function sampleRateOptions(current: number, locale: Locale, off: string) {
  const rates = (SAMPLE_RATES as readonly number[]).includes(current)
    ? [...SAMPLE_RATES]
    : [...SAMPLE_RATES, current].sort((a, b) => b - a);
  return rates.map((r) => ({
    id: String(r),
    label: r === 0 ? off : formatMetric('replay_sample_rate', r, locale),
  }));
}

export default function ReplaySettings({
  orgId,
  site,
  canEdit,
}: {
  orgId: string;
  site: Site;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (replaySampleRate: number) =>
      api<{ site: Site }>(`/sites/${site.id}`, { method: 'PATCH', body: { replaySampleRate } }),
    onSuccess: async ({ site: updated }) => {
      qc.setQueryData(siteQuery(orgId, site.id).queryKey, updated);
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sites'], exact: true });
    },
  });
  const rate = save.variables !== undefined && save.isPending ? save.variables : site.replaySampleRate;
  const label =
    rate === 0
      ? t('replay.rate.offSentence')
      : t('replay.rate.sentence', { share: formatMetric('replay_sample_rate', rate, locale) });
  return (
    <Panel id="replay-settings" title={t('replay.rate.title')}>
      <p className="text-sm text-text-muted">{t('replay.rate.body')}</p>
      {canEdit ? (
        <Select
          label={t('replay.rate.label')}
          className="max-w-xs"
          options={sampleRateOptions(rate, locale, t('replay.rate.off'))}
          selectedKey={String(rate)}
          onSelectionChange={(k) => {
            const next = Number(k);
            if (next !== site.replaySampleRate) save.mutate(next);
          }}
        />
      ) : null}
      <p role="status" className="text-sm font-medium">
        {save.isSuccess ? `${t('common.saved')} · ` : ''}
        {label}
      </p>
      {save.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
    </Panel>
  );
}
