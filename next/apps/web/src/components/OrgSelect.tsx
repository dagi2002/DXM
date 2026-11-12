import { Select } from '@pulse/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMe } from '../lib/queries';

/**
 * The workspace switcher for people in more than one organization. It is its own chunk: the
 * select (popover, list box) is the heaviest control in the shell and most accounts have one
 * workspace, so they never download it (03 §8).
 */
export default function OrgSelect() {
  const { t } = useTranslation();
  const { me, orgId } = useMe();
  const qc = useQueryClient();
  return (
    <Select
      label={t('nav.switchOrg')}
      selectedKey={orgId}
      options={me.orgs.map((o) => ({ id: o.id, label: o.name }))}
      onSelectionChange={async (id) => {
        const { authClient } = await import('../lib/auth-client');
        await authClient.organization.setActive({ organizationId: id });
        await qc.invalidateQueries();
      }}
    />
  );
}
