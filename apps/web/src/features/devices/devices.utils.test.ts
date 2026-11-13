import type { CommandEntry } from '@canopy/contracts';

import {
  addDeviceInputSchema,
  deviceIdInputSchema,
  deviceKindInputSchema,
  freshDetectionMs,
  maxDevicesPerKind,
  updateDeviceInputSchema,
  deviceSections,
  deviceName,
  isOnline,
  kindViews,
  needsDetection,
  onlineWindowMs,
  parseDetected,
  pickable,
  type Device,
} from './devices.utils';

const now = Date.parse('2026-11-13T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const device = (extra: Partial<Device>): Device => ({
  id: '00000000-0000-4000-8000-000000000000',
  pluginId: 'dapple',
  kind: 'screen',
  locator: 'chromecast://1',
  detectedName: 'Device',
  customName: null,
  type: null,
  model: null,
  needsPairing: false,
  hidden: false,
  addedByHand: false,
  lastSeen: null,
  ...extra,
});

describe('detection output', () => {
  it('reads locators, labels and attributes, once each', () => {
    expect(
      parseDetected([
        'Searching…',
        'chromecast://192.168.1.42:8009\tLiving room\ttype=chromecast;model=Chromecast Ultra',
        'airplay://192.168.1.114\tHome Cinema\ttype=airplay; pairing=needed;bad;pair=;Bad=x',
        'chromecast://192.168.1.42:8009\tAgain',
        '--evil\tOption',
        '\tNo locator',
        'http://tv/dmr\t',
        '',
      ]),
    ).toEqual([
      {
        locator: 'chromecast://192.168.1.42:8009',
        label: 'Living room',
        attributes: { type: 'chromecast', model: 'Chromecast Ultra' },
      },
      {
        locator: 'airplay://192.168.1.114',
        label: 'Home Cinema',
        attributes: { type: 'airplay', pairing: 'needed' },
      },
      { locator: 'http://tv/dmr', label: 'http://tv/dmr', attributes: {} },
    ]);
    expect(parseDetected([`${'x'.repeat(600)}\tLong`])).toEqual([]);
  });
});

describe('devices', () => {
  it('are named by what was given, else what they announced', () => {
    expect(deviceName(device({}))).toBe('Device');
    expect(deviceName(device({ customName: 'TV' }))).toBe('TV');
  });

  it('are online when found lately, and forms search when nothing is fresh', () => {
    expect(isOnline(device({ lastSeen: ago(1000) }), now)).toBe(true);
    expect(isOnline(device({ lastSeen: ago(onlineWindowMs + 1) }), now)).toBe(false);
    expect(isOnline(device({}), now)).toBe(false);
    expect(needsDetection([], now)).toBe(true);
    expect(needsDetection([device({ lastSeen: ago(5 * 60_000) })], now)).toBe(true);
    expect(needsDetection([device({}), device({ lastSeen: ago(30_000) })], now)).toBe(false);
  });

  it('are offered online first, by name, hidden ones left out unless chosen', () => {
    const list = [
      device({ locator: 'a', detectedName: 'b-tv' }),
      device({ locator: 'b', detectedName: 'A-tv' }),
      device({ locator: 'c', detectedName: 'z', lastSeen: ago(1000) }),
      device({ locator: 'd', detectedName: 'hidden', hidden: true }),
    ];
    expect(pickable(list, now).map((item) => item.locator)).toEqual(['c', 'b', 'a']);
    expect(pickable(list, now, 'd').map((item) => item.locator)).toContain('d');
  });

  it('are added by hand only with a locator that cannot pass as an option', () => {
    const base = { pluginId: 'dapple', kind: 'screen' };
    expect(
      addDeviceInputSchema.safeParse({ ...base, locator: ' airplay://1 ' }).data?.locator,
    ).toBe('airplay://1');
    expect(addDeviceInputSchema.safeParse({ ...base, locator: '-x' }).success).toBe(false);
    expect(addDeviceInputSchema.safeParse({ ...base, locator: 'a\tb' }).success).toBe(false);
    expect(addDeviceInputSchema.safeParse({ ...base, locator: '' }).success).toBe(false);
    expect(
      addDeviceInputSchema.safeParse({ pluginId: 'X', kind: 'screen', locator: 'a' }).success,
    ).toBe(false);
  });
});

describe('administration sections', () => {
  it('follow the declared kinds, then kinds no plugin declares any more', () => {
    const screens = { pluginId: 'dapple', pluginName: 'Cast', kind: 'screen', kindName: 'Screens' };
    const speakers = { ...screens, kind: 'speaker', kindName: 'Speakers' };
    const sections = deviceSections(
      [screens, speakers],
      [
        device({ locator: 'b', detectedName: 'b' }),
        device({ locator: 'old', pluginId: 'gone' }),
        device({ locator: 'a', detectedName: 'x', customName: 'A' }),
      ],
    );
    expect(
      sections.map((section) => [section.pluginId, section.kind, section.view !== undefined]),
    ).toEqual([
      ['dapple', 'screen', true],
      ['dapple', 'speaker', true],
      ['gone', 'screen', false],
    ]);
    expect(sections[0]?.devices.map((item) => item.locator)).toEqual(['a', 'b']);
    expect(sections[1]?.devices).toEqual([]);
  });
});

describe('kind views', () => {
  it('name each declared kind once, in catalog order', () => {
    const plugin = {
      id: 'dapple',
      name: { en: 'Cast', fr: 'Diffuser', es: 'Enviar' },
      devices: [
        {
          kind: 'screen',
          name: { en: 'Screens', fr: 'Écrans', es: 'Pantallas' },
          detect: 'dapple.devices',
        },
      ],
    };
    const entry = (id: string, extra: Partial<CommandEntry> = {}): CommandEntry => ({
      id,
      name: plugin.name,
      description: plugin.name,
      mode: 'basic',
      dryRun: false,
      params: [],
      ...extra,
    });
    const views = kindViews(
      [
        entry('rsync.sync'),
        entry('mrename.run', { plugin: { id: 'mrename', name: plugin.name } }),
        entry('dapple.cast', { plugin }),
        entry('dapple.pause', { plugin }),
      ],
      (text) => text.fr,
    );
    expect(views).toEqual([
      { pluginId: 'dapple', pluginName: 'Diffuser', kind: 'screen', kindName: 'Écrans' },
    ]);
  });
});

describe('inputs', () => {
  it('accept kinds, ids and changes, and refuse the rest', () => {
    expect(deviceKindInputSchema.safeParse({ pluginId: 'dapple', kind: 'screen' }).success).toBe(
      true,
    );
    expect(deviceKindInputSchema.safeParse({ pluginId: 'dapple', kind: '../x' }).success).toBe(
      false,
    );
    const id = '00000000-0000-4000-8000-000000000000';
    expect(deviceIdInputSchema.safeParse({ id }).success).toBe(true);
    expect(deviceIdInputSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(updateDeviceInputSchema.safeParse({ id, name: ' TV ', hidden: true }).data?.name).toBe(
      'TV',
    );
    expect(updateDeviceInputSchema.safeParse({ id, name: 'x'.repeat(200) }).success).toBe(false);
    expect(maxDevicesPerKind).toBeGreaterThan(0);
    expect(freshDetectionMs).toBeLessThan(onlineWindowMs);
  });
});
