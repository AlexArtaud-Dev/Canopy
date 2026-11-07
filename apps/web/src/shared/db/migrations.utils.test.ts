import { pendingMigrations } from './migrations.utils';

const migrations = [{ folderMillis: 300 }, { folderMillis: 100 }, { folderMillis: 200 }];

describe('pendingMigrations', () => {
  it('returns every migration, oldest first, on a fresh database', () => {
    expect(pendingMigrations(migrations, null).map((m) => m.folderMillis)).toEqual([100, 200, 300]);
  });

  it('skips migrations already applied (bigint arrives as a string)', () => {
    expect(pendingMigrations(migrations, '200').map((m) => m.folderMillis)).toEqual([300]);
  });

  it('returns nothing when up to date', () => {
    expect(pendingMigrations(migrations, 300)).toEqual([]);
  });
});
