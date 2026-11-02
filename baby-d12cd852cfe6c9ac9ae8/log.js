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
  pwIn:async(e,p)=>chk(await sb.auth.signInWithPassword({email:e,password:p})),
  setPw:async p=>chk(await sb.auth.updateUser({password:p})),
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
 return{name:'mock',fromLink:async()=>{},pwIn:async(e,p)=>{if(p!=(localStorage['ls-mock-pw']||'\u0000'))throw Error('Invalid login credentials');me=e;sessionStorage['ls-mock-user']=e},setPw:async p=>{localStorage['ls-mock-pw']=p},user:async()=>me&&{email:me},sendCode:async()=>{},verify:async(e,c)=>{if(c!='123456')throw Error('Invalid code');me=e;sessionStorage['ls-mock-user']=e},
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
const nd=a=>startOfDay(a+DAY*1.5);
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
const dur=m=>{if(m<MIN)return Math.max(0,Math.floor(m/1e3))+'s';m=Math.max(0,Math.floor(m/MIN));return m<60?m+'m':Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m'};
const clock=m=>{const s=Math.max(0,Math.floor(m/1e3));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const hm=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const hms=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});
const dt=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
const durS=m=>{const s=Math.max(0,Math.floor(m/1e3)),h=Math.floor(s/3600),mi=Math.floor(s%3600/60),se=s%60;return(h?h+'h ':'')+(h||mi?String(mi).padStart(h?2:1,'0')+'m ':'')+String(se).padStart(2,'0')+'s'};
const LIVE={clock,dur,durS};
const live=(f,from,to)=>`<span data-live="${f}" data-from="${esc(from)}"${to?` data-to="${esc(to)}"`:''}>${LIVE[f]((to?Date.parse(to):Date.now())-Date.parse(from))}</span>`;
function liveUpdate(){document.querySelectorAll('#log [data-live]').forEach(x=>{const t=x.dataset.to?Date.parse(x.dataset.to):Date.now();const v=LIVE[x.dataset.live](t-Date.parse(x.dataset.from));if(x.textContent!==v)x.textContent=v})}
const oz=ml=>(ml/OZ).toFixed(1).replace(/\.0$/,''),mlFmt=ml=>Math.round(ml);
const MILK={formula:'Formula',breastmilk:'Breast milk'},milkOf=e=>e.milk=='breastmilk'?'breastmilk':'formula';
const amt=e=>e.unit=='ml'?`${mlFmt(e.amount_ml)} mL (${oz(e.amount_ml)} oz)`:`${oz(e.amount_ml)} oz (${mlFmt(e.amount_ml)} mL)`;
const toLocalInput=t=>{const d=new Date(t);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,19)};
const ageDays=()=>hh?.birth_date?Math.floor((startOfDay(day)-startOfDay(Date.parse(hh.birth_date+'T00:00')))/DAY):null;
const ICON={sleep:'🌙',breast:'🤱',bottle:'🍼',diaper:'🧷',weight:'⚖️',note:'📝'};
const LB=453.592,gToLbOz=g=>{const t=Math.round(g/LB*16*10)/10;let lb=Math.floor(t/16),o=Math.round((t-lb*16)*10)/10;if(o>=16){lb++;o-=16}return[lb,o]},wFmt=g=>{const[l,o]=gToLbOz(g);return`${l} lb ${o} oz (${(g/1000).toFixed(2)} kg)`};
const SRC={birth:'Birth',home:'Home',pediatrician:'Pediatrician'};
const noteVal=()=>{const v=($('#lg-note')?.value||'').trim();return v?v.slice(0,2000):null};
const noteField=v=>`<label class="lg-f">Notes<textarea id="lg-note" maxlength="2000" rows="2" placeholder="Optional notes">${esc(v||'')}</textarea></label>`;
function overlap(e,a,b){const s=Date.parse(e.started_at),f=e.ended_at?Date.parse(e.ended_at):Date.now();return Math.max(0,Math.min(f,b)-Math.max(s,a))}
function wakeWindows(){const sl=evs().filter(e=>e.kind=='sleep').reverse(),w=[];for(let i=1;i<sl.length;i++){const p=sl[i-1];if(!p.ended_at)continue;w.push({from:p.ended_at,to:sl[i].started_at})}return w}
function status(){const r=running('sleep');if(r)return{asleep:true,since:r.started_at};const last=evs().find(e=>e.kind=='sleep'&&e.ended_at);return{asleep:false,since:last?.ended_at}}

/* ---------- actions ---------- */
function toggleSleep(){const r=running('sleep');if(r)put({...r,ended_at:now()});else put({id:uid(),kind:'sleep',started_at:now(),ended_at:null})}
function tapSide(side){const r=running('breast');if(r){put({...r,ended_at:now()});if(r.side==side)return}put({id:uid(),kind:'breast',side,started_at:now(),ended_at:null})}
function diaper(t,when){put({id:uid(),kind:'diaper',diaper:t,started_at:when||now(),ended_at:null,note:noteVal()});closeSheet();toast(`${ICON.diaper} ${t=='both'?'Pee + poo':t[0].toUpperCase()+t.slice(1)} logged`)}
function bottle(v,unit,when,milk='formula'){const ml=unit=='oz'?v*OZ:v;if(!(ml>0))return;S.unit=unit;put({id:uid(),kind:'bottle',milk,note:noteVal(),amount_ml:Math.round(ml*10)/10,unit,started_at:when||now(),ended_at:null});closeSheet();toast(`${ICON.bottle} ${MILK[milk]} ${unit=='oz'?v+' oz':v+' mL'} logged`)}
function delUndo(id){const e=S.ev[id];if(!e)return;const saved={...e};del(id);
 document.querySelectorAll('.lg-toast.undo').forEach(x=>x.remove());const d=document.createElement('div');d.className='lg-toast undo';d.innerHTML=`Deleted ${esc(label(saved))} <button>Undo</button>`;document.body.append(d);
 const t=setTimeout(()=>d.remove(),5000);d.querySelector('button').onclick=()=>{clearTimeout(t);d.remove();put({...saved})}}
function toast(t){const d=document.createElement('div');d.className='lg-toast';d.textContent=t;document.body.append(d);setTimeout(()=>d.remove(),1800)}

/* ---------- summary ---------- */
function summary(a=day){const b=nd(a),inDay=e=>{const t=Date.parse(e.started_at);return t>=a&&t<b},all=evs();
 const sleeps=all.filter(e=>e.kind=='sleep'&&overlap(e,a,b)>0),sleepMs=sleeps.reduce((s,e)=>s+overlap(e,a,b),0),longest=Math.max(0,...sleeps.map(ms));
 const br=all.filter(e=>e.kind=='breast'&&inDay(e)),bo=all.filter(e=>e.kind=='bottle'&&inDay(e)),di=all.filter(e=>e.kind=='diaper'&&inDay(e));
 // breast segments within 30 min of each other = one feed
 const brs=[...br].sort((x,y)=>x.started_at<y.started_at?-1:1);let feedsBr=0,lastEnd=0;for(const e of brs){const s=Date.parse(e.started_at);if(s-lastEnd>30*MIN)feedsBr++;lastEnd=Date.parse(e.ended_at||now())}
 const side=k=>br.filter(e=>e.side==k).reduce((s,e)=>s+ms(e),0),ml=bo.reduce((s,e)=>s+ +e.amount_ml,0),fo=bo.filter(e=>milkOf(e)=='formula'),bm=bo.filter(e=>milkOf(e)=='breastmilk'),fml=fo.reduce((s,e)=>s+ +e.amount_ml,0),bml=bm.reduce((s,e)=>s+ +e.amount_ml,0);
 const wet=di.filter(e=>e.diaper!='poo').length,dirty=di.filter(e=>e.diaper!='pee').length;
 const ww=wakeWindows().filter(w=>{const t=Date.parse(w.to);return t>=a&&t<b}).map(w=>Date.parse(w.to)-Date.parse(w.from));
 return{sleepMs,naps:sleeps.length,longest,feeds:feedsBr+bo.length,feedsBr,L:side('L'),R:side('R'),bottles:bo.length,ml,wet,dirty,diapers:di.length,ww,avgBottleOz:bo.length?ml/bo.length/OZ:0,fml,bml,nf:fo.length,nb:bm.length}}
function compare(s){const d=ageDays();if(d==null||!typ)return'';const r=typ.ranges.find(r=>d>=r.from&&d<=r.to);
 if(!r)return`<div class="lg-cmp"><b>Typical for day ${d+1}</b><p class="lg-muted">Ranges for this age arrive with the next episode.</p></div>`;
 const isToday=day==startOfDay(Date.now()),row=(l,v,t,ok)=>`<tr><td>${l}</td><td>${v}</td><td>${t}</td><td>${ok==null||isToday?'':ok?'✓':'•'}</td></tr>`;
 return`<div class="lg-cmp"><b>Compared with typical · ${esc(r.episode)}</b><table><tr><th></th><th>${isToday?'So far':'Day'}</th><th>Typical</th><th></th></tr>
 ${row('Feeds',s.feeds,r.feeds.join('–')+' / day',s.feeds>=r.feeds[0]&&s.feeds<=r.feeds[1])}
 ${row('Wet diapers',s.wet,esc(r.wet),r.wetMin==null?null:s.wet>=r.wetMin)}
 ${s.bottles?row('Bottle / feed',s.avgBottleOz.toFixed(1)+' oz',r.bottleOz.join('–')+' oz',null):''}
 ${row('Sleep',dur(s.sleepMs),'~'+r.sleepH+'h / day',null)}</table>
 <p class="lg-muted">${esc(typ.note)} These are rough guides, not targets — call your pediatrician for fever, trouble breathing, too few wet diapers or yellow skin.</p></div>`}

/* ---------- render ---------- */
let tick;
function shell(){let m=document.getElementById('lg-main'),w=document.getElementById('lg-sheetwrap');if(!m){root.innerHTML='';m=document.createElement('div');m.id='lg-main';w=document.createElement('div');w.id='lg-sheetwrap';root.append(m,w);w.addEventListener('animationend',()=>w.classList.add('noanim'))}return[m,w]}
function setSheet(sh){const w=shell()[1];if(w.dataset.h===sh)return;if(!w.dataset.h&&sh)w.classList.remove('noanim');else w.classList.add('noanim');w.innerHTML=sh;w.dataset.h=sh;const t=document.getElementById('lg-note');if(t&&sheet){const v=sheet.e?sheet.e.note:sheet.note;if(v!=null)t.value=v}}
function render(){if(!root)return;const[main]=shell();
 if(!B){setSheet('');main.innerHTML=`<div class="lg-card lg-center"><h3>Log is almost ready</h3><p class="lg-muted">Shared sync hasn't been connected yet. It will appear here once it's set up.</p></div>`;return}
 if(!S.user){setSheet('');main.innerHTML=signin();bindSignin();return}
 if(!hh){setSheet('');main.innerHTML=`<div class="lg-card lg-center"><h3>Not linked yet</h3><p class="lg-muted">Signed in as ${esc(S.user)}, but this account isn't linked to the family log yet.</p><button class="lg-btn ghost" data-a="out">Sign out</button></div>`;bind();return}
 const st=status(),rb=running('breast'),s=summary(),isToday=day==startOfDay(Date.now()),dLabel=isToday?'Today':new Date(day).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
 const items=evs().filter(e=>{const t=Date.parse(e.started_at);return(t>=day&&t<nd(day))||(e.kind=='sleep'&&overlap(e,day,nd(day))>0)});
 main.innerHTML=`
 <div class="lg-status ${st.asleep?'asleep':''}"><span>${st.asleep?'Asleep':'Awake'}</span><b>${st.since?live('durS',st.since):'—'}</b><small>${st.since?(st.asleep?'since ':'wake window · since ')+hm(st.since):'Log a sleep to track wake windows'}</small></div>
 ${S.q.length||syncErr?`<div class="lg-sync">${esc(syncErr||'Syncing…')}</div>`:''}
 <div class="lg-grid">
  <button class="lg-big sleep ${st.asleep?'run':''}" data-a="sleep"><i>${ICON.sleep}</i><b>${st.asleep?'Wake up':'Sleep'}</b><small>${st.asleep?live('clock',st.since):'Tap to start'}</small></button>
  <button class="lg-big breast ${rb?'run':''}" data-a="breast"><i>${ICON.breast}</i><b>Breast</b><small>${rb?(rb.side=='L'?'Left ':'Right ')+live('clock',rb.started_at):'Left · Right timer'}</small></button>
  <button class="lg-big bottle" data-a="bottle"><i>${ICON.bottle}</i><b>Bottle</b><small>Formula · Breast milk</small></button>
  <button class="lg-big diaper" data-a="diaper"><i>${ICON.diaper}</i><b>Diaper</b><small>Pee · Poo · Both</small></button>
  <button class="lg-mini" data-a="weight">⚖️ Weight</button><button class="lg-mini" data-a="noteadd">📝 Note</button>
 </div>
 <div class="lg-card"><div class="lg-dayhd"><button data-a="prev" aria-label="Previous day">‹</button><h3>${dLabel}</h3><button data-a="next" ${isToday?'disabled':''} aria-label="Next day">›</button></div>
  <div class="lg-stats">
   <div><i>${ICON.sleep}</i><b>${dur(s.sleepMs)}</b><small>sleep · ${s.naps} stretch${s.naps==1?'':'es'}${s.longest?' · longest '+dur(s.longest):''}</small></div>
   <div><i>☀️</i><b>${s.ww.length?dur(s.ww.reduce((a,b)=>a+b,0)/s.ww.length):'—'}</b><small>avg wake window${s.ww.length?' · '+s.ww.length:''}</small></div>
   <div><i>${ICON.breast}</i><b>${s.feeds}</b><small>feeds · L ${dur(s.L)} · R ${dur(s.R)}</small></div>
   <div><i>${ICON.bottle}</i><b>${S.unit=='ml'?mlFmt(s.ml)+' mL':oz(s.ml)+' oz'}</b><small>bottles · ${s.bottles}<br>Formula ${oz(s.fml)} oz / ${mlFmt(s.fml)} mL<br>Breast milk ${oz(s.bml)} oz / ${mlFmt(s.bml)} mL</small></div>
   <div><i>💧</i><b>${s.wet}</b><small>wet diapers</small></div>
   <div><i>💩</i><b>${s.dirty}</b><small>dirty diapers</small></div>
  </div>${compare(s)}</div>
 ${trendsHtml()}
 <div class="lg-card"><h3>Timeline</h3>${items.length?items.map(e=>`<div class="lg-row" data-edit="${e.id}" role="button" tabindex="0"><i>${ICON[e.kind]}</i><span><b>${label(e)}</b>${e.note?`<small class="lg-note">📝 ${esc(e.note.length>70?e.note.slice(0,70)+'…':e.note)}</small>`:''}<small>${hm(e.started_at)}${e.ended_at&&e.kind!='diaper'&&e.kind!='bottle'?' – '+hm(e.ended_at):''}${!e.ended_at&&(e.kind=='sleep'||e.kind=='breast')?' · running':''}</small></span><em>${e.kind=='sleep'||e.kind=='breast'?live('dur',e.started_at,e.ended_at):''}</em><button class="lg-act" data-editbtn="${e.id}" aria-label="Edit">✏️</button><button class="lg-act del" data-del="${e.id}" aria-label="Delete">🗑️</button></div>`).join(''):'<p class="lg-muted">Nothing logged yet. Tap a button above.</p>'}
  <button class="lg-btn ghost" data-a="add">+ Add a past sleep or feed</button></div>
 <p class="lg-muted lg-foot">Shared with your partner in real time · ${esc(S.user)} · <a href="#" data-a="out">Sign out</a></p><details class="lg-card"><summary><b>${S.pw?'Family password is set ✓':'Set a family password'}</b> <span class="lg-muted">— sign in on any phone or the Home Screen app without email</span></summary><input id="lg-p1" type="password" autocomplete="new-password" placeholder="New password (8+ characters)"><input id="lg-p2" type="password" autocomplete="new-password" placeholder="Repeat password"><button class="lg-btn" data-a="setpw">Save password</button><p class="lg-err" id="lg-err"></p></details>
 `;
 setSheet(sheet?sheetHtml():'');
 bind();liveUpdate()}
setInterval(()=>{liveUpdate();if(follow&&S.user&&hh&&day!=startOfDay(Date.now())){day=startOfDay(Date.now());render()}},1e3);
function label(e){if(e.kind=='weight')return'Weight · '+wFmt(e.weight_g)+(e.weight_src?' · '+SRC[e.weight_src]:'');if(e.kind=='note')return'Note';return e.kind=='sleep'?'Sleep':e.kind=='breast'?`Breast · ${e.side=='L'?'Left':'Right'}`:e.kind=='bottle'?MILK[milkOf(e)]+' bottle · '+amt(e):'Diaper · '+(e.diaper=='both'?'Pee + poo':e.diaper[0].toUpperCase()+e.diaper.slice(1))}
const IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform=='MacIntel'&&navigator.maxTouchPoints>1),PWA=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function signin(){return`<div class="lg-card lg-center"><h3>Family log</h3><p class="lg-muted">Private to your household.</p>
 <input id="lg-email" type="email" autocomplete="username" placeholder="you@example.com" value="${esc(S.lastEmail||'')}">
 <input id="lg-pw" type="password" autocomplete="current-password" placeholder="Family password">
 <button class="lg-btn" data-a="pwin">Sign in</button>
 <details class="lg-muted" ${S.pendingEmail?'open':''}><summary>No password yet? Email me a sign-in link</summary>
 ${S.pendingEmail?`<p>Link sent to <b>${esc(S.pendingEmail)}</b>. Tap <b>Log In</b> in the email${IOS&&PWA?' — it opens in Safari. Sign in there, set a family password, then come back here and sign in with it':''}.</p>`:''}
 <button class="lg-btn ghost" data-a="send">${S.pendingEmail?'Send another link':'Email me a sign-in link'}</button>
 ${S.pendingEmail?`<input id="lg-code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="6-digit code (if your email has one)"><button class="lg-btn ghost" data-a="verify">Use code</button>`:''}</details>
 <p class="lg-err" id="lg-err">${esc(syncErr)}</p></div>`}

/* ---------- trends ---------- */
const trS=()=>({tab:'feeds',range:7,...(S.tr||{})});
const ageOf=t=>hh?.birth_date?Math.round((startOfDay(t)-startOfDay(Date.parse(hh.birth_date+'T00:00')))/DAY):null;
function lastWeight(){return evs().find(e=>e.kind=='weight')}
function birthWeight(){const w=evs().filter(e=>e.kind=='weight');return(w.find(e=>e.weight_src=='birth')||null)?.weight_g||null}
// band(kind, ageDays[, birthWeight g]) -> [lo, hi|null] ; null = no band
function band(k,d,bw){const n=d+1;
 if(k=='feeds')return d<90?[8,12]:null;
 if(k=='wet')return[Math.min(n,6),null];
 if(k=='dirty')return n<=2?[1,null]:n<=4?[2,null]:d<42?[3,null]:null;
 if(k=='sleep')return d<90?[14,17]:[12,16];
 if(k=='bottle'){const lw=lastWeight();if(lw){const lb=lw.weight_g/LB;return[Math.min(32,2*lb),Math.min(32,3*lb)]}
  const pf=n<=2?[.5,1]:n<=7?[1,2]:d<28?[2,3]:[3,4];return[pf[0]*8,Math.min(32,pf[1]*8)]}
 if(k=='weight'){if(!bw)return null;const lo=d<=4?bw*(1-.025*d):d<=14?bw*(.9+.1*(d-4)/10):bw+20*(d-14),hi=d<=5?bw:bw+40*(d-5);return[lo,hi]}
 return null}
function dayAgg(a){const s=summary(a),b=nd(a),has=evs().some(e=>{const t=Date.parse(e.started_at);return(t>=a&&t<b)||(e.kind=='sleep'&&overlap(e,a,b)>0)});
 return has?{feeds:s.feeds,wet:s.wet,dirty:s.dirty,sleep:s.sleepMs/H,longest:s.longest/H,fo:s.fml/OZ,bm:s.bml/OZ,tot:s.ml/OZ}:null}
function chart(o){const W=360,Hh=190,L=34,R=8,T=10,Bm=24,x0=o.x0,x1=o.x1,xs=d=>L+(d-x0)/(x1-x0||1)*(W-L-R);
 const ymax=o.ymax,ymin=o.ymin||0,ys=v=>T+(1-(v-ymin)/(ymax-ymin||1))*(Hh-T-Bm),clampY=v=>ys(Math.max(ymin,Math.min(ymax,v)));
 let g='';
 // grid + y labels
 const step=o.ystep;for(let v=Math.ceil(ymin/step)*step;v<=ymax+1e-9;v+=step)g+=`<line x1="${L}" x2="${W-R}" y1="${ys(v)}" y2="${ys(v)}" class="gr"/><text x="${L-5}" y="${ys(v)+3.5}" class="yl">${o.yfmt?o.yfmt(v):v}</text>`;
 // bands
 for(const bd of o.bands||[]){let top='',bot='';const pts=[];for(let d=x0;d<=x1;d+=.5){const b=bd.fn(d);if(!b){pts.push(null);continue}pts.push([d,b[0],b[1]??ymax])}
  let seg=[];const flush=()=>{if(seg.length>1)g+=`<path d="M${seg.map(p=>xs(p[0])+','+clampY(p[2])).join('L')}L${seg.slice().reverse().map(p=>xs(p[0])+','+clampY(p[1])).join('L')}Z" class="band" style="fill:${bd.color}"/>`;seg=[]};
  for(const p of pts){if(p)seg.push(p);else flush()}flush();
  const fp=pts.filter(p=>p&&p[0]>=o.today+.5);if(fp.length>1){g+=`<path d="M${fp.map(p=>xs(p[0])+','+clampY(p[1])).join('L')}" class="ln fc band-e" style="stroke:${bd.color.replace(/[\d.]+\)$/,'.9)')}"/>`;if(bd.fn(o.today)?.[1]!=null)g+=`<path d="M${fp.map(p=>xs(p[0])+','+clampY(p[2])).join('L')}" class="ln fc band-e" style="stroke:${bd.color.replace(/[\d.]+\)$/,'.9)')}"/>`}}
 // today divider
 g+=`<line x1="${xs(o.today+.5)}" x2="${xs(o.today+.5)}" y1="${T}" y2="${Hh-Bm}" class="now"/><text x="${xs(o.today+.5)+3}" y="${T+9}" class="nowl">forecast →</text>`;
 // x labels
 const xstep=x1-x0>28?7:x1-x0>14?3:x1-x0>8?2:1;for(let d=Math.ceil(x0/xstep)*xstep;d<=x1;d+=xstep)g+=`<text x="${xs(d)}" y="${Hh-8}" class="xl">${d}</text>`;
 // series
 for(const se of o.series){let path='',prev=false;for(const [d,v,pt] of se.pts){if(v==null||pt){prev=false;continue}path+=(prev?'L':'M')+xs(d)+','+clampY(v);prev=true}
  if(path)g+=`<path d="${path}" class="ln${se.dash?' fc':''}" style="stroke:${se.color}"/>`;
  for(const [d,v,partial] of se.pts)if(v!=null&&!se.dash&&!se.nodots)g+=`<circle cx="${xs(d)}" cy="${clampY(v)}" r="${partial?3.6:2.8}" class="${partial?'part':''}" style="${partial?'stroke':'fill'}:${se.color}"/>`}
 return`<svg viewBox="0 0 ${W} ${Hh}" class="lg-chart" role="img" aria-label="${esc(o.title)}">${g}<text x="${W-R}" y="${Hh-8}" class="xl" text-anchor="end"></text></svg><div class="lg-axis">Age (days since birth)</div>`}
function trendsHtml(){if(!hh?.birth_date)return'';const st=trS(),today=ageOf(Date.now()),N=st.range,F=N>=30?14:7,x0=Math.max(0,today-N+1),x1=today+F,birth=Date.parse(hh.birth_date+'T00:00');
 const days=[];for(let d=x0;d<=today;d++){const a=startOfDay(birth+d*DAY+3*H);days.push([d,dayAgg(a)])}
 const P=(f)=>days.map(([d,a])=>[d,a?f(a):null,d==today]);
 const C={feeds:'#B36BFF',wet:'#5EC8FF',dirty:'#E2A86A',sleep:'#8E9BFF',longest:'#D9B8FF',fo:'#FFD86B',bm:'#FF8FC8',tot:'#FFFFFF',w:'#7CE0A3'};
 const fc=(k,c)=>({color:c,dash:true,nodots:true,pts:[]});
 let html='',out=[],leg='';
 const chk=(k,f,lbl)=>{for(const[d,a]of days){if(!a||d==today)continue;const b=band(k,d);if(!b)continue;const v=f(a);if(v<b[0]||(b[1]!=null&&v>b[1]))out.push(`${lbl} on day ${d}`)}};
 if(st.tab=='feeds'){chk('feeds',a=>a.feeds,'Feeds');const ys=Math.max(14,...days.map(([,a])=>a?a.feeds:0))+2;
  html=chart({title:'Feeds per day',x0,x1,today,ymax:ys,ystep:4,bands:[{fn:d=>band('feeds',d),color:'rgba(179,107,255,.18)'}],series:[{color:C.feeds,pts:P(a=>a.feeds)}]});
  leg=`<span><i style="background:${C.feeds}"></i>Feeds (breast + bottle)</span>`}
 if(st.tab=='diapers'){chk('wet',a=>a.wet,'Wet diapers');chk('dirty',a=>a.dirty,'Dirty diapers');const ys=Math.max(10,...days.map(([,a])=>a?Math.max(a.wet,a.dirty):0))+1;
  html=chart({title:'Diapers per day',x0,x1,today,ymax:ys,ystep:2,bands:[{fn:d=>band('wet',d),color:'rgba(94,200,255,.13)'},{fn:d=>band('dirty',d),color:'rgba(226,168,106,.13)'}],series:[{color:C.wet,pts:P(a=>a.wet)},{color:C.dirty,pts:P(a=>a.dirty)}]});
  leg=`<span><i style="background:${C.wet}"></i>Wet</span><span><i style="background:${C.dirty}"></i>Dirty</span>`}
 if(st.tab=='sleep'){chk('sleep',a=>a.sleep,'Sleep');
  html=chart({title:'Sleep per day',x0,x1,today,ymax:20,ystep:4,yfmt:v=>v+'h',bands:[{fn:d=>band('sleep',d),color:'rgba(142,155,255,.18)'}],series:[{color:C.sleep,pts:P(a=>a.sleep)},{color:C.longest,pts:P(a=>a.longest)}]});
  leg=`<span><i style="background:${C.sleep}"></i>Total sleep</span><span><i style="background:${C.longest}"></i>Longest stretch</span>`}
 if(st.tab=='bottles'){const ys=Math.max(32,...days.map(([,a])=>a?a.tot:0))+2;
  html=chart({title:'Bottle volume per day',x0,x1,today,ymax:ys,ystep:8,yfmt:v=>v+'oz',bands:[{fn:d=>band('bottle',d),color:'rgba(255,255,255,.09)'}],series:[{color:C.tot,pts:P(a=>a.tot)},{color:C.fo,pts:P(a=>a.fo)},{color:C.bm,pts:P(a=>a.bm)}]});
  leg=`<span><i style="background:${C.tot}"></i>Total</span><span><i style="background:${C.fo}"></i>Formula</span><span><i style="background:${C.bm}"></i>Breast milk</span>`;
  out=[]}
 if(st.tab=='weight'){const ws=evs().filter(e=>e.kind=='weight').map(e=>[(Date.parse(e.started_at)-birth)/DAY,e.weight_g]).sort((a,b)=>a[0]-b[0]),bw=birthWeight();
  if(!ws.length)html=`<p class="lg-muted lg-empty">No weights yet. Tap <b>⚖️ Weight</b> above to add the birth weight (from the hospital) and any weigh-ins.</p>`;
  else{const last=ws[ws.length-1],lo=Math.min(...ws.map(w=>w[1]),bw?bw*.9:1e9)-150,hi=Math.max(...ws.map(w=>w[1]),bw?band('weight',x1,bw)[1]:0)+150,toLb=g=>g/LB;
   const fpts=last[0]>=5?[[last[0],toLb(last[1])],[last[0]+F,toLb(last[1]+30*F)]]:[];
   for(const[d,g]of ws.slice(0,-1).concat([last]))if(bw){const b=band('weight',Math.floor(d),bw);if(b&&(g<b[0]-1||g>b[1]+1)&&d<today)out.push('Weight on day '+Math.floor(d))}
   const wx0=Math.min(x0,Math.floor(ws[0][0]));
   html=chart({title:'Weight',x0:wx0,x1,today,ymin:Math.floor(toLb(lo)*2)/2,ymax:Math.ceil(toLb(hi)*2)/2,ystep:.5,yfmt:v=>v.toFixed(1),bands:bw?[{fn:d=>{const b=band('weight',d,bw);return b&&[toLb(b[0]),toLb(b[1])]},color:'rgba(124,224,163,.15)'}]:[],
    series:[{color:C.w,pts:ws.map(([d,g])=>[d,toLb(g),false])},...(fpts.length?[{color:C.w,dash:true,nodots:true,pts:fpts}]:[])]})
   leg=`<span><i style="background:${C.w}"></i>Weight (lb)${bw?' · birth '+wFmt(bw).split(' (')[0]:''}</span>${fpts.length?'<span><i class="dash" style="border-color:'+C.w+'"></i>Forecast (+30 g/day)</span>':''}${bw?'':'<span class="lg-muted">Add a Birth weight to see the typical range</span>'}`}}
 const tabs=[['feeds','Feeds'],['diapers','Diapers'],['sleep','Sleep'],['bottles','Bottles'],['weight','Weight']];
 const partial=st.tab!='weight'&&days.some(([d,a])=>d==today&&a);
 return`<div class="lg-card lg-trends"><h3>Trends</h3>
  <div class="lg-tabs">${tabs.map(([k,l])=>`<button data-trtab="${k}" class="${st.tab==k?'on':''}">${l}</button>`).join('')}</div>
  <div class="lg-seg lg-range">${[7,14,30].map(n=>`<button data-trrange="${n}" class="${st.range==n?'on':''}">${n} days</button>`).join('')}</div>
  ${html}
  <div class="lg-legend">${leg}<span><i class="solid"></i>Logged</span><span><i class="dash"></i>Forecast</span><span><i class="shade"></i>Typical range</span>${partial?'<span><i class="hollow"></i>Today (so far)</span>':''}</div>
  ${out.length?`<p class="lg-gentle">Outside the typical range (${esc(out.slice(0,3).join(', '))}${out.length>3?'…':''}). Worth mentioning to your pediatrician.</p>`:''}
  <p class="lg-muted lg-trfoot">Ranges are rough guides for healthy full-term babies, not targets. <a href="#" data-a="method">ⓘ How these ranges are set</a></p></div>`}
function methodHtml(){const A=(u,t)=>`<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
 const HC1=A('https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/how-often-and-how-much-should-your-baby-eat.aspx','AAP / HealthyChildren: How often and how much should your baby eat'),
 HC2=A('https://www.healthychildren.org/english/ages-stages/baby/breastfeeding/pages/how-to-tell-if-baby-is-getting-enough-milk.aspx','AAP / HealthyChildren: Is your breastfed baby getting enough milk'),
 HC3=A('https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/amount-and-schedule-of-formula-feedings.aspx','AAP / HealthyChildren: Amount and schedule of formula feedings'),
 HC4=A('https://www.healthychildren.org/english/ages-stages/baby/sleep/Pages/default.aspx','AAP / HealthyChildren: Sleep'),
 HC5=A('https://www.healthychildren.org/english/ages-stages/prenatal/delivery-beyond/pages/bringing-baby-home.aspx','AAP / HealthyChildren: Your newborn\'s first week'),
 HC6=A('https://www.healthychildren.org/English/ages-stages/baby/Pages/First-Month-Physical-Appearance-and-Growth.aspx','AAP / HealthyChildren: First month growth'),
 CDC=A('https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/how-much-and-how-often.html','CDC: How much and how often to feed infant formula'),
 WHO=A('https://www.who.int/tools/child-growth-standards/standards/weight-velocity','WHO Child Growth Standards: weight velocity'),
 PAUL=A('https://doi.org/10.1542/peds.2016-2625','Paul et al., Pediatrics 2016: weight-change nomograms (143,889 newborns)'),
 SLCH=A('https://www.stlouischildrens.org/conditions-treatments/slow-or-poor-infant-weight-gain','St. Louis Children\'s Hospital: slow infant weight gain');
 return`<h3>How these ranges are set</h3><div class="lg-method">
 <p class="lg-warn"><b>Not medical advice.</b> These bands are rough guides for healthy, full-term babies drawn from public pediatric guidance. Your pediatrician's advice for Noah comes first. <b>*</b> = our extrapolation where sources give no single number.</p>
 <h4>Feeds per day — 8 to 12</h4><p>Breastfed newborns nurse at least 8–12 times in 24 hours (AAP says 10–12 is the norm). Formula-fed newborns: CDC says most feed 8–12 times; AAP says 8 is the usual minimum. A "feed" here = breast sessions within 30 minutes of each other counted once, plus each bottle. Band applies through 3 months.*</p><p>${HC2} · ${HC1} · ${CDC}</p>
 <h4>Wet diapers — ramp to 6+</h4><p>Lower edge = day of life (1 on day 1, 2 on day 2 … 6 from day 6 on).* AAP: 2–3 wet diapers in the first few days, 5–6+ after day 4–5, and 6+ pale-yellow by day 5–7. There is no upper limit, so the band is open at the top.</p><p>${HC1} · ${HC2}</p>
 <h4>Dirty diapers — 1–2, then 2+, then 3+</h4><p>AAP (breastfed): 1–2 tarry stools on days 1–2, at least 2 on days 3–4, and at least 3–4 yellow stools from day 5–7. Another AAP page says at least 4 by day 4. We use the lower numbers. Formula-fed babies often have fewer, firmer stools, so a lower count can be normal. The band stops at 6 weeks,* when stool frequency becomes very variable.</p><p>${HC2} · ${HC1}</p>
 <h4>Sleep per day — 14 to 17 hours</h4><p>AAP: newborns sleep about 14–17 hours a day (another AAP page says 16–17), often only 1–2 hours at a time. From 4 months the AAP-endorsed range is 12–16 hours. "Longest stretch" has no band. AAP advises waking a formula-fed baby who sleeps more than 4–5 hours and misses feeds in the first weeks.</p><p>${HC5} · ${HC4} · ${HC3}</p>
 <h4>Bottle volume per day</h4><p>Only meaningful if Noah is mostly bottle-fed. If a weight is logged: AAP's average of 2½ oz per pound per day. We shade 2–3 oz/lb* around it, capped at AAP's usual maximum of 32 oz. Without a weight: AAP/CDC per-feed amounts × 8 feeds:* ½–1 oz (days 1–2), 1–2 oz (first week), 2–3 oz (weeks 2–4), 3–4 oz (end of month 1). Breastfed babies usually take about 1 oz per feed in the first weeks, so a mixed-fed baby will sit below the band.</p><p>${HC3} · ${HC1} · ${CDC}</p>
 <h4>Weight</h4><p>Needs a <b>Birth</b> weight entry. Loss of up to 8–10% in the first days is expected (AAP). Most babies are back to birth weight by 10–14 days (AAP says by about 2 weeks; almost all by 3 weeks). A study of 143,889 newborns found half were back by day 9–10, and 14% of vaginal and 24% of C-section babies were not back by day 14, so being slightly late is common. After that, the AAP average is about 1 oz (28 g) per day, and St. Louis Children's flags less than about 30 g/day in the first 3 months. WHO weight-velocity medians for days 14–28 are about 39 g/day (girls). Band:* down to −10% by day 4, back to birth weight by day 14, then +20 to +40 g/day (about 0.7–1.4 oz). <b>Forecast</b> = a straight line from the latest weigh-in at +30 g/day (about 1 oz/day). It is a guide, not a prediction for Noah. Home scales can be off by 1–2 oz, so compare like with like.</p><p>${HC2} · ${HC6} · ${PAUL} · ${SLCH} · ${WHO}</p>
 <h4>How the charts work</h4><p>Solid line = logged days. Hollow dot = today so far (not judged). Shaded = typical range, which continues forward as dotted forecast columns. Days with nothing logged are left blank, not counted as zero. A gentle note appears if a complete day falls outside the range. It's a prompt to mention it at the next visit, not an alarm. For fever, trouble breathing, too few wet diapers or yellow skin, call your pediatrician right away.</p></div>`}
function sheetHtml(){const k=sheet.k;let b='';if(sheet.nInit===undefined)sheet.nInit=sheet.e?.note||'';
 if(k=='diaper')b=`<h3>Diaper</h3><div class="lg-tri"><button data-d="pee">💧<b>Pee</b></button><button data-d="poo">💩<b>Poo</b></button><button data-d="both">💧💩<b>Both</b></button></div>${whenField()}${noteField(sheet.nInit)}`;
 if(k=='bottle'){const u=sheet.unit||S.unit,v=sheet.v??(u=='oz'?2:60);const mk=sheet.milk||S.milk||'formula';b=`<h3>Bottle</h3><div class="lg-seg lg-milk"><button data-milk="formula" class="${mk=='formula'?'on':''}">Formula</button><button data-milk="breastmilk" class="${mk=='breastmilk'?'on':''}">Breast milk</button></div><div class="lg-seg"><button data-u="oz" class="${u=='oz'?'on':''}">oz</button><button data-u="ml" class="${u=='ml'?'on':''}">mL</button></div>
  <div class="lg-amt"><button data-step="-1">−</button><input id="lg-v" type="number" inputmode="decimal" step="${u=='oz'?.5:5}" value="${v}"><button data-step="1">+</button></div>
  <p class="lg-conv" id="lg-conv">${conv(v,u)}</p>${whenField()}${noteField(sheet.nInit)}<button class="lg-btn" data-a="savebottle">Log bottle</button>`}
 if(k=='breast'){const r=running('breast');const last=evs().find(e=>e.kind=='breast'&&e.ended_at);b=`<h3>Breastfeeding</h3>${!r&&last?`<p class="lg-muted">Last side: ${last.side=='L'?'Left':'Right'} at ${hm(last.started_at)} — try ${last.side=='L'?'Right':'Left'}</p>`:''}
  <div class="lg-sides">${['L','R'].map(sd=>{const on=r?.side==sd,tot=evs().filter(e=>e.kind=='breast'&&e.side==sd&&Date.parse(e.started_at)>Date.now()-H).reduce((a,e)=>a+ms(e),0);return`<button data-side="${sd}" class="${on?'run':''}"><small>${sd=='L'?'LEFT':'RIGHT'}</small><b>${on?live('clock',r.started_at):'▶'}</b><small>${on?'tap to pause':tot?'this feed '+dur(tot):'tap to start'}</small></button>`}).join('')}</div>
  ${r?noteField(sheet.nInit)+'<button class="lg-btn" data-a="stopbreast">Done</button>':''}`}
 if(k=='weight'){const u=S.wunit||'lb',src=sheet.src||'home';b=`<h3>Weight</h3><div class="lg-seg"><button data-wu="lb" class="${u=='lb'?'on':''}">lb + oz</button><button data-wu="kg" class="${u=='kg'?'on':''}">kg</button></div>
  ${u=='lb'?`<div class="lg-two"><label class="lg-f">lb<input id="lg-wlb" type="number" inputmode="numeric" min="0" max="60" value="${sheet.wlb??''}"></label><label class="lg-f">oz<input id="lg-woz" type="number" inputmode="decimal" min="0" max="15.9" step="0.1" value="${sheet.woz??''}"></label></div>`:`<label class="lg-f">kg<input id="lg-wkg" type="number" inputmode="decimal" step="0.01" value="${sheet.wkg??''}"></label>`}
  <div class="lg-seg">${Object.entries(SRC).map(([v,l])=>`<button data-src="${v}" class="${src==v?'on':''}">${l}</button>`).join('')}</div>${whenField()}${noteField(sheet.nInit)}<button class="lg-btn" data-a="saveweight">Save weight</button><p class="lg-err" id="lg-err"></p>`}
 if(k=='noteadd'){b=`<h3>Note</h3><p class="lg-muted">Anything worth remembering: awake time, mood, symptoms, questions for the pediatrician.</p>${whenField()}${noteField(sheet.nInit)}<button class="lg-btn" data-a="savenote">Save note</button><p class="lg-err" id="lg-err"></p>`}
 if(k=='method')b=methodHtml();
 if(k=='edit'||k=='add'){const e=sheet.e;b=`<h3>${k=='add'?'Add entry':label(e)}</h3>
  ${k=='add'?`<div class="lg-seg">${[['sleep','Sleep'],['breastL','Left'],['breastR','Right']].map(([v,l])=>`<button data-kind="${v}" class="${sheet.kind==v?'on':''}">${l}</button>`).join('')}</div>`:''}
  <label class="lg-f">${['diaper','bottle','weight','note'].includes(e.kind)?'Time':'Start'}<input type="datetime-local" step="1" id="lg-s" value="${toLocalInput(e.started_at)}"><small class="lg-muted" id="lg-s-txt">${dt(e.started_at)}</small></label>
  ${e.kind=='sleep'||e.kind=='breast'?(e.ended_at||k=='add'?`<label class="lg-f">End<input type="datetime-local" step="1" id="lg-e" value="${e.ended_at?toLocalInput(e.ended_at):''}"><small class="lg-muted" id="lg-e-txt">${e.ended_at?dt(e.ended_at):''}</small></label>`
   :`<div class="lg-f">End<div class="lg-inprog"><b>In progress</b><button class="lg-btn" data-a="stopedit">Stop now</button></div></div>`)
   +`<p class="lg-total">Total <b id="lg-total">${e.ended_at?durS(Date.parse(e.ended_at)-Date.parse(e.started_at)):live('durS',e.started_at)}</b></p>`:''}
  ${e.kind=='bottle'?`<div class="lg-seg lg-milk"><button data-emilk="formula" class="${milkOf(e)=='formula'?'on':''}">Formula</button><button data-emilk="breastmilk" class="${milkOf(e)=='breastmilk'?'on':''}">Breast milk</button></div>`:''}
  ${e.kind=='bottle'?`<label class="lg-f">Amount (${e.unit||'oz'})<input type="number" id="lg-amt" inputmode="decimal" value="${e.unit=='ml'?mlFmt(e.amount_ml):oz(e.amount_ml)}"></label>`:''}
  ${e.kind=='diaper'?`<div class="lg-seg">${['pee','poo','both'].map(d=>`<button data-dk="${d}" class="${e.diaper==d?'on':''}">${d}</button>`).join('')}</div>`:''}
  ${e.kind=='weight'?`<div class="lg-two"><label class="lg-f">lb<input id="lg-elb" type="number" inputmode="numeric" value="${gToLbOz(e.weight_g)[0]}"></label><label class="lg-f">oz<input id="lg-eoz" type="number" inputmode="decimal" step="0.1" value="${gToLbOz(e.weight_g)[1]}"></label></div><div class="lg-seg">${Object.entries(SRC).map(([v,l])=>`<button data-esrc="${v}" class="${e.weight_src==v?'on':''}">${l}</button>`).join('')}</div>`:''}
  ${noteField(sheet.nInit)}
  <button class="lg-btn" data-a="saveedit">Save</button>${k=='edit'?'<button class="lg-btn danger" data-a="delete">Delete</button>':''}<p class="lg-err" id="lg-err"></p>`}
 return`<div class="lg-sheet-bg" data-a="close"></div><div class="lg-sheet${k=='method'?' full':''}" role="dialog"><div class="lg-grab"></div>${b}<button class="lg-btn ghost" data-a="close">Close</button></div>`}
const whenField=()=>`<label class="lg-f">Time<input type="datetime-local" id="lg-when" value="${toLocalInput(Date.now())}"></label>`;
const conv=(v,u)=>!(v>0)?'':u=='oz'?`= ${mlFmt(v*OZ)} mL`:`= ${oz(v)} oz`;
const whenVal=()=>{const v=$('#lg-when')?.value;if(!v)return now();const t=new Date(v);return Math.abs(t-Date.now())<2*MIN?now():t.toISOString()};
function closeSheet(){sheet=null;render()}
function bind(){root.querySelectorAll('[data-a]').forEach(x=>x.onclick=ev=>{ev.preventDefault();act(x.dataset.a)});
 root.querySelectorAll('[data-edit]').forEach(x=>x.onclick=ev=>{if(ev.target.closest('.lg-act'))return;sheet={k:'edit',e:{...S.ev[x.dataset.edit]}};render()});
 root.querySelectorAll('[data-editbtn]').forEach(x=>x.onclick=ev=>{ev.stopPropagation();sheet={k:'edit',e:{...S.ev[x.dataset.editbtn]}};render()});
 root.querySelectorAll('[data-del]').forEach(x=>x.onclick=ev=>{ev.stopPropagation();delUndo(x.dataset.del)});
 root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>diaper(x.dataset.d,whenVal()));
 root.querySelectorAll('[data-side]').forEach(x=>x.onclick=()=>{tapSide(x.dataset.side)});
 root.querySelectorAll('[data-milk]').forEach(x=>x.onclick=()=>{const v=$('#lg-v');if(v){sheet.v=+v.value;sheet.unit=sheet.unit||S.unit}sheet.milk=x.dataset.milk;render()});
 root.querySelectorAll('[data-emilk]').forEach(x=>x.onclick=()=>{const a=$('#lg-amt');if(a&&+a.value>0)sheet.e.amount_ml=Math.round((sheet.e.unit=='ml'?+a.value:+a.value*OZ)*10)/10;sheet.e.milk=x.dataset.emilk;keepEdit();render()});
 const nt=$('#lg-note');if(nt&&sheet){nt.oninput=()=>{if(sheet.e)sheet.e.note=nt.value;else sheet.note=nt.value}}
 const keepW=()=>{['wlb','woz','wkg'].forEach(k=>{const i=$('#lg-'+k);if(i)sheet[k]=i.value})};['wlb','woz','wkg'].forEach(k=>{const i=$('#lg-'+k);if(i)i.oninput=keepW});
 root.querySelectorAll('[data-wu]').forEach(x=>x.onclick=()=>{keepW();const u=x.dataset.wu;if(u==(S.wunit||'lb'))return;if(u=='kg'&&(sheet.wlb||sheet.woz))sheet.wkg=(((+sheet.wlb||0)*16+(+sheet.woz||0))/16*LB/1000).toFixed(2);if(u=='lb'&&sheet.wkg){const[l,o]=gToLbOz(+sheet.wkg*1000);sheet.wlb=l;sheet.woz=o}S.wunit=u;persist();render()});
 root.querySelectorAll('[data-src]').forEach(x=>x.onclick=()=>{keepW();sheet.src=x.dataset.src;render()});
 root.querySelectorAll('[data-esrc]').forEach(x=>x.onclick=()=>{const l=$('#lg-elb'),o=$('#lg-eoz');if(l)sheet.e.weight_g=Math.round(((+l.value)*16+(+o.value))/16*LB);sheet.e.weight_src=x.dataset.esrc;keepEdit();render()});
 root.querySelectorAll('[data-trtab]').forEach(x=>x.onclick=()=>{S.tr={...trS(),tab:x.dataset.trtab};persist();render()});
 root.querySelectorAll('[data-trrange]').forEach(x=>x.onclick=()=>{S.tr={...trS(),range:+x.dataset.trrange};persist();render()});
 root.querySelectorAll('[data-dk]').forEach(x=>x.onclick=()=>{sheet.e.diaper=x.dataset.dk;keepEdit();render()});
 root.querySelectorAll('[data-kind]').forEach(x=>x.onclick=()=>{sheet.kind=x.dataset.kind;sheet.e.kind=x.dataset.kind=='sleep'?'sleep':'breast';sheet.e.side=x.dataset.kind.slice(6)||null;keepEdit();render()});
 root.querySelectorAll('[data-u]').forEach(x=>x.onclick=()=>{const v=+$('#lg-v').value,u=x.dataset.u,old=sheet.unit||S.unit;if(u==old)return;sheet.unit=u;sheet.v=u=='ml'?Math.round(v*OZ/5)*5:Math.round(v/OZ*2)/2;render()});
 root.querySelectorAll('[data-step]').forEach(x=>x.onclick=()=>{const i=$('#lg-v'),u=sheet.unit||S.unit;sheet.v=Math.max(0,+i.value+x.dataset.step*(u=='oz'?.5:5));sheet.unit=u;render()});
 const si=$('#lg-s'),ei=$('#lg-e'),upd=()=>{const sv=si?.value,ev=ei?.value;if(sv)$('#lg-s-txt').textContent=dt(new Date(sv));if(ei)$('#lg-e-txt').textContent=ev?dt(new Date(ev)):'';const tot=$('#lg-total');if(tot&&sv&&ev)tot.textContent=durS(new Date(ev)-new Date(sv))};
 si&&(si.oninput=upd);ei&&(ei.oninput=upd);
 const v=$('#lg-v');if(v)v.oninput=()=>{sheet.v=+v.value;$('#lg-conv').textContent=conv(+v.value,sheet.unit||S.unit)}}
function keepEdit(){const s=$('#lg-s')?.value,e=$('#lg-e')?.value;if(s)sheet.e.started_at=new Date(s).toISOString();if(e!=null)sheet.e.ended_at=e?new Date(e).toISOString():null}
async function act(a){const err=t=>{const p=$('#lg-err');if(p)p.textContent=t};
 if(a=='sleep')toggleSleep();
 if(a=='breast'){sheet={k:'breast'};render()}
 if(a=='bottle'){sheet={k:'bottle'};render()}
 if(a=='diaper'){sheet={k:'diaper'};render()}
 if(a=='close')closeSheet();
 if(a=='stopbreast'){const r=running('breast'),n=noteVal();r&&put({...r,ended_at:now(),...(n?{note:n}:{})});closeSheet();toast('🤱 Feed saved')}
 if(a=='savebottle'){S.milk=sheet.milk||S.milk||'formula';bottle(+$('#lg-v').value,sheet.unit||S.unit,whenVal(),S.milk)}
 if(a=='prev'){day=startOfDay(day-DAY/2);follow=false;render()}
 if(a=='next'){day=Math.min(startOfDay(day+DAY*1.5),startOfDay(Date.now()));follow=day==startOfDay(Date.now());render()}
 if(a=='add'){const t=Date.now();sheet={k:'add',kind:'sleep',e:{id:uid(),kind:'sleep',started_at:new Date(t-H).toISOString(),ended_at:new Date(t).toISOString()}};render()}
 if(a=='stopedit'){keepEdit();sheet.e.ended_at=now();put({...sheet.e});closeSheet();toast('🌙 Stopped')}
 if(a=='weight'){sheet={k:'weight'};render()}
 if(a=='noteadd'){sheet={k:'noteadd'};render()}
 if(a=='method'){sheet={k:'method'};render()}
 if(a=='saveweight'){const u=S.wunit||'lb';let g=u=='lb'?((+$('#lg-wlb').value||0)*16+(+$('#lg-woz').value||0))/16*LB:(+$('#lg-wkg').value||0)*1000;if(!(g>500&&g<30000))return err('Enter a weight');
  put({id:uid(),kind:'weight',weight_g:Math.round(g),weight_src:sheet.src||'home',started_at:whenVal(),ended_at:null,note:noteVal()});closeSheet();toast('⚖️ Weight saved')}
 if(a=='savenote'){const n=noteVal();if(!n)return err('Write a note first');put({id:uid(),kind:'note',started_at:whenVal(),ended_at:null,note:n});closeSheet();toast('📝 Note saved')}
 if(a=='saveedit'){keepEdit();const e=sheet.e;e.note=noteVal();if(e.kind=='weight'){const g=(+$('#lg-elb').value*16+ +$('#lg-eoz').value)/16*LB;if(!(g>500&&g<30000))return err('Enter a weight');e.weight_g=Math.round(g)}if(e.ended_at&&e.ended_at<e.started_at)return err('End is before start');if(Date.parse(e.started_at)>Date.now()+MIN)return err('Start is in the future');
  if(e.kind=='bottle'){const v=+$('#lg-amt').value;if(!(v>0))return err('Enter an amount');e.amount_ml=Math.round((e.unit=='ml'?v:v*OZ)*10)/10}
  if(e.kind=='sleep'||e.kind=='diaper')e.side=null;put(e);closeSheet()}
 if(a=='delete'){const id=sheet.e.id;closeSheet();delUndo(id)}
 const mailErr=x=>/rate limit|429/i.test(x.message||'')?'Email limit reached — Supabase only sends a couple of sign-in emails per hour. Use your family password, or try again in an hour.':/signups|not allowed|not found/i.test(x.message)?'That email isn’t on the family list.':(x.message||'Something went wrong');
 if(a=='send'){const e=($('#lg-email').value||S.pendingEmail||'').trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(e))return err('Enter your email');S.lastEmail=e;try{await B.sendCode(e);S.pendingEmail=e;persist();render();toast('📧 Link sent')}catch(x){err(mailErr(x))}}
 if(a=='pwin'){const e=$('#lg-email').value.trim().toLowerCase(),p=$('#lg-pw').value;if(!/^\S+@\S+\.\S+$/.test(e))return err('Enter your email');if(!p)return err('Enter the family password');S.lastEmail=e;
  try{await B.pwIn(e,p);S.pendingEmail=null;S.pw=true;persist();await boot()}catch(x){err(/invalid login/i.test(x.message||'')?'Wrong email or password. No password yet? Use the email link once, then set one.':(x.message||'Sign-in failed'))}}
 if(a=='setpw'){const p=$('#lg-p1').value,q=$('#lg-p2').value;if(p.length<8)return err('Use at least 8 characters');if(p!==q)return err('Passwords don’t match');
  try{await B.setPw(p);S.pw=true;persist();render();toast('🔑 Password saved — use it to sign in anywhere')}catch(x){err(x.message||'Could not save password')}}
 if(a=='verify'){const c=($('#lg-code').value||'').replace(/\s/g,'');try{await B.verify(S.pendingEmail,c);S.pendingEmail=null;await boot()}catch(x){err('That code didn’t work.')}}
 if(a=='reset'){S.pendingEmail=null;persist();render()}
 if(a=='out'&&confirm('Sign out of the family log on this phone?')){await B.signOut();S={ev:{},q:[],unit:S.unit};hh=null;persist();render()}}
function bindSignin(){bind();const p=$('#lg-pw');p&&(p.onkeydown=e=>{if(e.key=='Enter')act('pwin')});const c=$('#lg-code');c&&(c.onkeydown=e=>{if(e.key=='Enter')act('verify')})}

async function boot(){if(!B)return render();try{await B.fromLink?.()}catch(x){syncErr='That sign-in link was already used (each link works once). Sign in with your email and family password below instead.'}const u=await B.user();S.user=u?.email||null;persist();
 if(!u){hh=null;return render()}
 try{hh=await B.household();S.hh=hh;persist()}catch(e){hh=S.hh||null;syncErr='Offline — showing saved data'}
 render();if(hh){B.subscribe((t,row)=>{if(t=='DELETE')delete S.ev[row.id];else if(!S.ev[row.id]||S.ev[row.id].updated_at<=row.updated_at)S.ev[row.id]=row;persist();render()});await pull();flush()}}
fetch('typical.json').then(r=>r.json()).then(j=>{typ=j;render()}).catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user){if(follow)day=startOfDay(Date.now());pull().then(flush)}});
addEventListener('online',flush);
window.LSLog={show:()=>{render()},state:()=>S,band:(k,d,bw)=>band(k,d,bw)};
if(S.hh)hh=S.hh;render();boot();
})();
