// Spike variant D: Pages Router API route piping raw Node streams (never merged).
import { request as httpRequest } from 'node:http';
import { pipeline } from 'node:stream/promises';

import type { NextApiRequest, NextApiResponse } from 'next';

import { parseServerEnv } from '@/shared/config/env';

export const config = {
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
};

const hopByHop = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host']);

function forwardable(headers: NodeJS.Dict<string | string[]>) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !hopByHop.has(key)));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { CANOPY_ENGINE_URL } = parseServerEnv(process.env);
  const incoming = new URL(req.url ?? '/', 'http://localhost');
  const target = new URL(incoming.pathname.replace(/^\/api\/spike-node/, '') + incoming.search, CANOPY_ENGINE_URL);

  const upstream = httpRequest(target, {
    method: req.method,
    headers: forwardable(req.headers),
  });
  // Client gone (abort or tab closed): tear down the engine request so it stops working.
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy();
  });

  const response = new Promise<void>((resolve, reject) => {
    upstream.on('response', (engineRes) => {
      res.writeHead(engineRes.statusCode ?? 502, forwardable(engineRes.headers));
      res.flushHeaders();
      pipeline(engineRes, res).then(resolve, reject);
    });
    upstream.on('error', reject);
  });

  try {
    await Promise.all([pipeline(req, upstream), response]);
  } catch {
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  }
}
