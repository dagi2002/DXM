export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  type: 'welcome' | 'site_verified' | 'critical_alert' | 'password_reset';
}

/** All mails sent — exposed for test assertions. */
export let sentMails: MailPayload[] = [];

export function resetSentMails(): void {
  sentMails = [];
}

export async function sendMail(payload: MailPayload): Promise<void> {
  sentMails.push(payload);
  console.log(`[mailer] To: ${payload.to} | Subject: ${payload.subject}`);
}

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

export async function sendCriticalAlertEmail(to: string, alertTitle: string, siteDomain: string | null): Promise<void> {
  const siteInfo = siteDomain ? ` on ${siteDomain}` : '';
  await sendMail({
    to,
    subject: `DXM Pulse — Critical alert${siteInfo}`,
    text: `A critical alert was triggered${siteInfo}:\n\n${alertTitle}\n\nReview it in your dashboard.\n\n— DXM Pulse`,
    type: 'critical_alert',
  });
}
