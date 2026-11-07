import {
  createUserSchema,
  editUserSchema,
  likePattern,
  pageCount,
  removesLastAdmin,
  resetPasswordSchema,
  userTargetSchema,
  usersPageSize,
  usersQuerySchema,
} from './users.utils';

describe('usersQuerySchema', () => {
  it('reads search and page, falling back on junk', () => {
    expect(usersQuerySchema.parse({ q: ' ada ', page: '3' })).toEqual({ q: 'ada', page: 3 });
    expect(usersQuerySchema.parse({ q: ['x'], page: '-2' })).toEqual({ q: '', page: 1 });
    expect(usersQuerySchema.parse({})).toEqual({ q: '', page: 1 });
  });
});

describe('pageCount', () => {
  it('always has at least one page', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(5, 2)).toBe(3);
  });
});

describe('likePattern', () => {
  it('escapes LIKE wildcards', () => {
    expect(likePattern('a_b%c\\')).toBe('%a\\_b\\%c\\\\%');
  });
});

describe('user schemas', () => {
  const roleId = '2b1f5c1e-8a7d-4c1b-9f0e-3d2a1b0c9e8f';

  it('creates with roles on top of the new-account rules', () => {
    const base = {
      username: 'grace',
      password: 'a long passphrase',
      confirmPassword: 'a long passphrase',
    };
    expect(createUserSchema(12).safeParse({ ...base, roleIds: [roleId] }).success).toBe(true);
    expect(createUserSchema(12).safeParse({ ...base, roleIds: ['nope'] }).success).toBe(false);
  });

  it('edits name, optional email and roles', () => {
    expect(
      editUserSchema.parse({ userId: 'u1', displayName: ' Grace ', contactEmail: '', roleIds: [] }),
    ).toEqual({ userId: 'u1', displayName: 'Grace', contactEmail: null, roleIds: [] });
    expect(
      editUserSchema.parse({
        userId: 'u1',
        displayName: 'Grace',
        contactEmail: 'g@example.com',
        roleIds: [],
      }).contactEmail,
    ).toBe('g@example.com');
  });

  it('resets a password with confirmation', () => {
    const schema = resetPasswordSchema(12);
    expect(
      schema.safeParse({ userId: 'u1', password: 'x'.repeat(12), confirmPassword: 'x'.repeat(12) })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ userId: 'u1', password: 'x'.repeat(12), confirmPassword: 'y' }).success,
    ).toBe(false);
  });
});

describe('removesLastAdmin', () => {
  it('protects the only active administrator', () => {
    expect(removesLastAdmin(['a'], 'a')).toBe(true);
    expect(removesLastAdmin(['a', 'b'], 'a')).toBe(false);
    expect(removesLastAdmin(['a'], 'b')).toBe(false);
    expect(removesLastAdmin([], 'a')).toBe(false);
  });
});

describe('constants', () => {
  it('pages users by 20 and needs a user id for targeted actions', () => {
    expect(usersPageSize).toBe(20);
    expect(userTargetSchema.safeParse({ userId: '' }).success).toBe(false);
  });
});
