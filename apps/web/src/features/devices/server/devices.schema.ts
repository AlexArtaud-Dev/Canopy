import { boolean, index, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';

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
