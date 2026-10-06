import type { Logger } from 'pino';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Keeps mail in memory — tests read `outbox`. Never used in production. */
export class MemoryMailer implements Mailer {
  readonly outbox: Mail[] = [];
  async send(mail: Mail) {
    this.outbox.push(mail);
  }
  lastTo(to: string): Mail | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

/** Development: logs the message (links included) so flows can be completed locally. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: Logger) {}
  async send(mail: Mail) {
    this.log.info({ to: mail.to, subject: mail.subject, text: mail.text }, 'email (dev mailer)');
  }
}

/** Production: Resend HTTP API. Times out instead of hanging a request. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(mail: Mail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}
