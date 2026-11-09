import 'server-only';

import { headers } from 'next/headers';

import { parseServerEnv } from '@/shared/config/env';

import { isSecureRequest } from './secure-request.utils';

/** The current request came over HTTPS: its cookies are Secure (see secure-request.utils). */
export async function currentRequestIsSecure(): Promise<boolean> {
  const publicUrl = parseServerEnv(process.env).CANOPY_PUBLIC_URL;
  let incoming: Headers;
  try {
    incoming = await headers();
  } catch {
    // Outside a request (jobs, tests): the public address decides.
    return publicUrl.startsWith('https:');
  }
  return isSecureRequest(incoming.get('x-forwarded-proto'), incoming.get('host'), publicUrl);
}
