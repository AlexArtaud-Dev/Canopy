#!/usr/bin/env node
// Streaming spike harness: measures multi-GB transfers, Range, SSE and abort propagation through
// three paths (Next rewrites, Route Handler proxy, direct engine) and watches the web server RSS.
//
// Usage: node scripts/spike/streaming-harness.mjs [--size-gb 10] [--sse-seconds 180] [--only A,B,C]
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    'size-gb': { type: 'string', default: '10' },
    'sse-seconds': { type: 'string', default: '180' },
    only: { type: 'string', default: 'A,B,C,D' },
    web: { type: 'string', default: 'http://localhost:3000' },
    engine: { type: 'string', default: 'http://localhost:8080' },
  },
});

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const size = Math.round(Number(args['size-gb']) * GiB);
const sseSeconds = Number(args['sse-seconds']);

const variants = {
  A: { name: 'next.config rewrites', base: `${args.web}/engine/spike` },
  B: { name: 'Route Handler proxy', base: `${args.web}/spike-proxy/spike` },
  C: { name: 'direct engine (baseline)', base: `${args.engine}/spike` },
  D: { name: 'Pages API route, Node pipeline', base: `${args.web}/api/spike-node/spike` },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmtRate = (bytes, seconds) => `${(bytes / MiB / seconds).toFixed(0)} MiB/s`;
const fmtMiB = (bytes) => `${(bytes / MiB).toFixed(1)} MiB`;

async function webMemory() {
  const response = await fetch(`${args.web}/api/spike/memory`, { cache: 'no-store' });
  return response.json();
}

async function engineStats() {
  const response = await fetch(`${args.engine}/spike/stats`);
  return response.json();
}

/** Samples web RSS while `task` runs and reports the peak growth over the starting value. */
async function withMemoryWatch(task) {
  const baseline = (await webMemory()).rss;
  let peak = baseline;
  let running = true;
  const sampler = (async () => {
    while (running) {
      peak = Math.max(peak, (await webMemory()).rss);
      await sleep(250);
    }
  })();
  try {
    return { result: await task(), rssGrowth: peak - baseline };
  } finally {
    running = false;
    await sampler;
  }
}

async function download(base) {
  const start = performance.now();
  const response = await fetch(`${base}/blob?size=${size}`);
  if (!response.ok) throw new Error(`download status ${response.status}`);
  let received = 0;
  for await (const chunk of response.body) received += chunk.byteLength;
  const seconds = (performance.now() - start) / 1000;
  if (received !== size) throw new Error(`download truncated: ${received}/${size}`);
  return { bytes: received, seconds };
}

function zeroStream(total) {
  const chunk = new Uint8Array(MiB);
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const n = Math.min(chunk.byteLength, total - sent);
      controller.enqueue(n === chunk.byteLength ? chunk : chunk.subarray(0, n));
      sent += n;
    },
  });
}

async function upload(base) {
  const start = performance.now();
  const response = await fetch(`${base}/sink`, {
    method: 'PUT',
    body: zeroStream(size),
    duplex: 'half',
    headers: { 'content-type': 'application/octet-stream' },
  });
  if (!response.ok) throw new Error(`upload status ${response.status}`);
  const body = await response.json();
  const seconds = (performance.now() - start) / 1000;
  if (body.bytes !== size) throw new Error(`upload truncated: ${body.bytes}/${size}`);
  return { bytes: body.bytes, seconds };
}

async function range(base) {
  const total = 4 * GiB;
  const from = 3 * GiB + 123;
  const response = await fetch(`${base}/blob?size=${total}`, {
    headers: { range: `bytes=${from}-${from + 99}` },
  });
  const body = new Uint8Array(await response.arrayBuffer());
  const ok =
    response.status === 206 &&
    body.byteLength === 100 &&
    response.headers.get('content-range') === `bytes ${from}-${from + 99}/${total}`;
  return {
    ok,
    status: response.status,
    length: body.byteLength,
    contentRange: response.headers.get('content-range'),
  };
}

async function sse(base, seconds) {
  const controller = new AbortController();
  const start = performance.now();
  const response = await fetch(`${base}/sse`, { signal: controller.signal });
  const decoder = new TextDecoder();
  let firstEventMs;
  let events = 0;
  let maxGapMs = 0;
  let last = performance.now();
  let endedEarly = false;
  const deadline = setTimeout(() => controller.abort(), seconds * 1000);
  try {
    for await (const chunk of response.body) {
      const text = decoder.decode(chunk, { stream: true });
      const count = (text.match(/^data: /gm) ?? []).length;
      if (count === 0) continue;
      const now = performance.now();
      firstEventMs ??= now - start;
      maxGapMs = Math.max(maxGapMs, now - last);
      last = now;
      events += count;
    }
    endedEarly = true;
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  } finally {
    clearTimeout(deadline);
  }
  const elapsed = (performance.now() - start) / 1000;
  return {
    firstEventMs: Math.round(firstEventMs ?? -1),
    events,
    maxGapMs: Math.round(maxGapMs),
    elapsed: Math.round(elapsed),
    endedEarly,
  };
}

/** Starts a stream, aborts it client-side and measures how long the engine keeps it alive. */
async function abortPropagation(base, kind) {
  const controller = new AbortController();
  const before = await engineStats();
  const request =
    kind === 'upload'
      ? fetch(`${base}/sink`, {
          method: 'PUT',
          body: zeroStream(100 * GiB),
          duplex: 'half',
          signal: controller.signal,
        })
      : fetch(`${base}/blob?size=${100 * GiB}`, { signal: controller.signal }).then(async (r) => {
          for await (const _ of r.body);
        });
  request.catch(() => {});
  await sleep(2000);
  const during = await engineStats();
  controller.abort();
  const abortedAt = performance.now();
  while (performance.now() - abortedAt < 10_000) {
    const now = await engineStats();
    if (now.activeStreams <= before.activeStreams) {
      return {
        propagated: true,
        ms: Math.round(performance.now() - abortedAt),
        activeDuring: during.activeStreams,
      };
    }
    await sleep(100);
  }
  return { propagated: false, ms: 10_000, activeDuring: during.activeStreams };
}

async function run() {
  const report = {};
  console.log(`size=${fmtMiB(size)} sse=${sseSeconds}s`);
  for (const key of args.only.split(',')) {
    const variant = variants[key];
    console.log(`\n== ${key}: ${variant.name}`);
    const entry = (report[key] = {});
    const step = async (name, fn) => {
      try {
        entry[name] = await fn();
      } catch (error) {
        entry[name] = { error: error.message };
      }
      console.log(`  ${name}:`, JSON.stringify(entry[name]));
    };
    await step('download', async () => {
      const { result, rssGrowth } = await withMemoryWatch(() => download(variant.base));
      return {
        rate: fmtRate(result.bytes, result.seconds),
        seconds: result.seconds.toFixed(1),
        webRssGrowth: fmtMiB(rssGrowth),
      };
    });
    await step('upload', async () => {
      const { result, rssGrowth } = await withMemoryWatch(() => upload(variant.base));
      return {
        rate: fmtRate(result.bytes, result.seconds),
        seconds: result.seconds.toFixed(1),
        webRssGrowth: fmtMiB(rssGrowth),
      };
    });
    await step('range', () => range(variant.base));
    await step('abortDownload', () => abortPropagation(variant.base, 'download'));
    await step('abortUpload', () => abortPropagation(variant.base, 'upload'));
    await step('sse', () => sse(variant.base, sseSeconds));
  }
  console.log(`\nREPORT ${JSON.stringify(report)}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
