/**
 * @jest-environment node
 */
import { isSuffixBreached, pwnedRangeQuery } from './password-policy.utils';

describe('pwnedRangeQuery', () => {
  it('splits the upper-case SHA-1 into a 5-char prefix and the rest', () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    expect(pwnedRangeQuery('password')).toEqual({
      prefix: '5BAA6',
      suffix: '1E4C9B93F3F0682250B6CF8331B7EE68FD8',
    });
  });
});

describe('isSuffixBreached', () => {
  const body = 'AAA111:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:52256179\r\nBBB222:0';

  it('finds a listed suffix with a positive count', () => {
    expect(isSuffixBreached(body, '1E4C9B93F3F0682250B6CF8331B7EE68FD8')).toBe(true);
  });

  it('ignores padding entries (count 0) and absent suffixes', () => {
    expect(isSuffixBreached(body, 'BBB222')).toBe(false);
    expect(isSuffixBreached(body, 'CCC333')).toBe(false);
    expect(isSuffixBreached('', 'CCC333')).toBe(false);
  });
});
