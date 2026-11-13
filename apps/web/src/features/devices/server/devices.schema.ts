import { boolean, index, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
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
