'use client';

import { useQueries } from '@tanstack/react-query';

import { readVariable } from '../server/variables-actions';
import type { TimeRange, VariableData } from '../variables.utils';

export type PanelDataState =
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'ready'; data: { id: string; data: VariableData }[] };

/**
 * The variables of a panel over a range, reloaded every `refreshSeconds` (never when 0). The
 * first refusal or failure is what the panel says; it never shows half its values silently.
 */
export function usePanelData(
  ids: readonly string[],
  range: TimeRange,
  refreshSeconds: number,
): PanelDataState {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['dashboards', 'variable', id, range],
      queryFn: () => readVariable({ id, range }),
      refetchInterval: refreshSeconds > 0 ? refreshSeconds * 1000 : (false as const),
      staleTime: 10_000,
    })),
  });
  const data: { id: string; data: VariableData }[] = [];
  for (const [index, result] of results.entries()) {
    if (!result.data) return { status: 'loading' };
    if (!result.data.ok) return { status: 'error', code: result.data.error.code };
    data.push({ id: ids[index] ?? '', data: result.data.data });
  }
  return { status: 'ready', data };
}
