import {
  outboxHref,
  outboxIdSchema,
  outboxKind,
  outboxKinds,
  outboxPageSize,
  outboxQuerySchema,
  outboxStatuses,
} from './mail.utils';

describe('sent e-mails list', () => {
  it('reads its URL, tolerating junk', () => {
    expect(outboxQuerySchema.parse({})).toEqual({ q: '', status: null, page: 1 });
    expect(outboxQuerySchema.parse({ q: ' ada ', status: 'failed', page: '3' })).toEqual({
      q: 'ada',
      status: 'failed',
      page: 3,
    });
    expect(outboxQuerySchema.parse({ status: 'lost', page: '-2' })).toEqual({
      q: '',
      status: null,
      page: 1,
    });
  });

  it('writes its URL with only what differs from the defaults', () => {
    expect(outboxHref('/admin/email', { q: '', status: null, page: 1 })).toBe('/admin/email');
    expect(outboxHref('/admin/email', { q: 'a b', status: 'sent', page: 2 })).toBe(
      '/admin/email?q=a+b&status=sent&page=2',
    );
  });

  it('names the kinds of e-mail', () => {
    expect(outboxKind('invitation')).toBe('invitation');
    expect(outboxKind('password_reset')).toBe('password_reset');
    expect(outboxKind('test')).toBe('test');
    expect(outboxKind('security.new_sign_in')).toBe('security');
    expect(outboxKind('shares.drop_off')).toBe('drop_off');
    expect(outboxKind('shares.drop_off_code')).toBe('drop_off_code');
    expect(outboxKind('something.else')).toBe('other');
    expect(outboxKinds).toContain('other');
  });

  it('pages by 25 and knows the three statuses', () => {
    expect(outboxPageSize).toBe(25);
    expect(outboxStatuses).toEqual(['queued', 'sent', 'failed']);
  });

  it('accepts only e-mail ids', () => {
    expect(outboxIdSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(outboxIdSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(true);
  });
});
