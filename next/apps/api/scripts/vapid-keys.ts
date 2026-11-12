/**
 * Prints a new VAPID key pair for web push. Put the two lines in the server's environment (both
 * the API and the worker). Keep the private key secret; changing keys means every browser has to
 * turn push on again.
 *
 *   pnpm --filter @pulse/api vapid:keys
 */
import { generateVapidKeys } from '@pulse/mail/push';

const { publicKey, privateKey } = generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
