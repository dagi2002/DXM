/**
 * "Delete recording" confirmation (task 13). Lazy-loaded by the replay page only when an owner
 * or admin opens it. The recording, its blobs and its AI recap are deleted for good.
 */
import { Banner, Button, Modal } from '@pulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export default function DeleteRecordingDialog({
  orgId,
  replayId,
  siteId,
  isOpen,
  onOpenChange,
  onDeleted,
}: {
  orgId: string;
  replayId: string;
  siteId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      api(`/replays/${encodeURIComponent(replayId)}?siteId=${encodeURIComponent(siteId)}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      // Leave the page first, so the gone recording isn't refetched while still on screen.
      onDeleted();
      qc.removeQueries({ queryKey: ['orgs', orgId, 'replays', 'detail', replayId] });
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'replays'] });
    },
  });
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('replay.delete.title')}
      closeLabel={t('common.close')}
    >
      <div className="grid gap-4">
        <p className="text-text-muted">{t('replay.delete.body')}</p>
        {remove.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={() => onOpenChange(false)} isDisabled={remove.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onPress={() => remove.mutate()}
            isPending={remove.isPending}
            pendingLabel={t('replay.delete.deleting')}
          >
            {t('replay.delete.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
