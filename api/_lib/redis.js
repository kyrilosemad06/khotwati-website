// Tiny Upstash / Vercel-KV REST client (no dependencies). Works with either env-var naming.
const url = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
export const configured = () => !!(url() && token());

async function call(path, payload) {
  const r = await fetch(url() + path, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok && r.status >= 500) throw new Error('storage unavailable');
  return r.json();
}
export async function cmd(...args) { const j = await call('', args); if (j.error) throw new Error(j.error); return j.result; }
export async function pipeline(cmds) { const j = await call('/pipeline', cmds); return j.map((x) => { if (x.error) throw new Error(x.error); return x.result; }); }
