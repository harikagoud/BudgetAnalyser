import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM).');
    this.name = 'EmailNotConfiguredError';
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Sends one email over SMTP (Gmail app password, Brevo, …). With no SMTP
 * settings: in development/test it only logs that nothing was sent (callers
 * log the link themselves in dev); in production it throws so the failure is
 * visible instead of silently losing the email.
 */
export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new EmailNotConfiguredError();
    logger.info({ to: mail.to, subject: mail.subject }, 'SMTP not configured; email not sent (dev)');
    return;
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades via STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
