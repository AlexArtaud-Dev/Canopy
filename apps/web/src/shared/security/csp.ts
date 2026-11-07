/**
 * Content-Security-Policy for every HTML response. Scripts need the per-request nonce
 * (`strict-dynamic` lets them load chunks); inline styles stay allowed because Radix positions
 * popovers with `style` attributes, which nonces cannot cover.
 */
export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (isDevelopment) {
    // React dev tooling evaluates code for better stack traces; never in production.
    scriptSrc.push(`'unsafe-eval'`);
  }
  const directives: Record<string, readonly string[]> = {
    'default-src': [`'self'`],
    'script-src': scriptSrc,
    'style-src': [`'self'`, `'unsafe-inline'`],
    'img-src': [`'self'`, 'blob:', 'data:'],
    'font-src': [`'self'`],
    'connect-src': [`'self'`],
    'media-src': [`'self'`, 'blob:'],
    'worker-src': [`'self'`, 'blob:'],
    'object-src': [`'none'`],
    'base-uri': [`'self'`],
    'form-action': [`'self'`],
    'frame-ancestors': [`'none'`],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** Headers that never vary per request (set in next.config `headers()`). */
export const staticSecurityHeaders: readonly { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];
