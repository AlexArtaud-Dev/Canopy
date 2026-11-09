import {
  downstreamHeaders,
  readCookie,
  relayLocation,
  relayPrefixFor,
  relayTarget,
  sameOrigin,
  shareCookie,
  sharePrefix,
  streamPrefix,
  ticketCookie,
  ticketCookieFor,
  upstreamHeaders,
} from './engine-stream.utils.mjs';

describe('relayTarget', () => {
  it('allows only listed routes and methods', () => {
    expect(relayTarget('GET', '/api/engine/stream/v1/fs/download?path=%2Fa')).toBe(
      '/v1/fs/download?path=%2Fa',
    );
    expect(relayTarget('HEAD', '/api/engine/stream/v1/fs/download')).toBe('/v1/fs/download');
    expect(relayTarget('GET', '/api/engine/stream/v1/fs/thumbnail?path=%2Fa')).toBe(
      '/v1/fs/thumbnail?path=%2Fa',
    );
    expect(relayTarget('GET', '/api/engine/stream/v1/fs/preview?path=%2Fa')).toBe(
      '/v1/fs/preview?path=%2Fa',
    );
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
    expect(relayTarget('GET', '/api/engine/share/v1/fs/download?path=%2Fa')).toBe(
      '/v1/fs/download?path=%2Fa',
    );
    expect(relayTarget('GET', '/api/engine/share/v1/fs/archive?path=%2Fa')).toBe(
      '/v1/fs/archive?path=%2Fa',
    );
    expect(relayTarget('GET', '/api/engine/share/v1/fs/preview?path=%2Fa')).toBeNull();
    expect(relayTarget('POST', '/api/engine/share/v1/uploads/')).toBe('/v1/uploads/');
    expect(relayTarget('PATCH', `/api/engine/share/v1/uploads/${'b'.repeat(32)}`)).toBe(
      `/v1/uploads/${'b'.repeat(32)}`,
    );
    expect(relayTarget('PUT', '/api/engine/share/v1/uploads/')).toBeNull();
    expect(ticketCookieFor('/api/engine/share/v1/fs/download')).toBe(shareCookie);
    expect(ticketCookieFor('/api/engine/stream/v1/fs/download')).toBe(ticketCookie);
    expect(ticketCookieFor('/files')).toBeNull();
    expect(ticketCookieFor(undefined)).toBeNull();
    expect(sharePrefix).toBe('/api/engine/share');
    expect(relayTarget('POST', '/api/engine/stream/v1/uploads/')).toBe('/v1/uploads/');
    const id = `${'a'.repeat(32)}6d65646961`;
    expect(relayTarget('PATCH', `/api/engine/stream/v1/uploads/${id}`)).toBe(`/v1/uploads/${id}`);
    expect(relayTarget('PATCH', '/api/engine/stream/v1/uploads/0123456789abcdef')).toBeNull();
    expect(relayTarget('PATCH', '/api/engine/stream/v1/uploads/not-an-id')).toBeNull();
    expect(relayTarget('GET', `/api/engine/stream/v1/uploads/${id}`)).toBeNull();
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

describe('uploads', () => {
  it('rewrites tus locations to the relay', () => {
    expect(relayLocation('http://engine:8080/v1/uploads/abc')).toBe(
      '/api/engine/stream/v1/uploads/abc',
    );
    expect(relayLocation('/elsewhere')).toBeNull();
    expect(relayLocation('http://engine:8080/v1/uploads/abc', sharePrefix)).toBe(
      '/api/engine/share/v1/uploads/abc',
    );
    expect(relayPrefixFor('/api/engine/share/v1/uploads/')).toBe(sharePrefix);
    expect(relayPrefixFor('/elsewhere')).toBeNull();
    expect(relayLocation(undefined)).toBeNull();
    expect(
      downstreamHeaders({ location: 'http://engine/v1/uploads/abc', 'upload-offset': '5' }),
    ).toEqual({
      location: '/api/engine/stream/v1/uploads/abc',
      'upload-offset': '5',
      'x-accel-buffering': 'no',
    });
  });

  it('accepts writes from this origin only', () => {
    expect(sameOrigin('GET', undefined, 'canopy.lan')).toBe(true);
    expect(sameOrigin('PATCH', 'https://canopy.lan', 'canopy.lan')).toBe(true);
    expect(sameOrigin('PATCH', 'https://evil.example', 'canopy.lan')).toBe(false);
    expect(sameOrigin('POST', undefined, 'canopy.lan')).toBe(false);
    expect(sameOrigin('POST', 'not a url', 'canopy.lan')).toBe(false);
    expect(sameOrigin(undefined, 'https://canopy.lan', undefined)).toBe(false);
  });
});
