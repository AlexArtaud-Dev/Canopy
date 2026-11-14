'use server';

import { listMetrics, queryMetric } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { requireSession, type CurrentSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';

import {
  bucketSeconds,
  chartPoints,
  engineVariable,
  mayReadFamily,
  rangeWindow,
  readVariableInputSchema,
  webVariables,
  type VariableData,
  type VariableDefinition,
} from '../variables.utils';
import { readWebVariable } from './web-variables';

/** The engine's variables the person may read (the engine filters by permission too). */
async function engineVariables(session: CurrentSession): Promise<VariableDefinition[]> {
  const { data } = await listMetrics({ client: await engineClientFor(session) });
  return (data?.metrics ?? []).flatMap((metric) => {
    const variable = engineVariable(metric);
    return variable && mayReadFamily(session.user, variable.family) ? [variable] : [];
  });
}

/**
 * Every variable the person may put on a dashboard: the engine's samples and what the web app
 * computes, filtered by their `metrics:<family>` permissions.
 */
export async function loadVariables(): Promise<ActionResult<VariableDefinition[]>> {
  return runAction(async () => {
    const session = await requireSession();
    const fromEngine = await engineVariables(session).catch(() => []);
    const fromWeb = webVariables.filter((variable) => mayReadFamily(session.user, variable.family));
    return [...fromEngine, ...fromWeb];
  });
}

/** One variable over a range, if the person may read its family (checked here, not in the UI). */
export async function readVariable(input: unknown): Promise<ActionResult<VariableData>> {
  return runAction(async () => {
    const parsed = readVariableInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const { id, range } = parsed.data;
    const session = await requireSession();
    const window = rangeWindow(range, new Date());
    const web = webVariables.find((variable) => variable.id === id);
    if (web) {
      if (!mayReadFamily(session.user, web.family)) {
        await audit({
          action: 'metrics.read_denied',
          result: 'denied',
          actorId: session.user.id,
          target: id,
        });
        throw new AppBaseError('metrics.forbidden', 'family not granted');
      }
      const data = await readWebVariable(id, { ...window, bucketSeconds: bucketSeconds(range) });
      if (!data) throw new AppBaseError('metrics.unknown', 'no such variable');
      return data;
    }
    const { data, error, response } = await queryMetric({
      client: await engineClientFor(session),
      query: {
        metric: id,
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        points: chartPoints,
      },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (!data) throw new AppBaseError(error.code, 'engine refused the metric');
    return {
      kind: 'series',
      unit: data.metric.unit,
      bucketSeconds: data.bucketSeconds,
      series: data.series,
    };
  });
}
