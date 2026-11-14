import {
  createShareSchema,
  extensionOf,
  megabytes,
  parseExtensions,
  uploadRefusal,
  defaultExpiry,
  expiryDate,
  expiryOptions,
  relativeShared,
  resolveShared,
  shareLink,
  shareStatus,
  sharedCrumbs,
  sharedPathSchema,
  shareIdSchema,
  sharePasswordMaxLength,
  shareTokenPattern,
  tokenSchema,
  codeRefusal,
  depositorSchema,
  dropOffCodeAttempts,
  dropOffCodeSchema,
  dropOffStep,
  dropOffCodeLength,
  dropOffCodeTtlMs,
  shareIdentities,
  dropOffEmailDue,
  dropOffEmailFileLimit,
  dropOffQuietMs,
} from './shares.utils';

const now = new Date('2026-01-10T00:00:00Z');
const live = {
  kind: 'download' as const,
  expiresAt: new Date('2026-01-11T00:00:00Z'),
  revokedAt: null,
  maxDownloads: null,
  downloadCount: 0,
  maxFiles: null,
  uploadedFiles: 0,
};

describe('shareStatus', () => {
  it('names why a link stopped working', () => {
    expect(shareStatus(live, now)).toBe('active');
    expect(shareStatus({ ...live, revokedAt: now }, now)).toBe('revoked');
    expect(shareStatus({ ...live, expiresAt: now }, now)).toBe('expired');
    expect(shareStatus({ ...live, maxDownloads: 2, downloadCount: 2 }, now)).toBe('exhausted');
    expect(shareStatus({ ...live, maxDownloads: 2, downloadCount: 1 }, now)).toBe('active');
    const inbox = { ...live, kind: 'upload' as const, maxDownloads: 1, downloadCount: 5 };
    expect(shareStatus(inbox, now)).toBe('active');
    expect(shareStatus({ ...inbox, maxFiles: 3, uploadedFiles: 3 }, now)).toBe('exhausted');
  });
});

describe('expiry', () => {
  it('offers choices up to the maximum', () => {
    expect(expiryOptions(90)).toEqual([1, 7, 30, 90]);
    expect(expiryOptions(14)).toEqual([1, 7, 14]);
    expect(expiryOptions(1)).toEqual([1]);
    expect(defaultExpiry(7, 3)).toBe(3);
    expect(defaultExpiry(7, 90)).toBe(7);
    expect(expiryDate(2, now).toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });
});

describe('shared paths', () => {
  it('stays inside the share', () => {
    expect(resolveShared('/media/photos', '/')).toBe('/media/photos');
    expect(resolveShared('/media/photos', 'trip/a.jpg')).toBe('/media/photos/trip/a.jpg');
    expect(resolveShared('/media/photos', '/../../etc')).toBe('/media/photos/etc');
    expect(resolveShared('/', '/media')).toBe('/media');
    expect(resolveShared('/media', 'a\u0000b')).toBeNull();
    expect(relativeShared('/media/photos', '/media/photos')).toBe('/');
    expect(relativeShared('/media/photos', '/media/photos/trip')).toBe('/trip');
    expect(relativeShared('/', '/media')).toBe('/media');
    expect(sharedCrumbs('/trip/day 1')).toEqual([
      { name: 'trip', path: '/trip' },
      { name: 'day 1', path: '/trip/day 1' },
    ]);
    expect(sharedCrumbs('/')).toEqual([]);
  });
});

describe('inputs', () => {
  it('validates requests', () => {
    expect(createShareSchema.parse({ path: '/a', expiresInDays: 7 })).toEqual({
      path: '/a',
      expiresInDays: 7,
      password: '',
      maxDownloads: null,
      kind: 'download',
      upload: {
        extensions: '',
        maxFileMb: null,
        maxTotalMb: null,
        maxFiles: null,
        identity: 'none',
        notifyByEmail: false,
      },
    });
    expect(
      createShareSchema.safeParse({ path: '/a', expiresInDays: 0, maxDownloads: 0 }).success,
    ).toBe(false);
    expect(
      createShareSchema.safeParse({
        path: '/a',
        expiresInDays: 1,
        password: 'x'.repeat(sharePasswordMaxLength + 1),
      }).success,
    ).toBe(false);
    const token = 'a'.repeat(43);
    expect(shareTokenPattern.test(token)).toBe(true);
    expect(tokenSchema.safeParse('short').success).toBe(false);
    expect(shareIdSchema.safeParse({ id: 'nope' }).success).toBe(false);
    expect(sharedPathSchema.parse(undefined)).toBe('/');
    expect(shareLink('https://nas.example/', token)).toBe(`https://nas.example/s/${token}`);
  });
});

describe('upload rules', () => {
  const rules = {
    allowedExtensions: ['pdf', 'jpg'],
    maxFileBytes: 100,
    maxTotalBytes: 250,
    maxFiles: 3,
  };
  const usage = { uploadedBytes: 0, uploadedFiles: 0 };

  it('reads typed extensions', () => {
    expect(parseExtensions('pdf, .JPG; png  pdf')).toEqual(['pdf', 'jpg', 'png']);
    expect(parseExtensions(' , ')).toBeNull();
    expect(parseExtensions('../etc')).toBeNull();
    expect(extensionOf('a.tar.GZ')).toBe('gz');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.env')).toBe('');
  });

  it('checks each file against the link', () => {
    expect(uploadRefusal(rules, usage, { name: 'a.PDF', size: 10 })).toBeNull();
    expect(uploadRefusal(rules, usage, { name: 'a.exe', size: 10 })).toBe(
      'shares.type_not_allowed',
    );
    expect(uploadRefusal(rules, usage, { name: 'a.pdf', size: 101 })).toBe('shares.file_too_large');
    expect(
      uploadRefusal(rules, { uploadedBytes: 0, uploadedFiles: 3 }, { name: 'a.pdf', size: 1 }),
    ).toBe('shares.files_exceeded');
    expect(
      uploadRefusal(rules, { uploadedBytes: 200, uploadedFiles: 1 }, { name: 'a.pdf', size: 60 }),
    ).toBe('shares.total_exceeded');
    const open = {
      allowedExtensions: null,
      maxFileBytes: null,
      maxTotalBytes: null,
      maxFiles: null,
    };
    expect(uploadRefusal(open, usage, { name: 'anything', size: 1e12 })).toBeNull();
    expect(megabytes(2)).toBe(2097152);
    expect(megabytes(null)).toBeNull();
  });
});

describe('depositors', () => {
  const declared = { name: 'Ada', email: 'ada@example.com', verified: false, codePending: false };

  it('offers three levels and short-lived six-digit codes', () => {
    expect(shareIdentities).toEqual(['none', 'declared', 'verified']);
    expect(dropOffCodeLength).toBe(6);
    expect(dropOffCodeTtlMs).toBe(15 * 60_000);
  });

  it('asks nothing of links that ask nothing', () => {
    expect(dropOffStep('none', null)).toBe('ready');
  });

  it('asks a name and e-mail first, then is ready for a declared identity', () => {
    expect(dropOffStep('declared', null)).toBe('identity');
    expect(dropOffStep('declared', { ...declared, email: null })).toBe('identity');
    expect(dropOffStep('declared', declared)).toBe('ready');
  });

  it('asks for the code once sent, and again for an e-mail when the code is gone', () => {
    expect(dropOffStep('verified', null)).toBe('identity');
    expect(dropOffStep('verified', { ...declared, codePending: true })).toBe('code');
    expect(dropOffStep('verified', declared)).toBe('identity');
    expect(dropOffStep('verified', { ...declared, verified: true })).toBe('ready');
  });

  it('accepts the right code in time only, and a few tries at most', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const later = new Date('2026-11-14T12:10:00Z');
    const pending = { codeExpiresAt: later, codeAttempts: 0 };
    expect(codeRefusal(pending, true, now)).toBeNull();
    expect(codeRefusal(pending, false, now)).toBe('shares.code_invalid');
    expect(codeRefusal({ ...pending, codeExpiresAt: now }, true, now)).toBe('shares.code_expired');
    expect(codeRefusal({ ...pending, codeExpiresAt: null }, true, now)).toBe('shares.code_expired');
    expect(codeRefusal({ ...pending, codeAttempts: dropOffCodeAttempts }, true, now)).toBe(
      'shares.code_expired',
    );
  });

  it('validates what depositors type', () => {
    const token = 'x'.repeat(43);
    expect(
      depositorSchema.safeParse({ token, name: ' Ada ', email: 'ada@example.com' }).data,
    ).toMatchObject({ name: 'Ada' });
    expect(depositorSchema.safeParse({ token, name: '', email: 'ada@example.com' }).success).toBe(
      false,
    );
    expect(depositorSchema.safeParse({ token, name: 'Ada', email: 'not-an-email' }).success).toBe(
      false,
    );
    expect(dropOffCodeSchema.safeParse({ token, code: '012345' }).success).toBe(true);
    expect(dropOffCodeSchema.safeParse({ token, code: '12345' }).success).toBe(false);
  });

  it('keeps upload links open to anyone unless asked', () => {
    const upload = createShareSchema.parse({ path: '/a', expiresInDays: 1, kind: 'upload' });
    expect(upload.upload.identity).toBe('none');
    expect(
      createShareSchema.safeParse({
        path: '/a',
        expiresInDays: 1,
        kind: 'upload',
        upload: { identity: 'verified' },
      }).data?.upload.identity,
    ).toBe('verified');
  });
});

describe('drop-off e-mails', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const quietSince = new Date(now.getTime() - dropOffQuietMs);
  const busy = new Date(now.getTime() - dropOffQuietMs + 1000);

  it('waits until the depositor is done, then tells about new files once', () => {
    expect(
      dropOffEmailDue({ fileCount: 3, emailedFileCount: 0, lastUploadAt: quietSince }, now),
    ).toBe(true);
    expect(dropOffEmailDue({ fileCount: 3, emailedFileCount: 0, lastUploadAt: busy }, now)).toBe(
      false,
    );
    expect(
      dropOffEmailDue({ fileCount: 3, emailedFileCount: 3, lastUploadAt: quietSince }, now),
    ).toBe(false);
    expect(
      dropOffEmailDue({ fileCount: 5, emailedFileCount: 3, lastUploadAt: quietSince }, now),
    ).toBe(true);
    expect(dropOffEmailDue({ fileCount: 0, emailedFileCount: 0, lastUploadAt: null }, now)).toBe(
      false,
    );
  });

  it('lists a handful of names and waits two minutes', () => {
    expect(dropOffEmailFileLimit).toBe(20);
    expect(dropOffQuietMs).toBe(120_000);
  });
});
