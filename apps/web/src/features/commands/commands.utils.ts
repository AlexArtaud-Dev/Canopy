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
  return hasExtension(target.name, param.extensions);
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

/** A value a field can take, with the name people pick it by. */
export interface Choice {
  label: string;
  value: string;
}

/**
 * Reads choices from a command's output: one `value<TAB>label` line each. Other lines (messages,
 * blanks) are ignored, like values that could pass as an option; a value listed twice counts once.
 */
export function parseChoices(lines: readonly string[]): Choice[] {
  const choices = new Map<string, Choice>();
  for (const line of lines) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const value = line.slice(0, tab).trim();
    const label = line.slice(tab + 1).trim();
    if (value === '' || value.startsWith('-') || choices.has(value)) continue;
    choices.set(value, { value, label: label === '' ? value : label });
  }
  return [...choices.values()];
}

/** Saved values first, then what was found that is not saved already. */
export function mergeChoices(saved: readonly Choice[], found: readonly Choice[]): Choice[] {
  const known = new Set(saved.map((choice) => choice.value));
  return [...saved, ...found.filter((choice) => !known.has(choice.value))];
}

/** Commands from one plugin, or the built-in ones (no plugin), as the commands page lists them. */
export interface CommandGroup {
  /** The plugin's id, or `builtIn`. */
  id: string;
  plugin?: CommandPlugin;
  entries: CommandEntry[];
}

/** The group of the commands that ship with Canopy. */
export const builtInGroup = 'builtIn';

/** Lower case without accents: "Écran" is found by typing "ecran". */
export function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Whether every word of the query appears in the command's name, description or plugin name, in
 * any of the three languages: someone may remember a command by its English name.
 */
export function matchesQuery(entry: CommandEntry, query: string): boolean {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const texts = [entry.name, entry.description, ...(entry.plugin ? [entry.plugin.name] : [])];
  const haystack = searchable(
    [entry.id, ...texts.flatMap((text) => [text.en, text.fr, text.es])].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

/**
 * The commands list: secondary commands left out (they are reached where they belong), the rest
 * matching the query, grouped by plugin in catalog order, built-in commands last.
 */
export function commandGroups(entries: readonly CommandEntry[], query: string): CommandGroup[] {
  const groups = new Map<string, CommandGroup>();
  const builtIn: CommandEntry[] = [];
  for (const entry of entries) {
    if (entry.secondary === true || !matchesQuery(entry, query)) continue;
    if (!entry.plugin) {
      builtIn.push(entry);
      continue;
    }
    const group = groups.get(entry.plugin.id);
    if (group) group.entries.push(entry);
    else
      groups.set(entry.plugin.id, { id: entry.plugin.id, plugin: entry.plugin, entries: [entry] });
  }
  const listed = [...groups.values()];
  if (builtIn.length > 0) listed.push({ id: builtInGroup, entries: builtIn });
  return listed;
}

/** How many recently run commands the page keeps on top. */
export const maxRecent = 5;

/** The ids run lately, the latest first, with `id` moved or added on top. */
export function withRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, maxRecent);
}

/** Recently run commands that are still listed (installed, visible, not secondary). */
export function recentEntries(
  recent: readonly string[],
  entries: readonly CommandEntry[],
): CommandEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return recent
    .map((id) => byId.get(id))
    .filter((entry): entry is CommandEntry => entry !== undefined && entry.secondary !== true);
}

/** The form's fields: what a run needs first, then the options folded under "more options". */
export function splitParams(params: readonly CommandParam[]): {
  essential: CommandParam[];
  advanced: CommandParam[];
} {
  return {
    essential: params.filter((param) => param.advanced !== true),
    advanced: params.filter((param) => param.advanced === true),
  };
}

/**
 * Whether "more options" starts open: some folded option already holds something else than its
 * default (a saved value, a preset), which people must see before running.
 */
export function advancedInUse(
  params: readonly CommandParam[],
  values: Readonly<Record<string, FormValue>>,
): boolean {
  const defaults = initialValues(params);
  return params.some(
    (param) =>
      param.advanced === true &&
      values[param.name] !== undefined &&
      values[param.name] !== defaults[param.name],
  );
}

/** An entry of a folder as the path picker shows it. */
export interface PickerEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Whether a file name ends with one of the extensions (any file when none is given). */
export function hasExtension(name: string, extensions: readonly string[] | undefined): boolean {
  if (!extensions || extensions.length === 0) return true;
  const dot = name.lastIndexOf('.');
  return dot > 0 && extensions.includes(name.slice(dot + 1).toLowerCase());
}

/**
 * What the path picker lists: folders to open, then (when a file is picked) the files the param
 * accepts. Hidden files stay hidden: they are seldom what a command works on.
 */
export function pickerEntries(
  entries: readonly PickerEntry[],
  pick: 'file' | 'folder',
  extensions?: readonly string[],
): PickerEntry[] {
  const visible = entries.filter((entry) => !entry.name.startsWith('.'));
  const byName = (a: PickerEntry, b: PickerEntry) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const folders = visible.filter((entry) => entry.isDirectory).sort(byName);
  if (pick === 'folder') return folders;
  const files = visible
    .filter((entry) => !entry.isDirectory && hasExtension(entry.name, extensions))
    .sort(byName);
  return [...folders, ...files];
}

/** The folder the picker opens on: the one holding the current value, else the root. */
export function pickerStart(value: string, pick: 'file' | 'folder'): string {
  const clean = value.trim();
  if (!clean.startsWith('/')) return '/';
  if (pick === 'folder') return clean;
  const slash = clean.lastIndexOf('/');
  return slash <= 0 ? '/' : clean.slice(0, slash);
}

/**
 * The commands that play a file on a device (a cast): plugin commands offered on that file whose
 * form takes a device. The file viewer offers them next to the player.
 */
export function castCommands(entries: readonly CommandEntry[], fileName: string): CommandEntry[] {
  return entries.filter(
    (entry) =>
      entry.plugin !== undefined &&
      entry.secondary !== true &&
      worksOn(entry, { kind: 'file', name: fileName }) &&
      entry.params.some((param) => param.device !== undefined),
  );
}
