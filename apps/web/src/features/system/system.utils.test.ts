import { toSystemStatus } from './system.utils';

const checkedAt = new Date('2026-11-07T10:00:00.000Z');

describe('toSystemStatus', () => {
  it('reports everything up when the engine is ready', () => {
    expect(
      toSystemStatus({ kind: 'response', httpStatus: 200, code: undefined }, checkedAt),
    ).toEqual({
      web: 'up',
      engine: 'up',
      database: 'up',
      checkedAt: '2026-11-07T10:00:00.000Z',
    });
  });

  it('reports the database down when the engine says so', () => {
    const status = toSystemStatus(
      { kind: 'response', httpStatus: 503, code: 'system.database_unavailable' },
      checkedAt,
    );
    expect(status).toMatchObject({ engine: 'up', database: 'down' });
  });

  it('treats an unexpected engine response as engine down', () => {
    const status = toSystemStatus(
      { kind: 'response', httpStatus: 500, code: undefined },
      checkedAt,
    );
    expect(status).toMatchObject({ engine: 'down', database: 'unknown' });
  });

  it('treats an unreachable engine as down with unknown database', () => {
    expect(toSystemStatus({ kind: 'unreachable' }, checkedAt)).toMatchObject({
      web: 'up',
      engine: 'down',
      database: 'unknown',
    });
  });
});
