import { unexpectedErrorCode } from '@/shared/lib/errors';

type Catalog = Readonly<Record<string, unknown>>;

/**
 * Returns `code` when the errors catalog translates it, else `system.unexpected`. Codes come from
 * the server at runtime, so they are checked against the loaded messages before use.
 */
export function resolveErrorKey(code: string, catalog: Catalog | undefined): string {
  const [module, name, ...rest] = code.split('.');
  if (!module || !name || rest.length > 0) {
    return unexpectedErrorCode;
  }
  const group = catalog?.[module];
  const isGroup = typeof group === 'object' && group !== null;
  return isGroup && typeof (group as Catalog)[name] === 'string' ? code : unexpectedErrorCode;
}
