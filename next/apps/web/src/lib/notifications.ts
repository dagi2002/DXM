import type { DigestUpdate, NotificationSettings, QuietHoursUpdate } from '@pulse/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** Shared quiet hours, this member's digest, and push status for the active org. */
export const notificationsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'notifications'],
    queryFn: ({ signal }) => api<NotificationSettings>('/notifications', { signal }),
  });

export type PushSupport = 'supported' | 'unsupported' | 'denied';

/** Whether this browser can do web push at all, and whether the person blocked it. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'supported';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

/** This browser's current push subscription, if any (never asks for permission). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() === 'unsupported') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export class PushPermissionError extends Error {}

/**
 * Turns push on for this browser. Only ever called from the Settings button: the permission
 * prompt appears because the person asked for it, never on page load.
 */
async function enablePush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionError(permission);
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON();
  return api<NotificationSettings>('/notifications/push', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys },
  });
}

async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return null;
  const settings = await api<NotificationSettings>('/notifications/push', {
    method: 'DELETE',
    body: { endpoint: sub.endpoint },
  });
  await sub.unsubscribe().catch(() => false);
  return settings;
}

export function useNotificationActions(orgId: string) {
  const qc = useQueryClient();
  const key = notificationsQuery(orgId).queryKey;
  const onSettings = (s: NotificationSettings | null) => {
    if (s) qc.setQueryData(key, s);
    void qc.invalidateQueries({ queryKey: ['orgs', orgId, 'push-device'] });
  };
  return {
    quietHours: useMutation({
      mutationFn: (body: QuietHoursUpdate) =>
        api<NotificationSettings>('/notifications/quiet-hours', { method: 'PUT', body }),
      onSuccess: (s) => {
        onSettings(s);
        // Telegram settings mirror the shared quiet hours.
        void qc.invalidateQueries({ queryKey: ['orgs', orgId, 'telegram'] });
      },
    }),
    digest: useMutation({
      mutationFn: (body: DigestUpdate) =>
        api<NotificationSettings>('/notifications/digest', { method: 'PUT', body }),
      onSuccess: onSettings,
    }),
    enablePush: useMutation({ mutationFn: enablePush, onSuccess: onSettings }),
    disablePush: useMutation({ mutationFn: disablePush, onSuccess: onSettings }),
    testPush: useMutation({
      mutationFn: () => api<{ sent: number }>('/notifications/push/test', { method: 'POST' }),
    }),
  };
}

/** Is push on in *this* browser (it may be on for the member elsewhere)? */
export const pushDeviceQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'push-device'],
    queryFn: async () => Boolean(await currentSubscription()),
  });
