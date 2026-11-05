import { parseRequestCode } from './license-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clean = (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '');
const fmtDev = (v) => clean(v).slice(0, 16).replace(/(.{4})(?=.)/g, '$1-');
const fmtLic = (v) => { const c = clean(v).slice(0, 13); return [c.slice(0, 4), c.slice(4, 8), c.slice(8)].filter(Boolean).join('-'); };
const ID_RE = /^KH-[0-9A-Z]{8}$/;
const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

export function initWizard(ctx) {
  const { S, t, lang, toast, copyText, svg, waLink, isPlaceholder } = ctx;
  const st = { type: 'new', step: 1, method: S.payments?.[0]?.id || '', codeOk: false, device: '', licOk: false, lic: '', order: null, poll: null, busy: false };

  // ------------------------------------------------------------------ helpers
  const money = () => (S.price ? `${S.price.amount} ${S.price.currency[lang()]}` : '');
  const method = () => (S.payments || []).find((p) => p.id === st.method) || S.payments[0];
  const kind = (ty) => t('kinds')[ty];

  // ------------------------------------------------------------------ steps
  function go(n, scroll = true) {
    st.step = n;
    $$('.pane', $('#wizard')).forEach((p) => p.classList.toggle('on', Number(p.dataset.pane) === n));
    $$('#stepper li').forEach((li) => { const s = Number(li.dataset.s); li.classList.toggle('on', s === n); li.classList.toggle('done', s < n); });
    if (scroll && matchMedia('(max-width: 760px)').matches) $('#wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function setType(ty, scroll = true) {
    st.type = ty; clearInterval(st.poll);
    $$('#wzTabs button').forEach((b) => b.classList.toggle('on', b.dataset.type === ty));
    $('#rowLic').hidden = ty === 'new'; $('#rowCode').hidden = ty === 'renew';
    $('#wzHint').textContent = t('wz_hint_' + ty);
    go(1, scroll); validate();
  }
  async function validateCode() {
    const msg = $('#codeMsg'), raw = clean($('#oCode').value); st.codeOk = false; st.device = ''; msg.className = 'msg';
    if (!raw) { msg.textContent = ''; return; }
    if (raw.length < 16) { msg.textContent = t('code_short'); return; }
    try { await parseRequestCode(raw); st.codeOk = true; st.device = fmtDev(raw); msg.textContent = t('code_ok'); msg.classList.add('ok'); }
    catch (e) { msg.textContent = t('code_bad'); msg.classList.add('bad'); }
  }
  function validateLic() {
    const msg = $('#licMsg'), c = clean($('#oLic').value); st.licOk = c.length === 13; st.lic = st.licOk ? fmtLic(c) : ''; msg.className = 'msg';
    msg.textContent = !c || st.licOk ? '' : t('lic_bad');
  }
  async function validate() {
    await validateCode(); validateLic();
    $('#toStep2').disabled = !((st.type === 'renew' || st.codeOk) && (st.type === 'new' || st.licOk));
  }

  // ------------------------------------------------------------------ payment methods
  function renderPm() {
    $('#amtView').textContent = money();
    $('#pmGrid').innerHTML = (S.payments || []).map((p) => {
      const logo = p.logo ? `<img class="pm-logo pm-logo-${esc(p.id)}" src="${esc(p.logo)}" alt="">` : `<span class="ico">${svg(p.id === 'instapay' ? 'send' : 'smartphone')}</span>`;
      const badge = p.badge?.[lang()] ? `<span class="pm-badge">${esc(p.badge[lang()])}</span>` : '';
      return `<button type="button" class="pm ${p.id === st.method ? 'on' : ''}" role="radio" aria-checked="${p.id === st.method}" data-id="${esc(p.id)}" style="--mc:${esc(p.color || '#1B63F6')}"><span class="pm-brand"><span class="pm-logo-wrap">${logo}</span><span class="pm-copy"><span class="pm-name">${esc(p.name[lang()])}</span>${badge}</span></span></button>`;
    }).join('');
    $$('#pmGrid .pm').forEach((b) => b.addEventListener('click', () => { st.method = b.dataset.id; renderPm(); }));
    const m = method(); if (!m) return;
    const steps = (m.link ? t('pm_insta') : t('pm_wallet')).map((x) => `<li>${esc(x)}</li>`).join('');
    $('#pmDetail').innerHTML = `<div class="to">${esc(t('wz_transfer_to'))} · ${esc(m.name[lang()])}</div>
      <div class="val"><b>${esc(m.value)}</b><button type="button" class="mini" data-copy="${esc(m.value)}">${svg('copy')}<span>${esc(t('copy'))}</span></button></div>
      ${m.link ? `<a class="btn primary block" href="${esc(m.link)}" target="_blank" rel="noopener">${svg('external-link')}<span>${esc(t('pm_open_link'))}</span></a>` : ''}
      <ol>${steps}</ol>`;
    $$('#pmDetail [data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b)));
  }

  // ------------------------------------------------------------------ create order
  async function createOrder() {
    if (st.busy) return; st.busy = true;
    const btn = $('#createBtn'), txt = $('#createTxt'); btn.disabled = true; txt.textContent = t('wz_creating');
    const body = { type: st.type, method: st.method, name: $('#oName').value, contact: $('#oPhone').value, amount: money(), device: st.device, licenseId: st.lic };
    try {
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) { st.order = j; LS.set('kh_order', JSON.stringify({ id: j.id, type: st.type })); go(3); render(); startPolling(); return; }
      if (r.status === 503 || r.status === 404 || r.status === 405) { st.order = { fallback: true }; go(3); render(); return; }
      toast(r.status === 429 ? t('e_too_many') : t('e_' + j.error) !== 'e_' + j.error ? t('e_' + j.error) : t('e_generic'));
    } catch (e) { st.order = { fallback: true }; go(3); render(); }
    finally { st.busy = false; txt.textContent = t('wz_create'); btn.disabled = !$('#paidChk').checked; }
  }

  // ------------------------------------------------------------------ tracker
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = Object.assign(document.createElement('div'), { className: 'confetti' }); const cols = ['#00D2FF', '#1B63F6', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6'];
    for (let i = 0; i < 46; i++) { const p = document.createElement('i'); p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-duration:${2.2 + Math.random() * 2}s;animation-delay:${Math.random() * .6}s;transform:rotate(${Math.random() * 360}deg)`; box.append(p); }
    document.body.append(box); setTimeout(() => box.remove(), 5200);
  }
  function until(d) { return new Date(d + 'T12:00:00').toLocaleDateString(lang() === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function receiptLink(o) { return waLink(t('msg_receipt')({ id: o.id, kind: kind(o.type || st.type), method: (S.payments.find((p) => p.id === o.method) || method()).name[lang()], amount: money(), name: $('#oName').value.trim() })); }
  function render() {
    const el = $('#tracker'), o = st.order; if (!o) return;
    if (o.fallback) {
      const text = t('msg_fallback')({ kind: kind(st.type), name: $('#oName').value.trim(), device: st.device, lic: st.lic, method: method().name[lang()], amount: money() });
      el.innerHTML = `<div class="tr"><div class="tr-ico">${svg('message-circle')}</div><h3>${esc(t('fb_t'))}</h3><p>${esc(t('fb_p'))}</p><a class="btn wa lg" target="_blank" rel="noopener" href="${esc(waLink(text))}">${svg('message-circle')}<span>${esc(t('fb_btn'))}</span></a></div>`; return;
    }
    const idRow = `<div class="oid"><span>${esc(t('tr_id'))}</span><b>${esc(o.id)}</b><button class="mini" type="button" data-copy="${esc(o.id)}">${svg('copy')}</button></div>`;
    if (o.status === 'approved') {
      const how = t('tr_how_' + o.type).map((x) => `<li>${esc(x)}</li>`).join('');
      el.innerHTML = `<div class="tr"><div class="tr-ico ok">${svg('check')}</div><h3>${esc(t('tr_ok_t'))}</h3><p>${esc(t('tr_ok_p'))}</p>
        <div class="codebox" id="theCode">${esc(o.code)}</div>
        <button class="btn primary lg" type="button" data-copy="${esc(o.code)}">${svg('copy')}<span>${esc(t('tr_copy_code'))}</span></button>
        <div class="lic"><span>${esc(t('tr_lic'))}</span><b>${esc(o.licenseId)}</b><button class="mini" type="button" data-copy="${esc(o.licenseId)}">${svg('copy')}</button></div>
        <p class="small">${esc(t('tr_lic_hint'))} · ${esc(t('tr_until'))} ${esc(until(o.lastDay))}</p><ol class="how">${how}</ol>
        <button class="mini" id="newOrder" type="button" style="margin-top:18px">${esc(t('tr_new'))}</button></div>`;
      if (!st.celebrated || st.celebrated !== o.id) { st.celebrated = o.id; confetti(); }
    } else if (o.status === 'rejected') {
      el.innerHTML = `<div class="tr"><div class="tr-ico bad">${svg('alert-triangle')}</div><h3>${esc(t('tr_rej_t'))}</h3><p>${esc(t('tr_rej_p'))}</p>${o.reason ? `<p class="small">${esc(t('tr_reason'))}: ${esc(o.reason)}</p>` : ''}${idRow}
        <div><a class="btn wa lg" target="_blank" rel="noopener" href="${esc(waLink(''))}">${svg('message-circle')}<span>${esc(t('tr_contact'))}</span></a></div><button class="mini" id="newOrder" type="button" style="margin-top:14px">${esc(t('tr_new'))}</button></div>`;
    } else {
      el.innerHTML = `<div class="tr"><div class="tr-ico wait">${svg('clock')}</div><h3>${esc(t('tr_pending_t'))}</h3><p>${esc(t('tr_pending_p'))}</p>${idRow}
        <div><a class="btn wa lg" target="_blank" rel="noopener" href="${esc(receiptLink(o))}">${svg('send')}<span>${esc(t('tr_send'))}</span></a></div><p class="small">${esc(t('tr_send_hint'))}</p><span class="live">${esc(t('tr_checking'))}</span></div>`;
    }
    $$('#tracker [data-copy]', document).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b)));
    const nb = $('#newOrder'); if (nb) nb.addEventListener('click', reset);
  }
  async function fetchOrder(id, quiet) {
    try {
      const r = await fetch('/api/orders?id=' + encodeURIComponent(id), { cache: 'no-store' });
      if (r.status === 404) { if (!quiet) toast(t('tr_notfound')); return null; }
      if (!r.ok) throw new Error('status');
      return await r.json();
    } catch (e) { if (!quiet) toast(t('tr_err')); return undefined; }
  }
  function startPolling() {
    clearInterval(st.poll);
    const tick = async () => {
      if (!st.order || st.order.status !== 'pending' || document.hidden) return;
      const o = await fetchOrder(st.order.id, true);
      if (o && o.status !== 'pending') { st.order = o; clearInterval(st.poll); render(); }
    };
    st.poll = setInterval(tick, 8000);
  }
  async function open(id) {
    id = String(id || '').toUpperCase().trim();
    if (!ID_RE.test(id)) { toast(t('tr_notfound')); return; }
    const o = await fetchOrder(id); if (!o) return;
    st.order = o; st.type = o.type; $$('#wzTabs button').forEach((b) => b.classList.toggle('on', b.dataset.type === o.type));
    LS.set('kh_order', JSON.stringify({ id: o.id, type: o.type })); go(3); render(); $('#resume').hidden = true;
    if (o.status === 'pending') startPolling(); $('#pay').scrollIntoView({ behavior: 'smooth' });
  }
  function reset() { clearInterval(st.poll); st.order = null; LS.set('kh_order', null); $('#oCode').value = ''; $('#paidChk').checked = false; $('#createBtn').disabled = true; setType('new'); }

  // ------------------------------------------------------------------ wiring
  $$('#wzTabs button').forEach((b) => b.addEventListener('click', () => { if (st.step === 3 && st.order) { st.order = null; } setType(b.dataset.type); }));
  $('#oCode').addEventListener('input', (e) => { e.target.value = fmtDev(e.target.value); validate(); });
  $('#oLic').addEventListener('input', (e) => { e.target.value = fmtLic(e.target.value); validate(); });
  $('#pasteBtn').addEventListener('click', async () => { try { $('#oCode').value = fmtDev(await navigator.clipboard.readText()); validate(); } catch (e) { $('#oCode').focus(); } });
  $('#toStep2').addEventListener('click', () => { renderPm(); go(2); });
  $('#back1').addEventListener('click', () => go(1));
  $('#paidChk').addEventListener('change', (e) => { $('#createBtn').disabled = !e.target.checked; });
  $('#createBtn').addEventListener('click', createOrder);
  $('#fBtn').addEventListener('click', () => open($('#fId').value));
  $('#fId').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open($('#fId').value); } });
  $('#resumeBtn').addEventListener('click', () => open($('#resumeId').textContent));
  document.addEventListener('visibilitychange', async () => { if (!document.hidden && st.order && st.order.status === 'pending' && st.order.id) { const o = await fetchOrder(st.order.id, true); if (o && o.status !== 'pending') { st.order = o; render(); } } });

  // resume a previous order (saved on this device) or open one from ?order=KH-XXXXXXXX
  const qid = new URLSearchParams(location.search).get('order');
  let saved = null; try { saved = JSON.parse(LS.get('kh_order') || 'null'); } catch (e) { /* ignore */ }
  if (qid) setTimeout(() => open(qid), 300);
  else if (saved && ID_RE.test(saved.id)) { $('#resumeId').textContent = saved.id; $('#resume').hidden = false; }

  setType('new', false);
  return { refresh() { $('#wzHint').textContent = t('wz_hint_' + st.type); validate(); if (st.step === 2) renderPm(); if (st.step === 3) render(); } };
}
