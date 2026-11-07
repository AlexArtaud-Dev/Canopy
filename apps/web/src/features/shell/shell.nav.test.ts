import { isNavItemActive } from './shell.nav';

describe('isNavItemActive', () => {
  it.each([
    ['/', '/', true],
    ['/', '/system', false],
    ['/system', '/system', true],
    ['/system', '/system/logs', true],
    ['/system', '/systems', false],
  ])('href %s at %s → %s', (href, pathname, expected) => {
    expect(isNavItemActive(href, pathname)).toBe(expected);
  });
});
