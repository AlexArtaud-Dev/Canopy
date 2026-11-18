'use client';

import { useQuery } from '@tanstack/react-query';

import { readVariable } from '../server/variables-actions';
import type { TimeRange, VariableData } from '../variables.utils';

export type VariableState =
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'ready'; data: VariableData };

/** One variable over a range, reloaded every `refreshSeconds` (never when 0). */
export function useVariableData(
  id: string,
  range: TimeRange,
  refreshSeconds: number,
): VariableState {
  const query = useQuery({
    queryKey: ['dashboards', 'variable', id, range],
    queryFn: () => readVariable({ id, range }),
    refetchInterval: refreshSeconds > 0 ? refreshSeconds * 1000 : false,
    staleTime: 10_000,
  });
  if (!query.data) return { status: 'loading' };
  if (!query.data.ok) return { status: 'error', code: query.data.error.code };
  return { status: 'ready', data: query.data.data };
}
