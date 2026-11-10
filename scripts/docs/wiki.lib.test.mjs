import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertUniqueNames,
  home,
  pageName,
  placeDoc,
  rewriteLinks,
  sidebar,
  sourceNotice,
  titleOf,
} from './wiki.lib.mjs';

const repo = 'https://github.com/o/r';

describe('titleOf', () => {
  it('reads the first heading without a trailing aside', () => {
    assert.equal(titleOf('intro\n# Users (Administration › Users)\n# Other', 'x'), 'Users');
    assert.equal(titleOf('no heading', 'install'), 'install');
  });
});

describe('pageName', () => {
  it('keeps letters, digits and dashes', () => {
    assert.equal(pageName('Commands & plugins'), 'Commands-and-plugins');
    assert.equal(pageName('Engine (Go): v1'), 'Engine-Go-v1');
    assert.equal(pageName('Privacy in Canopy'), 'Privacy-in-Canopy');
    assert.equal(pageName("What's new"), 'Whats-new');
  });
});

describe('placeDoc', () => {
  it('names section READMEs after the section', () => {
    assert.deepEqual(placeDoc('user/README.md', '# Canopy user guide'), {
      relative: 'user/README.md',
      section: 'user',
      name: 'User-guide',
    });
  });

  it('prefixes contributor pages and keeps loose docs', () => {
    assert.equal(placeDoc('dev/engine.md', '# Engine (Go)').name, 'Dev-Engine');
    assert.equal(placeDoc('features/trash.md', '# Trash').title, 'Trash');
    assert.deepEqual(placeDoc('roadmap.md', '# Canopy roadmap (to v1)'), {
      relative: 'roadmap.md',
      section: null,
      name: 'Canopy-roadmap',
      title: 'Canopy roadmap',
    });
  });
});

describe('assertUniqueNames', () => {
  it('refuses two docs on one page', () => {
    assert.doesNotThrow(() => assertUniqueNames([{ name: 'A', relative: 'a.md' }]));
    assert.throws(
      () =>
        assertUniqueNames([
          { name: 'A', relative: 'user/a.md' },
          { name: 'A', relative: 'features/a.md' },
        ]),
      /user\/a\.md/,
    );
  });
});

describe('rewriteLinks', () => {
  const pages = new Map([
    ['user/install.md', { name: 'Install' }],
    ['user/README.md', { name: 'User-guide' }],
    ['features/commands.md', { name: 'Command-catalog' }],
  ]);
  const rewrite = (markdown) => rewriteLinks(markdown, 'user/upgrade.md', pages, repo);

  it('links other docs as wiki pages, anchors kept', () => {
    assert.equal(rewrite('[i](install.md#folders)'), '[i](Install#folders)');
    assert.equal(rewrite('[c](../features/commands.md)'), '[c](Command-catalog)');
    assert.equal(rewrite('[g](../user)'), '[g](User-guide)');
  });

  it('points other repository files to GitHub', () => {
    assert.equal(
      rewrite('[d](../../docker/compose.yaml)'),
      `[d](${repo}/blob/main/docker/compose.yaml)`,
    );
    assert.equal(rewrite('[dev](../dev/)'), `[dev](${repo}/tree/main/docs/dev)`);
  });

  it('keeps assets, absolute URLs and anchors', () => {
    assert.equal(rewrite('![logo](../assets/logo.svg)'), '![logo](assets/logo.svg)');
    assert.equal(rewrite('[x](https://a.b/c.md)'), '[x](https://a.b/c.md)');
    assert.equal(rewrite('[top](#top)'), '[top](#top)');
  });
});

describe('sourceNotice', () => {
  it('links the source file', () => {
    assert.match(sourceNotice('user/install.md', repo), /blob\/main\/docs\/user\/install\.md/);
  });
});

describe('sidebar and home', () => {
  const pages = [
    { section: 'features', name: 'Trash', title: 'Trash' },
    { section: 'user', name: 'Install', title: 'Install' },
    { section: 'user', name: 'User-guide' },
    { section: 'features', name: 'Archives', title: 'Archives' },
    { section: null, name: 'Canopy-roadmap', title: 'Canopy roadmap' },
  ];

  it('groups pages by section, README first', () => {
    const text = sidebar(pages);
    assert.ok(text.indexOf('User guide](User-guide)') < text.indexOf('(Install)'));
    assert.ok(text.indexOf('(Archives)') < text.indexOf('(Trash)'));
    assert.ok(!text.includes('**Development**'));
    assert.match(text, /\*\*More\*\*\n\n- \[Canopy roadmap\]/);
  });

  it('leaves out an empty More group', () => {
    assert.ok(!sidebar(pages.slice(0, 2)).includes('**More**'));
  });

  it('opens on the user guide when there is one', () => {
    assert.match(home(pages, repo), /Start with the \[User guide\]\(User-guide\)/);
    assert.doesNotMatch(home(pages.slice(0, 1), repo), /Start with/);
  });
});
