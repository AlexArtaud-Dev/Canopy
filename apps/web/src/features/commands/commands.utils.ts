import type { CommandParam } from '@canopy/contracts';

/** What a form field holds: text for inputs, a boolean for switches. */
export type FormValue = string | boolean;

/** Starting form values: each param's default, or empty. */
export function initialValues(params: readonly CommandParam[]): Record<string, FormValue> {
  const values: Record<string, FormValue> = {};
  for (const param of params) {
    if (param.type === 'bool') values[param.name] = param.default === true;
    else if (typeof param.default === 'string' || typeof param.default === 'number') {
      values[param.name] = String(param.default);
    } else values[param.name] = '';
  }
  return values;
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
