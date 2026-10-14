import type { TelegramLinkCode, TelegramSettingsUpdate, TelegramStatus } from '@pulse/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** Telegram alerts status for the active org. Polls while a link code is waiting to be used. */
export const telegramQuery = (orgId: string, waiting = false) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'telegram'],
    queryFn: ({ signal }) => api<TelegramStatus>('/telegram', { signal }),
    refetchInterval: waiting ? 3000 : false,
  });

export function useTelegramActions(orgId: string) {
  const qc = useQueryClient();
  const key = telegramQuery(orgId).queryKey;
  const onStatus = (status: TelegramStatus) => qc.setQueryData(key, status);
  return {
    linkCode: useMutation({
      mutationFn: () => api<TelegramLinkCode>('/telegram/link-code', { method: 'POST' }),
    }),
    save: useMutation({
      mutationFn: (body: TelegramSettingsUpdate) =>
        api<TelegramStatus>('/telegram', { method: 'PATCH', body }),
      onSuccess: onStatus,
    }),
    unlink: useMutation({
      mutationFn: () => api<TelegramStatus>('/telegram', { method: 'DELETE' }),
      onSuccess: onStatus,
    }),
    test: useMutation({
      mutationFn: () => api<{ sent: true }>('/telegram/test', { method: 'POST' }),
    }),
  };
}
