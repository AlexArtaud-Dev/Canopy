import { engineRouteFor, forwardableHeaders } from './engine-routes.utils';

describe('engineRouteFor', () => {
  it('allows only listed routes', () => {
    expect(engineRouteFor('GET', '/api/engine/v1/jobs/events')).toEqual({
      target: '/v1/jobs/events',
      stream: true,
    });
    expect(engineRouteFor('GET', '/api/engine/v1/jobs/events?x=1')?.target).toBe(
      '/v1/jobs/events?x=1',
    );
    expect(engineRouteFor('POST', '/api/engine/v1/jobs/events')).toBeNull();
    expect(engineRouteFor('GET', '/api/engine/v1/fs/list')).toBeNull();
    expect(engineRouteFor('GET', '/api/engine/v1/jobs/../fs/list')).toBeNull();
    expect(engineRouteFor('GET', '/api/engine/v1/jobs//events')).toBeNull();
    expect(engineRouteFor(undefined, '/api/engine/v1/jobs/events')).toBeNull();
    expect(engineRouteFor('GET', '/elsewhere')).toBeNull();
    expect(engineRouteFor('GET', undefined)).toBeNull();
  });
});

describe('forwardableHeaders', () => {
  it('keeps content headers only', () => {
    expect(
      forwardableHeaders({
        'Content-Type': 'text/event-stream',
        'set-cookie': ['a=b'],
        connection: 'keep-alive',
        etag: '"1"',
        'x-other': undefined,
      }),
    ).toEqual({ 'content-type': 'text/event-stream', etag: '"1"' });
  });
});
