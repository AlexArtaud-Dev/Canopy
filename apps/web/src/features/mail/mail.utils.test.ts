import { mailSettings, type MailSettings } from './mail.settings';
import {
  failureCode,
  fromHeader,
  isMailConfigured,
  nextAttemptDelayMs,
  smtpFormSchema,
  testMailSchema,
  transportOptions,
} from './mail.utils';

const base: MailSettings = {
  ...mailSettings.schema.parse({}),
  enabled: true,
  host: 'smtp.example.com',
  fromAddress: 'canopy@example.com',
};

describe('isMailConfigured', () => {
  it('needs enabled, a host and a sender', () => {
    expect(isMailConfigured(base)).toBe(true);
    expect(isMailConfigured({ ...base, enabled: false })).toBe(false);
    expect(isMailConfigured({ ...base, host: '' })).toBe(false);
    expect(isMailConfigured({ ...base, fromAddress: '' })).toBe(false);
  });
});

describe('transportOptions', () => {
  it('maps the security modes', () => {
    expect(transportOptions(base)).toMatchObject({
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
    });
    expect(transportOptions({ ...base, security: 'tls', port: 465 })).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: false,
    });
    expect(transportOptions({ ...base, security: 'none' })).toMatchObject({ ignoreTLS: true });
  });

  it('authenticates only with a username', () => {
    expect(transportOptions(base).auth).toBeUndefined();
    expect(transportOptions({ ...base, username: 'u', password: 'p' }).auth).toEqual({
      user: 'u',
      pass: 'p',
    });
  });
});

describe('fromHeader', () => {
  it('quotes the display name and strips header injection', () => {
    expect(fromHeader(base)).toBe('"Canopy" <canopy@example.com>');
    expect(fromHeader({ ...base, fromName: 'Evil"\r\nBcc: x' })).toBe(
      '"EvilBcc: x" <canopy@example.com>',
    );
    expect(fromHeader({ ...base, fromName: '' })).toBe('canopy@example.com');
  });
});

describe('nextAttemptDelayMs', () => {
  it('backs off, then gives up after five failures', () => {
    expect(nextAttemptDelayMs(1)).toBe(60_000);
    expect(nextAttemptDelayMs(5)).toBe(360 * 60_000);
    expect(nextAttemptDelayMs(6)).toBeNull();
  });
});

describe('failureCode', () => {
  it.each([
    [{ code: 'EAUTH' }, 'mail.auth_failed'],
    [{ code: 'ETIMEDOUT' }, 'mail.connection_failed'],
    [{ code: 'EENVELOPE' }, 'mail.invalid_recipient'],
    [{ code: 'ETLS' }, 'mail.tls_failed'],
    [new Error('boom'), 'mail.send_failed'],
    ['weird', 'mail.send_failed'],
  ])('%j → %s', (error, expected) => {
    expect(failureCode(error)).toBe(expected);
  });
});

describe('schemas', () => {
  it('validates the SMTP form and the test recipient', () => {
    expect(
      smtpFormSchema.parse({
        enabled: true,
        host: ' smtp.example.com ',
        port: '587',
        security: 'starttls',
        username: '',
        password: '',
        fromAddress: 'a@b.co',
        fromName: 'Canopy',
      }),
    ).toMatchObject({ host: 'smtp.example.com', port: 587 });
    expect(testMailSchema.safeParse({ to: 'nope' }).success).toBe(false);
  });
});
