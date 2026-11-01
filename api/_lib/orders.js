import { randomBytes } from 'node:crypto';
import { cmd, pipeline } from './redis.js';
import { HttpError } from './http.js';
import { parseRequestCode, makeRequestCode, b32decode, unpackPayload, verifyCode, importPublicKeyHex, toHex, KIND_LICENSE, PAYLOAD_LEN, ALPHABET } from '../../assets/js/license-core.js';

const TTL = 60 * 86400;                      // orders are kept 60 days, then disappear on their own
export const TYPES = ['new', 'renew', 'transfer'];
export const METHODS = ['instapay', 'vodafone', 'orange'];
const ID_RE = /^KH-[0-9A-Z]{8}$/;

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const newId = () => 'KH-' + [...randomBytes(8)].map((b) => ALPHABET[b & 31]).join('');
export const validId = (id) => ID_RE.test(String(id || '').toUpperCase());

async function save(o) { await cmd('SET', `order:${o.id}`, JSON.stringify(o), 'EX', TTL); }
export async function load(id) {
  if (!validId(id)) return null;
  const raw = await cmd('GET', `order:${String(id).toUpperCase()}`);
  return raw ? JSON.parse(raw) : null;
}

/** What the customer may see (never the device code or contact details). */
export const publicView = (o) => ({ id: o.id, type: o.type, status: o.status, method: o.method, createdAt: o.createdAt, approvedAt: o.approvedAt || null,
  code: o.status === 'approved' ? o.code : undefined, licenseId: o.status === 'approved' ? o.licenseId : undefined, lastDay: o.status === 'approved' ? o.lastDay : undefined,
  reason: o.status === 'rejected' ? o.reason || '' : undefined });

export async function createOrder(b) {
  const type = TYPES.includes(b.type) ? b.type : 'new';
  const method = METHODS.includes(b.method) ? b.method : null;
  if (!method) throw new HttpError(400, 'bad_method');
  let deviceHash = '', device = '', licenseId = '';
  if (type !== 'renew') {
    try { const h = await parseRequestCode(String(b.device || '')); deviceHash = toHex(h); device = await makeRequestCode(h); }
    catch (e) { throw new HttpError(400, 'bad_device_code'); }
  }
  if (type !== 'new') {
    licenseId = String(b.licenseId || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 13);
    if (licenseId.length !== 13) throw new HttpError(400, 'bad_license_id');
    licenseId = `${licenseId.slice(0, 4)}-${licenseId.slice(4, 8)}-${licenseId.slice(8)}`;
  }
  const dedupeKey = `dup:${type}:${deviceHash || licenseId}`;
  const existing = await cmd('GET', dedupeKey);
  if (existing) { const o = await load(existing); if (o && o.status === 'pending') return { order: o, existing: true }; }
  const o = { id: '', type, status: 'pending', method, name: clean(b.name, 40), contact: clean(b.contact, 20), note: clean(b.note, 120),
    amount: clean(b.amount, 20), device, deviceHash, licenseId, createdAt: Date.now() };
  for (let i = 0; i < 5; i++) { o.id = newId(); if ((await cmd('SET', `order:${o.id}`, JSON.stringify(o), 'EX', TTL, 'NX')) === 'OK') break; if (i === 4) throw new Error('id collision'); }
  await pipeline([['ZADD', 'orders:pending', o.createdAt, o.id], ['SET', dedupeKey, o.id, 'EX', 14 * 86400]]);
  return { order: o, existing: false };
}
export async function listOrders(status = 'pending', limit = 100) {
  const ids = await cmd('ZREVRANGE', `orders:${status}`, 0, limit - 1);
  if (!ids.length) return [];
  const raws = await cmd('MGET', ...ids.map((i) => `order:${i}`));
  const out = [];
  for (let i = 0; i < ids.length; i++) { if (raws[i]) out.push(JSON.parse(raws[i])); else await cmd('ZREM', `orders:${status}`, ids[i]); }
  return out;
}

/** Checks that a signed code really is the code for THIS order, then stores it. */
export async function approveOrder(id, code) {
  const o = await load(id); if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'pending') throw new HttpError(409, 'not_pending');
  let info;
  try { info = unpackPayload(b32decode(String(code)).slice(0, PAYLOAD_LEN)); } catch (e) { throw new HttpError(400, 'bad_code'); }
  if (b32decode(String(code)).length !== PAYLOAD_LEN + 64 || info.kind !== KIND_LICENSE) throw new HttpError(400, 'bad_code');
  if (o.type !== 'renew' && !info.unbound && info.device_hash !== o.deviceHash) throw new HttpError(400, 'code_for_another_device');
  if (o.licenseId && info.license_id !== o.licenseId) throw new HttpError(400, 'code_for_another_license');
  const pub = (process.env.LICENSE_PUBLIC_KEY_HEX || '').trim();
  if (pub) { try { await verifyCode(await importPublicKeyHex(pub), String(code)); } catch (e) { throw new HttpError(400, 'bad_signature'); } }
  Object.assign(o, { status: 'approved', code: String(code).trim(), licenseId: info.license_id, lastDay: info.last, approvedAt: Date.now() });
  await save(o);
  await pipeline([['ZREM', 'orders:pending', o.id], ['ZADD', 'orders:approved', o.approvedAt, o.id], ['DEL', `dup:${o.type}:${o.deviceHash || o.licenseId}`]]);
  return o;
}
export async function rejectOrder(id, reason) {
  const o = await load(id); if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'pending') throw new HttpError(409, 'not_pending');
  Object.assign(o, { status: 'rejected', reason: clean(reason, 140), approvedAt: Date.now() });
  await save(o);
  await pipeline([['ZREM', 'orders:pending', o.id], ['DEL', `dup:${o.type}:${o.deviceHash || o.licenseId}`]]);
  return o;
}

export async function notifyOwner(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID; if (!t || !c) return;
  try { await fetch(`https://api.telegram.org/bot${t}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: c, text }), signal: AbortSignal.timeout(3000) }); } catch (e) { /* never block an order */ }
}
