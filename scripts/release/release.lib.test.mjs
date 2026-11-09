import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import {
  changeTypes,
  compareVersionsDesc,
  locales,
  nextVersion,
  parseChangelog,
  parseVersion,
  releaseFileContent,
  renderNotes,
  versionOfReleaseFile,
} from './release.lib.mjs';

const entry = (type, issue, scope = 'files') => ({
  type,
  scope,
  issue,
  text: { en: `${type} ${issue}`, fr: 'fr', es: 'es' },
});

describe('changelog files', () => {
  it('accepts valid files, with or without a date', () => {
    const raw =
      'entries:\n  - type: feat\n    scope: files\n    issue: 1\n    text: { en: a, fr: b, es: c }\n';
    assert.equal(parseChangelog(raw).success, true);
    assert.equal(parseChangelog(`date: 2026-11-09\n${raw}`).success, true);
    assert.deepEqual(parseChangelog('').data, { entries: [] });
  });

  it('refuses missing translations, bad scopes and unknown fields', () => {
    const bad = [
      'entries:\n  - { type: feat, scope: files, issue: 1, text: { en: a, fr: b } }\n',
      'entries:\n  - { type: feat, scope: Files, issue: 1, text: { en: a, fr: b, es: c } }\n',
      'entries:\n  - { type: feat, scope: files, text: { en: a, fr: b, es: c } }\n',
      'entries: []\nversion: 1\n',
      'date: yesterday\nentries: []\n',
    ];
    for (const raw of bad) assert.equal(parseChangelog(raw).success, false, raw);
  });

  it('knows the types and languages', () => {
    assert.deepEqual(locales, ['en', 'fr', 'es']);
    assert.equal(changeTypes[0], 'feat');
  });
});

describe('CalVer', () => {
  const november = new Date('2026-11-09T12:00:00Z');

  it('parses versions', () => {
    assert.deepEqual(parseVersion('2026.11.3'), { year: 2026, month: 11, micro: 3 });
    assert.equal(parseVersion('2026.13.0'), null);
    assert.equal(parseVersion('v2026.11.0'), null);
    assert.equal(parseVersion('1.0.0'), null);
  });

  it('counts releases within the month and restarts each month', () => {
    assert.equal(nextVersion(november, []), '2026.11.0');
    assert.equal(
      nextVersion(november, ['2026.11.0', '2026.11.1', '2026.10.4', 'junk']),
      '2026.11.2',
    );
    assert.equal(nextVersion(new Date('2026-12-01T00:00:00Z'), ['2026.11.5']), '2026.12.0');
    assert.equal(nextVersion(new Date('2026-12-31T23:59:59Z'), []), '2026.12.0');
  });

  it('orders versions newest first', () => {
    const sorted = ['2026.9.0', '2026.11.0', '2026.11.10', '2026.11.2', 'junk', '2025.12.0'].sort(
      compareVersionsDesc,
    );
    assert.deepEqual(sorted, [
      '2026.11.10',
      '2026.11.2',
      '2026.11.0',
      '2026.9.0',
      '2025.12.0',
      'junk',
    ]);
  });

  it('reads the version of a release file', () => {
    assert.equal(versionOfReleaseFile('changelog/releases/2026.11.0.yaml'), '2026.11.0');
    assert.equal(versionOfReleaseFile('/repo/changelog/releases/2026.11.0.yaml'), '2026.11.0');
    assert.equal(versionOfReleaseFile('changelog/releases/notes.yaml'), null);
    assert.equal(versionOfReleaseFile('changelog/unreleased.yaml'), null);
  });
});

describe('release output', () => {
  it('writes the release file with its date', () => {
    const content = releaseFileContent([entry('feat', 1)], new Date('2026-11-09T22:00:00Z'));
    assert.deepEqual(parse(content), { date: '2026-11-09', entries: [entry('feat', 1)] });
    assert.equal(parseChangelog(content).success, true);
  });

  it('renders notes by type in a fixed order', () => {
    const notes = renderNotes(
      [entry('fix', 2, 'shares'), entry('feat', 1), entry('feat', 3)],
      'o/r',
    );
    assert.equal(
      notes,
      '### New\n\n' +
        '- **files**: feat 1 ([#1](https://github.com/o/r/issues/1))\n' +
        '- **files**: feat 3 ([#3](https://github.com/o/r/issues/3))\n\n' +
        '### Fixes\n\n' +
        '- **shares**: fix 2 ([#2](https://github.com/o/r/issues/2))\n',
    );
    assert.equal(renderNotes([], 'o/r'), 'No user-facing changes.\n');
  });
});
