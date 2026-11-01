import * as C from '../assets/js/license-core.js';
const TEST_PUB = '3059301306072a8648ce3d020106082a8648ce3d030107034200042019127a6498498f2a425db3232096da27ba005b2a8ab95fc49036e15ce00b14522a8f29db45f1a04f19b638881d9a9f0caa6c08268cb5aad5dc9b2015ad9291';           // the throw-away TEST key (public half) - shows the yellow warning badge
const core = { priv: null, pub: null, pubHex: '', reg: new C.Registry(), name: 'licenses.json', handle: null, dirty: false, lastBackup: '' };
const hasFS = typeof window.showOpenFilePicker === 'function';

const view = (id) => C.Issuer.view(id, core.reg.licenses[id], C.todayIso());
const issuer = () => { if (!core.priv) throw new Error('الكونسول مقفول'); return new C.Issuer(core.priv, core.reg, { today: C.todayIso() }); };
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function paintSave() {
  const el = document.getElementById('bSave'); if (!el) return;
  el.classList.toggle('primary', core.dirty && !core.handle);
  const f = document.getElementById('foot'); if (f) f.innerHTML = '';
  if (f) { f.append(document.createTextNode('قاعدة العملاء: ' + core.name + '  ·  ')); const s = document.createElement('span'); s.className = core.dirty ? 'dirty' : 'saved'; s.textContent = core.dirty ? '● فيه تغييرات لسه ماتحفظتش — اضغط «حفظ القاعدة»' : '✓ محفوظة'; f.append(s); }
}
async function writeHandle() { const w = await core.handle.createWritable(); await w.write(core.reg.toJSON()); await w.close(); core.dirty = false; }
async function persist() {
  core.dirty = true;
  if (core.handle) { try { await writeHandle(); } catch (e) { toast('تعذّر الحفظ التلقائي — اضغط «حفظ القاعدة»', true); } }
  paintSave();
}
async function saveNow() {
  try {
    if (!core.handle && typeof window.showSaveFilePicker === 'function') core.handle = await showSaveFilePicker({ suggestedName: core.name, types: [{ accept: { 'application/json': ['.json'] } }] });
    if (core.handle) { core.name = core.handle.name; await writeHandle(); toast('تم الحفظ ✓'); }
    else { download(core.name, core.reg.toJSON()); core.dirty = false; toast('تم تنزيل الملف — استبدل بيه القديم'); }
    paintSave();
  } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); }
}
window.addEventListener('beforeunload', (e) => { if (core.dirty) { e.preventDefault(); e.returnValue = ''; } });

/** Same API surface as the local Python page, but computed right here in the browser. */
async function api(path, b = {}) {
  const name = path.replace('/api/', '').replace(/-/g, '_');
  if (!core.priv) throw new Error('الكونسول مقفول');
  const out = (id, extra = {}) => ({ id, license: view(id), ...extra });
  switch (name) {
    case 'state': return { mode: core.pubHex === TEST_PUB ? 'test' : 'production', keys_dir: 'المفتاح محمّل في المتصفح فقط (لا يُرسل لأي مكان)', registry_path: core.name,
      today: C.todayIso(), pub_hex: core.pubHex, licenses: Object.entries(core.reg.licenses).map(([k, l]) => C.Issuer.view(k, l, C.todayIso())), last_backup: core.lastBackup, backup_dir: '' };
    case 'issue': { const [id, code] = await issuer().issue({ name: (b.name || '').trim() || '-', contact: (b.contact || '').trim(), payment_ref: (b.payment_ref || '').trim(),
        request: (b.request || '').trim() || null, unbound: !!b.unbound, days: b.days ? Number(b.days) : undefined, start: b.start || undefined, transfer_limit: b.transfer_limit, notes: (b.notes || '').trim() });
      await persist(); return out(id, { code }); }
    case 'renew': { const [id, code] = await issuer().renew(b.id, b.days ? Number(b.days) : undefined); await persist(); return out(id, { code }); }
    case 'replace': { const [id, code, rev] = await issuer().replace(b.id, (b.request || '').trim(), !!b.reset_clock, !!b.force); await persist(); return out(id, { code, revocation_code: rev }); }
    case 'reissue': { const [id, code] = await issuer().reissue(b.id); await persist(); return out(id, { code }); }
    case 'reset_clock': { const [id, code] = await issuer().resetClock(b.id); await persist(); return out(id, { code }); }
    case 'reinstate': { const [id, code] = await issuer().reinstate(b.id); await persist(); return out(id, { code }); }
    case 'revoke': { const [id, code] = await issuer().revoke(b.id, b.reason || ''); await persist(); return out(id, { revocation_code: code }); }
    case 'edit': { const [id] = issuer().edit(b.id, b); await persist(); return out(id); }
    case 'inspect': { const r = await C.verifyCode(core.pub, b.code || ''); return { ...r, kind: String(r.kind), unbound: r.unbound ? 'True' : 'False' }; }
    case 'request_info': { const h = await C.parseRequestCode(b.code || ''); return { valid: true, hash: C.toHex(h) }; }
    case 'backup': { const n = 'licenses-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.json'; download(n, core.reg.toJSON()); core.lastBackup = n; return { path: n }; }
    default: throw new Error('not found');
  }
}


let S={licenses:[]}, filter="all";

// ---------- tiny helpers
const h=(t,a={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a||{})){if(k==="class")e.className=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v===true?"":v)}
  for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c.nodeType?c:document.createTextNode(c))}return e};
const $=s=>document.querySelector(s);
function toast(msg,err){const t=h("div",{class:"toast"+(err?" err":"")},msg);document.body.append(t);setTimeout(()=>t.remove(),err?5000:2200)}
async function copy(text,msg){try{await navigator.clipboard.writeText(text)}catch(e){const ta=h("textarea",{});ta.value=text;document.body.append(ta);ta.select();document.execCommand("copy");ta.remove()}toast(msg||"تم النسخ ✓")}
function closeModal(){$("#layer").replaceChildren()}
function modal(title,...content){const m=h("div",{class:"modal"},h("h2",{},title),...content);const o=h("div",{class:"overlay",onmousedown:e=>{if(e.target===o)closeModal()}},m);$("#layer").replaceChildren(o);return m}
const ARDATE=d=>new Date(d+"T12:00:00").toLocaleDateString("ar-EG",{day:"numeric",month:"long",year:"numeric"});
const STATE={active:["نشط","s-active"],expiring:["ينتهي قريباً","s-expiring"],expired:["منتهي","s-expired"],revoked:["ملغي","s-revoked"]};
const find=id=>S.licenses.find(l=>l.id===id);

async function load(){S=await api("/api/state");
  const m=$("#mode");m.textContent=S.mode==="test"?"⚠ مفتاح تجريبي — لا تبِع به لعملاء حقيقيين":"✓ مفتاح حقيقي";m.className="badge "+(S.mode==="test"?"b-test":"b-prod");
  $("#count").textContent=S.licenses.length+" عميل"; render()}

// ---------- list
function render(){
  const q=$("#q").value.trim().toLowerCase();
  const cnt={all:S.licenses.length};for(const k of["active","expiring","expired","revoked"])cnt[k]=S.licenses.filter(l=>l.state===k).length;
  $("#chips").replaceChildren(...[["all","الكل"],["active","نشط"],["expiring","ينتهي قريباً"],["expired","منتهي"],["revoked","ملغي"]].map(([k,t])=>
    h("button",{class:"chip"+(filter===k?" on":""),onclick:()=>{filter=k;render()}},`${t} (${cnt[k]})`)));
  const rows=S.licenses.filter(l=>(filter==="all"||l.state===filter)&&(!q||(l.name+" "+l.contact+" "+l.id+" "+l.payment_ref).toLowerCase().includes(q)))
    .sort((a,b)=>a.last_day.localeCompare(b.last_day));
  if(!rows.length){$("#tableWrap").replaceChildren(h("div",{class:"empty"},S.licenses.length?"مفيش نتائج.":"لسه مفيش عملاء. اضغط «عميل جديد» لإصدار أول كود."));}
  else $("#tableWrap").replaceChildren(h("table",{},
    h("thead",{},h("tr",{},...["العميل","رقم الترخيص","الحالة","ينتهي في","الجهاز","إجراءات"].map(t=>h("th",{},t)))),
    h("tbody",{},...rows.map(l=>{const[st,cls]=STATE[l.state];
      return h("tr",{},
        h("td",{},h("div",{style:"font-weight:700"},l.name||"—"),h("div",{class:"sub",dir:"ltr",style:"text-align:right"},l.contact||"")),
        h("td",{},h("span",{class:"mono"},l.id)),
        h("td",{},h("span",{class:"st "+cls},st)),
        h("td",{},h("div",{class:"mono"},l.last_day),h("div",{class:"sub"},l.state==="revoked"?"":(l.days_left>0?`متبقي ${l.days_left} يوم`:`انتهى من ${-l.days_left+1} يوم`))),
        h("td",{},h("div",{},"جهاز #"+l.device_gen+(l.unbound?" (مفتوح)":"")),h("div",{class:"sub"},`نقل ${l.transfers_used}/${l.transfer_limit}`)),
        h("td",{},h("div",{class:"acts"},
          l.state!=="revoked"&&h("button",{class:"sm primary",onclick:()=>openRenew(l.id)},"تجديد"),
          l.state!=="revoked"&&h("button",{class:"sm",onclick:()=>openReplace(l.id)},"جهاز جديد"),
          h("button",{class:"sm",onclick:()=>openMore(l.id)},"المزيد ⋯"))))}))));
  paintSave();
}

// ---------- shared pieces
function reqField(onValid){
  const inp=h("input",{placeholder:"XXXX-XXXX-XXXX-XXXX",dir:"ltr",autocomplete:"off",style:"font-family:Consolas,monospace;text-transform:uppercase"});
  const note=h("div",{});let t;
  inp.addEventListener("input",()=>{clearTimeout(t);note.replaceChildren();onValid(false);if(!inp.value.trim())return;
    t=setTimeout(async()=>{try{await api("/api/request_info",{code:inp.value});note.replaceChildren(h("div",{class:"note n-ok"},"✓ كود الجهاز سليم"));onValid(true)}
      catch(e){note.replaceChildren(h("div",{class:"note n-bad"},"✗ "+e.message))}},300)});
  return[inp,note]}
const phoneFor=c=>{let d=(c||"").replace(/\D/g,"");if(d.startsWith("00"))d=d.slice(2);else if(d.startsWith("0"))d="20"+d.slice(1);return d.length>=10?d:""};
function whatsapp(kind,l,code){
  const first=l.name&&l.name!=="-"?`أهلاً ${l.name} 👋\n`:"أهلاً 👋\n";
  const idLine=`رقم الترخيص: ${l.id}  (احتفظ به — هتحتاجه لو غيّرت الموبايل)\nصالح حتى: ${ARDATE(l.last_day)}\n`;
  if(kind==="renew")return`${first}تم تجديد اشتراكك في تطبيق خطوتي ✅\n${idLine}\nكود التجديد:\n${code}\n\nالخطوات: افتح التطبيق ← الإعدادات ← الترخيص ← «تجديد الاشتراك» ← الصق الكود ← تجديد.`;
  if(kind==="replace")return`${first}تم تجهيز ترخيصك للجهاز الجديد ✅ (مدة اشتراكك المتبقية زي ما هي)\n${idLine}\nكود التفعيل:\n${code}\n\nالخطوات: افتح التطبيق ← الصق الكود في خانة «كود التفعيل» ← تفعيل.`;
  return`${first}تم تفعيل اشتراكك في تطبيق خطوتي ✅\n${idLine}\nكود التفعيل:\n${code}\n\nالخطوات: افتح التطبيق ← الصق الكود في خانة «كود التفعيل» ← تفعيل.`}
function result(title,kind,r,extra){
  const l=r.license,msg=whatsapp(kind,l,r.code),ta=h("textarea",{rows:11,style:"direction:rtl;font-size:13.5px"});ta.value=msg;
  const ph=phoneFor(l.contact);
  const m=modal(title,
    h("dl",{class:"kv"},h("dt",{},"العميل"),h("dd",{},l.name),h("dt",{},"رقم الترخيص"),h("dd",{},h("span",{class:"mono"},l.id)),h("dt",{},"صالح حتى"),h("dd",{},`${l.last_day}  (${l.days_left} يوم)`)),
    h("label",{},"الكود (انسخه كله)"),h("div",{class:"code"},r.code),
    h("label",{},"رسالة جاهزة للإرسال (تقدر تعدّلها)"),ta,
    h("div",{class:"foot"},
      h("button",{class:"primary",onclick:()=>copy(ta.value,"تم نسخ الرسالة كاملة ✓")},"📋 نسخ الرسالة كاملة"),
      h("button",{onclick:()=>copy(r.code,"تم نسخ الكود ✓")},"نسخ الكود فقط"),
      ph&&h("button",{onclick:()=>window.open("https://wa.me/"+ph+"?text="+encodeURIComponent(ta.value),"_blank")},"واتساب"),
      h("button",{onclick:closeModal},"إغلاق")),
    extra||null)}

// ---------- actions
function openIssue(){
  let valid=false;const[req,note]=reqField(v=>{valid=v;btn.disabled=!(valid||unb.checked)});
  const f={name:h("input",{placeholder:"اسم العميل"}),contact:h("input",{placeholder:"01xxxxxxxxx",dir:"ltr"}),pay:h("input",{placeholder:"رقم عملية الدفع / المرجع"}),
    start:h("input",{type:"date"}),days:h("input",{type:"number",value:365,min:1}),lim:h("input",{type:"number",value:3,min:0}),notes:h("input",{placeholder:"ملاحظات (اختياري)"})};
  f.start.value=S.today;const unb=h("input",{type:"checkbox",style:"width:auto"});
  const btn=h("button",{class:"primary",disabled:true,onclick:go},"إصدار الكود");
  unb.addEventListener("change",()=>btn.disabled=!(valid||unb.checked));
  async function go(){btn.disabled=true;try{const r=await api("/api/issue",{name:f.name.value,contact:f.contact.value,payment_ref:f.pay.value,request:req.value,unbound:unb.checked,
      days:f.days.value,start:f.start.value,transfer_limit:f.lim.value,notes:f.notes.value});await load();result("✅ تم إصدار الترخيص","issue",r)}catch(e){toast(e.message,true);btn.disabled=false}}
  modal("عميل جديد",h("label",{},"كود الجهاز (اللي ظهر في تطبيق العميل)"),req,note,
    h("div",{class:"row"},h("div",{},h("label",{},"الاسم"),f.name),h("div",{},h("label",{},"التليفون"),f.contact)),
    h("label",{},"مرجع الدفع"),f.pay,
    h("div",{class:"row"},h("div",{},h("label",{},"يبدأ من"),f.start),h("div",{},h("label",{},"عدد الأيام"),f.days),h("div",{},h("label",{},"حد النقل"),f.lim)),
    h("label",{},"ملاحظات"),f.notes,
    h("details",{},h("summary",{},"خيارات متقدمة"),h("label",{style:"display:flex;gap:8px;align-items:center"},unb,"كود غير مربوط بجهاز (للتجربة فقط — ممكن يتشارك!)")),
    h("div",{class:"foot"},btn,h("button",{onclick:closeModal},"إلغاء")))}

function addDays(iso,n){const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function openRenew(id){const l=find(id),days=h("input",{type:"number",value:365,min:1}),prev=h("div",{class:"note n-info"});
  const upd=()=>{const n=parseInt(days.value)||365;const base=l.last_day>=S.today?l.last_day:addDays(S.today,-1);prev.textContent=`الانتهاء الحالي ${l.last_day}  ←  بعد التجديد ${addDays(base,n)}`+(l.last_day>=S.today?"  (تجديد مبكر: بيتضاف على تاريخ الانتهاء)":"  (انتهى: السنة الجديدة بتبدأ من النهارده)")};
  days.addEventListener("input",upd);upd();
  const btn=h("button",{class:"primary",onclick:async()=>{btn.disabled=true;try{const r=await api("/api/renew",{id,days:days.value});await load();result("✅ كود التجديد","renew",r)}catch(e){toast(e.message,true);btn.disabled=false}}},"إصدار كود التجديد");
  modal("تجديد — "+l.name,h("label",{},"عدد الأيام"),days,prev,h("div",{class:"foot"},btn,h("button",{onclick:closeModal},"إلغاء")))}

function openReplace(id){const l=find(id);let valid=false;const[req,note]=reqField(v=>{valid=v;btn.disabled=!v});
  const rc=h("input",{type:"checkbox",style:"width:auto"}),force=h("input",{type:"checkbox",style:"width:auto"});
  const over=l.transfers_used>=l.transfer_limit;
  const btn=h("button",{class:"primary",disabled:true,onclick:async()=>{btn.disabled=true;try{const r=await api("/api/replace",{id,request:req.value,reset_clock:rc.checked,force:force.checked});await load();
      result("✅ كود الجهاز الجديد","replace",r,h("details",{},h("summary",{},"كود إلغاء الجهاز القديم (اختياري)"),h("p",{class:"sub"},"لو الموبايل القديم لسه معاه، ابعت له الكود ده يلصقه فيتقفل. لو ضاع، تجاهله."),h("div",{class:"code"},r.revocation_code),h("div",{class:"foot"},h("button",{onclick:()=>copy(r.revocation_code)},"نسخ"))))}
    catch(e){toast(e.message,true);btn.disabled=false}}},"إصدار كود الجهاز الجديد");
  modal("نقل لجهاز جديد — "+l.name,h("div",{class:"note n-info"},`المدة المتبقية (${l.days_left} يوم) هتفضل زي ما هي — مفيش سنة جديدة. مرات النقل: ${l.transfers_used}/${l.transfer_limit}`),
    h("label",{},"كود الجهاز الجديد (من تطبيق العميل بعد التثبيت)"),req,note,
    h("details",{},h("summary",{},"خيارات"),h("label",{style:"display:flex;gap:8px;align-items:center"},rc,"تصفير ذاكرة الساعة (لو التاريخ على جهازه متلخبط)"),
      over&&h("label",{style:"display:flex;gap:8px;align-items:center;color:var(--bad)"},force,"تخطّي حد النقل (بعد ما تتأكد إنه صاحب الاشتراك)")),
    h("div",{class:"foot"},btn,h("button",{onclick:closeModal},"إلغاء")))}

function openMore(id){const l=find(id),close=closeModal;
  const row=(label,fn,cls)=>h("button",{class:cls||"",style:"display:block;width:100%;text-align:start;margin-top:8px",onclick:fn},label);
  modal(l.name+"  ·  "+l.id,
    h("dl",{class:"kv"},h("dt",{},"التليفون"),h("dd",{dir:"ltr",style:"text-align:right"},l.contact||"—"),h("dt",{},"مرجع الدفع"),h("dd",{},l.payment_ref||"—"),h("dt",{},"ملاحظات"),h("dd",{},l.notes||"—"),
      h("dt",{},"بدأ"),h("dd",{},l.start),h("dt",{},"ينتهي"),h("dd",{},l.last_day),h("dt",{},"الإصدار"),h("dd",{},"rev "+l.rev)),
    l.state!=="revoked"&&row("📨 إعادة إرسال الكود الحالي (نفس الشروط)",async()=>{try{const r=await api("/api/reissue",{id});await load();result("الكود الحالي","issue",r)}catch(e){toast(e.message,true)}}),
    row("✏️ تعديل بيانات العميل",()=>openEdit(id)),
    l.state!=="revoked"&&row("🕒 كود تصفير الساعة",async()=>{try{const r=await api("/api/reset_clock",{id});await load();result("كود تصفير الساعة","renew",r)}catch(e){toast(e.message,true)}}),
    l.state==="revoked"?row("↩️ إعادة تفعيل الترخيص",async()=>{try{const r=await api("/api/reinstate",{id});await load();result("تمت إعادة التفعيل","issue",r)}catch(e){toast(e.message,true)}}):
      row("⛔ إلغاء الترخيص",()=>openRevoke(id),"danger"),
    h("details",{open:true},h("summary",{},"السجل"),h("ul",{class:"hist"},...[...l.history].reverse().map(x=>h("li",{},`${x.at} — ${{issue:"إصدار",renew:"تجديد",replace_device:"نقل جهاز",edit:"تعديل بيانات",revoke:"إلغاء",reinstate:"إعادة تفعيل",reset_clock:"تصفير الساعة",reissue:"إعادة إرسال الكود",revocation_code:"كود إلغاء"}[x.action]||x.action}${x.last_day?" → "+x.last_day:""}`)))),
    h("div",{class:"foot"},h("button",{onclick:close},"إغلاق")))}

function openEdit(id){const l=find(id),f={name:h("input",{value:l.name}),contact:h("input",{value:l.contact,dir:"ltr"}),pay:h("input",{value:l.payment_ref}),notes:h("input",{value:l.notes})};
  const btn=h("button",{class:"primary",onclick:async()=>{try{await api("/api/edit",{id,name:f.name.value,contact:f.contact.value,payment_ref:f.pay.value,notes:f.notes.value});await load();closeModal();toast("تم الحفظ ✓")}catch(e){toast(e.message,true)}}},"حفظ");
  modal("تعديل بيانات العميل",h("label",{},"الاسم"),f.name,h("label",{},"التليفون"),f.contact,h("label",{},"مرجع الدفع"),f.pay,h("label",{},"ملاحظات"),f.notes,
    h("p",{class:"sub"},"التعديل بيغيّر السجل عندك بس — مش بيأثر على كود العميل."),h("div",{class:"foot"},btn,h("button",{onclick:closeModal},"إلغاء")))}

function openRevoke(id){const l=find(id),reason=h("input",{placeholder:"السبب (مثلاً: استرداد المبلغ)"});
  const btn=h("button",{class:"danger",onclick:async()=>{try{const r=await api("/api/revoke",{id,reason:reason.value});await load();
      modal("تم إلغاء الترخيص",h("p",{},"اتسجّل في السجل، ومش هتقدر تجدده أو تنقله إلا بعد إعادة التفعيل. الموبايل نفسه بيتأثر لما يستلم كود الإلغاء أو بعد انتهاء المدة."),
        h("label",{},"كود الإلغاء (للإرسال لو حبيت)"),h("div",{class:"code"},r.revocation_code),h("div",{class:"foot"},h("button",{onclick:()=>copy(r.revocation_code)},"نسخ"),h("button",{onclick:closeModal},"إغلاق")))}catch(e){toast(e.message,true)}}},"تأكيد الإلغاء");
  modal("إلغاء ترخيص — "+l.name,h("label",{},"السبب"),reason,h("div",{class:"foot"},btn,h("button",{onclick:closeModal},"تراجع")))}

function openInspect(){const ta=h("textarea",{rows:5,dir:"ltr",placeholder:"الصق أي كود هنا…",style:"font-family:Consolas,monospace;font-size:12px"}),out=h("div",{});
  const btn=h("button",{class:"primary",onclick:async()=>{try{const r=await api("/api/inspect",{code:ta.value});const kinds={"1":"ترخيص","2":"كود إلغاء"};
      out.replaceChildren(h("div",{class:"note n-ok"},"✓ توقيع سليم — صادر بمفتاحك"),h("dl",{class:"kv",style:"margin-top:10px"},
        h("dt",{},"النوع"),h("dd",{},kinds[r.kind]||r.kind),h("dt",{},"رقم الترخيص"),h("dd",{},h("span",{class:"mono"},r.license_id)),h("dt",{},"البداية"),h("dd",{},r.start),h("dt",{},"النهاية"),h("dd",{},r.last),
        h("dt",{},"تاريخ الإصدار"),h("dd",{},r.issued),h("dt",{},"الإصدار / الجهاز"),h("dd",{},`rev ${r.rev} / gen ${r.device_gen}`),h("dt",{},"مربوط بجهاز"),h("dd",{},r.unbound==="True"?"لا (مفتوح)":"نعم")))}
    catch(e){out.replaceChildren(h("div",{class:"note n-bad"},"✗ "+e.message))}}},"فحص");
  modal("فحص كود",ta,h("div",{class:"foot"},btn,h("button",{onclick:closeModal},"إغلاق")),out)}

function openKey(){modal("المفتاح العام (آمن للمشاركة)",h("p",{class:"sub"},"ده الجزء اللي بيتحط داخل التطبيق للتحقق من الأكواد. ابعته لمن يبني التطبيق. المفتاح الخاص ما بيطلعش من جهازك أبداً."),
  h("div",{class:"code"},S.pub_hex),h("p",{class:"sub"},"مجلد المفاتيح: "+S.keys_dir),h("div",{class:"foot"},h("button",{class:"primary",onclick:()=>copy(S.pub_hex,"تم نسخ المفتاح العام ✓")},"نسخ"),h("button",{onclick:closeModal},"إغلاق")))}

async function doBackup(){try{const r=await api("/api/backup",{});toast("تم تنزيل نسخة: "+r.path)}catch(e){toast(e.message,true)}}



// ---------------------------------------------------------------- unlock screen
const $u = (s) => document.querySelector(s);
function adoptDb(text, name, handle) {
  const data = JSON.parse(text);
  if (!data || typeof data.licenses !== 'object') throw new Error('ده مش ملف قاعدة عملاء سليم');
  core.reg = new C.Registry(data); core.name = name; core.handle = handle || null; core.dirty = false;
  $u('#dbStatus').textContent = `✓ ${name} (${Object.keys(core.reg.licenses).length} عميل)`;
}
$u('#openDb').addEventListener('click', async () => {
  try {
    if (hasFS) { const [h] = await showOpenFilePicker({ types: [{ accept: { 'application/json': ['.json'] } }] }); adoptDb(await (await h.getFile()).text(), h.name, h); }
    else $u('#dbFile').click();
  } catch (e) { if (e.name !== 'AbortError') $u('#unlockMsg').innerHTML = `<div class="note n-bad">✗ ${e.message}</div>`; }
});
$u('#dbFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { adoptDb(await f.text(), f.name, null); } catch (err) { $u('#unlockMsg').innerHTML = `<div class="note n-bad">✗ ${err.message}</div>`; } });
$u('#newDb').addEventListener('click', () => { core.reg = new C.Registry(); core.name = 'licenses.json'; core.handle = null; core.dirty = false; $u('#dbStatus').textContent = '✓ قاعدة جديدة فاضية'; });
$u('#unlockBtn').addEventListener('click', async () => {
  const msg = $u('#unlockMsg'); const file = $u('#keyFile').files[0];
  if (!file) { msg.innerHTML = '<div class="note n-bad">اختار ملف المفتاح الخاص الأول</div>'; return; }
  try {
    adminToken = $u('#ownerTok').value.trim();
    core.priv = await C.importPrivateKeyPem(await file.text(), $u('#pass').value);
    const p = await C.publicFromPrivate(core.priv); core.pub = p.key; core.pubHex = p.spkiHex;
    $u('#pass').value = ''; $u('#unlock').remove(); $u('#hdr').hidden = false; $u('#app').hidden = false;
    $('#q').addEventListener('input', render); $('#bInspect').addEventListener('click', openInspect); $('#bKey').addEventListener('click', openKey);
    $('#bBackup').addEventListener('click', doBackup); $('#bSave').addEventListener('click', saveNow); $('#bNew').addEventListener('click', openIssue);
    await load(); paintSave(); startOrders();
  } catch (e) { core.priv = null; msg.innerHTML = `<div class="note n-bad">✗ ${e.message === 'wrong passphrase' ? 'الباسوورد غلط' : e.message}</div>`; }
});

// ---------------------------------------------------------------- website orders (needs OWNER_TOKEN)
let adminToken = '', ordersTimer = null;
const ADMIN_ERR = { unauthorized: 'كلمة سر الطلبات غلط', admin_not_configured: 'OWNER_TOKEN مش متظبط في إعدادات فيرسيل', not_configured: 'قاعدة الطلبات (Upstash) مش متوصلة بفيرسيل',
  too_many_attempts: 'محاولات غلط كتير — استنى 15 دقيقة', not_found: 'الطلب مش موجود', not_pending: 'الطلب ده اتعالج قبل كده', bad_code: 'الكود مش سليم',
  code_for_another_device: 'الكود ده لجهاز تاني مش جهاز الطلب', code_for_another_license: 'الكود ده لترخيص تاني', bad_signature: 'التوقيع مش مطابق للمفتاح العام اللي في فيرسيل (LICENSE_PUBLIC_KEY_HEX)' };
async function adminApi(path, body) {
  const r = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + adminToken, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(ADMIN_ERR[j.error] || j.error || 'HTTP ' + r.status);
  return j;
}
const KINDS = { new: 'اشتراك جديد', renew: 'تجديد', transfer: 'نقل جهاز' }, PAYN = { instapay: 'إنستا باي', vodafone: 'فودافون كاش', orange: 'أورنج كاش' };
const ago = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'دلوقتي' : m < 60 ? `من ${m} دقيقة` : m < 1440 ? `من ${Math.round(m / 60)} ساعة` : `من ${Math.round(m / 1440)} يوم`; };

function startOrders() {
  if (!adminToken) return;
  $('#ordersPanel').hidden = false; $('#ordersRefresh').addEventListener('click', refreshOrders);
  refreshOrders(); ordersTimer = setInterval(refreshOrders, 20000);
}
async function refreshOrders() {
  try { const j = await adminApi('list'); renderOrders(j.orders); }
  catch (e) { $('#orders').replaceChildren(h('div', { class: 'note n-bad' }, '⚠ ' + e.message)); }
}
function renderOrders(list) {
  $('#ordersCount').textContent = list.length; document.title = (list.length ? `(${list.length}) ` : '') + 'خطوتي — كونسول المالك';
  if (!list.length) { $('#orders').replaceChildren(h('div', { class: 'sub', style: 'padding:10px' }, 'مفيش طلبات في الانتظار ✓')); return; }
  $('#orders').replaceChildren(...list.map((o) => h('div', { class: 'ord' },
    h('div', {}, h('b', {}, o.name || '—'), h('span', { class: 'sub', dir: 'ltr' }, '  ' + (o.contact || '')),
      h('div', { class: 'meta' }, h('span', { class: 'tag' }, KINDS[o.type] || o.type), h('span', { class: 'tag' }, PAYN[o.method] || o.method), o.amount && h('span', {}, o.amount),
        h('span', {}, ago(o.createdAt)), h('span', { class: 'dev' }, o.id), o.device && h('span', { class: 'dev' }, o.device), o.licenseId && h('span', { class: 'dev' }, o.licenseId))),
    h('div', { class: 'acts' }, h('button', { class: 'primary sm', onclick: () => approveOrder(o) }, '✅ تأكيد الدفع وإصدار الكود'), h('button', { class: 'danger sm', onclick: () => rejectDialog(o) }, '❌ رفض')))));
}
async function approveOrder(o) {
  try {
    const iss = issuer(); let id, code;
    if (o.type === 'new') {
      const hash = C.toHex(await C.parseRequestCode(o.device));
      const dup = Object.entries(core.reg.licenses).find(([, l]) => l.status === 'active' && l.devices[l.devices.length - 1].hash === hash);
      if (dup && !confirm(`⚠ الجهاز ده عنده ترخيص نشط بالفعل (${dup[0]} — ${dup[1].name}).\nتكمل وتصدر ترخيص جديد؟`)) return;
      [id, code] = await iss.issue({ name: o.name || '-', contact: o.contact || '', payment_ref: o.id, request: o.device, notes: `${PAYN[o.method] || o.method} ${o.amount || ''}`.trim() });
    } else if (o.type === 'renew') {
      [id, code] = await iss.renew(o.licenseId);
    } else {
      try { [id, code] = await iss.replace(o.licenseId, o.device, false, false); }
      catch (e) { if (/transfer limit/.test(e.message) && confirm(e.message + '\n\nتتخطى الحد؟')) [id, code] = await iss.replace(o.licenseId, o.device, false, true); else throw e; }
    }
    await persist();                                           // your local record first - never lose a license you issued
    try { await adminApi('approve', { id: o.id, code }); toast('تم — الكود ظهر عند العميل ✓'); }
    catch (e) { toast('الكود اتحفظ عندك بس مارفعش للموقع: ' + e.message, true); }
    await load(); refreshOrders();
    const l = core.reg.licenses[id]; if (l) { const m = h('div', {}, h('p', { class: 'sub' }, `${o.name || ''} · ${id}`), h('div', { class: 'code' }, code), h('div', { class: 'foot' }, h('button', { class: 'primary', onclick: () => copy(code) }, 'نسخ الكود'), h('button', { onclick: closeModal }, 'إغلاق'))); modal('نسخة من الكود (احتياطي)', m); }
  } catch (e) { toast(e.message, true); }
}
function rejectDialog(o) {
  const reason = h('input', { placeholder: 'السبب اللي هيظهر للعميل (مثلاً: التحويل لم يصل)' });
  modal('رفض الطلب ' + o.id, h('label', {}, 'السبب'), reason, h('div', { class: 'foot' },
    h('button', { class: 'danger', onclick: async () => { try { await adminApi('reject', { id: o.id, reason: reason.value }); closeModal(); toast('تم الرفض'); refreshOrders(); } catch (e) { toast(e.message, true); } } }, 'تأكيد الرفض'), h('button', { onclick: closeModal }, 'تراجع')));
}
