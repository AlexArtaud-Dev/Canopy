export const locales = ['en', 'fr', 'es'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';
export const localeCookieName = 'NEXT_LOCALE';

const localeSet: ReadonlySet<string> = new Set(locales);

export function isLocale(value: string): value is Locale {
  return localeSet.has(value);
}

/**
 * Picks the UI locale: an explicit cookie choice wins, then the browser's Accept-Language
 * preferences (by q-value), then the default. Region subtags are ignored (fr-CA → fr).
 */
export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (cookieValue !== undefined && isLocale(cookieValue)) {
    return cookieValue;
  }
  return matchAcceptLanguage(acceptLanguage) ?? defaultLocale;
}

function matchAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) {
    return undefined;
  }
  const ranked = header
    .split(',')
    .map(parseLanguageRange)
    .filter((range) => range.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  return ranked.map((range) => range.language).find(isLocale);
}

function parseLanguageRange(part: string): { language: string; quality: number } {
  const language = part
    .trim()
    .toLowerCase()
    .replace(/[-;].*$/s, '');
  const qualityMatch = /;\s*q=([^;]*)/.exec(part);
  const quality = qualityMatch ? Number(qualityMatch[1]) : 1;
  return { language, quality: Number.isFinite(quality) ? quality : 0 };
}
