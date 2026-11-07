import 'server-only';

import { getRequestContext } from '@/shared/request/request-context';

import { toErrorDto, type ErrorDto } from './errors';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ErrorDto };

/**
 * Runs a server action body and turns any failure into a translated-code result. Server actions
 * never throw to the client: the UI always receives `{ ok, data | error }`.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  const context = await getRequestContext();
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    const dto = toErrorDto(error, context.requestId);
    context.logger.error('server action failed', { code: dto.code, error });
    return { ok: false, error: dto };
  }
}
