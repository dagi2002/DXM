import type { ReplaySummary } from '@pulse/contracts';
import { EmptyState, Skeleton, buttonClass } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../lib/queries';
import { replaysQuery, useReplayView, type ReplayFilters } from '../lib/replays';

export function ReplayList({ replays }: { replays: ReplaySummary[] }) {
  const { t } = useTranslation();
  const view = useReplayView();
  if (replays.length === 0) {
    return (
      <EmptyState
        icon={<Play size={22} aria-hidden="true" />}
        title={t('replays.empty')}
        body={t('replays.empty.body')}
        action={
          <Link to="/sites" className={buttonClass()}>
            {t('replays.empty.action')}
          </Link>
        }
      />
    );
  }
  return (
    <ul className="grid gap-3" data-testid="replay-list">
      {replays.map((r) => {
        const v = view(r);
        return (
          <li key={`${r.siteId}:${r.id}`}>
            <Link
              to="/replays/$replayId"
              params={{ replayId: r.id }}
              search={{ site: r.siteId }}
              className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 outline-none transition-colors hover:border-border-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
              >
                <Play size={18} />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-semibold">{v.title}</span>
                <span className="truncate text-sm text-text-muted">{v.facts.join(' · ')}</span>
                {r.entryPath ? (
                  <span className="truncate font-mono text-xs text-text-muted">{r.entryPath}</span>
                ) : null}
              </span>
              {r.frictionCount ? (
                <span className="hidden shrink-0 rounded-full bg-bad-bg px-2.5 py-1 text-[0.8125rem] font-semibold text-bad sm:inline">
                  {t('replay.frictionCount', { count: r.frictionCount })}
                </span>
              ) : null}
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-faint" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** List + "only with friction" filter; used by /replays and the site's Replays tab. */
export function ReplayBrowser({ siteId }: { siteId?: string }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const [friction, setFriction] = useState(false);
  const filters: ReplayFilters = { siteId, friction };
  const { data: replays, isLoading } = useQuery(replaysQuery(orgId, filters));
  return (
    <div className="grid gap-4">
      <label className="flex min-h-11 w-fit items-center gap-2 text-[0.9375rem]">
        <input
          type="checkbox"
          checked={friction}
          onChange={(e) => setFriction(e.target.checked)}
          className="size-4.5 accent-primary"
        />
        {t('replays.filter.friction')}
      </label>
      {isLoading || !replays ? <Skeleton className="h-64" /> : <ReplayList replays={replays} />}
    </div>
  );
}
