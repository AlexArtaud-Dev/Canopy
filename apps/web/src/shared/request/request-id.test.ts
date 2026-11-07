import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  const generate = () => 'generated-id';

  it('keeps a well-formed upstream ID', () => {
    expect(resolveRequestId('req-0123456789', generate)).toBe('req-0123456789');
  });

  it.each([null, '', 'short', 'has spaces in it', 'x'.repeat(129), '<script>alert(1)</script>'])(
    'replaces %p',
    (incoming) => {
      expect(resolveRequestId(incoming, generate)).toBe('generated-id');
    },
  );
});
