import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/shared/db/client';

import {
  panelSchema,
  refreshOptions,
  type Dashboard,
  type DashboardInput,
} from '../dashboards.utils';
import { timeRanges } from '../variables.utils';
import { dashboardsTable } from './dashboards.schema';

const columns = {
  id: dashboardsTable.id,
  name: dashboardsTable.name,
  isHome: dashboardsTable.isHome,
  range: dashboardsTable.range,
  refreshSeconds: dashboardsTable.refreshSeconds,
  panels: dashboardsTable.panels,
  updatedAt: dashboardsTable.updatedAt,
};

type Row = { [K in keyof typeof columns]: (typeof columns)[K]['_']['data'] };

/** Stored JSON is checked again: a panel this version cannot draw is left out, not crashed on. */
function toDashboard(row: Row): Dashboard {
  const range = timeRanges.find((candidate) => candidate === row.range) ?? '24h';
  const refreshSeconds = refreshOptions.find((value) => value === row.refreshSeconds) ?? 60;
  const panels = z
    .array(z.unknown())
    .catch([])
    .parse(row.panels)
    .flatMap((panel) => {
      const parsed = panelSchema.safeParse(panel);
      return parsed.success ? [parsed.data] : [];
    });
  return {
    id: row.id,
    name: row.name,
    isHome: row.isHome,
    range,
    refreshSeconds,
    panels,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDashboards(userId: string): Promise<Dashboard[]> {
  const rows = await getDb()
    .select(columns)
    .from(dashboardsTable)
    .where(eq(dashboardsTable.userId, userId))
    .orderBy(asc(dashboardsTable.name));
  return rows.map(toDashboard);
}

export async function findDashboard(userId: string, id: string): Promise<Dashboard | null> {
  const [row] = await getDb()
    .select(columns)
    .from(dashboardsTable)
    .where(and(eq(dashboardsTable.userId, userId), eq(dashboardsTable.id, id)));
  return row ? toDashboard(row) : null;
}

export async function insertDashboard(
  userId: string,
  input: DashboardInput,
  isHome: boolean,
): Promise<Dashboard> {
  const [row] = await getDb()
    .insert(dashboardsTable)
    .values({ userId, ...input, isHome })
    .returning(columns);
  if (!row) throw new Error('dashboard insert returned no row');
  return toDashboard(row);
}

export async function updateDashboard(
  userId: string,
  id: string,
  input: DashboardInput,
): Promise<Dashboard | null> {
  const [row] = await getDb()
    .update(dashboardsTable)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(dashboardsTable.userId, userId), eq(dashboardsTable.id, id)))
    .returning(columns);
  return row ? toDashboard(row) : null;
}

export async function deleteDashboard(userId: string, id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(dashboardsTable)
    .where(and(eq(dashboardsTable.userId, userId), eq(dashboardsTable.id, id)))
    .returning({ id: dashboardsTable.id });
  return rows.length > 0;
}

/** Makes one dashboard the person's home; the others stop being it. */
export async function setHome(userId: string, id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .update(dashboardsTable)
      .set({ isHome: false })
      .where(eq(dashboardsTable.userId, userId));
    await tx
      .update(dashboardsTable)
      .set({ isHome: true })
      .where(and(eq(dashboardsTable.userId, userId), eq(dashboardsTable.id, id)));
  });
}
