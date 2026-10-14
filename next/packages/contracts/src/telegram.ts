import { z } from 'zod';

/**
 * Telegram alerts (slice 3). One chat per organization receives created / escalated / reopened
 * fixes. Quiet hours are whole local hours in the chat's time zone; alerts that fall inside them
 * wait until the quiet hours end.
 */

const hour = z.number().int().min(0).max(23);

export const TelegramLink = z.object({
  chatTitle: z.string().nullable(),
  linkedAt: z.string(),
  /** Quiet hours [start, end) in local time; both null = always send. start > end wraps midnight. */
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
    quietStart: hour.nullable(),
    quietEnd: hour.nullable(),
    locale: z.enum(['en', 'am']),
  })
  .refine((v) => (v.quietStart === null) === (v.quietEnd === null), {
    message: 'Set both quiet-hours ends, or neither',
    path: ['quietEnd'],
  })
  .refine((v) => v.quietStart === null || v.quietStart !== v.quietEnd, {
    message: 'Quiet hours must start and end at different times',
    path: ['quietEnd'],
  });
export type TelegramSettingsUpdate = z.infer<typeof TelegramSettingsUpdate>;

/** Default time zone for new links: the product is built for Ethiopia. */
export const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa';
