import { z } from 'zod';

import { smtpSecurityModes, type MailSettings } from './mail.settings';

/** Ready to send: enabled, with a host and a sender address. */
export function isMailConfigured(settings: MailSettings): boolean {
  return settings.enabled && settings.host !== '' && settings.fromAddress !== '';
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  ignoreTLS: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/** nodemailer options for the configured SMTP server. */
export function transportOptions(settings: MailSettings): SmtpTransportOptions {
  return {
    host: settings.host,
    port: settings.port,
    // "tls" is implicit TLS (465); "starttls" upgrades a plain connection and must succeed.
    secure: settings.security === 'tls',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    ...(settings.username ? { auth: { user: settings.username, pass: settings.password } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/** `"Name" <address>`, with characters that could inject headers removed from the name. */
export function fromHeader(settings: MailSettings): string {
  const name = settings.fromName.replace(/["\\\r\n]/g, '');
  return name ? `"${name}" <${settings.fromAddress}>` : settings.fromAddress;
}

/** Retry schedule after a failed delivery; null once the message is given up. */
const retryDelaysMinutes = [1, 5, 30, 120, 360] as const;

export function nextAttemptDelayMs(failedAttempts: number): number | null {
  const minutes = retryDelaysMinutes[failedAttempts - 1];
  return minutes === undefined ? null : minutes * 60_000;
}

const connectionCodes = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED']);

/** Stable, translatable code for a delivery failure (never the server's raw message). */
export function failureCode(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'EAUTH') return 'mail.auth_failed';
  if (connectionCodes.has(code)) return 'mail.connection_failed';
  if (code === 'EENVELOPE') return 'mail.invalid_recipient';
  if (code === 'ETLS') return 'mail.tls_failed';
  return 'mail.send_failed';
}

/** Admin form: an empty password keeps the stored one. */
export const smtpFormSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  security: z.enum(smtpSecurityModes),
  username: z.string().max(255),
  password: z.string().max(1024),
  fromAddress: z.union([z.literal(''), z.email()]),
  fromName: z.string().trim().max(100),
});

export type SmtpForm = z.infer<typeof smtpFormSchema>;

export const testMailSchema = z.object({ to: z.email() });
