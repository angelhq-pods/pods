/* Little Steps — Log tab. Shared between two parents via Supabase (RLS-protected). */
(()=>{
const $=s=>document.querySelector(s),root=$('#log'),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OZ=29.5735,LSK='ls-log-v1',MIN=6e4,H=36e5,DAY=864e5;
const cfg=window.LS_LOG||{},local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const uid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));

/* ---------- backends ---------- */
function supa(){const sb=supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'implicit',storageKey:'ls-auth'}});
 const T=()=>sb.from('events');const chk=r=>{if(r.error)throw r.error;return r.data};
 return{name:'supabase',
  async fromLink(){const h=sessionStorage['ls-auth-hash'];if(!h)return;delete sessionStorage['ls-auth-hash'];const q=new URLSearchParams(h);
   if(q.get('error_description'))throw Error(q.get('error_description'));if(q.get('access_token'))chk(await sb.auth.setSession({access_token:q.get('access_token'),refresh_token:q.get('refresh_token')}))},
  key:async()=>(await sb.auth.getSession()).data.session?.refresh_token||'',
  useKey:async k=>chk(await sb.auth.refreshSession({refresh_token:k})),
  localOut:()=>sb.auth.signOut({scope:'local'}),
  user:async()=>(await sb.auth.getSession()).data.session?.user||null,
  sendCode:async e=>chk(await sb.auth.signInWithOtp({email:e,options:{shouldCreateUser:false,emailRedirectTo:cfg.redirect||location.origin+location.pathname}})),
  verify:async(e,c)=>chk(await sb.auth.verifyOtp({email:e,token:c,type:'email'})),
  signOut:()=>sb.auth.signOut(),
  household:async()=>chk(await sb.from('households').select('id,birth_date').maybeSingle()),
  list:async from=>chk(await T().select('*').gte('started_at',from).order('started_at')),
  running:async()=>chk(await T().select('*').is('ended_at',null).in('kind',['sleep','breast'])),
  upsert:async ev=>chk(await T().upsert(ev)),
  del:async id=>chk(await T().delete().eq('id',id)),
  subscribe(cb){this.ch&&sb.removeChannel(this.ch);this.ch=sb.channel('ev').on('postgres_changes',{event:'*',schema:'public',table:'events'},p=>cb(p.eventType,p.eventType=='DELETE'?p.old:p.new)).subscribe()}}}
function mock(){ // localhost-only test double: localStorage "server" + BroadcastChannel as realtime
 const K='ls-mock-db',db=()=>JSON.parse(localStorage[K]||'[]'),save=d=>localStorage[K]=JSON.stringify(d),bc=new BroadcastChannel('ls-mock');let me=sessionStorage['ls-mock-user']||null;
 return{name:'mock',fromLink:async()=>{},key:async()=>'mock-key',useKey:async k=>{if(k!='mock-key')throw Error('bad');me='paste@test';sessionStorage['ls-mock-user']=me},localOut:async()=>{me=null;delete sessionStorage['ls-mock-user']},user:async()=>me&&{email:me},sendCode:async()=>{},verify:async(e,c)=>{if(c!='123456')throw Error('Invalid code');me=e;sessionStorage['ls-mock-user']=e},
  signOut:async()=>{me=null;delete sessionStorage['ls-mock-user']},household:async()=>({id:'h1',birth_date:localStorage['ls-mock-bd']||null}),
  list:async f=>db().filter(e=>e.started_at>=f),running:async()=>db().filter(e=>!e.ended_at&&e.kind!='diaper'&&e.kind!='bottle'),
  upsert:async ev=>{const d=db().filter(e=>e.id!=ev.id);d.push(ev);save(d);bc.postMessage(['UPDATE',ev])},
  del:async id=>{save(db().filter(e=>e.id!=id));bc.postMessage(['DELETE',{id}])},subscribe(cb){bc.onmessage=m=>cb(...m.data)}}}
const B=cfg.url&&cfg.anonKey&&window.supabase?supa():local?mock():null;

/* ---------- local state (survives app close) ---------- */
const SK=LSK+(B?.name=='mock'?(sessionStorage['ls-mock-dev']||=Math.random().toString(36).slice(2)):'');
let S=JSON.parse(localStorage[SK]||'{}');S.ev||={};S.q||=[];S.unit||='oz';
const persist=()=>localStorage[SK]=JSON.stringify(S);
let follow=true,hh=null,day=startOfDay(Date.now()),typ=null,sheet=null,syncErr='';
function startOfDay(t){const d=new Date(t);d.setHours(0,0,0,0);return+d}
const evs=()=>Object.values(S.ev).sort((a,b)=>a.started_at<b.started_at?1:-1);
const running=k=>evs().find(e=>e.kind==k&&!e.ended_at);
async function flush(){if(!B)return;while(S.q.length){const[op,v]=S.q[0];try{op=='del'?await B.del(v):await B.upsert(v);S.q.shift();persist();syncErr=''}catch(e){syncErr=navigator.onLine?(e.message||'Sync error'):'Offline — will sync';break}}render()}
function put(ev){ev.updated_at=new Date().toISOString();if(hh)ev.household_id=hh.id;S.ev[ev.id]=ev;S.q.push(['up',{...ev}]);persist();render();flush()}
function del(id){delete S.ev[id];S.q.push(['del',id]);persist();render();flush()}
async function pull(){if(!B||!hh)return;try{const from=new Date(startOfDay(Date.now())-14*DAY).toISOString();const[rows,run]=await Promise.all([B.list(from),B.running()]);
 const pending=new Set(S.q.map(([o,v])=>o=='del'?v:v.id));const keep={};for(const e of Object.values(S.ev))if(pending.has(e.id))keep[e.id]=e;
 S.ev={};for(const e of[...rows,...run])S.ev[e.id]=e;Object.assign(S.ev,keep);for(const[o,v]of S.q)if(o=='del')delete S.ev[v];persist();render()}catch(e){syncErr=e.message||'Sync error';render()}}

/* ---------- helpers ---------- */
const now=()=>new Date().toISOString(),ms=e=>(e.ended_at?Date.parse(e.ended_at):Date.now())-Date.parse(e.started_at);
const dur=m=>{m=Math.max(0,Math.round(m/MIN));return m<60?m+'m':Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m'};
const clock=m=>{const s=Math.max(0,Math.floor(m/1e3));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const hm=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const oz=ml=>(ml/OZ).toFixed(1).replace(/\.0$/,''),mlFmt=ml=>Math.round(ml);
const amt=e=>e.unit=='ml'?`${mlFmt(e.amount_ml)} mL (${oz(e.amount_ml)} oz)`:`${oz(e.amount_ml)} oz (${mlFmt(e.amount_ml)} mL)`;
const toLocalInput=t=>{const d=new Date(t);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
const ageDays=()=>hh?.birth_date?Math.floor((startOfDay(day)-startOfDay(Date.parse(hh.birth_date+'T00:00')))/DAY):null;
const ICON={sleep:'🌙',breast:'🤱',bottle:'🍼',diaper:'🧷'};
function overlap(e,a,b){const s=Date.parse(e.started_at),f=e.ended_at?Date.parse(e.ended_at):Date.now();return Math.max(0,Math.min(f,b)-Math.max(s,a))}
function wakeWindows(){const sl=evs().filter(e=>e.kind=='sleep').reverse(),w=[];for(let i=1;i<sl.length;i++){const p=sl[i-1];if(!p.ended_at)continue;w.push({from:p.ended_at,to:sl[i].started_at})}return w}
function status(){const r=running('sleep');if(r)return{asleep:true,since:r.started_at};const last=evs().find(e=>e.kind=='sleep'&&e.ended_at);return{asleep:false,since:last?.ended_at}}

/* ---------- actions ---------- */
function toggleSleep(){const r=running('sleep');if(r)put({...r,ended_at:now()});else put({id:uid(),kind:'sleep',started_at:now(),ended_at:null})}
function tapSide(side){const r=running('breast');if(r){put({...r,ended_at:now()});if(r.side==side)return}put({id:uid(),kind:'breast',side,started_at:now(),ended_at:null})}
function diaper(t,when){put({id:uid(),kind:'diaper',diaper:t,started_at:when||now(),ended_at:null});closeSheet();toast(`${ICON.diaper} ${t=='both'?'Pee + poo':t[0].toUpperCase()+t.slice(1)} logged`)}
function bottle(v,unit,when){const ml=unit=='oz'?v*OZ:v;if(!(ml>0))return;S.unit=unit;put({id:uid(),kind:'bottle',amount_ml:Math.round(ml*10)/10,unit,started_at:when||now(),ended_at:null});closeSheet();toast(`${ICON.bottle} ${unit=='oz'?v+' oz':v+' mL'} logged`)}
function toast(t){const d=document.createElement('div');d.className='lg-toast';d.textContent=t;document.body.append(d);setTimeout(()=>d.remove(),1800)}

/* ---------- summary ---------- */
function summary(){const a=day,b=day+DAY,inDay=e=>{const t=Date.parse(e.started_at);return t>=a&&t<b},all=evs();
 const sleeps=all.filter(e=>e.kind=='sleep'&&overlap(e,a,b)>0),sleepMs=sleeps.reduce((s,e)=>s+overlap(e,a,b),0),longest=Math.max(0,...sleeps.map(ms));
 const br=all.filter(e=>e.kind=='breast'&&inDay(e)),bo=all.filter(e=>e.kind=='bottle'&&inDay(e)),di=all.filter(e=>e.kind=='diaper'&&inDay(e));
 // breast segments within 30 min of each other = one feed
 const brs=[...br].sort((x,y)=>x.started_at<y.started_at?-1:1);let feedsBr=0,lastEnd=0;for(const e of brs){const s=Date.parse(e.started_at);if(s-lastEnd>30*MIN)feedsBr++;lastEnd=Date.parse(e.ended_at||now())}
 const side=k=>br.filter(e=>e.side==k).reduce((s,e)=>s+ms(e),0),ml=bo.reduce((s,e)=>s+ +e.amount_ml,0);
 const wet=di.filter(e=>e.diaper!='poo').length,dirty=di.filter(e=>e.diaper!='pee').length;
 const ww=wakeWindows().filter(w=>{const t=Date.parse(w.to);return t>=a&&t<b}).map(w=>Date.parse(w.to)-Date.parse(w.from));
 return{sleepMs,naps:sleeps.length,longest,feeds:feedsBr+bo.length,feedsBr,L:side('L'),R:side('R'),bottles:bo.length,ml,wet,dirty,diapers:di.length,ww,avgBottleOz:bo.length?ml/bo.length/OZ:0}}
function compare(s){const d=ageDays();if(d==null||!typ)return'';const r=typ.ranges.find(r=>d>=r.from&&d<=r.to);
 if(!r)return`<div class="lg-cmp"><b>Typical for day ${d+1}</b><p class="lg-muted">Ranges for this age arrive with the next episode.</p></div>`;
 const isToday=day==startOfDay(Date.now()),row=(l,v,t,ok)=>`<tr><td>${l}</td><td>${v}</td><td>${t}</td><td>${ok==null||isToday?'':ok?'✓':'•'}</td></tr>`;
 return`<div class="lg-cmp"><b>Compared with typical · ${esc(r.episode)}</b><table><tr><th></th><th>${isToday?'So far':'Day'}</th><th>Typical</th><th></th></tr>
 ${row('Feeds',s.feeds,r.feeds.join('–')+' / day',s.feeds>=r.feeds[0]&&s.feeds<=r.feeds[1])}
 ${row('Wet diapers',s.wet,esc(r.wet),r.wetMin==null?null:s.wet>=r.wetMin)}
 ${s.bottles?row('Formula / feed',s.avgBottleOz.toFixed(1)+' oz',r.bottleOz.join('–')+' oz',null):''}
 ${row('Sleep',dur(s.sleepMs),'~'+r.sleepH+'h / day',null)}</table>
 <p class="lg-muted">${esc(typ.note)} These are rough guides, not targets — call your pediatrician for fever, trouble breathing, too few wet diapers or yellow skin.</p></div>`}

/* ---------- render ---------- */
let tick;
function render(){if(!root)return;clearTimeout(tick);
 if(!B){root.innerHTML=`<div class="lg-card lg-center"><h3>Log is almost ready</h3><p class="lg-muted">Shared sync hasn't been connected yet. It will appear here once it's set up.</p></div>`;return}
 if(!S.user){root.innerHTML=signin();bindSignin();return}
 if(!hh){root.innerHTML=`<div class="lg-card lg-center"><h3>Not linked yet</h3><p class="lg-muted">Signed in as ${esc(S.user)}, but this account isn't linked to the family log yet.</p><button class="lg-btn ghost" data-a="out">Sign out</button></div>`;bind();return}
 const st=status(),rb=running('breast'),s=summary(),isToday=day==startOfDay(Date.now()),dLabel=isToday?'Today':new Date(day).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
 const items=evs().filter(e=>{const t=Date.parse(e.started_at);return(t>=day&&t<day+DAY)||(e.kind=='sleep'&&overlap(e,day,day+DAY)>0)});
 root.innerHTML=`
 <div class="lg-status ${st.asleep?'asleep':''}"><span>${st.asleep?'Asleep':'Awake'}</span><b>${st.since?dur(Date.now()-Date.parse(st.since)):'—'}</b><small>${st.since?(st.asleep?'since ':'wake window · since ')+hm(st.since):'Log a sleep to track wake windows'}</small></div>
 ${S.q.length||syncErr?`<div class="lg-sync">${esc(syncErr||'Syncing…')}</div>`:''}
 <div class="lg-grid">
  <button class="lg-big sleep ${st.asleep?'run':''}" data-a="sleep"><i>${ICON.sleep}</i><b>${st.asleep?'Wake up':'Sleep'}</b><small>${st.asleep?clock(Date.now()-Date.parse(st.since)):'Tap to start'}</small></button>
  <button class="lg-big breast ${rb?'run':''}" data-a="breast"><i>${ICON.breast}</i><b>Breast</b><small>${rb?(rb.side=='L'?'Left ':'Right ')+clock(ms(rb)):'Left · Right timer'}</small></button>
  <button class="lg-big bottle" data-a="bottle"><i>${ICON.bottle}</i><b>Bottle</b><small>Formula · mL / oz</small></button>
  <button class="lg-big diaper" data-a="diaper"><i>${ICON.diaper}</i><b>Diaper</b><small>Pee · Poo · Both</small></button>
 </div>
 <div class="lg-card"><div class="lg-dayhd"><button data-a="prev" aria-label="Previous day">‹</button><h3>${dLabel}</h3><button data-a="next" ${isToday?'disabled':''} aria-label="Next day">›</button></div>
  <div class="lg-stats">
   <div><i>${ICON.sleep}</i><b>${dur(s.sleepMs)}</b><small>sleep · ${s.naps} stretch${s.naps==1?'':'es'}${s.longest?' · longest '+dur(s.longest):''}</small></div>
   <div><i>☀️</i><b>${s.ww.length?dur(s.ww.reduce((a,b)=>a+b,0)/s.ww.length):'—'}</b><small>avg wake window${s.ww.length?' · '+s.ww.length:''}</small></div>
   <div><i>${ICON.breast}</i><b>${s.feeds}</b><small>feeds · L ${dur(s.L)} · R ${dur(s.R)}</small></div>
   <div><i>${ICON.bottle}</i><b>${S.unit=='ml'?mlFmt(s.ml)+' mL':oz(s.ml)+' oz'}</b><small>formula · ${s.bottles} bottle${s.bottles==1?'':'s'} · ${S.unit=='ml'?oz(s.ml)+' oz':mlFmt(s.ml)+' mL'}</small></div>
   <div><i>💧</i><b>${s.wet}</b><small>wet diapers</small></div>
   <div><i>💩</i><b>${s.dirty}</b><small>dirty diapers</small></div>
  </div>${compare(s)}</div>
 <div class="lg-card"><h3>Timeline</h3>${items.length?items.map(e=>`<button class="lg-row" data-edit="${e.id}"><i>${ICON[e.kind]}</i><span><b>${label(e)}</b><small>${hm(e.started_at)}${e.ended_at&&e.kind!='diaper'&&e.kind!='bottle'?' – '+hm(e.ended_at):''}${!e.ended_at&&(e.kind=='sleep'||e.kind=='breast')?' · running':''}</small></span><em>${e.kind=='sleep'||e.kind=='breast'?dur(ms(e)):''}</em></button>`).join(''):'<p class="lg-muted">Nothing logged yet. Tap a button above.</p>'}
  <button class="lg-btn ghost" data-a="add">+ Add a past sleep or feed</button></div>
 <p class="lg-muted lg-foot">Shared with your partner in real time · ${esc(S.user)} · <a href="#" data-a="out">Sign out</a></p>${IOS&&!PWA?`<div class="lg-card"><p class="lg-muted">Using Little Steps from your Home Screen? Tap below, then open the app → Log → paste. (This signs Safari out.)</p><button class="lg-btn ghost" data-a="copykey">Copy sign-in for Home Screen app</button></div>`:''}
 ${sheet?sheetHtml():''}`;
 bind();if(running('sleep')||rb||sheet?.k=='breast')tick=setTimeout(()=>{if(!document.activeElement?.matches('input'))render();else tick=setTimeout(render,1e3)},1e3)}
function label(e){return e.kind=='sleep'?'Sleep':e.kind=='breast'?`Breast · ${e.side=='L'?'Left':'Right'}`:e.kind=='bottle'?'Formula · '+amt(e):'Diaper · '+(e.diaper=='both'?'Pee + poo':e.diaper[0].toUpperCase()+e.diaper.slice(1))}
const IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform=='MacIntel'&&navigator.maxTouchPoints>1),PWA=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function pasteBox(){return`<details class="lg-muted" ${PWA?'open':''}><summary>Signed in on Safari? Move it here</summary><p>In Safari, open Little Steps → Log → “Copy sign-in for Home Screen app”, then paste it here.</p><input id="lg-key" autocomplete="off" placeholder="Paste sign-in"><button class="lg-btn ghost" data-a="usekey">Use pasted sign-in</button></details>`}
function signin(){return`<div class="lg-card lg-center"><h3>Family log</h3><p class="lg-muted">Private to your household. Enter the email you were invited with and we'll email you a sign-in link.</p>
 ${S.pendingEmail?`<p>Check <b>${esc(S.pendingEmail)}</b> and tap <b>Log In</b> in the email.${IOS&&PWA?' On iPhone it opens in Safari — you’ll be signed in there; then use the box below to bring it into this app.':''}</p>
 <details class="lg-muted"><summary>Got a 6-digit code instead?</summary><input id="lg-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"><button class="lg-btn" data-a="verify">Sign in</button></details>
 <button class="lg-btn ghost" data-a="send2">Resend link</button><a href="#" data-a="reset" class="lg-muted">Use a different email</a>`
 :`<input id="lg-email" type="email" autocomplete="email" placeholder="you@example.com"><button class="lg-btn" data-a="send">Email me a sign-in link</button>`}${pasteBox()}<p class="lg-err" id="lg-err">${esc(syncErr)}</p></div>`}
function sheetHtml(){const k=sheet.k;let b='';
 if(k=='diaper')b=`<h3>Diaper</h3><div class="lg-tri"><button data-d="pee">💧<b>Pee</b></button><button data-d="poo">💩<b>Poo</b></button><button data-d="both">💧💩<b>Both</b></button></div>${whenField()}`;
 if(k=='bottle'){const u=sheet.unit||S.unit,v=sheet.v??(u=='oz'?2:60);b=`<h3>Formula</h3><div class="lg-seg"><button data-u="oz" class="${u=='oz'?'on':''}">oz</button><button data-u="ml" class="${u=='ml'?'on':''}">mL</button></div>
  <div class="lg-amt"><button data-step="-1">−</button><input id="lg-v" type="number" inputmode="decimal" step="${u=='oz'?.5:5}" value="${v}"><button data-step="1">+</button></div>
  <p class="lg-conv" id="lg-conv">${conv(v,u)}</p>${whenField()}<button class="lg-btn" data-a="savebottle">Log bottle</button>`}
 if(k=='breast'){const r=running('breast');const last=evs().find(e=>e.kind=='breast'&&e.ended_at);b=`<h3>Breastfeeding</h3>${!r&&last?`<p class="lg-muted">Last side: ${last.side=='L'?'Left':'Right'} at ${hm(last.started_at)} — try ${last.side=='L'?'Right':'Left'}</p>`:''}
  <div class="lg-sides">${['L','R'].map(sd=>{const on=r?.side==sd,tot=evs().filter(e=>e.kind=='breast'&&e.side==sd&&Date.parse(e.started_at)>Date.now()-H).reduce((a,e)=>a+ms(e),0);return`<button data-side="${sd}" class="${on?'run':''}"><small>${sd=='L'?'LEFT':'RIGHT'}</small><b>${on?clock(ms(r)):'▶'}</b><small>${on?'tap to pause':tot?'this feed '+dur(tot):'tap to start'}</small></button>`}).join('')}</div>
  ${r?'<button class="lg-btn" data-a="stopbreast">Done</button>':''}`}
 if(k=='edit'||k=='add'){const e=sheet.e;b=`<h3>${k=='add'?'Add entry':label(e)}</h3>
  ${k=='add'?`<div class="lg-seg">${[['sleep','Sleep'],['breastL','Left'],['breastR','Right']].map(([v,l])=>`<button data-kind="${v}" class="${sheet.kind==v?'on':''}">${l}</button>`).join('')}</div>`:''}
  <label class="lg-f">${e.kind=='diaper'||e.kind=='bottle'?'Time':'Start'}<input type="datetime-local" id="lg-s" value="${toLocalInput(e.started_at)}"></label>
  ${e.kind=='sleep'||e.kind=='breast'?`<label class="lg-f">End<input type="datetime-local" id="lg-e" value="${e.ended_at?toLocalInput(e.ended_at):''}"></label>`:''}
  ${e.kind=='bottle'?`<label class="lg-f">Amount (${e.unit||'oz'})<input type="number" id="lg-amt" inputmode="decimal" value="${e.unit=='ml'?mlFmt(e.amount_ml):oz(e.amount_ml)}"></label>`:''}
  ${e.kind=='diaper'?`<div class="lg-seg">${['pee','poo','both'].map(d=>`<button data-dk="${d}" class="${e.diaper==d?'on':''}">${d}</button>`).join('')}</div>`:''}
  <button class="lg-btn" data-a="saveedit">Save</button>${k=='edit'?'<button class="lg-btn danger" data-a="delete">Delete</button>':''}<p class="lg-err" id="lg-err"></p>`}
 return`<div class="lg-sheet-bg" data-a="close"></div><div class="lg-sheet" role="dialog"><div class="lg-grab"></div>${b}<button class="lg-btn ghost" data-a="close">Close</button></div>`}
const whenField=()=>`<label class="lg-f">Time<input type="datetime-local" id="lg-when" value="${toLocalInput(Date.now())}"></label>`;
const conv=(v,u)=>!(v>0)?'':u=='oz'?`= ${mlFmt(v*OZ)} mL`:`= ${oz(v)} oz`;
const whenVal=()=>{const v=$('#lg-when')?.value;if(!v)return now();const t=new Date(v);return Math.abs(t-Date.now())<2*MIN?now():t.toISOString()};
function closeSheet(){sheet=null;render()}
function bind(){root.querySelectorAll('[data-a]').forEach(x=>x.onclick=ev=>{ev.preventDefault();act(x.dataset.a)});
 root.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>{sheet={k:'edit',e:{...S.ev[x.dataset.edit]}};render()});
 root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>diaper(x.dataset.d,whenVal()));
 root.querySelectorAll('[data-side]').forEach(x=>x.onclick=()=>{tapSide(x.dataset.side)});
 root.querySelectorAll('[data-dk]').forEach(x=>x.onclick=()=>{sheet.e.diaper=x.dataset.dk;keepEdit();render()});
 root.querySelectorAll('[data-kind]').forEach(x=>x.onclick=()=>{sheet.kind=x.dataset.kind;sheet.e.kind=x.dataset.kind=='sleep'?'sleep':'breast';sheet.e.side=x.dataset.kind.slice(6)||null;keepEdit();render()});
 root.querySelectorAll('[data-u]').forEach(x=>x.onclick=()=>{const v=+$('#lg-v').value,u=x.dataset.u,old=sheet.unit||S.unit;if(u==old)return;sheet.unit=u;sheet.v=u=='ml'?Math.round(v*OZ/5)*5:Math.round(v/OZ*2)/2;render()});
 root.querySelectorAll('[data-step]').forEach(x=>x.onclick=()=>{const i=$('#lg-v'),u=sheet.unit||S.unit;sheet.v=Math.max(0,+i.value+x.dataset.step*(u=='oz'?.5:5));sheet.unit=u;render()});
 const v=$('#lg-v');if(v)v.oninput=()=>{sheet.v=+v.value;$('#lg-conv').textContent=conv(+v.value,sheet.unit||S.unit)}}
function keepEdit(){const s=$('#lg-s')?.value,e=$('#lg-e')?.value;if(s)sheet.e.started_at=new Date(s).toISOString();if(e!=null)sheet.e.ended_at=e?new Date(e).toISOString():null}
async function act(a){const err=t=>{const p=$('#lg-err');if(p)p.textContent=t};
 if(a=='sleep')toggleSleep();
 if(a=='breast'){sheet={k:'breast'};render()}
 if(a=='bottle'){sheet={k:'bottle'};render()}
 if(a=='diaper'){sheet={k:'diaper'};render()}
 if(a=='close')closeSheet();
 if(a=='stopbreast'){const r=running('breast');r&&put({...r,ended_at:now()});closeSheet();toast('🤱 Feed saved')}
 if(a=='savebottle')bottle(+$('#lg-v').value,sheet.unit||S.unit,whenVal());
 if(a=='prev'){day=startOfDay(day-DAY/2);follow=false;render()}
 if(a=='next'){day=Math.min(startOfDay(day+DAY*1.5),startOfDay(Date.now()));follow=day==startOfDay(Date.now());render()}
 if(a=='add'){const t=Date.now();sheet={k:'add',kind:'sleep',e:{id:uid(),kind:'sleep',started_at:new Date(t-H).toISOString(),ended_at:new Date(t).toISOString()}};render()}
 if(a=='saveedit'){keepEdit();const e=sheet.e;if(e.ended_at&&e.ended_at<e.started_at)return err('End is before start');if(Date.parse(e.started_at)>Date.now()+MIN)return err('Start is in the future');
  if(e.kind=='bottle'){const v=+$('#lg-amt').value;if(!(v>0))return err('Enter an amount');e.amount_ml=Math.round((e.unit=='ml'?v:v*OZ)*10)/10}
  if(e.kind=='sleep'||e.kind=='diaper')e.side=null;put(e);closeSheet()}
 if(a=='delete'&&confirm('Delete this entry?')){del(sheet.e.id);closeSheet()}
 if(a=='send'){const e=$('#lg-email').value.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(e))return err('Enter your email');try{await B.sendCode(e);S.pendingEmail=e;persist();render()}catch(x){err(/signups|not allowed|not found/i.test(x.message)?'That email isn’t on the family list.':x.message)}}
 if(a=='verify'){const c=$('#lg-code').value.trim();try{await B.verify(S.pendingEmail,c);S.pendingEmail=null;await boot()}catch(x){err('That code didn’t work — check it or request a new one.')}}
 if(a=='send2'){try{await B.sendCode(S.pendingEmail);toast('📧 New link sent')}catch(x){err(x.message)}}
 if(a=='usekey'){const k=($('#lg-key').value||'').trim();if(!k)return err('Paste the sign-in first');try{await B.useKey(k);S.pendingEmail=null;persist();await boot()}catch(x){err('That sign-in didn’t work — copy a fresh one from Safari.')}}
 if(a=='copykey'){const k=await B.key();if(!k)return;try{await navigator.clipboard.writeText(k)}catch(x){prompt('Copy this',k)}await B.localOut();S={ev:{},q:[],unit:S.unit};hh=null;persist();render();toast('Copied — now open the Home Screen app → Log → paste')}
 if(a=='reset'){S.pendingEmail=null;persist();render()}
 if(a=='out'&&confirm('Sign out of the family log on this phone?')){await B.signOut();S={ev:{},q:[],unit:S.unit};hh=null;persist();render()}}
function bindSignin(){bind();const i=$('#lg-email')||$('#lg-code');i&&(i.onkeydown=e=>{if(e.key=='Enter')act($('#lg-email')?'send':'verify')})}

async function boot(){if(!B)return render();try{await B.fromLink?.()}catch(x){syncErr='Sign-in link expired or already used — request a new one.'}const u=await B.user();S.user=u?.email||null;persist();
 if(!u){hh=null;return render()}
 try{hh=await B.household();S.hh=hh;persist()}catch(e){hh=S.hh||null;syncErr='Offline — showing saved data'}
 render();if(hh){B.subscribe((t,row)=>{if(t=='DELETE')delete S.ev[row.id];else if(!S.ev[row.id]||S.ev[row.id].updated_at<=row.updated_at)S.ev[row.id]=row;persist();render()});await pull();flush()}}
fetch('typical.json').then(r=>r.json()).then(j=>{typ=j;render()}).catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user){if(follow)day=startOfDay(Date.now());pull().then(flush)}});
addEventListener('online',flush);
window.LSLog={show:()=>{render()},state:()=>S};
if(S.hh)hh=S.hh;render();boot();
})();
