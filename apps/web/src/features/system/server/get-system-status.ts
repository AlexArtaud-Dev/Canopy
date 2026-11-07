import 'server-only';

import { getReadiness } from '@canopy/contracts';
import { createClient } from '@canopy/contracts/client';

import { parseServerEnv } from '@/shared/config/env';
import { logger } from '@/shared/lib/logger';

import type { EngineProbe, SystemStatus } from '../system.types';
import { toSystemStatus } from '../system.utils';

const probeTimeoutMs = 2000;

async function probeEngine(engineUrl: string): Promise<EngineProbe> {
  const client = createClient({ baseUrl: engineUrl });
  try {
    const { error, response } = await getReadiness({
      client,
      cache: 'no-store',
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    // No response means the request never completed (network failure surfaced as a value).
    if (!response) {
      return { kind: 'unreachable' };
    }
    return { kind: 'response', httpStatus: response.status, code: error?.code };
  } catch (error) {
    logger.warn('engine readiness probe failed', { module: 'system', error });
    return { kind: 'unreachable' };
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const { CANOPY_ENGINE_URL } = parseServerEnv(process.env);
  return toSystemStatus(await probeEngine(CANOPY_ENGINE_URL), new Date());
}
