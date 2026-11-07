import type common from '../../../messages/en/common.json';
import type shell from '../../../messages/en/shell.json';
import type system from '../../../messages/en/system.json';
import type { Locale } from './locales';

// English is the source language: its files define the key set every locale must provide.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: { common: typeof common; shell: typeof shell; system: typeof system };
  }
}
