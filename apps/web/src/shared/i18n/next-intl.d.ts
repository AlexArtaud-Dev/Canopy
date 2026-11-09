import type access from '../../../messages/en/access.json';
import type audit from '../../../messages/en/audit.json';
import type auth from '../../../messages/en/auth.json';
import type commands from '../../../messages/en/commands.json';
import type common from '../../../messages/en/common.json';
import type errors from '../../../messages/en/errors.json';
import type files from '../../../messages/en/files.json';
import type jobs from '../../../messages/en/jobs.json';
import type trash from '../../../messages/en/trash.json';
import type mail from '../../../messages/en/mail.json';
import type settings from '../../../messages/en/settings.json';
import type plugins from '../../../messages/en/plugins.json';
import type shares from '../../../messages/en/shares.json';
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
      audit: typeof audit;
      auth: typeof auth;
      commands: typeof commands;
      common: typeof common;
      errors: typeof errors;
      files: typeof files;
      jobs: typeof jobs;
      trash: typeof trash;
      mail: typeof mail;
      settings: typeof settings;
      plugins: typeof plugins;
      shares: typeof shares;
      shell: typeof shell;
      system: typeof system;
      users: typeof users;
    };
  }
}
