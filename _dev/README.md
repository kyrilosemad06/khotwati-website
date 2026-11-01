Dev-only tools (not needed in production).

- `node _dev/api.test.mjs <private.pem> <public.hex>` - API integration tests against a fake Upstash.
- `node _dev/e2e-server.mjs <public.hex>` - local site + API + fake Redis on :4300 for browser tests.
- `node _dev/dev-server.mjs 4300` - static + /api only (set the Upstash env vars yourself).
