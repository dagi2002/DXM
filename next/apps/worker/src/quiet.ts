import { notificationSettings, type Tx } from '@pulse/db';
import type { QuietHours } from '@pulse/mail/quiet-hours';

const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa';

/** The org's quiet hours (current org scope). No row = always send, Addis Ababa time. */
export async function loadQuietHours(tx: Tx): Promise<QuietHours> {
  const [row] = await tx.select().from(notificationSettings).limit(1);
  return row
    ? { quietStart: row.quietStart, quietEnd: row.quietEnd, timeZone: row.timeZone }
    : { quietStart: null, quietEnd: null, timeZone: DEFAULT_TIME_ZONE };
}
