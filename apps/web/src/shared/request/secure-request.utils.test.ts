import { isSecureRequest } from './secure-request.utils';

const publicUrl = 'https://canopy.example.com';

describe('isSecureRequest', () => {
  it('trusts the proxy protocol first', () => {
    expect(isSecureRequest('https', '192.168.1.10:6060', publicUrl)).toBe(true);
    expect(isSecureRequest('HTTP, https', 'canopy.example.com', publicUrl)).toBe(false);
  });

  it('without a proxy, is HTTPS only on the public HTTPS address', () => {
    expect(isSecureRequest(null, 'Canopy.Example.com', publicUrl)).toBe(true);
    expect(isSecureRequest(null, '192.168.1.10:6060', publicUrl)).toBe(false);
    expect(isSecureRequest('', null, publicUrl)).toBe(false);
    expect(isSecureRequest(null, 'localhost:3000', 'http://localhost:3000')).toBe(false);
  });
});
