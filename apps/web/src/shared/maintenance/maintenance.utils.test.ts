import { maintenanceDecision, maintenanceFromEnv } from './maintenance.utils';

describe('maintenanceDecision', () => {
  it.each([
    [{ enabled: false, local: false, pathname: '/' }, 'pass'],
    [{ enabled: true, local: true, pathname: '/admin' }, 'pass'],
    [{ enabled: true, local: false, pathname: '/maintenance' }, 'pass'],
    [{ enabled: true, local: false, pathname: '/_next/static/chunk.js' }, 'pass'],
    [{ enabled: true, local: false, pathname: '/' }, 'page'],
    [{ enabled: true, local: false, pathname: '/login' }, 'page'],
    [{ enabled: true, local: false, pathname: '/api/engine/upload' }, 'unavailable'],
    [{ enabled: true, local: false, pathname: '/engine/v1/fs/list' }, 'unavailable'],
  ] as const)('%j → %s', (input, expected) => {
    expect(maintenanceDecision(input)).toBe(expected);
  });
});

describe('maintenanceFromEnv', () => {
  it.each([
    ['true', true],
    [' ON ', true],
    ['1', true],
    ['false', false],
    ['', false],
    [undefined, false],
  ])('%j → %s', (raw, expected) => {
    expect(maintenanceFromEnv(raw)).toBe(expected);
  });
});
