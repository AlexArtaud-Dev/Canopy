import { isBuiltInRoleKey } from './role-label';

describe('isBuiltInRoleKey', () => {
  it('recognizes the seeded roles only', () => {
    expect(isBuiltInRoleKey('admin')).toBe(true);
    expect(isBuiltInRoleKey('viewer')).toBe(true);
    expect(isBuiltInRoleKey('custom')).toBe(false);
    expect(isBuiltInRoleKey(null)).toBe(false);
  });
});
