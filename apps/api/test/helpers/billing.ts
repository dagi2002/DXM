import type Database from 'better-sqlite3';
import type { WorkspacePlanId } from '../../../../packages/contracts/index.js';

export const setWorkspacePlan = (
  db: Database.Database,
  workspaceId: string,
  plan: WorkspacePlanId,
  billingStatus: 'active' | 'past_due' | 'cancelled' = 'active',
) => {
  db.prepare('UPDATE workspaces SET plan = ?, billing_status = ? WHERE id = ?')
    .run(plan, billingStatus, workspaceId);
};
