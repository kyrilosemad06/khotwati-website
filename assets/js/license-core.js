/* Khotwati licence core (browser + Node). Same binary format as owner-tool/khlicense.py and the Android engine.
 * ECDSA P-256 / SHA-256 via WebCrypto. The PRIVATE key only ever lives in memory on the owner's own device. */
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const DOMAIN = enc.encode('KHOTWATI-LICENSE-V1\0');
export const VER = 1, KIND_LICENSE = 1, KIND_REVOKE = 2, FLAG_UNBOUND = 1, FLAG_RESET_CLOCK = 2, PAYLOAD_LEN = 28;

// ---------------------------------------------------------------- base32 / hex
export function b32encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  while (bits.length % 5) bits += '0';
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
export function b32decode(text) {
  const t = text.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[-_\s]/g, '');
  let bits = '';
  for (const ch of t) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`invalid character '${ch}'`);
    bits += v.toString(2).padStart(5, '0');
  }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}
export const group = (s, n) => s.match(new RegExp(`.{1,${n}}`, 'g')).join('-');
export const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const cat = (...as) => { const o = new Uint8Array(as.reduce((n, a) => n + a.length, 0)); let p = 0; for (const a of as) { o.set(a, p); p += a.length; } return o; };

// ---------------------------------------------------------------- ids / request codes
export function fmtLicenseId(raw) { const s = b32encode(raw).slice(0, 13); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; }
export function parseLicenseId(text) { const raw = b32decode(text); if (raw.length < 8) throw new Error('license id too short'); return raw.slice(0, 8); }

async function requestChecksum(hash8) {
  const d = new Uint8Array(await subtle.digest('SHA-256', cat(enc.encode('KHREQ'), Uint8Array.of(VER), hash8)));
  return d[0];
}
export async function makeRequestCode(hash8) { return group(b32encode(cat(Uint8Array.of(VER), hash8, Uint8Array.of(await requestChecksum(hash8)))), 4); }
/** Returns the 8-byte device hash or throws an Error with a human message (same wording as the Python tool). */
export async function parseRequestCode(text) {
  let raw;
  try { raw = b32decode(text); } catch (e) { throw new Error('not a valid request code'); }
  if (raw.length < 10 || raw[0] !== VER) throw new Error('not a valid request code');
  const h = raw.slice(1, 9);
  if (raw[9] !== (await requestChecksum(h))) throw new Error('request code has a typo (checksum mismatch) - ask the customer to resend it');
  return h;
}

// ---------------------------------------------------------------- dates (UTC math on ISO days)
export const EPOCH = Date.UTC(1970, 0, 1);
export const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000); };
export const dateOf = (day) => new Date(EPOCH + day * 86400000).toISOString().slice(0, 10);
export const addDays = (iso, n) => dateOf(dayOf(iso) + n);
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------------------------------------------------------------- payload / signing
export function packPayload(kind, licenseId, rev, deviceGen, startDay, lastDay, issuedDay, flags, deviceHash) {
  const b = new Uint8Array(PAYLOAD_LEN), v = new DataView(b.buffer);
  b[0] = VER; b[1] = kind; b.set(licenseId, 2); v.setUint16(10, rev); b[12] = deviceGen;
  v.setUint16(13, startDay); v.setUint16(15, lastDay); v.setUint16(17, issuedDay); b[19] = flags; b.set(deviceHash, 20);
  return b;
}
export function unpackPayload(p) {
  if (p.length !== PAYLOAD_LEN) throw new Error('bad payload length');
  const v = new DataView(p.buffer, p.byteOffset, p.length);
  return { ver: p[0], kind: p[1], license_id: fmtLicenseId(p.slice(2, 10)), rev: v.getUint16(10), device_gen: p[12],
    start: dateOf(v.getUint16(13)), last: dateOf(v.getUint16(15)), issued: dateOf(v.getUint16(17)),
    unbound: !!(p[19] & FLAG_UNBOUND), reset_clock: !!(p[19] & FLAG_RESET_CLOCK), device_hash: toHex(p.slice(20, 28)) };
}
export async function signPayload(privKey, payload) {
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, cat(DOMAIN, payload)));
  if (sig.length !== 64) throw new Error('unexpected signature size');
  return group(b32encode(cat(payload, sig)), 6);
}
export async function verifyCode(pubKey, code) {
  const blob = b32decode(code);
  if (blob.length !== PAYLOAD_LEN + 64) throw new Error('code has the wrong length');
  const payload = blob.slice(0, PAYLOAD_LEN), sig = blob.slice(PAYLOAD_LEN);
  if (!(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, cat(DOMAIN, payload))))
    throw new Error('BAD SIGNATURE - code was not issued with this key or was altered');
  return unpackPayload(payload);
}

// ---------------------------------------------------------------- key import (PKCS#8, plain or PBES2/PBKDF2/AES-CBC encrypted)
function pemBody(pem) { return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0)); }
function tlv(buf, pos) {
  const tag = buf[pos]; let len = buf[pos + 1], p = pos + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[p++]; }
  return { tag, start: p, end: p + len, next: p + len };
}
const oidHex = (buf, t) => toHex(buf.slice(t.start, t.end));
const PRF = { '2a864886f70d0207': 'SHA-1', '2a864886f70d0209': 'SHA-256', '2a864886f70d020a': 'SHA-384', '2a864886f70d020b': 'SHA-512' };
const CIPHER = { '608648016503040102': 16, '608648016503040116': 24, '60864801650304012a': 32 };

export async function importPrivateKeyPem(pem, passphrase) {
  let der = pemBody(pem);
  if (/ENCRYPTED PRIVATE KEY/.test(pem)) {
    const top = tlv(der, 0), alg = tlv(der, top.start), oid = tlv(der, alg.start);
    if (oidHex(der, oid) !== '2a864886f70d01050d') throw new Error('unsupported key encryption (expected PBES2)');
    const params = tlv(der, oid.next), kdf = tlv(der, params.start), kdfOid = tlv(der, kdf.start);
    if (oidHex(der, kdfOid) !== '2a864886f70d01050c') throw new Error('unsupported key derivation (expected PBKDF2)');
    const kp = tlv(der, kdfOid.next), salt = tlv(der, kp.start), iterT = tlv(der, salt.next);
    let iter = 0; for (let i = iterT.start; i < iterT.end; i++) iter = iter * 256 + der[i];
    let hash = 'SHA-1', cur = iterT.next;
    while (cur < kp.end) {
      const t = tlv(der, cur);
      if (t.tag === 0x30) hash = PRF[oidHex(der, tlv(der, t.start))] || (() => { throw new Error('unsupported PRF'); })();
      cur = t.next;
    }
    const scheme = tlv(der, kdf.next), cOid = tlv(der, scheme.start), keyLen = CIPHER[oidHex(der, cOid)];
    if (!keyLen) throw new Error('unsupported cipher (expected AES-CBC)');
    const iv = tlv(der, cOid.next), data = tlv(der, alg.next);
    const pw = await subtle.importKey('raw', enc.encode(passphrase || ''), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: der.slice(salt.start, salt.end), iterations: iter, hash }, pw, keyLen * 8);
    const aes = await subtle.importKey('raw', bits, 'AES-CBC', false, ['decrypt']);
    try { der = new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: der.slice(iv.start, iv.end) }, aes, der.slice(data.start, data.end))); }
    catch (e) { throw new Error('wrong passphrase'); }
  }
  try { return await subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']); }
  catch (e) { throw new Error(/ENCRYPTED/.test(pem) ? 'wrong passphrase' : 'not a valid P-256 private key'); }
}
export async function publicFromPrivate(priv) {
  const j = await subtle.exportKey('jwk', priv);
  const pub = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  return { key: pub, spkiHex: toHex(new Uint8Array(await subtle.exportKey('spki', pub))) };
}
export async function importPublicKeyHex(hex) { return subtle.importKey('spki', fromHex(hex), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']); }

// ---------------------------------------------------------------- registry + issuer (mirrors khlicense.Issuer)
export class Registry {
  constructor(data) { this.data = data && data.licenses ? data : { licenses: {} }; }
  get licenses() { return this.data.licenses; }
  toJSON() { return JSON.stringify(this.data, null, 2); }
  find(text) {
    const t = (text || '').trim();
    try { const key = fmtLicenseId(parseLicenseId(t)); if (this.licenses[key]) return [key, this.licenses[key]]; } catch (e) { /* fall through */ }
    const low = t.toLowerCase();
    const hits = Object.entries(this.licenses).filter(([, v]) => `${v.name || ''} ${v.contact || ''} ${v.payment_ref || ''}`.toLowerCase().includes(low));
    if (hits.length === 1) return hits[0];
    throw new Error(hits.length ? 'Several licenses match: ' + hits.map(([k]) => k).join(', ') : `No license matches '${text}'`);
  }
}

export class Issuer {
  constructor(priv, registry, { today = todayIso(), defaultDays = 365, defaultTransferLimit = 3 } = {}) {
    Object.assign(this, { priv, reg: registry, today, days: defaultDays, limit: defaultTransferLimit });
  }
  log(lic, action, details = {}) { lic.history.push({ at: this.today, action, ...details }); }
  remember(lic, code) { lic.last_code = code; return code; }
  async sign(key, lic, kind = KIND_LICENSE, extraFlags = 0) {
    const dev = lic.devices[lic.devices.length - 1];
    const flags = extraFlags | (dev.unbound ? FLAG_UNBOUND : 0);
    return signPayload(this.priv, packPayload(kind, parseLicenseId(key), lic.rev, lic.device_gen, dayOf(lic.start), dayOf(lic.last_day),
      dayOf(this.today), flags, fromHex(dev.hash)));
  }
  static requireActive(lic) { if (lic.status !== 'active') throw new Error('license is revoked - run reinstate first if that was a mistake'); }

  async issue({ name, contact, payment_ref, request, unbound = false, days, start, transfer_limit, notes = '' }) {
    if (!unbound && !request) throw new Error('a device request code is required (or use unbound)');
    const devHash = unbound ? new Uint8Array(8) : await parseRequestCode(request);
    const st = start || this.today;
    let key; do { key = fmtLicenseId(globalThis.crypto.getRandomValues(new Uint8Array(8))); } while (this.reg.licenses[key]);
    const lic = { name, contact, payment_ref, notes, status: 'active', start: st, last_day: addDays(st, (days || this.days) - 1), rev: 1, device_gen: 1,
      transfers_used: 0, transfer_limit: transfer_limit == null || transfer_limit === '' ? this.limit : Number(transfer_limit),
      devices: [{ gen: 1, hash: toHex(devHash), unbound: !!unbound, added: this.today }], history: [] };
    this.reg.licenses[key] = lic;
    this.log(lic, 'issue', { last_day: lic.last_day, unbound: !!unbound });
    return [key, this.remember(lic, await this.sign(key, lic))];
  }
  async renew(ident, days) {
    const [key, lic] = this.reg.find(ident); Issuer.requireActive(lic);
    const base = lic.last_day >= this.today ? lic.last_day : addDays(this.today, -1);     // early: extend the end date; late: restart from today
    lic.last_day = addDays(base, days || this.days); lic.rev += 1;
    this.log(lic, 'renew', { last_day: lic.last_day, rev: lic.rev });
    return [key, this.remember(lic, await this.sign(key, lic))];
  }
  async replace(ident, request, resetClock = false, force = false) {
    const [key, lic] = this.reg.find(ident); Issuer.requireActive(lic);
    if (lic.transfers_used >= lic.transfer_limit && !force)
      throw new Error(`transfer limit reached (${lic.transfers_used}/${lic.transfer_limit}). Verify the customer, then re-run with --force (or raise the limit).`);
    const newHash = await parseRequestCode(request), oldRev = lic.rev;
    lic.devices.push({ gen: lic.device_gen + 1, hash: toHex(newHash), unbound: false, added: this.today });
    lic.device_gen += 1; lic.transfers_used += 1; lic.rev += 1;
    this.log(lic, 'replace_device', { rev: lic.rev, device_gen: lic.device_gen, forced: !!force });
    const code = this.remember(lic, await this.sign(key, lic, KIND_LICENSE, resetClock ? FLAG_RESET_CLOCK : 0));
    return [key, code, await this.revocationCode(key, lic, oldRev, false)];
  }
  async resetClock(ident) {
    const [key, lic] = this.reg.find(ident); Issuer.requireActive(lic); lic.rev += 1;
    this.log(lic, 'reset_clock', { rev: lic.rev });
    return [key, this.remember(lic, await this.sign(key, lic, KIND_LICENSE, FLAG_RESET_CLOCK))];
  }
  async revocationCode(key, lic, uptoRev, log = true) {
    const upto = uptoRev == null ? lic.rev : uptoRev;
    if (log) this.log(lic, 'revocation_code', { upto_rev: upto });
    return signPayload(this.priv, packPayload(KIND_REVOKE, parseLicenseId(key), upto, lic.device_gen, dayOf(lic.start), dayOf(lic.last_day), dayOf(this.today), 0, new Uint8Array(8)));
  }
  async revoke(ident, reason = '') {
    const [key, lic] = this.reg.find(ident); lic.status = 'revoked'; this.log(lic, 'revoke', { reason });
    return [key, await this.revocationCode(key, lic)];
  }
  async reinstate(ident) {
    const [key, lic] = this.reg.find(ident); lic.status = 'active'; lic.rev += 1; this.log(lic, 'reinstate', { rev: lic.rev });
    return [key, this.remember(lic, await this.sign(key, lic, KIND_LICENSE, FLAG_RESET_CLOCK))];
  }
  async reissue(ident) {
    const [key, lic] = this.reg.find(ident); Issuer.requireActive(lic);
    const code = this.remember(lic, await this.sign(key, lic)); this.log(lic, 'reissue', { rev: lic.rev });
    return [key, code];
  }
  edit(ident, fields) {
    const [key, lic] = this.reg.find(ident), before = {}, changes = {};
    for (const f of ['name', 'contact', 'payment_ref', 'notes']) if (fields[f] != null) { before[f] = lic[f] ?? ''; changes[f] = fields[f]; }
    if (!Object.keys(changes).length) throw new Error('nothing to change');
    Object.assign(lic, changes); this.log(lic, 'edit', { before, after: changes });
    return [key, changes];
  }
  static view(key, lic, today) {
    const left = dayOf(lic.last_day) - dayOf(today) + 1, dev = lic.devices[lic.devices.length - 1];
    const state = lic.status !== 'active' ? 'revoked' : left <= 0 ? 'expired' : left <= 30 ? 'expiring' : 'active';
    return { id: key, name: lic.name || '', contact: lic.contact || '', payment_ref: lic.payment_ref || '', notes: lic.notes || '', state, start: lic.start,
      last_day: lic.last_day, days_left: left, rev: lic.rev, device_gen: lic.device_gen, transfers_used: lic.transfers_used,
      transfer_limit: lic.transfer_limit, unbound: dev.unbound, has_code: !!lic.last_code, history: lic.history.slice(-20) };
  }
}
