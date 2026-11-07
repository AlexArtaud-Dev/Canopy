import { parseServerEnv } from './env';

describe('parseServerEnv', () => {
  it('defaults the engine URL for local development', () => {
    expect(parseServerEnv({})).toEqual({ CANOPY_ENGINE_URL: 'http://localhost:8080' });
  });

  it('accepts an explicit engine URL', () => {
    expect(parseServerEnv({ CANOPY_ENGINE_URL: 'http://engine:8080' }).CANOPY_ENGINE_URL).toBe(
      'http://engine:8080',
    );
  });

  it('rejects a malformed engine URL', () => {
    expect(() => parseServerEnv({ CANOPY_ENGINE_URL: 'not a url' })).toThrow();
  });
});
