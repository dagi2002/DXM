/**
 * Registers (or re-registers) the Telegram webhook. The API also does this on start; use this
 * after rotating TELEGRAM_WEBHOOK_SECRET or to check the setup.
 *
 *   pnpm --filter @pulse/api telegram:webhook           # only changes what's out of date
 *   pnpm --filter @pulse/api telegram:webhook --force   # always calls setWebhook
 *
 * Prints the outcome only: never the bot token or the secret.
 */
import { registerTelegramWebhook } from '../src/telegram-webhook';

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
const publicUrl = process.env.API_URL ?? 'http://localhost:4100';
const result = await registerTelegramWebhook({
  token,
  secret,
  publicUrl,
  force: process.argv.includes('--force'),
});
console.log(JSON.stringify(result));
if (result.status === 'failed') process.exit(1);
