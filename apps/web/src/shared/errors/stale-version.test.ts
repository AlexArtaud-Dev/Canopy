import { mayReloadAgain, staleVersionCode } from './stale-version';

jest.mock('next/navigation', () => ({
  unstable_isUnrecognizedActionError: (error: Error) => error.name === 'UnrecognizedActionError',
}));

describe('stale version', () => {
  it('reloads once, then lets the error show for a while', () => {
    expect(mayReloadAgain(null, 1_000)).toBe(true);
    expect(mayReloadAgain(1_000, 20_000)).toBe(false);
    expect(mayReloadAgain(1_000, 31_000)).toBe(true);
    expect(staleVersionCode).toBe('system.updated');
  });
});
