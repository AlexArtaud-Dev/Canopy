import { boolean, index, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
import { groupsTable } from '@/features/access/server/access.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

/**
 * Devices plugins found on the network (screens…), kept so that people pick them by name. A
 * locator is only a value handed to the plugin's commands: the engine still validates and
 * authorizes every run.
 */
export const pluginDevicesTable = appSchema.table(
  'plugin_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pluginId: text('plugin_id').notNull(),
    /** The plugin's kind of device (`screen`). */
    kind: text('kind').notNull(),
    /** What the plugin's commands take to reach the device; its identity. */
    locator: text('locator').notNull(),
    detectedName: text('detected_name').notNull(),
    customName: text('custom_name'),
    type: text('type'),
    model: text('model'),
    needsPairing: boolean('needs_pairing').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    addedByHand: boolean('added_by_hand').notNull().default(false),
    firstSeen: timestamp('first_seen', { withTimezone: true }),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('plugin_devices_locator_unique').on(table.pluginId, table.kind, table.locator),
    index('plugin_devices_kind_idx').on(table.pluginId, table.kind),
  ],
);

/**
 * The device a person picks first for a plugin's kind (their screen): forms start with it. One
 * per person and kind; forgetting the device or deleting the person clears it.
 */
export const defaultDevicesTable = appSchema.table(
  'default_devices',
  {
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    pluginId: text('plugin_id').notNull(),
    kind: text('kind').notNull(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => pluginDevicesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pluginId, table.kind] })],
);

/**
 * Casts started from Canopy: which run plays on which device, so that the remote can find what
 * plays and drive it. Kept a day; the run itself (state, progress) lives with the engine's job.
 */
export const deviceRunsTable = appSchema.table(
  'device_runs',
  {
    jobId: uuid('job_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    pluginId: text('plugin_id').notNull(),
    kind: text('kind').notNull(),
    locator: text('locator').notNull(),
    /** The file played (a virtual path), shown on the remote. */
    file: text('file').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('device_runs_user_idx').on(table.userId, table.createdAt)],
);

/**
 * The groups allowed to use a device (cast to a screen). A device without any row is open to
 * everyone who may run the plugin's commands; administrators use every device.
 */
export const deviceGroupsTable = appSchema.table(
  'device_groups',
  {
    deviceId: uuid('device_id')
      .notNull()
      .references(() => pluginDevicesTable.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groupsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.groupId] }),
    index('device_groups_group_idx').on(table.groupId),
  ],
);
