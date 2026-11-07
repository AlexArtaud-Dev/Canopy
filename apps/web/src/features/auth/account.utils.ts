import { z } from 'zod';

import { passwordSchema } from './auth.utils';

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
  contactEmail: z
    .union([z.literal(''), z.email()])
    .transform((value) => (value === '' ? null : value)),
});

export type ProfileInput = z.input<typeof profileSchema>;

export function changePasswordSchema(passwordMinLength: number) {
  return z
    .object({
      currentPassword: z.string().min(1).max(1024),
      newPassword: passwordSchema(passwordMinLength),
      confirmPassword: z.string(),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      path: ['confirmPassword'],
      message: 'mismatch',
    });
}

export interface DeviceSummary {
  browser: string | null;
  os: string | null;
}

// Order matters: Edge and Opera also announce Chrome; Chrome also announces Safari.
const browsers: readonly [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const systems: readonly [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

function firstMatch(table: readonly [RegExp, string][], userAgent: string): string | null {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/** Coarse "Firefox on Windows" label for the sessions list; no library, no fingerprinting. */
export function describeUserAgent(userAgent: string | null): DeviceSummary {
  if (!userAgent) return { browser: null, os: null };
  return { browser: firstMatch(browsers, userAgent), os: firstMatch(systems, userAgent) };
}
