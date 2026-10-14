import { Button, EmptyState, IconButton, PageHeader, Skeleton, cx } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
// rrweb (~60 KB gzip) ships only in this route's chunk: the player page is the only one that needs it.
import ReplayPlayer from '../components/replay-player';
import { ApiError } from '../lib/api';
import { fixQuery } from '../lib/fixes';
import { useMe } from '../lib/queries';
import { fmtClock, replayQuery, replaysQuery, useMarkLabel, useReplayView } from '../lib/replays';

export function ReplayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { orgId } = useMe();
  const { replayId } = useParams({ strict: false }) as { replayId: string };
  const search = useSearch({ strict: false }) as { fix?: string; site?: string; t?: number };
  const view = useReplayView();
  const markLabel = useMarkLabel();
  const [seek, setSeek] = useState<{ at: number; n: number } | undefined>(
    search.t !== undefined ? { at: search.t, n: 0 } : undefined,
  );

  const {
    data: detail,
    isLoading,
    error,
  } = useQuery({
    ...replayQuery(orgId, replayId, search.site),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  // Coming from a fix: prev/next walk that fix's clips. Otherwise they walk the replay list.
  const fix = useQuery({ ...fixQuery(orgId, search.fix ?? ''), enabled: Boolean(search.fix), retry: false });
  const list = useQuery({ ...replaysQuery(orgId), enabled: !search.fix });
  const ids = search.fix ? (fix.data?.fix.replayIds ?? []) : (list.data?.map((r) => r.id) ?? []);
  const index = ids.indexOf(replayId);
  const prev = index > 0 ? ids[index - 1] : undefined;
  const next = index >= 0 ? ids[index + 1] : undefined;
  const go = (id: string) =>
    navigate({
      to: '/replays/$replayId',
      params: { replayId: id },
      search: search.fix ? { fix: search.fix } : {},
    });

  if (isLoading) return <Skeleton className="h-[36rem]" />;
  if (!detail || error) {
    return (
      <EmptyState
        title={t('errors.notFound.title')}
        body={t('errors.notFound.body')}
        action={<Button onPress={() => navigate({ to: '/replays' })}>{t('nav.replays')}</Button>}
      />
    );
  }
  const v = view(detail.replay);
  const firstFriction = detail.marks.find((m) => m.friction);

  return (
    <>
      {search.fix ? (
        <Link
          to="/fixes/$fixId"
          params={{ fixId: search.fix }}
          className="mb-1 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← {t('replay.backToFix', { n: Math.max(1, index + 1), total: Math.max(1, ids.length) })}
        </Link>
      ) : null}
      <PageHeader
        title={v.title}
        summary={v.facts.join(' · ')}
        actions={
          <>
            {firstFriction ? (
              <Button
                variant="secondary"
                onPress={() => setSeek({ at: Math.max(0, firstFriction.at - 3000), n: Date.now() })}
              >
                {t('fix.playMoment')}
              </Button>
            ) : null}
            <IconButton
              label={t('replay.prev')}
              isDisabled={!prev}
              onPress={() => prev && go(prev)}
              className="border border-border bg-surface"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t('replay.next')}
              isDisabled={!next}
              onPress={() => next && go(next)}
              className="border border-border bg-surface"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </IconButton>
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ReplayPlayer key={`${detail.replay.siteId}:${detail.replay.id}`} detail={detail} seek={seek} />

        <div className="grid gap-4">
          {/* The AI recap returns with task 10's AI flag; until then nothing pretends to summarise. */}
          <section aria-labelledby="happened" className="rounded-lg border border-border bg-surface py-2">
            <h2 id="happened" className="px-5 py-3 text-[0.9375rem] font-semibold">
              {t('replay.happened')}
            </h2>
            {detail.marks.length ? (
              <ol className="text-sm">
                {detail.marks.map((m, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setSeek({ at: Math.max(0, m.at - 1000), n: Date.now() })}
                      className={cx(
                        'grid min-h-11 w-full grid-cols-[3rem_1fr] gap-2 px-5 py-2.5 text-left outline-none hover:bg-surface-sunken focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary',
                        m.friction && 'bg-bad-bg font-semibold text-bad',
                      )}
                    >
                      <span className={cx('tabular-nums', !m.friction && 'text-text-muted')}>
                        {fmtClock(m.at)}
                      </span>
                      <span className="break-words">{markLabel(m)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 pb-3 text-sm text-text-muted">{t('replay.noMarks')}</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
