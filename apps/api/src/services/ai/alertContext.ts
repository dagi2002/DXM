import type { AlertDetail } from '../../../../../packages/contracts/index.js';

export interface AlertAiContext {
  id: string;
  siteId: string | null;
  type: AlertDetail['type'];
  severity: AlertDetail['severity'];
  title: string;
  description: string;
  timestamp: string;
  state: 'active' | 'resolved';
  resolvedAt: string | null;
  affectedSessions: number;
  telegramSent: boolean;
}

export const buildAlertAiContext = (alert: AlertDetail): AlertAiContext => ({
  id: alert.id,
  siteId: alert.siteId,
  type: alert.type,
  severity: alert.severity,
  title: alert.title,
  description: alert.description,
  timestamp: alert.timestamp,
  state: alert.resolved ? 'resolved' : 'active',
  resolvedAt: alert.resolvedAt,
  affectedSessions: alert.affectedSessions,
  telegramSent: alert.telegramSent,
});
