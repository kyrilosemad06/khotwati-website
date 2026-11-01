import { timingSafeEqual } from 'node:crypto';
import { cmd, pipeline } from './redis.js';

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(obj));
}
export class HttpError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }

export async function readJson(req, limit = 20000) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > limit) throw new HttpError(413, 'too_large'); chunks.push(c); } raw = Buffer.concat(chunks).toString('utf8'); }
  if (raw.length > limit) throw new HttpError(413, 'too_large');
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { throw new HttpError(400, 'bad_json'); }
}
export const query = (req) => Object.fromEntries(new URL(req.url, 'http://x').searchParams);
export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim();

/** Fixed-window limiter. Returns false when the limit is exceeded. */
export async function rateLimit(key, limit, windowSec) {
  const [n] = await pipeline([['INCR', key], ['EXPIRE', key, windowSec, 'NX']]);
  return n <= limit;
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Owner-only endpoints: Authorization: Bearer <OWNER_TOKEN>. Blocks brute force per IP. */
export async function requireOwner(req) {
  const t = process.env.OWNER_TOKEN || '';
  if (t.length < 8) throw new HttpError(503, 'admin_not_configured');
  const ip = clientIp(req);
  const tries = Number(await cmd('GET', `rl:auth:${ip}`)) || 0;
  if (tries >= 20) throw new HttpError(429, 'too_many_attempts');
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(got, t)) { await pipeline([['INCR', `rl:auth:${ip}`], ['EXPIRE', `rl:auth:${ip}`, 900, 'NX']]); throw new HttpError(401, 'unauthorized'); }
}
/** Wraps a handler: method check, storage check, uniform error responses. */
export const route = (methods, fn) => async (req, res) => {
  try {
    if (!methods.includes(req.method)) throw new HttpError(405, 'method_not_allowed');
    const { configured } = await import('./redis.js');
    if (!configured()) throw new HttpError(503, 'not_configured');
    await fn(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code });
    console.error('api error', e);
    send(res, 500, { error: 'server_error' });
  }
};
