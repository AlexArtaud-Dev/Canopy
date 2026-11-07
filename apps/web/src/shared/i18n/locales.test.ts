import {
  defaultLocale,
  isLocale,
  localeCookieName,
  localeNames,
  locales,
  resolveLocale,
} from './locales';

describe('locale constants', () => {
  it('ships English as source plus French and Spanish', () => {
    expect(locales).toEqual(['en', 'fr', 'es']);
    expect(defaultLocale).toBe('en');
  });

  it('uses the next-intl cookie name', () => {
    expect(localeCookieName).toBe('NEXT_LOCALE');
  });
});

describe('isLocale', () => {
  it.each([
    ['en', true],
    ['fr', true],
    ['es', true],
    ['de', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isLocale(value)).toBe(expected);
  });
});

describe('resolveLocale', () => {
  it('prefers a valid cookie over the browser header', () => {
    expect(resolveLocale('es', 'fr-FR,fr;q=0.9')).toBe('es');
  });

  it('ignores an unsupported cookie value', () => {
    expect(resolveLocale('de', 'fr-CA')).toBe('fr');
  });

  it('ranks Accept-Language entries by quality', () => {
    expect(resolveLocale(undefined, 'de;q=1, en;q=0.5, es;q=0.8')).toBe('es');
  });

  it('skips entries with zero or invalid quality', () => {
    expect(resolveLocale(undefined, 'fr;q=0, es;q=abc, en;q=0.1')).toBe('en');
  });

  it('falls back to the default locale', () => {
    expect(resolveLocale(undefined, null)).toBe(defaultLocale);
    expect(resolveLocale(undefined, '')).toBe(defaultLocale);
    expect(resolveLocale(undefined, 'de, ja')).toBe(defaultLocale);
  });
});

describe('localeNames', () => {
  it('names every locale in its own language', () => {
    expect(locales.map((locale) => localeNames[locale])).toEqual([
      'English',
      'Français',
      'Español',
    ]);
  });
});
