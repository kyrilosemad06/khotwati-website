import { DICT } from './i18n.js?v=20261105-3';
import { hydrateIcons, svg } from './icons.js?v=20261105-3';
import { initWizard } from './wizard.js?v=20261105-3';

const S = window.SITE || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let lang = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ar' || q === 'en') return q;
  return store.get('kh_lang') || ((navigator.language || 'ar').toLowerCase().startsWith('ar') ? 'ar' : 'en');
})();
const t = (k) => DICT[lang][k] ?? k;
const isPlaceholder = (v) => !v || /X/i.test(v) || /\.\.\./.test(v);
const waLink = (text) => `https://wa.me/${S.whatsapp}` + (text ? `?text=${encodeURIComponent(text)}` : '');

let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const ta = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch (_) { /* ignore */ } ta.remove();
  }
  toast(t('copied'));
  if (btn) { const old = btn.innerHTML; btn.innerHTML = svg('check') + (btn.querySelector('span') ? `<span>${t('copied')}</span>` : ''); setTimeout(() => (btn.innerHTML = old), 1600); }
}

// ---------------------------------------------------------------- theme / screenshots
const SHOT = { home: 'light_home', habits: 'light_habits', focus: 'light_focus', stats: 'light_stats', dark_home: 'dark_home', activate: 'light_activate' };
let showKey = 'home';
const shotSrc = (k) => `assets/img/screens/${lang}_${SHOT[k] || k}.webp`;
function renderShots() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $$('#heroPhone img').forEach((img) => { let k = img.dataset.shot; if (dark && k === 'home') k = 'dark_home'; img.src = shotSrc(k); });
  $('#showImg').src = shotSrc(showKey);
}
function applyTheme(th) { document.documentElement.dataset.theme = th; store.set('kh_theme', th); $('meta[name=theme-color]').content = th === 'dark' ? '#0A1020' : '#1B63F6'; renderShots(); }
function initTheme() {
  document.documentElement.dataset.theme = store.get('kh_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
}
function initHero() {
  const imgs = $$('#heroPhone img'); let i = 0; imgs[0].classList.add('on');
  if (!reduceMotion) setInterval(() => { imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); }, 3400);
  const art = $('#heroArt'), ph = $('#heroPhone');
  if (!reduceMotion && matchMedia('(hover: hover)').matches) {
    art.addEventListener('pointermove', (e) => { const r = art.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; ph.style.setProperty('--ry', `${x * 14}deg`); ph.style.setProperty('--rx', `${-y * 10}deg`); });
    art.addEventListener('pointerleave', () => { ph.style.setProperty('--ry', '0deg'); ph.style.setProperty('--rx', '0deg'); });
  }
}
function initTour() {
  let auto = !reduceMotion, timer;
  const pick = (k) => {
    showKey = k; $$('#showTabs button').forEach((b) => b.classList.toggle('on', b.dataset.shot === k));
    const img = $('#showImg'); img.classList.add('swap'); setTimeout(() => { img.src = shotSrc(k); img.classList.remove('swap'); }, 180);
  };
  $$('#showTabs button').forEach((b) => b.addEventListener('click', () => { auto = false; clearInterval(timer); pick(b.dataset.shot); }));
  const keys = $$('#showTabs button').map((b) => b.dataset.shot);
  const io = new IntersectionObserver((es) => { clearInterval(timer); if (auto && es[0].isIntersecting) timer = setInterval(() => pick(keys[(keys.indexOf(showKey) + 1) % keys.length]), 4200); }, { threshold: 0.35 });
  io.observe($('.show'));
}
function initDecor() {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  $('#heat').innerHTML = Array.from({ length: 70 }, (_, i) => { const trend = i / 70; const r = rnd() * 0.75 + trend * 0.55; return `<i data-l="${r < .25 ? 0 : r < .5 ? 1 : r < .8 ? 2 : r < 1.05 ? 3 : 4}"></i>`; }).join('');
}

// ---------------------------------------------------------------- language
let wizard;
function applyLang() {
  const d = document.documentElement; d.lang = lang; d.dir = lang === 'ar' ? 'rtl' : 'ltr'; store.set('kh_lang', lang);
  document.title = t('title'); $('meta[name=description]').content = t('desc');
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });      // our own static strings only
  $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  $$('[data-i18n-ph]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPh)));
  $('#heroMeta').textContent = t('hero_meta').replace('%SIZE%', '\u2066' + (S.apk?.size || '') + '\u2069').replace('%VER%', '\u2066' + (S.apk?.version || '') + '\u2069');
  $('#priceAmt').textContent = S.price?.amount ?? ''; $('#priceCur').textContent = S.price?.currency?.[lang] || '';
  renderShots(); wizard?.refresh();
}

// ---------------------------------------------------------------- page chrome
function initChrome() {
  const nav = $('#nav'), bar = $('#progress'), mbar = $('#mbar');
  const onScroll = () => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    nav.classList.toggle('scrolled', y > 8); bar.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`; mbar.classList.toggle('show', y > 520);
  };
  onScroll(); addEventListener('scroll', onScroll, { passive: true });
  $('#menuBtn').addEventListener('click', () => $('#links').classList.toggle('open'));
  $$('#links a').forEach((a) => a.addEventListener('click', () => $('#links').classList.remove('open')));
  $('#langBtn').addEventListener('click', () => { lang = lang === 'ar' ? 'en' : 'ar'; applyLang(); });
  $('#year').textContent = new Date().getFullYear();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.1 }) : null;
  $$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
}
function initConfig() {
  [$('#apkBtn'), $('#apkBtn2'), $('#mbDl')].forEach((a) => a.setAttribute('href', S.apk?.file || '#'));
  for (const [id, url] of [['storePlay', S.stores?.play], ['storeApple', S.stores?.appstore]]) {
    const a = $('#' + id); if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.removeAttribute('aria-disabled'); }
  }
  for (const [id, url] of [['socialFacebook', S.social?.facebook], ['socialInstagram', S.social?.instagram], ['socialTiktok', S.social?.tiktok], ['socialEmail', S.email ? 'mailto:' + S.email : '']]) {
    const a = $('#' + id); if (a && url) a.href = url;
  }
  const warn = (e) => { if (isPlaceholder(S.whatsapp)) { e.preventDefault(); toast('WhatsApp number is not set in site.config.js'); } };
  for (const id of ['waBtn', 'fab', 'mbWa']) { const a = $('#' + id); a.href = isPlaceholder(S.whatsapp) ? '#' : waLink(''); a.addEventListener('click', warn); }
}
function initSplash() {
  const sp = $('#splash');
  if (sessionStorage.getItem('kh_splash') || reduceMotion) { sp.remove(); return; }
  try { sessionStorage.setItem('kh_splash', '1'); } catch (e) { /* ignore */ }
  setTimeout(() => sp.classList.add('done'), 1250); setTimeout(() => sp.remove(), 1900);
}

hydrateIcons();
initTheme(); initConfig(); initChrome(); initDecor();
wizard = initWizard({ S, t, lang: () => lang, toast, copyText, svg, waLink, isPlaceholder });
applyLang(); initHero(); initTour(); initSplash();
