'use client';

import { useEffect, useState } from 'react';

import { ensureStreamTicket } from './stream-ticket';

/** Media keep asking for ranges long after opening: the ticket is kept fresh meanwhile. */
const keepAliveMs = 20_000;

export type TicketState = 'pending' | 'ready' | 'failed';

/** Holds a valid stream ticket while `active` (a viewer is open). */
export function useStreamTicket(active: boolean): TicketState {
  const [state, setState] = useState<TicketState>('pending');
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const renew = () => {
      ensureStreamTicket().then(
        () => {
          if (!cancelled) setState('ready');
        },
        () => {
          if (!cancelled) setState('failed');
        },
      );
    };
    renew();
    const timer = window.setInterval(renew, keepAliveMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active]);
  return active ? state : 'pending';
}
