import { Button, EmptyState, IconButton, PageHeader, Skeleton, buttonClass, cx } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiBox, ReplayPhone, SamplePill } from '../components/pulse';
import { sampleReplaysQuery, type Replay } from '../lib/sample';

export function ReplayList({ replays }: { replays: Replay[] }) {
  const { t } = useTranslation();
  if (replays.length === 0) {
    return (
      <EmptyState
        icon={<Play size={22} aria-hidden="true" />}
        title={t('replays.empty')}
        action={
          <Link to="/sites" className={buttonClass()}>
            {t('replays.empty.action')}
          </Link>
        }
      />
    );
  }
  return (
    <ul className="grid gap-3">
      {replays.map((r) => (
        <li key={r.id}>
          <Link
            to="/replays/$replayId"
            params={{ replayId: r.id }}
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 outline-none transition-colors hover:border-border-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
          >
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
            >
              <Play size={18} />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-semibold">{r.title}</span>
              <span className="truncate text-sm text-text-muted" lang="en">
                {r.site} · {r.device} · {r.network} · {r.duration}
              </span>
              <span className="truncate text-sm text-ai">{r.recap.headline}</span>
            </span>
            {r.frictionAt.length ? (
              <span className="hidden shrink-0 rounded-full bg-bad-bg px-2.5 py-1 text-[0.8125rem] font-semibold text-bad sm:inline">
                {t('replay.frictionCount', { count: r.frictionAt.length })}
              </span>
            ) : null}
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ReplaysPage() {
  const { t } = useTranslation();
  const { data: replays, isLoading } = useQuery(sampleReplaysQuery);
  return (
    <>
      <PageHeader
        eyebrow={t('nav.replays')}
        title={t('replays.headline', { count: replays?.length ?? 0 })}
        summary={t('replays.intro')}
        actions={<SamplePill />}
      />
      {isLoading || !replays ? <Skeleton className="h-64" /> : <ReplayList replays={replays} />}
    </>
  );
}

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function ReplayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { replayId } = useParams({ strict: false }) as { replayId: string };
  const { data: replays, isLoading } = useQuery(sampleReplaysQuery);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipIdle, setSkipIdle] = useState(true);

  if (isLoading) return <Skeleton className="h-[36rem]" />;
  const index = replays?.findIndex((r) => r.id === replayId) ?? -1;
  const replay = replays?.[index];
  if (!replays || !replay) {
    return (
      <EmptyState
        title={t('errors.notFound.title')}
        body={t('errors.notFound.body')}
        action={<Button onPress={() => navigate({ to: '/replays' })}>{t('nav.replays')}</Button>}
      />
    );
  }
  const prev = replays[index - 1];
  const next = replays[index + 1];
  const at = replay.frictionAt[0] ?? 0.5;

  return (
    <>
      {replay.fixId ? (
        <Link
          to="/fixes/$fixId"
          params={{ fixId: replay.fixId }}
          className="mb-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          ← {t('replay.backToFix', { n: index + 1, total: replays.length })}
        </Link>
      ) : null}
      <PageHeader
        title={replay.title}
        summary={
          <span lang="en">
            {replay.site} · {replay.device} · {replay.network} · {replay.duration} ·{' '}
            {t('replay.pages', { count: replay.pages })}
          </span>
        }
        actions={
          <>
            <SamplePill className="self-center" />
            <IconButton
              label={t('replay.prev')}
              isDisabled={!prev}
              onPress={() => prev && navigate({ to: '/replays/$replayId', params: { replayId: prev.id } })}
              className="border border-border bg-surface"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t('replay.next')}
              isDisabled={!next}
              onPress={() => next && navigate({ to: '/replays/$replayId', params: { replayId: next.id } })}
              className="border border-border bg-surface"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </IconButton>
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label={t('replay.player')}
          className="overflow-hidden rounded-lg border border-border bg-surface text-text"
        >
          <div className="relative grid min-h-[32rem] place-items-center bg-surface-sunken p-6">
            <ReplayPhone label={t('replay.phoneLabel')} />
            <span className="absolute top-4 left-4 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text-muted">
              {replay.page}
            </span>
            <span className="absolute top-4 right-4 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted">
              {t('replay.masked')}
            </span>
          </div>
          <div className="grid gap-3 px-4 pt-3.5 pb-4 sm:px-5">
            <div
              className="relative h-6"
              role="img"
              aria-label={t('replay.timeline', {
                at: fmtTime(at * replay.durationSec),
                total: fmtTime(replay.durationSec),
              })}
            >
              <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-border" />
              <div
                className="absolute top-2.5 left-0 h-1 rounded-full bg-primary"
                style={{ width: `calc(${at} * 100%)` }}
              />
              {replay.pageMarks.map((m) => (
                <div
                  key={m}
                  className="absolute top-3 h-2.5 w-0.5 bg-text-faint"
                  style={{ left: `calc(${m} * 100%)` }}
                />
              ))}
              {replay.frictionAt.map((m) => (
                <div
                  key={m}
                  className="absolute top-1.5 size-3 -translate-x-1/2 rounded-full border-2 border-surface bg-bad"
                  style={{ left: `calc(${m} * 100%)` }}
                />
              ))}
              <div
                className="absolute top-1 size-4 -translate-x-1/2 rounded-full border-2 border-surface bg-text"
                style={{ left: `calc(${at} * 100%)` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <IconButton
                label={playing ? t('replay.pause') : t('replay.play')}
                onPress={() => setPlaying((p) => !p)}
                className="rounded-full bg-primary !text-on-primary data-[hovered]:bg-primary-hover"
              >
                {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              </IconButton>
              <span className="text-sm tabular-nums">
                {fmtTime(at * replay.durationSec)} / {fmtTime(replay.durationSec)}
              </span>
              <button
                type="button"
                onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                className="min-h-9 rounded-md border border-border-strong px-2.5 text-[0.8125rem] outline-none hover:bg-surface-sunken focus-visible:outline-3 focus-visible:outline-primary"
              >
                {speed}×
              </button>
              <label className="flex min-h-11 items-center gap-2 text-[0.8125rem]">
                <input
                  type="checkbox"
                  checked={skipIdle}
                  onChange={(e) => setSkipIdle(e.target.checked)}
                  className="size-4.5 accent-primary"
                />
                {t('replay.skipIdle')}
              </label>
              <span className="ml-auto flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-bad" />
                {t('replay.friction')}
              </span>
            </div>
          </div>
        </section>

        <aside className="grid gap-4">
          <AiBox title={t('replay.recap')} className="p-5">
            <p className="text-base font-semibold">{replay.recap.headline}</p>
            <p className="mt-1.5 text-sm leading-relaxed">{replay.recap.story}</p>
          </AiBox>
          <section aria-labelledby="happened" className="rounded-lg border border-border bg-surface py-2">
            <h2 id="happened" className="px-5 py-3 text-[0.9375rem] font-semibold">
              {t('replay.happened')}
            </h2>
            <ol className="text-sm">
              {replay.events.map((e) => (
                <li
                  key={e.at}
                  className={cx(
                    'grid grid-cols-[3rem_1fr] gap-2 px-5 py-2.5',
                    e.friction && 'bg-bad-bg font-semibold text-bad',
                  )}
                >
                  <span className={cx('tabular-nums', !e.friction && 'text-text-muted')}>{e.at}</span>
                  <span lang="en">{e.label}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
