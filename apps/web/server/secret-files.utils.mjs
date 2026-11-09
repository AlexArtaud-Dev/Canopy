/**
 * Docker's NAME_FILE convention for Canopy's variables: when CANOPY_X is empty and CANOPY_X_FILE
 * names a file, CANOPY_X becomes that file's content (trimmed). A value set directly wins.
 * Returns the variables to set; `read` is injected so this stays pure.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(path: string) => string} read
 * @returns {Record<string, string>}
 */
export function resolveSecretFiles(env, read) {
  /** @type {Record<string, string>} */
  const resolved = {};
  for (const [name, path] of Object.entries(env)) {
    if (!name.startsWith('CANOPY_') || !name.endsWith('_FILE') || !path) continue;
    const target = name.slice(0, -'_FILE'.length);
    if (env[target]) continue;
    resolved[target] = read(path).trim();
  }
  return resolved;
}
