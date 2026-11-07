import type access from '../../../messages/en/access.json';
import type auth from '../../../messages/en/auth.json';
import type common from '../../../messages/en/common.json';
import type errors from '../../../messages/en/errors.json';
import type files from '../../../messages/en/files.json';
import type shell from '../../../messages/en/shell.json';
import type system from '../../../messages/en/system.json';
import type users from '../../../messages/en/users.json';
import type { Locale } from './locales';

// English is the source language: its files define the key set every locale must provide.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      access: typeof access;
      auth: typeof auth;
      common: typeof common;
      errors: typeof errors;
      files: typeof files;
      shell: typeof shell;
      system: typeof system;
      users: typeof users;
    };
  }
}
