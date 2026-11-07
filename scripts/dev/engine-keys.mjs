// Prints a fresh Ed25519 key pair for web → engine tokens, as docker/.env lines.
// The private key goes to the web app only; the engine only ever gets the public key.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ed25519');
const jwk = privateKey.export({ format: 'jwk' });
console.log(`CANOPY_ENGINE_PRIVATE_KEY=${jwk.d}`);
console.log(`CANOPY_ENGINE_PUBLIC_KEY=${jwk.x}`);
