// Integration tests of the real /api handlers against a fake Upstash server. Run: node _dev/api.test.mjs <private.pem> <public.hex>
import * as C from '../assets/js/license-core.js';
import fs from 'node:fs'; import assert from 'node:assert/strict';
import { startFakeRedis } from './fake-redis.mjs'; import { startDevServer } from './dev-server.mjs';
const redis = await startFakeRedis('tok'); process.env.UPSTASH_REDIS_REST_URL = redis.url; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
process.env.OWNER_TOKEN = 'owner-secret-123'; process.env.LICENSE_PUBLIC_KEY_HEX = fs.readFileSync(process.argv[3], 'utf8').trim();
const priv = await C.importPrivateKeyPem(fs.readFileSync(process.argv[2], 'utf8'), 'khotwati-test');
const dev = await startDevServer(0), B = `http://127.0.0.1:${dev.port}`;
const call = async (m, p, body, token, ip) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json() }; };
const OWN = 'owner-secret-123'; let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  PASS ', name); };
const hashA = Uint8Array.from({ length: 8 }, (_, i) => 60 + i), hashB = Uint8Array.from({ length: 8 }, (_, i) => 80 + i);
const devA = await C.makeRequestCode(hashA), devB = await C.makeRequestCode(hashB);
const reg = new C.Registry(); const iss = () => new C.Issuer(priv, reg, { today: '2026-10-24' });
let order, code;

await t('create order: id format, pending, customer view hides device/contact', async () => {
  const r = await call('POST', '/api/orders', { type: 'new', method: 'instapay', device: devA.toLowerCase().replace(/-/g, ''), name: 'سارة <b>x</b>', contact: '01012345678', amount: '99' }, null, '1.1.1.1');
  assert.equal(r.s, 201); order = r.j; assert.match(order.id, /^KH-[0-9A-Z]{8}$/); assert.equal(order.status, 'pending'); assert.equal(order.code, undefined);
  assert.equal(JSON.stringify(r.j).includes('01012345678'), false); assert.equal(JSON.stringify(r.j).includes(devA), false);
});
await t('same device ordering twice returns the same pending order (no spam)', async () => {
  const r = await call('POST', '/api/orders', { type: 'new', method: 'vodafone', device: devA }, null, '1.1.1.1'); assert.equal(r.s, 200); assert.equal(r.j.id, order.id); assert.equal(r.j.existing, true);
});
await t('invalid input is refused: typo in device code, bad method, bad license id', async () => {
  const typo = devB.slice(0, -1) + (devB.slice(-1) === '0' ? '1' : '0');
  assert.equal((await call('POST', '/api/orders', { type: 'new', method: 'instapay', device: typo }, null, '2.2.2.2')).j.error, 'bad_device_code');
  assert.equal((await call('POST', '/api/orders', { type: 'new', method: 'paypal', device: devB }, null, '2.2.2.2')).j.error, 'bad_method');
  assert.equal((await call('POST', '/api/orders', { type: 'renew', method: 'orange', licenseId: '123' }, null, '2.2.2.2')).j.error, 'bad_license_id');
  assert.equal((await call('POST', '/api/orders', 'x')).s >= 400, true);
});
await t('status polling while pending never reveals a code', async () => {
  const r = await call('GET', '/api/orders?id=' + order.id.toLowerCase(), null, null, '3.3.3.3'); assert.equal(r.s, 200); assert.equal(r.j.status, 'pending'); assert.equal(r.j.code, undefined);
  assert.equal((await call('GET', '/api/orders?id=KH-ZZZZZZZZ')).s, 404); assert.equal((await call('GET', '/api/orders?id=bad')).s, 400);
});
await t('admin endpoints: no token / wrong token are refused; brute force is blocked', async () => {
  assert.equal((await call('GET', '/api/admin/list')).s, 401); assert.equal((await call('GET', '/api/admin/list', null, 'nope', '9.9.9.9')).s, 401);
  let last; for (let i = 0; i < 25; i++) last = await call('GET', '/api/admin/list', null, 'nope' + i, '8.8.8.8'); assert.equal(last.s, 429);
  assert.equal((await call('GET', '/api/admin/list', null, OWN, '8.8.8.8')).s, 429);          // even the right token is locked out for that IP for a while
  assert.equal((await call('POST', '/api/admin/approve', { id: order.id, code: 'x' }, null)).s, 401);
});
await t('owner sees the pending order with the device code (names are stored as plain text)', async () => {
  const r = await call('GET', '/api/admin/list', null, OWN, '4.4.4.4'); assert.equal(r.s, 200); const o = r.j.orders.find((x) => x.id === order.id);
  assert.equal(o.device, devA); assert.equal(o.contact, '01012345678'); assert.equal(o.name.includes('<'), false);
});
await t('approve is refused for a code made for ANOTHER device or by ANOTHER key, and for garbage', async () => {
  const [, other] = await iss().issue({ name: 'other', request: devB }); code = other;
  assert.equal((await call('POST', '/api/admin/approve', { id: order.id, code: other }, OWN, '4.4.4.4')).j.error, 'code_for_another_device');
  const evil = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const [, forged] = await new C.Issuer(evil.privateKey, new C.Registry(), { today: '2026-10-24' }).issue({ name: 'f', request: devA });
  assert.equal((await call('POST', '/api/admin/approve', { id: order.id, code: forged }, OWN, '4.4.4.4')).j.error, 'bad_signature');
  assert.equal((await call('POST', '/api/admin/approve', { id: order.id, code: 'GARBAGE' }, OWN, '4.4.4.4')).j.error, 'bad_code');
  const still = await call('GET', '/api/orders?id=' + order.id); assert.equal(still.j.status, 'pending'); assert.equal(still.j.code, undefined);   // nothing leaked
});
await t('approve with the right signed code -> customer polling now receives it', async () => {
  const [lid, good] = await iss().issue({ name: 'سارة', contact: '01012345678', payment_ref: order.id, request: devA }); code = good;
  const a = await call('POST', '/api/admin/approve', { id: order.id, code: good }, OWN, '4.4.4.4'); assert.equal(a.s, 200); assert.equal(a.j.licenseId, lid); assert.equal(a.j.lastDay, '2027-10-23');
  const r = await call('GET', '/api/orders?id=' + order.id); assert.equal(r.j.status, 'approved'); assert.equal(r.j.code, good); assert.equal(r.j.licenseId, lid);
  assert.equal((await C.verifyCode((await C.publicFromPrivate(priv)).key, r.j.code)).device_hash, C.toHex(hashA));         // what the customer sees is a genuine code for their device
  assert.equal((await call('POST', '/api/admin/approve', { id: order.id, code: good }, OWN, '4.4.4.4')).j.error, 'not_pending');   // cannot be approved twice
  assert.equal((await call('GET', '/api/admin/list', null, OWN, '4.4.4.4')).j.orders.length, 0);
  assert.equal((await call('GET', '/api/admin/list?status=approved', null, OWN, '4.4.4.4')).j.orders.length, 1);
});
await t('reject flow: customer sees the reason, never a code; can order again afterwards', async () => {
  const o = (await call('POST', '/api/orders', { type: 'new', method: 'orange', device: devB }, null, '5.5.5.5')).j;
  const r = await call('POST', '/api/admin/reject', { id: o.id, reason: 'التحويل لم يصل' }, OWN, '4.4.4.4'); assert.equal(r.j.status, 'rejected');
  const v = (await call('GET', '/api/orders?id=' + o.id)).j; assert.equal(v.status, 'rejected'); assert.equal(v.reason, 'التحويل لم يصل'); assert.equal(v.code, undefined);
  assert.equal((await call('POST', '/api/orders', { type: 'new', method: 'orange', device: devB }, null, '5.5.5.5')).j.existing, false);
});
await t('renewal and transfer orders carry the license id and are matched to it', async () => {
  const [lid] = await iss().issue({ name: 'R', request: devA });
  const ro = (await call('POST', '/api/orders', { type: 'renew', method: 'vodafone', licenseId: lid.toLowerCase().replace(/-/g, '') }, null, '6.6.6.6')).j;
  const [, renew] = await iss().renew(lid); const [, other] = await iss().issue({ name: 'zz', request: devB });
  assert.equal((await call('POST', '/api/admin/approve', { id: ro.id, code: other }, OWN, '4.4.4.4')).j.error, 'code_for_another_license');
  assert.equal((await call('POST', '/api/admin/approve', { id: ro.id, code: renew }, OWN, '4.4.4.4')).s, 200);
  const to = (await call('POST', '/api/orders', { type: 'transfer', method: 'instapay', licenseId: lid, device: devB }, null, '6.6.6.6')).j;
  const [, repl] = await iss().replace(lid, devB); assert.equal((await call('POST', '/api/admin/approve', { id: to.id, code: repl }, OWN, '4.4.4.4')).s, 200);
  assert.equal((await call('GET', '/api/orders?id=' + to.id)).j.code, repl);
});
await t('rate limit on order creation per IP', async () => {
  let last; for (let i = 0; i < 10; i++) last = await call('POST', '/api/orders', { type: 'new', method: 'instapay', device: await C.makeRequestCode(Uint8Array.from({ length: 8 }, (_, k) => i * 9 + k)) }, null, '7.7.7.7'); assert.equal(last.s, 429);
});
await t('orders expire on their own (TTL set) and nothing stores the private key', async () => {
  const { kv, exp } = redis.dump(); assert.ok([...kv.keys()].filter((k) => k.startsWith('order:')).every((k) => exp.has(k)));
  assert.equal([...kv.values()].some((v) => /PRIVATE|owner_private/.test(v)), false);
});
console.log(`\n${n} passed`); dev.close(); redis.close();
