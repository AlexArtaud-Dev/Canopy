import type { CommandEntry, CommandParam, CommandPlugin } from '@canopy/contracts';

/** What a form field holds: text for inputs, a boolean for switches. */
export type FormValue = string | boolean;

/** Starting form values: each param's default, or empty; `preset` fills some (a folder). */
export function initialValues(
  params: readonly CommandParam[],
  preset: Readonly<Record<string, FormValue>> = {},
): Record<string, FormValue> {
  const values: Record<string, FormValue> = {};
  for (const param of params) {
    const given = preset[param.name];
    if (given !== undefined) values[param.name] = given;
    else if (param.type === 'bool') values[param.name] = param.default === true;
    else if (typeof param.default === 'string' || typeof param.default === 'number') {
      values[param.name] = String(param.default);
    } else values[param.name] = '';
  }
  return values;
}

/** The first required field still empty: where the cursor goes when the form opens. */
export function firstToFill(
  params: readonly CommandParam[],
  values: Readonly<Record<string, FormValue>>,
): string | undefined {
  return params.find((param) => param.required && values[param.name] === '')?.name;
}

/** The param the right-clicked entry fills in: the command's first path param. */
export function targetParam(entry: CommandEntry): string | undefined {
  return entry.params.find((param) => param.type === 'path')?.name;
}

/** What was right-clicked in the file browser: a folder, or a file known by its name. */
export type MenuTarget = { kind: 'folder' } | { kind: 'file'; name: string };

/**
 * Whether a command is offered on the target: its first path param says what it works on (a
 * folder unless it declares `on: file`), and files may be narrowed to some extensions.
 */
export function worksOn(entry: CommandEntry, target: MenuTarget): boolean {
  const param = entry.params.find((candidate) => candidate.type === 'path');
  if (!param) return false;
  if (target.kind === 'folder') return param.on !== 'file';
  if (param.on !== 'file') return false;
  if (!param.extensions || param.extensions.length === 0) return true;
  const dot = target.name.lastIndexOf('.');
  return dot > 0 && param.extensions.includes(target.name.slice(dot + 1).toLowerCase());
}

/** A plugin and its commands that work on an entry, as the file browser's menu lists them. */
export interface PluginMenu {
  plugin: CommandPlugin;
  entries: CommandEntry[];
}

/** Plugin commands offered on the target, grouped by plugin (in catalog order). */
export function pluginMenus(entries: readonly CommandEntry[], target: MenuTarget): PluginMenu[] {
  const menus = new Map<string, PluginMenu>();
  for (const entry of entries) {
    if (!entry.plugin || !worksOn(entry, target)) continue;
    const menu = menus.get(entry.plugin.id);
    if (menu) menu.entries.push(entry);
    else menus.set(entry.plugin.id, { plugin: entry.plugin, entries: [entry] });
  }
  return [...menus.values()];
}

/**
 * The request's values: empty fields are left out (the engine applies defaults and reports what
 * is missing), numbers are sent as numbers. The engine validates everything again.
 */
export function requestValues(
  params: readonly CommandParam[],
  form: Readonly<Record<string, FormValue>>,
): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const param of params) {
    const value = form[param.name];
    if (typeof value === 'boolean') {
      values[param.name] = value;
      continue;
    }
    if (value === undefined || value.trim() === '') continue;
    values[param.name] = param.type === 'int' ? Number(value) : value;
  }
  return values;
}

const plainArgument = /^[\w./=:@%+,-]+$/;

/** How the argument list reads: arguments with spaces or quotes are quoted, for display only. */
export function displayArgv(binary: string, argv: readonly string[]): string {
  return [binary, ...argv]
    .map((arg) => (plainArgument.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`))
    .join(' ');
}

/** The label in the person's language. */
export function localized(text: { en: string; fr: string; es: string }, locale: string): string {
  if (locale === 'fr') return text.fr;
  if (locale === 'es') return text.es;
  return text.en;
}

/** An enum value as people read it: its label when the catalog names it, else the value. */
export function choiceLabel(
  param: Pick<CommandParam, 'choices'>,
  value: string,
  locale: string,
): string {
  const choice = param.choices?.find((candidate) => candidate.value === value);
  return choice ? localized(choice.label, locale) : value;
}
