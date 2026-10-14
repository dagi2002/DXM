import type { FixStatus } from '@pulse/contracts/constants';
import { Banner, Button, EmptyState, PageHeader, Skeleton, buttonClass, cx } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Mail, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiBox, Panel, SeverityPill } from '../components/pulse';
import { fixQuery, fixesQuery, useFixView, useSetFixStatus, type FixView as Fix } from '../lib/fixes';
import { useMe } from '../lib/queries';

const FLOW: FixStatus[] = ['open', 'fixing', 'fixed', 'verified'];
const NEXT: Partial<Record<FixStatus, FixStatus>> = { open: 'fixing', fixing: 'fixed', fixed: 'verified' };

export function FixDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { fixId } = useParams({ strict: false }) as { fixId: string };
  const { orgId } = useMe();
  const toView = useFixView();
  const feed = useQuery(fixesQuery(orgId));
  // Loaded by id (the feed is capped); the feed holds the optimistic status right after a click.
  const detail = useQuery({ ...fixQuery(orgId, fixId), retry: false });
  const setStatus = useSetFixStatus();
  let fix: Fix | undefined;
  if (detail.data) {
    const listed = feed.data?.find((f) => f.id === fixId);
    fix = { ...toView(detail.data.fix), status: listed?.status ?? detail.data.fix.status };
  }
  const isLoading = detail.isLoading;
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
            <span>
              {fix.kind} · {fix.page ? <span lang="en">{fix.page} · </span> : null}
              {t('fix.firstSeen', { when: fix.firstSeen })}
            </span>
          </span>
        }
        title={fix.title}
        summary={fix.summary}
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
          {fix.verifyNote ? <Banner tone="info" title={fix.verifyNote} /> : null}
          {fix.verified ? (
            <div className="grid gap-1 rounded-lg bg-good-bg p-5">
              <span className="text-[0.8125rem] font-semibold text-good">
                {t('fix.verifiedWhen', { when: fix.verified.when })}
              </span>
              <span className="text-[1.0625rem] font-semibold">{fix.verified.label}</span>
              <span className="text-sm">
                {t('fix.verify.result', { before: fix.verified.before, after: fix.verified.after })}
              </span>
            </div>
          ) : null}
          <div className="grid gap-3 rounded-lg border border-border bg-surface p-5">
            <p className="text-[0.9375rem] leading-relaxed">{fix.summary}</p>
            {fix.chips.length ? (
              <ul className="flex flex-wrap gap-2" aria-label={t('fix.evidence')}>
                {fix.chips.map((c) => (
                  <li key={c} className="rounded-sm bg-surface-sunken px-2.5 py-1.5 text-[0.8125rem]">
                    {c}
                  </li>
                ))}
              </ul>
            ) : null}
            {fix.replayIds[0] ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/replays/$replayId"
                  params={{ replayId: fix.replayIds[0] }}
                  className={buttonClass('primary')}
                >
                  <Play size={16} aria-hidden="true" />
                  {t('fix.playMoment')}
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-6">
          {fix.impact ? (
            <Panel>
              <span className="-mb-3 text-[0.8125rem] text-text-muted">{t('fix.impact')}</span>
              <span className="font-display text-[1.875rem] leading-tight font-bold tracking-[-0.02em]">
                {t('fix.impact.visitors', { count: fix.impact.visitsPerDay })}
              </span>
              <p className="-mt-2 text-[0.8125rem] leading-relaxed text-text-muted">
                {t('fix.impact.left', { count: fix.impact.leftPerDay })}{' '}
                {t('fix.impact.basis', { hours: fix.impact.hours })}
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
              <p className="mt-2 text-[0.8125rem] text-text-muted">{t('fix.suggested.basis')}</p>
            </AiBox>
          ) : null}
          <Panel title={t('fix.nextStep')} id="next-step">
            {setStatus.error ? <Banner tone="bad" title={t('fix.statusError')} /> : null}
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
