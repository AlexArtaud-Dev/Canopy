/**
 * @jest-environment node
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { namespaces, serverOnlyNamespaces } from './namespaces';

describe('namespaces', () => {
  it('lists every message file (a missing one shows raw keys in the UI)', () => {
    const files = readdirSync(join(__dirname, '../../../messages/en'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort();
    expect([...namespaces, ...serverOnlyNamespaces].sort()).toEqual(files);
  });
});
