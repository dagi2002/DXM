import type Database from 'better-sqlite3';
import type { WorkspacePlanId } from '../../../../packages/contracts/index.js';

/** Apply the chapa_tx_ref migration that index.ts runs at startup (not in schema.sql). */
export const applyBillingMigration = (db: Database.Database) => {
  try { db.prepare('ALTER TABLE upgrade_requests ADD COLUMN chapa_tx_ref TEXT').run(); } catch {}
  try {
    db.prepare(
      'CREATE UNIQUE INDEX ux_upgrade_requests_chapa_tx_ref ON upgrade_requests(chapa_tx_ref) WHERE chapa_tx_ref IS NOT NULL'
    ).run();
  } catch {}
};

export const setWorkspacePlan = (
  db: Database.Database,
  workspaceId: string,
  plan: WorkspacePlanId,
  billingStatus: 'active' | 'past_due' | 'cancelled' = 'active',
) => {
  db.prepare('UPDATE workspaces SET plan = ?, billing_status = ? WHERE id = ?')
    .run(plan, billingStatus, workspaceId);
};
