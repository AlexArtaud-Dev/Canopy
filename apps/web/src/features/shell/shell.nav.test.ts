import { isNavItemActive, navGroups } from './shell.nav';

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

describe('navGroups', () => {
  it('declares unique hrefs', () => {
    const hrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
