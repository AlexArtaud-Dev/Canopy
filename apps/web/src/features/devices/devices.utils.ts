import type { CommandEntry } from '@canopy/contracts';

import { z } from 'zod';

/** A device a plugin found, as its detection command prints it. */
export interface DetectedDevice {
  locator: string;
  label: string;
  /** What the plugin says about it: `type`, `model`, `pairing=needed`… */
  attributes: Record<string, string>;
}

/** A device Canopy keeps, as forms and the administration page show it. */
export interface Device {
  id: string;
  pluginId: string;
  kind: string;
  locator: string;
  /** The name the device announced. */
  detectedName: string;
  /** The name an administrator gave it, shown instead. */
  customName: string | null;
  type: string | null;
  model: string | null;
  needsPairing: boolean;
  hidden: boolean;
  addedByHand: boolean;
  /** ISO 8601; null for a device added by hand and never found since. */
  lastSeen: string | null;
}

/** How many devices of one kind a plugin may keep: detection never grows a list without end. */
export const maxDevicesPerKind = 200;
/** A device found this recently counts as switched on. */
export const onlineWindowMs = 10 * 60_000;
/** Forms search again by themselves when nothing was found more recently than this. */
export const freshDetectionMs = 2 * 60_000;

const maxLocator = 512;
const maxLabel = 120;
const attribute = /^([a-z][a-z0-9-]{0,31})=(.{1,120})$/;

/**
 * Reads a detection command's output: one `locator<TAB>label[<TAB>key=value;key=value]` line per
 * device. Other lines (messages, blanks) are ignored, like locators that could pass as an option;
 * a locator listed twice counts once.
 */
export function parseDetected(lines: readonly string[]): DetectedDevice[] {
  const devices = new Map<string, DetectedDevice>();
  for (const line of lines) {
    const tab = line.indexOf('\t');
    const locator = line.slice(0, Math.max(tab, 0)).trim();
    if (tab < 0 || locator === '' || locator.startsWith('-')) continue;
    const rest = line.slice(tab + 1);
    const second = rest.indexOf('\t');
    const rawLabel = second < 0 ? rest : rest.slice(0, second);
    const rawAttributes = second < 0 ? '' : rest.slice(second + 1);
    if (locator.length > maxLocator || devices.has(locator)) continue;
    const label = rawLabel.trim().slice(0, maxLabel) || locator;
    const attributes: Record<string, string> = {};
    for (const pair of rawAttributes.split(';')) {
      const match = attribute.exec(pair.trim());
      if (match?.[1] && match[2]) attributes[match[1]] = match[2].trim();
    }
    devices.set(locator, { locator, label, attributes });
  }
  return [...devices.values()];
}

/** The name people know a device by: the one given to it, else the one it announced. */
export function deviceName(device: Pick<Device, 'customName' | 'detectedName'>): string {
  return device.customName ?? device.detectedName;
}

/** Whether the device was found recently enough to be taken as switched on. */
export function isOnline(device: Pick<Device, 'lastSeen'>, now: number): boolean {
  return device.lastSeen !== null && now - Date.parse(device.lastSeen) <= onlineWindowMs;
}

/** How many devices a search saw: those last seen from `since` on. */
export function foundSince(devices: readonly Pick<Device, 'lastSeen'>[], since: number): number {
  return devices.filter(
    (device) => device.lastSeen !== null && Date.parse(device.lastSeen) >= since,
  ).length;
}

/** Whether a form should search for devices by itself: nothing of the kind was found lately. */
export function needsDetection(devices: readonly Pick<Device, 'lastSeen'>[], now: number): boolean {
  return !devices.some(
    (device) => device.lastSeen !== null && now - Date.parse(device.lastSeen) <= freshDetectionMs,
  );
}

/**
 * The devices a form offers: visible ones, those switched on first, then by name. The current
 * value stays offered even when hidden, so that a form never silently loses it.
 */
export function pickable(devices: readonly Device[], now: number, current = ''): Device[] {
  return devices
    .filter((device) => !device.hidden || device.locator === current)
    .sort((a, b) => {
      const online = Number(isOnline(b, now)) - Number(isOnline(a, now));
      return online !== 0
        ? online
        : deviceName(a).localeCompare(deviceName(b), undefined, { sensitivity: 'base' });
    });
}

const idSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);
const kindSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

/** A plugin's kind of devices (`dapple`, `screen`). */
export const deviceKindInputSchema = z.object({ pluginId: idSchema, kind: kindSchema });

/** A device to add by hand: its locator, and optionally a name. */
export const addDeviceInputSchema = deviceKindInputSchema.extend({
  locator: z
    .string()
    .trim()
    .min(1)
    .max(maxLocator)
    .refine((value) => !value.startsWith('-') && !/[\t\r\n]/.test(value)),
  name: z.string().trim().max(maxLabel).optional(),
});

/** A change an administrator makes to a kept device. */
export const updateDeviceInputSchema = z.object({
  id: z.uuid(),
  /** Empty gives the device back its announced name. */
  name: z.string().trim().max(maxLabel).optional(),
  hidden: z.boolean().optional(),
});

export const deviceIdInputSchema = z.object({ id: z.uuid() });

/** The code a device shows while it pairs: digits only, as AirPlay and most TVs show. */
export const pairingCodeInputSchema = deviceIdInputSchema.extend({
  code: z.string().regex(/^[0-9]{4,8}$/),
});

/** A person's default device for a kind, or none (`id` null). */
export const defaultDeviceInputSchema = deviceKindInputSchema.extend({ id: z.uuid().nullable() });

/**
 * The device an empty field starts with: the person's default when it is still offered, else the
 * first one switched on. Nothing when neither exists.
 */
export function startingDevice(
  offered: readonly Device[],
  defaultId: string | null,
  now: number,
): Device | undefined {
  return (
    offered.find((device) => device.id === defaultId) ??
    offered.find((device) => isOnline(device, now))
  );
}

/** The pairing run to check before a device is marked paired. */
export const confirmPairingInputSchema = deviceIdInputSchema.extend({ jobId: z.uuid() });

/** A kind of device a plugin declares, named for the administration page. */
export interface KindView {
  pluginId: string;
  pluginName: string;
  kind: string;
  kindName: string;
  /** The plugin pairs devices of this kind. */
  pairable: boolean;
}

/** The devices of one kind, as the administration page lists them. */
export interface DeviceSection {
  pluginId: string;
  kind: string;
  /** Absent when the plugin no longer declares the kind (uninstalled): its devices can only be forgotten. */
  view?: KindView;
  devices: Device[];
}

/**
 * Devices grouped by the kinds plugins declare (in that order, even when empty), then the devices
 * of kinds no installed plugin declares any more. Each list is sorted by name.
 */
export function deviceSections(
  kinds: readonly KindView[],
  devices: readonly Device[],
): DeviceSection[] {
  const key = (pluginId: string, kind: string) => `${pluginId}/${kind}`;
  const sections = new Map<string, DeviceSection>(
    kinds.map((view) => [
      key(view.pluginId, view.kind),
      { pluginId: view.pluginId, kind: view.kind, view, devices: [] },
    ]),
  );
  for (const device of devices) {
    const id = key(device.pluginId, device.kind);
    const section = sections.get(id);
    if (section) section.devices.push(device);
    else sections.set(id, { pluginId: device.pluginId, kind: device.kind, devices: [device] });
  }
  const byName = (a: Device, b: Device) =>
    deviceName(a).localeCompare(deviceName(b), undefined, { sensitivity: 'base' });
  return [...sections.values()].map((section) => ({
    ...section,
    devices: section.devices.toSorted(byName),
  }));
}

type Localize = (text: { en: string; fr: string; es: string }) => string;

/** The kinds of devices installed plugins declare, once each, in catalog order. */
export function kindViews(entries: readonly CommandEntry[], localize: Localize): KindView[] {
  const views = new Map<string, KindView>();
  for (const { plugin } of entries) {
    if (!plugin) continue;
    for (const declared of plugin.devices ?? []) {
      const id = `${plugin.id}/${declared.kind}`;
      if (views.has(id)) continue;
      views.set(id, {
        pluginId: plugin.id,
        pluginName: localize(plugin.name),
        kind: declared.kind,
        kindName: localize(declared.name),
        pairable: declared.pair !== undefined,
      });
    }
  }
  return [...views.values()];
}

/** Where a cast is, as its plugin reports it beside the percentage. */
export interface CastState {
  state: 'playing' | 'paused' | 'buffering' | 'idle';
  /** Seconds into the film. */
  position: number;
  /** Seconds; null when the screen does not say. */
  duration: number | null;
  /** 0-100; null when the screen does not say (Apple TV). */
  volume: number | null;
}

/** Seconds of a clock (`90`, `4:11`, `1:02:03`); null when it is not one. */
export function parseClock(text: string): number | null {
  if (!/^\d{1,3}(:\d{2}){0,2}$/.test(text)) return null;
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** A clock for people: `4:11`, or `1:02:03` past an hour. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

const states = new Set(['playing', 'paused', 'buffering', 'idle']);

/**
 * Reads a cast's detail (`0:04:11 / 0:09:56 playing vol 18`, or `0:04:11 paused` when the
 * length is unknown); null when the plugin said nothing readable.
 */
export function parseCastDetail(detail: string | undefined): CastState | null {
  const match = /^(\S+)(?: \/ (\S+))? (\w+)(?: vol (\d{1,3}))?$/.exec(detail?.trim() ?? '');
  if (!match?.[1] || !match[3] || !states.has(match[3])) return null;
  const position = parseClock(match[1]);
  if (position === null) return null;
  return {
    state: match[3] as CastState['state'],
    position,
    duration: match[2] === undefined ? null : parseClock(match[2]),
    volume: match[4] === undefined ? null : Math.min(100, Number(match[4])),
  };
}

/** A cast started from Canopy, to remember for the remote. */
export const rememberRunInputSchema = z.object({
  jobId: z.uuid(),
  pluginId: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  kind: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  locator: z.string().min(1).max(512),
  file: z.string().min(1).max(4096),
});

/** What a remote button asks for. */
export const controlInputSchema = z.discriminatedUnion('action', [
  z.object({ jobId: z.uuid(), action: z.enum(['pause', 'resume', 'stop']) }),
  z.object({ jobId: z.uuid(), action: z.literal('seek'), seconds: z.number().min(0).max(359_999) }),
  z.object({
    jobId: z.uuid(),
    action: z.literal('volume'),
    level: z.number().int().min(0).max(100),
  }),
]);
export type ControlInput = z.infer<typeof controlInputSchema>;
