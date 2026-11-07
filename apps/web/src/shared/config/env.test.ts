import { parseServerEnv } from './env';

describe('parseServerEnv', () => {
  it('applies defaults for local development', () => {
    expect(parseServerEnv({})).toEqual({
      CANOPY_ENGINE_URL: 'http://localhost:8080',
      CANOPY_TRUSTED_PROXIES: '',
      CANOPY_ENCRYPTION_KEY_PREVIOUS: '',
      CANOPY_PUBLIC_URL: 'http://localhost:3000',
      CANOPY_LOCAL_NETWORKS: '127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7',
    });
  });

  it('accepts explicit values', () => {
    const env = parseServerEnv({
      CANOPY_ENGINE_URL: 'http://engine:8080',
      CANOPY_DATABASE_URL: 'postgres://canopy_web:pw@postgres:5432/canopy',
      CANOPY_TRUSTED_PROXIES: '172.16.0.0/12',
    });
    expect(env.CANOPY_ENGINE_URL).toBe('http://engine:8080');
    expect(env.CANOPY_DATABASE_URL).toBe('postgres://canopy_web:pw@postgres:5432/canopy');
    expect(env.CANOPY_TRUSTED_PROXIES).toBe('172.16.0.0/12');
  });

  it.each([[{ CANOPY_ENGINE_URL: 'not a url' }], [{ CANOPY_DATABASE_URL: 'mysql://db' }]])(
    'rejects %o',
    (source) => {
      expect(() => parseServerEnv(source)).toThrow();
    },
  );
});
