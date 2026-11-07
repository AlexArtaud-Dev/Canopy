'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { localeCookieName, locales } from '@/shared/i18n/locales';

const oneYearInSeconds = 60 * 60 * 24 * 365;
const setLocaleInput = z.enum(locales);

/** Persists the UI language. A cookie, not a URL segment, so links stay locale-free. */
export async function setLocale(input: unknown): Promise<void> {
  const locale = setLocaleInput.parse(input);
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    path: '/',
    maxAge: oneYearInSeconds,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
