'use client';

import { refreshStreamTicket } from '../server/stream-ticket';

/** Ask for a new stream ticket this long before the current one expires. */
const ticketMarginMs = 30_000;

let ticketExpiresAt = 0;
let ticketRequest: Promise<void> | null = null;

/**
 * Makes sure a valid stream ticket cookie is set, refreshing it shortly before it expires. One
 * refresh at a time, shared by every upload, download and preview that needs it.
 */
export async function ensureStreamTicket(): Promise<void> {
  if (Date.now() < ticketExpiresAt - ticketMarginMs) return;
  ticketRequest ??= refreshStreamTicket()
    .then((result) => {
      if (!result.ok) throw new Error(result.error.code);
      ticketExpiresAt = result.data.expiresAt;
    })
    .finally(() => {
      ticketRequest = null;
    });
  await ticketRequest;
}
