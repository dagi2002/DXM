import { PageHeader } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ReplayBrowser } from '../components/replay-list';
import { useMe } from '../lib/queries';
import { replaysQuery } from '../lib/replays';

export function ReplaysPage() {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const { data: all } = useQuery(replaysQuery(orgId));
  return (
    <>
      <PageHeader
        eyebrow={t('nav.replays')}
        title={all?.length ? t('replays.headline', { count: all.length }) : t('nav.replays')}
        summary={t('replays.intro')}
      />
      <ReplayBrowser />
    </>
  );
}
