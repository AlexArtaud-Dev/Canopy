import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describeField, modulesWithOwnPage } from '@/features/settings/settings-form.utils';
import { locales } from '@/shared/i18n/locales';

import { appRegistry } from './modules';

type Messages = Record<string, unknown>;

function load(locale: string, namespace: string): Messages {
  const file = path.join(process.cwd(), 'messages', locale, `${namespace}.json`);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return parsed !== null && typeof parsed === 'object' ? (parsed as Messages) : {};
}

function has(messages: Messages, key: string): boolean {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return false;
    node = (node as Messages)[part];
  }
  return typeof node === 'string';
}

type Declared = (typeof appRegistry.modules)[number];

/** Labels of a module's settings page: its title, each field, group and choice. */
function settingsLabels(id: string, settings: NonNullable<Declared['settings']>): string[] {
  return Object.entries(settings.fields).flatMap(([field, meta]) => {
    const prefix = `settings:fields.${id}.${field}`;
    const shape = settings.schema.shape[field];
    const described = shape ? describeField(shape) : null;
    const options =
      described?.kind === 'select'
        ? described.options.map((option) => `settings:options.${id}.${field}.${option}`)
        : [];
    return [
      `${prefix}.label`,
      `${prefix}.description`,
      `settings:groups.${meta.group}`,
      ...options,
    ];
  });
}

/** Labels of a module's permissions: global ones in the roles editor, path ones on folders. */
function permissionLabels(declared: Declared): string[] {
  const { id, permissions } = declared;
  if (permissions?.scope === 'global') {
    return [
      `access:modules.${id}`,
      ...permissions.actions.map((action) => `access:actions.${action}`),
    ];
  }
  return (permissions?.actions ?? []).map((action) => `files:grants.actionNames.${action}`);
}

/**
 * Every label the generated screens (roles editor, folder access, settings) read from the module
 * registry, as `namespace:key`. They are looked up at run time, so only this test sees them.
 */
function registryLabels(): string[] {
  const keys = appRegistry.modules.flatMap((declared) => {
    const own = permissionLabels(declared);
    // Settings shown on a page of their own are labelled there, by hand.
    if (!declared.settings || modulesWithOwnPage.has(declared.id)) return own;
    return [
      ...own,
      `settings:modules.${declared.id}`,
      ...settingsLabels(declared.id, declared.settings),
    ];
  });
  return [...new Set(keys)];
}

describe('registry labels', () => {
  it.each(locales)('are all translated in %s', (locale) => {
    const cache = new Map<string, Messages>();
    const missing = registryLabels().filter((entry) => {
      const [namespace = '', key = ''] = entry.split(':');
      const messages = cache.get(namespace) ?? load(locale, namespace);
      cache.set(namespace, messages);
      return !has(messages, key);
    });
    expect(missing).toEqual([]);
  });
});
