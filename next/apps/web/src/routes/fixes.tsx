import type { Locale } from '@pulse/i18n';
import { formatMetric } from '@pulse/metrics';
import { Button, EmptyState, PageHeader, Skeleton, buttonClass, cx } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Mail, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiBox, Panel, ReplayPhone, SamplePill, SeverityPill, scrollRegionClass } from '../components/pulse';
import { sampleFixesQuery, type FixStatus } from '../lib/sample';
import { useSetFixStatus } from './today';

const FLOW: FixStatus[] = ['open', 'fixing', 'fixed', 'verified'];
const NEXT: Partial<Record<FixStatus, FixStatus>> = { open: 'fixing', fixing: 'fixed', fixed: 'verified' };

export function FixDetailPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const navigate = useNavigate();
  const { fixId } = useParams({ strict: false }) as { fixId: string };
  const { data: fixes, isLoading } = useQuery(sampleFixesQuery);
  const setStatus = useSetFixStatus();
  const fix = fixes?.find((f) => f.id === fixId);
  const stepsRef = useRef<HTMLOListElement>(null);
  const [announcement, setAnnouncement] = useState('');
  /** Advance the workflow, announce it, and keep focus on the page when the button goes away. */
  const advance = (id: string, to: FixStatus) => {
    setStatus(id, to);
    setAnnouncement(t('fix.statusNow', { status: t(`fix.status.${to}`) }));
    if (!NEXT[to]) requestAnimationFrame(() => stepsRef.current?.focus());
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (!fix) {
    return (
      <EmptyState
        title={t('errors.notFound.title')}
        body={t('errors.notFound.body')}
        action={<Button onPress={() => navigate({ to: '/today' })}>{t('nav.today')}</Button>}
      />
    );
  }
  const next = NEXT[fix.status];
  const step = FLOW.indexOf(fix.status);

  return (
    <>
      <nav aria-label={t('common.breadcrumb')} className="mb-4 flex flex-wrap gap-2 text-sm text-text-muted">
        <Link
          to="/today"
          className="-my-3 inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        >
          {t('nav.today')}
        </Link>
        <span aria-hidden="true">/</span>
        <span lang="en">{fix.site}</span>
        <span aria-hidden="true">/</span>
        <span className="text-text">{t('fix.number', { number: fix.number })}</span>
      </nav>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
            <SeverityPill severity={fix.severity} />
            <span lang="en">
              {fix.kind} · {fix.page} · {t('fix.firstSeen', { when: fix.firstSeen })}
            </span>
          </span>
        }
        title={fix.title}
        summary={fix.detail ?? fix.summary}
        actions={<SamplePill />}
      />

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ol
        ref={stepsRef}
        tabIndex={-1}
        aria-label={t('fix.statusLabel')}
        className="-mt-2 mb-8 flex flex-wrap items-center gap-2 rounded-md outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        {FLOW.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true" className="h-px w-6 bg-border-strong" /> : null}
            <span
              aria-current={s === fix.status ? 'step' : undefined}
              className={cx(
                'inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm',
                s === fix.status
                  ? 'bg-text font-semibold text-bg'
                  : i < step
                    ? 'border border-good text-good'
                    : 'border border-border text-text-muted',
              )}
            >
              {s === fix.status ? (
                <span
                  aria-hidden="true"
                  className={cx('size-2 rounded-full', fix.severity === 'critical' ? 'bg-bad' : 'bg-warn')}
                />
              ) : null}
              {t(`fix.status.${s}`)}
            </span>
          </li>
        ))}
        {fix.status === 'dismissed' ? (
          <li className="text-sm text-text-muted">· {t('fix.status.dismissed')}</li>
        ) : null}
      </ol>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4">
          <h2 className="text-[1.0625rem] font-semibold">{t('fix.evidence')}</h2>
          {fix.clip ? (
            <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface p-5">
              <div className="rounded-[22px] border-[6px] border-neutral-900 bg-neutral-900">
                <ReplayPhone scale={0.75} label={t('replay.phoneLabel')} />
              </div>
              <div className="grid min-w-[16rem] flex-1 gap-3">
                <span className="text-[0.8125rem] text-text-muted">{fix.clip.caption}</span>
                <p className="text-[0.9375rem] leading-relaxed">{fix.clip.story}</p>
                <div className="flex flex-wrap gap-2">
                  {fix.replayIds[0] ? (
                    <Link
                      to="/replays/$replayId"
                      params={{ replayId: fix.replayIds[0] }}
                      className={buttonClass('primary')}
                    >
                      <Play size={16} aria-hidden="true" />
                      {t('fix.playMoment')}
                    </Link>
                  ) : null}
                  {fix.replayIds[1] ? (
                    <Link
                      to="/replays/$replayId"
                      params={{ replayId: fix.replayIds[1] }}
                      className={buttonClass('secondary')}
                    >
                      {t('fix.nextClip', { n: 2, total: fix.replayIds.length })}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong p-6 text-sm text-text-muted">
              {fix.summary}
            </p>
          )}

          {fix.visits?.length ? (
            <section
              aria-labelledby="affected"
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
                <h2 id="affected" className="text-[0.9375rem] font-semibold">
                  {t('fix.affectedVisits')}
                </h2>
                <span className="text-[0.8125rem] text-text-muted">
                  {t('fix.affectedCount', {
                    total: fix.affectedToday ?? fix.visits.length,
                    shown: fix.visits.length,
                  })}
                </span>
              </div>
              {/* Scrollable at 360px, so it must be reachable and named for keyboard users. */}
              <div className={scrollRegionClass} tabIndex={0} role="region" aria-labelledby="affected">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[0.8125rem] text-text-muted">
                      <th scope="col" className="px-5 py-2.5 font-medium">
                        {t('fix.col.time')}
                      </th>
                      <th scope="col" className="px-2.5 py-2.5 font-medium">
                        {t('fix.col.device')}
                      </th>
                      <th scope="col" className="px-2.5 py-2.5 font-medium">
                        {t('fix.col.network')}
                      </th>
                      <th scope="col" className="px-2.5 py-2.5 font-medium">
                        {t('fix.col.taps')}
                      </th>
                      <th scope="col" className="px-5 py-2.5 font-medium">
                        {t('fix.col.outcome')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fix.visits.map((v) => (
                      <tr key={v.time} className="border-t border-border">
                        <td className="px-5 py-3 tabular-nums">{v.time}</td>
                        <td className="px-2.5 py-3" lang="en">
                          {v.device}
                        </td>
                        <td className="px-2.5 py-3">{v.network}</td>
                        <td className="px-2.5 py-3 tabular-nums">{v.taps}</td>
                        <td
                          className={cx(
                            'px-5 py-3 font-medium',
                            v.outcome === 'left' ? 'text-bad' : 'text-good',
                          )}
                        >
                          {t(`fix.outcome.${v.outcome}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-6">
          {fix.impact ? (
            <Panel>
              <span className="-mb-3 text-[0.8125rem] text-text-muted">{t('fix.impact')}</span>
              <span className="font-display text-[1.875rem] leading-tight font-bold tracking-[-0.02em]">
                {t('fix.perDay', {
                  amount: formatMetric('revenue_at_risk', fix.impact.revenuePerDay, locale),
                })}
              </span>
              <p className="-mt-2 text-[0.8125rem] leading-relaxed text-text-muted">
                {t('fix.impactMath', {
                  orders: fix.impact.ordersPerDay,
                  amount: formatMetric('revenue_at_risk', fix.impact.averageOrder, locale),
                })}{' '}
                {fix.impact.basis}
              </p>
            </Panel>
          ) : null}
          {fix.suggestion ? (
            <AiBox title={t('fix.suggested')} className="p-5">
              <p>{fix.suggestion.text}</p>
              {fix.suggestion.code ? (
                <pre
                  tabIndex={0}
                  lang="en"
                  dir="ltr"
                  aria-label={t('fix.suggested')}
                  className="mt-3 overflow-x-auto rounded-md bg-surface p-3 font-mono text-[0.8125rem] leading-relaxed outline-none focus-visible:outline-3 focus-visible:outline-primary"
                >
                  {fix.suggestion.code}
                </pre>
              ) : null}
              <p className="mt-2 text-[0.8125rem] text-text-muted">{fix.suggestion.basis}</p>
            </AiBox>
          ) : null}
          <Panel title={t('fix.nextStep')} id="next-step">
            {next ? (
              <Button className="min-h-12 text-[0.9375rem]" onPress={() => advance(fix.id, next)}>
                {t(`fix.mark.${next}`)}
              </Button>
            ) : null}
            <Button variant="secondary">
              <Mail size={16} aria-hidden="true" />
              {t('fix.sendDeveloper')}
            </Button>
            <p className="text-[0.8125rem] leading-relaxed text-text-muted">{t('fix.verifyExplainer')}</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
