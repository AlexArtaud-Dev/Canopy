// Preloaded with `node --import` before Next starts. Next only fills `x-forwarded-for` with the
// socket address when the client did not send one, so App Router code cannot know the direct peer.
// Before Next sees each request we overwrite `x-canopy-peer` with `<nonce> <socket address>`. The
// per-process nonce proves the value came from here and not from a client-supplied header.
import { randomBytes } from 'node:crypto';
import { subscribe } from 'node:diagnostics_channel';

const nonce = randomBytes(16).toString('hex');
process.env.CANOPY_PEER_NONCE = nonce;

subscribe('http.server.request.start', ({ request, socket }) => {
  request.headers['x-canopy-peer'] = `${nonce} ${socket.remoteAddress ?? ''}`;
});
