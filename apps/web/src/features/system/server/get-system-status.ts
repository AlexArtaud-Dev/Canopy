import 'server-only';

import { z } from 'zod';

import { parseServerEnv } from '@/shared/config/env';
import { logger } from '@/shared/lib/logger';

import type { EngineProbe, SystemStatus } from '../system.types';
import { toSystemStatus } from '../system.utils';

const probeTimeoutMs = 2000;
const errorBodySchema = z.object({ code: z.string() }).partial();

async function probeEngine(engineUrl: string): Promise<EngineProbe> {
  try {
    const response = await fetch(new URL('/readyz', engineUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    const body = errorBodySchema.safeParse(await response.json().catch(() => ({})));
    return { kind: 'response', httpStatus: response.status, code: body.data?.code };
  } catch (error) {
    logger.warn('engine readiness probe failed', { module: 'system', error });
    return { kind: 'unreachable' };
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const { CANOPY_ENGINE_URL } = parseServerEnv(process.env);
  return toSystemStatus(await probeEngine(CANOPY_ENGINE_URL), new Date());
}
