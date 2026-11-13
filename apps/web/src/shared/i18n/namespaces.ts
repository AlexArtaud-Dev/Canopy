/**
 * Message files loaded for every request; the file name is the namespace. `emails` is left out on
 * purpose: it is only rendered server-side, in the recipient's locale. A test checks this list
 * against `messages/en` so a new file cannot be forgotten.
 */
export const namespaces = [
  'access',
  'audit',
  'auth',
  'commands',
  'common',
  'devices',
  'errors',
  'files',
  'jobs',
  'mail',
  'plugins',
  'settings',
  'shares',
  'shell',
  'system',
  'trash',
  'users',
  'whatsNew',
] as const;

export const serverOnlyNamespaces = ['emails'] as const;
