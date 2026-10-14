import { sitesForInsights } from '@pulse/insights/db';
import type { Db } from '@pulse/db';
import { sendJob, type Boss } from '@pulse/jobs';

/** Spreads per-site rollups over a few minutes so they don't all hit Postgres at once. */
export const INSIGHTS_STAGGER_SECONDS = 240;

/** Queues one staggered `insights.site` per site that needs it (deduplicated per site). */
export async function sweepInsights(db: Db, boss: Boss, random: () => number = Math.random) {
  const due = await sitesForInsights(db);
  for (const site of due) {
    await sendJob(boss, 'insights.site', site, {
      singletonKey: site.siteId,
      startAfter: Math.floor(random() * INSIGHTS_STAGGER_SECONDS),
    });
  }
  return due.length;
}
