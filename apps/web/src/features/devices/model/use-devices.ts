'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useErrorMessage } from '@/shared/errors/use-error-message';

import { freshDetectionMs, needsDetection, type Device } from '../devices.utils';
import { detectDevices, loadDevices } from '../server/devices-actions';

/** When this tab last searched by itself, per plugin and kind: forms opened in a row search once. */
const autoSearched = new Map<string, number>();

export function devicesKey(pluginId: string, kind: string) {
  return ['devices', pluginId, kind] as const;
}

/**
 * The devices kept for a plugin's kind, and a search for them. A form searches by itself once
 * when nothing was found lately, so that switched-on screens show up without a click.
 */
export function useDevices(pluginId: string, kind: string, autoDetect: boolean) {
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const key = devicesKey(pluginId, kind);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await loadDevices({ pluginId, kind });
      if (!result.ok) throw new Error(result.error.code);
      return result.data;
    },
    staleTime: 30_000,
  });
  const detection = useMutation({
    mutationFn: async () => detectDevices({ pluginId, kind }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(errorMessage(result.error.code, result.error.params));
        return;
      }
      setError(null);
      queryClient.setQueryData<Device[]>(key, result.data);
    },
  });
  const { mutate } = detection;
  const devices = list.data;
  const searchedOnce = useRef(false);

  useEffect(() => {
    if (!autoDetect || searchedOnce.current || devices === undefined) return;
    searchedOnce.current = true;
    const now = Date.now();
    const id = `${pluginId}/${kind}`;
    if (now - (autoSearched.get(id) ?? 0) < freshDetectionMs) return;
    if (!needsDetection(devices, now)) return;
    autoSearched.set(id, now);
    mutate();
  }, [autoDetect, devices, mutate, pluginId, kind]);

  return {
    devices,
    loadFailed: list.isError,
    searching: detection.isPending,
    error,
    detect: () => {
      mutate();
    },
  };
}
