import type { CommandEntry, PluginView } from '@canopy/contracts';

import {
  actionApplies,
  actionValues,
  formatEta,
  parseViewData,
  viewActionInputSchema,
  viewHref,
  viewRefSchema,
  viewsOf,
} from './plugin-views.utils';

const text = { en: 'x', fr: 'x', es: 'x' };

const view: PluginView = {
  id: 'downloads',
  name: text,
  icon: 'download',
  source: 'jd.state',
  refreshSeconds: 3,
  widget: true,
  permission: 'plugins:view.jd.downloads',
  sections: [
    { key: 'downloads', name: text, rowActions: ['enable'] },
    { key: 'grabber', name: text, rowActions: [] },
  ],
  states: [{ key: 'running', label: text, tone: 'active' }],
  actions: [],
};

function entry(id: string, views?: PluginView[] | null): CommandEntry {
  const built: CommandEntry = {
    id,
    name: text,
    description: text,
    mode: 'basic',
    dryRun: false,
    params: [],
  };
  // null: a built-in command, with no plugin at all.
  if (views !== null) built.plugin = { id: 'jd', name: text, ...(views ? { views } : {}) };
  return built;
}

describe('plugin views', () => {
  it('lists each view once, when the person may open it', () => {
    const entries = [entry('jd.state', [view]), entry('jd.pause', [view]), entry('jd.other')];
    expect(viewsOf(entries, () => true).map((ref) => ref.view.id)).toEqual(['downloads']);
    expect(viewsOf(entries, () => false)).toEqual([]);
    expect(viewsOf([entry('rsync.sync', null)], () => true)).toEqual([]);
    expect(viewHref('jd', 'downloads')).toBe('/views/jd/downloads');
  });

  it('checks what the person sends', () => {
    expect(viewRefSchema.safeParse({ plugin: 'jd', view: 'downloads' }).success).toBe(true);
    expect(viewRefSchema.safeParse({ plugin: 'JD', view: 'x' }).success).toBe(false);
    const action = viewActionInputSchema.parse({
      plugin: 'jd',
      view: 'downloads',
      action: 'enable',
      items: ['12'],
    });
    expect(action).toMatchObject({ groups: [], items: ['12'] });
    expect(
      viewActionInputSchema.safeParse({ plugin: 'jd', view: 'd', action: 'x', items: ['a b'] })
        .success,
    ).toBe(false);
  });

  it('reads the data leniently', () => {
    const data = parseViewData(
      {
        summary: {
          active: true,
          controller: 'running',
          progress: 1.5,
          speed: 2000,
          eta: 30,
          bytes_loaded: 1,
          bytes_total: 2,
        },
        downloads: [
          {
            id: 1,
            name: 'Show',
            state: 'running',
            progress: 0.5,
            folder: '/output/Show',
            items: [
              {
                id: '11',
                name: 'e01',
                host: 'example.com',
                enabled: false,
                items: [{ id: 'deep' }],
              },
              { name: 'no id' },
            ],
          },
          'junk',
          { id: Number.NaN },
        ],
        grabber: 'not a list',
      },
      view,
    );
    expect(data.summary).toEqual({
      active: true,
      state: 'running',
      progress: 1,
      speed: 2000,
      eta: 30,
      bytesLoaded: 1,
      bytesTotal: 2,
    });
    expect(data.sections.downloads).toHaveLength(1);
    const [show] = data.sections.downloads ?? [];
    expect(show).toMatchObject({
      id: '1',
      name: 'Show',
      state: 'running',
      progress: 0.5,
      detail: '/output/Show',
      enabled: true,
    });
    expect(show?.items).toHaveLength(1);
    expect(show?.items[0]).toMatchObject({
      id: '11',
      name: 'e01',
      detail: 'example.com',
      enabled: false,
      items: [],
    });
    expect(data.sections.grabber).toEqual([]);
    const empty = parseViewData({ summary: [] }, view);
    expect(empty.summary).toEqual({
      active: false,
      state: null,
      progress: null,
      speed: null,
      eta: null,
      bytesLoaded: null,
      bytesTotal: null,
    });
    expect(
      parseViewData({ summary: { state: 'paused', progress: -2 } }, view).summary,
    ).toMatchObject({ state: 'paused', progress: 0 });
    expect(
      parseViewData({ downloads: [{ id: 'x', name: '' }] }, view).sections.downloads?.[0]?.name,
    ).toBe('x');
  });

  it('turns the chosen rows into the command’s values', () => {
    const action = { groups: 'packages', items: 'links', input: 'name' };
    expect(actionValues(action, { groups: ['1', '2'], items: ['3'], input: 'New' })).toEqual({
      packages: '1,2',
      links: '3',
      name: 'New',
    });
    expect(actionValues({}, { groups: ['1'], items: [] })).toEqual({});
    const pasted = [' https://a', 'https://b\t '].join('\n');
    expect(actionValues({ input: 'links' }, { groups: [], items: [], input: pasted })).toEqual({
      links: 'https://a https://b',
    });
    expect(actionValues(action, { groups: [], items: [] })).toEqual({});
  });

  it('offers a row action only for what it can take', () => {
    expect(actionApplies({ items: 'links' }, { groups: [], items: ['1'] })).toBe(true);
    expect(actionApplies({ items: 'links' }, { groups: ['1'], items: [] })).toBe(false);
    expect(actionApplies({ groups: 'packages' }, { groups: [], items: ['1'] })).toBe(false);
    expect(actionApplies({ groups: 'packages', items: 'links' }, { groups: [], items: [] })).toBe(
      false,
    );
  });

  it('writes the time left', () => {
    expect(formatEta(-5)).toBe('0 s');
    expect(formatEta(45)).toBe('45 s');
    expect(formatEta(180)).toBe('3 min');
    expect(formatEta(3900)).toBe('1 h 05');
  });
});
