// Starts: fake Upstash + the site with its real /api handlers on :4300.  node _dev/e2e-server.mjs <public.hex>
import fs from 'node:fs'; import { startFakeRedis } from './fake-redis.mjs'; import { startDevServer } from './dev-server.mjs';
const redis = await startFakeRedis('tok');
Object.assign(process.env, { UPSTASH_REDIS_REST_URL: redis.url, UPSTASH_REDIS_REST_TOKEN: 'tok', OWNER_TOKEN: 'owner-secret-123', LICENSE_PUBLIC_KEY_HEX: fs.readFileSync(process.argv[2], 'utf8').trim() });
const dev = await startDevServer(4300); console.log('READY', dev.port);
