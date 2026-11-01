// Minimal Upstash-compatible REST server for tests: GET SET DEL INCR EXPIRE MGET ZADD ZREM ZREVRANGE ZCARD.
import http from 'node:http';
export function startFakeRedis(token = 'test-token') {
  const kv = new Map(), exp = new Map(), z = new Map();
  const alive = (k) => { const e = exp.get(k); if (e && e <= Date.now()) { kv.delete(k); exp.delete(k); } return kv.has(k); };
  const run = ([c, ...a]) => {
    c = String(c).toUpperCase();
    if (c === 'GET') return alive(a[0]) ? kv.get(a[0]) : null;
    if (c === 'MGET') return a.map((k) => (alive(k) ? kv.get(k) : null));
    if (c === 'SET') { const [k, v, ...o] = a; const nx = o.map(String).includes('NX'); if (nx && alive(k)) return null; kv.set(k, String(v)); exp.delete(k);
      const i = o.findIndex((x) => String(x).toUpperCase() === 'EX'); if (i >= 0) exp.set(k, Date.now() + Number(o[i + 1]) * 1000); return 'OK'; }
    if (c === 'DEL') { let n = 0; for (const k of a) { if (alive(k)) n++; kv.delete(k); exp.delete(k); } return n; }
    if (c === 'INCR') { const n = (alive(a[0]) ? Number(kv.get(a[0])) : 0) + 1; kv.set(a[0], String(n)); return n; }
    if (c === 'EXPIRE') { const [k, s, flag] = a; if (!alive(k)) return 0; if (String(flag).toUpperCase() === 'NX' && exp.has(k)) return 0; exp.set(k, Date.now() + Number(s) * 1000); return 1; }
    if (c === 'ZADD') { const m = z.get(a[0]) || new Map(); m.set(String(a[2]), Number(a[1])); z.set(a[0], m); return 1; }
    if (c === 'ZREM') { const m = z.get(a[0]); return m && m.delete(String(a[1])) ? 1 : 0; }
    if (c === 'ZCARD') return (z.get(a[0]) || new Map()).size;
    if (c === 'ZREVRANGE') { const m = [...(z.get(a[0]) || new Map())].sort((x, y) => y[1] - x[1]).map((e) => e[0]); const s = Number(a[1]), e = Number(a[2]); return m.slice(s, e < 0 ? undefined : e + 1); }
    throw new Error('ERR unknown command ' + c);
  };
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== `Bearer ${token}`) { res.statusCode = 401; return res.end('{"error":"unauthorized"}'); }
      try {
        const j = JSON.parse(body);
        if (req.url === '/pipeline') return res.end(JSON.stringify(j.map((c) => { try { return { result: run(c) }; } catch (e) { return { error: e.message }; } })));
        res.end(JSON.stringify({ result: run(j) }));
      } catch (e) { res.end(JSON.stringify({ error: e.message })); }
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, token, close: () => server.close(), dump: () => ({ kv, z, exp }) })));
}
