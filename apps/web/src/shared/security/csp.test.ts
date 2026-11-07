import { buildContentSecurityPolicy, staticSecurityHeaders } from './csp';

describe('buildContentSecurityPolicy', () => {
  it('locks scripts to the nonce and forbids framing in production', () => {
    const policy = buildContentSecurityPolicy('abc123', false);
    expect(policy).toContain(`script-src 'self' 'nonce-abc123' 'strict-dynamic'`);
    expect(policy).toContain(`frame-ancestors 'none'`);
    expect(policy).toContain(`object-src 'none'`);
    expect(policy).not.toContain('unsafe-eval');
  });

  it('allows eval only in development', () => {
    expect(buildContentSecurityPolicy('n', true)).toContain(`'unsafe-eval'`);
  });
});

describe('staticSecurityHeaders', () => {
  it('sets nosniff and denies framing', () => {
    const byName = new Map(staticSecurityHeaders.map((header) => [header.key, header.value]));
    expect(byName.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byName.get('X-Frame-Options')).toBe('DENY');
    expect(byName.get('Permissions-Policy')).toContain('camera=()');
  });
});
