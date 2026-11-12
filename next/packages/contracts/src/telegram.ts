import { z } from 'zod';

/**
 * Telegram alerts (slice 3). One chat per organization receives created / escalated / reopened
 * fixes. Quiet hours are the org's shared rule (see `notifications.ts`), the same for web push;
 * alerts that fall inside them wait until the quiet hours end.
 */

const hour = z.number().int().min(0).max(23);

export const TelegramLink = z.object({
  chatTitle: z.string().nullable(),
  linkedAt: z.string(),
  /** The org's shared quiet hours (also apply to web push). Read-only mirror for older clients. */
  quietStart: hour.nullable(),
  quietEnd: hour.nullable(),
  timeZone: z.string(),
  locale: z.enum(['en', 'am']),
});
export type TelegramLink = z.infer<typeof TelegramLink>;

export const TelegramStatus = z.object({
  /** False when this deployment has no bot token: the UI says so instead of offering a link. */
  configured: z.boolean(),
  botUsername: z.string().nullable(),
  link: TelegramLink.nullable(),
});
export type TelegramStatus = z.infer<typeof TelegramStatus>;

export const TelegramLinkCode = z.object({
  /** Open this in Telegram and press Start to link the chat. */
  url: z.string(),
  code: z.string(),
  expiresAt: z.string(),
});
export type TelegramLinkCode = z.infer<typeof TelegramLinkCode>;

export const TelegramSettingsUpdate = z
  .object({
    /** Optional: quiet hours are the org's shared setting (PUT /notifications/quiet-hours). */
    quietStart: hour.nullable().optional(),
    quietEnd: hour.nullable().optional(),
    locale: z.enum(['en', 'am']),
  })
  .refine((v) => (v.quietStart === undefined) === (v.quietEnd === undefined), {
    message: 'Set both quiet-hours ends, or neither',
    path: ['quietEnd'],
  })
  .refine((v) => ((v.quietStart ?? null) === null) === ((v.quietEnd ?? null) === null), {
    message: 'Set both quiet-hours ends, or neither',
    path: ['quietEnd'],
  })
  .refine((v) => v.quietStart == null || v.quietStart !== v.quietEnd, {
    message: 'Quiet hours must start and end at different times',
    path: ['quietEnd'],
  });
export type TelegramSettingsUpdate = z.infer<typeof TelegramSettingsUpdate>;

/** Default time zone for new links: the product is built for Ethiopia. */
export const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa';
