/**
 * AI recap of one recording (task 13). Rendered only when /public-config says AI is on, and
 * lazy-loaded. Nothing is generated until someone asks: the recap costs from the org's monthly
 * AI budget. Every state is said plainly; nothing is ever made up when the model can't answer.
 */
import type { ReplayRecap } from '@pulse/contracts';
import type { Locale } from '@pulse/i18n';
import { Button, Skeleton } from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { AiBox } from './pulse';

export default function ReplayRecapPanel({
  orgId,
  replayId,
  siteId,
}: {
  orgId: string;
  replayId: string;
  siteId: string;
}) {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'am' ? 'am' : 'en';
  const qc = useQueryClient();
  const key = ['orgs', orgId, 'replays', 'detail', replayId, 'recap', siteId, locale];
  const path = `/replays/${encodeURIComponent(replayId)}/recap?siteId=${encodeURIComponent(siteId)}`;
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<ReplayRecap>(`${path}&locale=${locale}`, { signal }),
    staleTime: Infinity,
  });
  const write = useMutation({
    mutationFn: () => api<ReplayRecap>(path, { body: { locale } }),
    onSuccess: (res) => qc.setQueryData(key, res),
  });
  const recap = write.data ?? data;
  // AI off on the server (or the flag flipped since the page loaded): show nothing at all.
  if (recap?.status === 'disabled') return null;

  return (
    <section aria-labelledby="recap" className="rounded-lg border border-border bg-surface p-5">
      <h2 id="recap" className="sr-only">
        {t('replay.recap')}
      </h2>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : recap?.status === 'ready' && recap.recap ? (
        <AiBox title={t('replay.recap')}>
          <p lang={recap.recap.locale}>{recap.recap.text}</p>
          <p className="mt-2 text-[0.8125rem] text-text-muted">{t('replay.recap.note')}</p>
        </AiBox>
      ) : (
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ai">
            <Sparkles size={14} aria-hidden="true" />
            {t('replay.recap')}
          </p>
          <p className="text-sm text-text-muted">
            {recap?.status === 'over_budget'
              ? t('replay.recap.overBudget')
              : recap?.status === 'unavailable' || isError || write.isError
                ? t('replay.recap.unavailable')
                : t('replay.recap.intro')}
          </p>
          {recap?.status !== 'over_budget' ? (
            <div>
              <Button
                variant="secondary"
                onPress={() => write.mutate()}
                isPending={write.isPending}
                pendingLabel={t('replay.recap.writing')}
              >
                {t('replay.recap.write')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
