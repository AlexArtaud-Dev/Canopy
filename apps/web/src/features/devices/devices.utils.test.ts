import type { CommandEntry } from '@canopy/contracts';

import {
  addDeviceInputSchema,
  controlInputSchema,
  formatClock,
  parseCastDetail,
  parseClock,
  rememberRunInputSchema,
  confirmPairingInputSchema,
  defaultDeviceInputSchema,
  startingDevice,
  pairingCodeInputSchema,
  deviceIdInputSchema,
  deviceKindInputSchema,
  freshDetectionMs,
  maxDevicesPerKind,
  updateDeviceInputSchema,
  deviceSections,
  foundSince,
  deviceName,
  isOnline,
  kindViews,
  needsDetection,
  onlineWindowMs,
  parseDetected,
  pickable,
  deviceGroupsInputSchema,
  mayUseDevice,
  namedDevices,
  refusedDevice,
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
  groupIds: [],
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
    const screens = {
      pluginId: 'dapple',
      pluginName: 'Cast',
      kind: 'screen',
      kindName: 'Screens',
      pairable: true,
    };
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
      {
        pluginId: 'dapple',
        pluginName: 'Diffuser',
        kind: 'screen',
        kindName: 'Écrans',
        pairable: false,
      },
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

describe('pairing inputs', () => {
  it('take a code of digits and the run to check', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(pairingCodeInputSchema.safeParse({ id, code: '8492' }).success).toBe(true);
    expect(pairingCodeInputSchema.safeParse({ id, code: '84a2' }).success).toBe(false);
    expect(pairingCodeInputSchema.safeParse({ id, code: '123' }).success).toBe(false);
    expect(confirmPairingInputSchema.safeParse({ id, jobId: id }).success).toBe(true);
    expect(confirmPairingInputSchema.safeParse({ id, jobId: 'x' }).success).toBe(false);
  });
});

describe('default device', () => {
  it('starts an empty field, else the first one on', () => {
    const tv = device({ id: '00000000-0000-4000-8000-000000000001', locator: 'tv' });
    const on = device({
      id: '00000000-0000-4000-8000-000000000002',
      locator: 'on',
      lastSeen: ago(1000),
    });
    expect(startingDevice([on, tv], tv.id, now)?.locator).toBe('tv');
    expect(startingDevice([on, tv], null, now)?.locator).toBe('on');
    expect(startingDevice([tv], 'gone', now)).toBeUndefined();
    const base = { pluginId: 'dapple', kind: 'screen' };
    expect(defaultDeviceInputSchema.safeParse({ ...base, id: null }).success).toBe(true);
    expect(defaultDeviceInputSchema.safeParse({ ...base, id: tv.id }).success).toBe(true);
    expect(defaultDeviceInputSchema.safeParse({ ...base, id: 'x' }).success).toBe(false);
  });
});

describe('search results', () => {
  it('count the devices seen by the search only', () => {
    const list = [
      device({ lastSeen: ago(1000) }),
      device({ lastSeen: ago(3_600_000) }),
      device({}),
    ];
    expect(foundSince(list, now - 60_000)).toBe(1);
  });
});

describe('casts', () => {
  it('read clocks and say them', () => {
    expect(parseClock('90')).toBe(90);
    expect(parseClock('4:11')).toBe(251);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('x')).toBeNull();
    expect(formatClock(251.9)).toBe('4:11');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('read what a cast reports', () => {
    expect(parseCastDetail('0:04:11 / 0:09:56 playing vol 18')).toEqual({
      state: 'playing',
      position: 251,
      duration: 596,
      volume: 18,
    });
    expect(parseCastDetail('0:00:05 paused')).toEqual({
      state: 'paused',
      position: 5,
      duration: null,
      volume: null,
    });
    expect(parseCastDetail('0:00:05 / 0:01:00 buffering vol 250')?.volume).toBe(100);
    expect(parseCastDetail(undefined)).toBeNull();
    expect(parseCastDetail('0:00:05 dancing')).toBeNull();
    expect(parseCastDetail('soon playing')).toBeNull();
  });

  it('take controls and runs to remember only in shape', () => {
    const jobId = '00000000-0000-4000-8000-000000000000';
    expect(controlInputSchema.safeParse({ jobId, action: 'pause' }).success).toBe(true);
    expect(controlInputSchema.safeParse({ jobId, action: 'seek', seconds: 90 }).success).toBe(true);
    expect(controlInputSchema.safeParse({ jobId, action: 'volume', level: 101 }).success).toBe(
      false,
    );
    expect(controlInputSchema.safeParse({ jobId, action: 'eject' }).success).toBe(false);
    const run = {
      jobId,
      pluginId: 'dapple',
      kind: 'screen',
      locator: 'airplay://1',
      file: '/a.mkv',
    };
    expect(rememberRunInputSchema.safeParse(run).success).toBe(true);
    expect(rememberRunInputSchema.safeParse({ ...run, pluginId: 'X' }).success).toBe(false);
  });
});

describe('who may use a device', () => {
  const family = '11111111-1111-4111-8111-111111111111';
  const guests = '22222222-2222-4222-8222-222222222222';
  const member = { isAdmin: false, groupIds: new Set([family]) };
  const stranger = { isAdmin: false, groupIds: new Set<string>() };
  const admin = { isAdmin: true, groupIds: new Set<string>() };
  const restricted = device({ locator: 'chromecast://salon', groupIds: [guests, family] });
  const open = device({ locator: 'chromecast://kitchen' });

  it('opens unrestricted devices to everyone, restricted ones to their groups and admins', () => {
    expect(mayUseDevice(open, stranger)).toBe(true);
    expect(mayUseDevice(restricted, member)).toBe(true);
    expect(mayUseDevice(restricted, stranger)).toBe(false);
    expect(mayUseDevice(restricted, admin)).toBe(true);
  });

  it('reads the devices a run names from its device fields', () => {
    const entry = {
      params: [
        { name: 'file', type: 'path' },
        { name: 'screen', type: 'string', device: 'screen' },
        { name: 'other', type: 'string', device: 'speaker' },
        { name: 'empty', type: 'string', device: 'screen' },
      ],
    } as unknown as Pick<CommandEntry, 'params'>;
    expect(
      namedDevices(entry, { file: '/a.mp4', screen: ' chromecast://salon ', other: 3, empty: ' ' }),
    ).toEqual([{ kind: 'screen', locator: 'chromecast://salon' }]);
  });

  it('refuses the first kept device the person may not use, never unknown ones', () => {
    const kept = [open, restricted];
    const salon = { kind: 'screen', locator: 'chromecast://salon' };
    const unknown = { kind: 'screen', locator: 'chromecast://elsewhere' };
    const otherKind = { kind: 'speaker', locator: 'chromecast://salon' };
    expect(refusedDevice([unknown, salon], kept, stranger)).toBe(restricted);
    expect(refusedDevice([salon], kept, member)).toBeUndefined();
    expect(refusedDevice([unknown, otherKind], kept, stranger)).toBeUndefined();
  });

  it('takes a list of groups, empty to open the device', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(deviceGroupsInputSchema.safeParse({ id, groupIds: [] }).success).toBe(true);
    expect(deviceGroupsInputSchema.safeParse({ id, groupIds: [family] }).success).toBe(true);
    expect(deviceGroupsInputSchema.safeParse({ id, groupIds: ['x'] }).success).toBe(false);
  });
});
