import {
  downstreamHeaders,
  readCookie,
  relayTarget,
  streamPrefix,
  ticketCookie,
  upstreamHeaders,
} from './engine-stream.utils.mjs';

describe('relayTarget', () => {
  it('allows only listed routes and methods', () => {
    expect(relayTarget('GET', '/api/engine/stream/v1/fs/download?path=%2Fa')).toBe(
      '/v1/fs/download?path=%2Fa',
    );
    expect(relayTarget('HEAD', '/api/engine/stream/v1/fs/download')).toBe('/v1/fs/download');
    expect(relayTarget('GET', '/api/engine/stream/v1/fs/archive?path=/a&path=/b')).toBe(
      '/v1/fs/archive?path=/a&path=/b',
    );
    expect(relayTarget('POST', '/api/engine/stream/v1/fs/download')).toBeNull();
    expect(relayTarget('GET', '/api/engine/stream/v1/jobs')).toBeNull();
    expect(relayTarget('GET', '/api/engine/stream/v1/fs/../jobs')).toBeNull();
    expect(relayTarget('GET', '/api/engine/stream/v1//fs/download')).toBeNull();
    expect(relayTarget('GET', '/files')).toBeNull();
    expect(relayTarget(undefined, '/api/engine/stream/v1/fs/download')).toBeNull();
    expect(relayTarget('GET', undefined)).toBeNull();
    expect(streamPrefix).toBe('/api/engine/stream');
  });
});

describe('readCookie', () => {
  it('finds one cookie', () => {
    expect(readCookie('a=1; canopy_stream=tok%3D; b=2', ticketCookie)).toBe('tok=');
    expect(readCookie('a=1', ticketCookie)).toBeNull();
    expect(readCookie('broken; =x', ticketCookie)).toBeNull();
    expect(readCookie(undefined, ticketCookie)).toBeNull();
  });
});

describe('headers', () => {
  it('forwards ranges and the ticket, never cookies', () => {
    expect(
      upstreamHeaders({ range: 'bytes=5-', cookie: 'secret', accept: '*/*', host: 'x' }, 'T', 'R'),
    ).toEqual({ range: 'bytes=5-', accept: '*/*', authorization: 'Bearer T', 'x-request-id': 'R' });
  });

  it('returns content metadata only', () => {
    expect(
      downstreamHeaders({
        'content-type': 'application/zip',
        'content-disposition': 'attachment',
        'set-cookie': ['x'],
        connection: 'close',
        'accept-ranges': undefined,
      }),
    ).toEqual({
      'content-type': 'application/zip',
      'content-disposition': 'attachment',
      'x-accel-buffering': 'no',
    });
  });
});
