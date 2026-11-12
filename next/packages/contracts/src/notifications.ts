import { z } from 'zod';

/**
 * Notifications (task 15): quiet hours shared by every instant channel (Telegram, web push), the
 * weekly digest email, and web push subscriptions for this browser.
 */

const hour = z.number().int().min(0).max(23);

/** Quiet hours [start, end) in whole local hours; both null = always send. start > end wraps midnight. */
export const QuietHours = z.object({
  quietStart: hour.nullable(),
  quietEnd: hour.nullable(),
  timeZone: z.string(),
});
export type QuietHours = z.infer<typeof QuietHours>;

export const QuietHoursUpdate = z
  .object({ quietStart: hour.nullable(), quietEnd: hour.nullable() })
  .refine((v) => (v.quietStart === null) === (v.quietEnd === null), {
    message: 'Set both quiet-hours ends, or neither',
    path: ['quietEnd'],
  })
  .refine((v) => v.quietStart === null || v.quietStart !== v.quietEnd, {
    message: 'Quiet hours must start and end at different times',
    path: ['quietEnd'],
  });
export type QuietHoursUpdate = z.infer<typeof QuietHoursUpdate>;

export const NotificationSettings = z.object({
  quietHours: QuietHours,
  /** This member's Monday digest email for the active org. */
  weeklyDigest: z.boolean(),
  push: z.object({
    /** False when this deployment has no VAPID keys: the UI says "not configured". */
    configured: z.boolean(),
    /** The VAPID public key the browser subscribes with (null when not configured). */
    publicKey: z.string().nullable(),
    /** How many of this member's browsers get push for the active org. */
    devices: z.number().int().min(0),
  }),
});
export type NotificationSettings = z.infer<typeof NotificationSettings>;

export const DigestUpdate = z.object({ weeklyDigest: z.boolean() });
export type DigestUpdate = z.infer<typeof DigestUpdate>;

const b64u = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** What `PushSubscription.toJSON()` gives (expirationTime ignored). */
export const PushSubscriptionInput = z.object({
  endpoint: z.string().url().max(1024).startsWith('https://'),
  keys: z.object({ p256dh: b64u.min(80).max(100), auth: b64u.min(16).max(44) }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

export const PushUnsubscribe = z.object({ endpoint: z.string().url().max(1024) });
export type PushUnsubscribe = z.infer<typeof PushUnsubscribe>;
