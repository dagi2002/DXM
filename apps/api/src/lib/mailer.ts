import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from './logger.js';

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  type: 'welcome' | 'site_verified' | 'critical_alert' | 'password_reset' | 'workspace_invite';
}

/** All mails sent — exposed for test assertions. */
export let sentMails: MailPayload[] = [];

export function resetSentMails(): void {
  sentMails = [];
}

// ── SMTP transport (conditional) ────────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim();
const SMTP_FROM = process.env.SMTP_FROM?.trim() || 'noreply@dxmpulse.com';

let transport: Transporter | null = null;

if (SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  logger.info('SMTP transport configured', { host: SMTP_HOST, port: SMTP_PORT });
} else {
  logger.info('SMTP not configured — emails will be logged to console');
}

// ── Send ────────────────────────────────────────────────────────────────────

export async function sendMail(payload: MailPayload): Promise<void> {
  sentMails.push(payload);

  if (transport) {
    try {
      await transport.sendMail({
        from: SMTP_FROM,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      });
      logger.info('Email sent', { to: payload.to, type: payload.type });
    } catch (err) {
      logger.error('Email send failed', {
        to: payload.to,
        type: payload.type,
        error: err instanceof Error ? err.message : String(err),
      });
      // Do NOT rethrow — email failure must never crash the API
    }
  } else {
    logger.info('[mailer] console fallback', {
      to: payload.to,
      subject: payload.subject,
      body: payload.text,
    });
  }
}

// ── Convenience helpers ─────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendMail({
    to,
    subject: 'Welcome to DXM Pulse',
    text: `Hi ${name},\n\nYour workspace is ready. Add your first site to start tracking.\n\n— DXM Pulse`,
    type: 'welcome',
  });
}

export async function sendSiteVerifiedEmail(to: string, domain: string): Promise<void> {
  await sendMail({
    to,
    subject: `DXM Pulse — ${domain} is now live`,
    text: `Your site ${domain} just received its first session. Tracking is active.\n\n— DXM Pulse`,
    type: 'site_verified',
  });
}

export async function sendInviteEmail(
  to: string,
  workspaceName: string,
  inviterName: string,
  role: string,
  inviteUrl: string,
): Promise<void> {
  await sendMail({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on DXM Pulse`,
    text: `${inviterName} invited you to join the "${workspaceName}" workspace as ${role === 'admin' ? 'an admin' : 'a viewer'}.\n\nAccept the invite (expires in 7 days):\n\n${inviteUrl}\n\nIf you weren't expecting this, you can ignore this email.\n\n— DXM Pulse`,
    type: 'workspace_invite',
  });
}

export async function sendCriticalAlertEmail(to: string, alertTitle: string, siteDomain: string | null): Promise<void> {
  const siteInfo = siteDomain ? ` on ${siteDomain}` : '';
  await sendMail({
    to,
    subject: `DXM Pulse — Critical alert${siteInfo}`,
    text: `A critical alert was triggered${siteInfo}:\n\n${alertTitle}\n\nReview it in your dashboard.\n\n— DXM Pulse`,
    type: 'critical_alert',
  });
}
