(function(){
"use strict";
var PW=window.PW, S=PW.sources, BK=window.PWBooks, $=function(s,r){return (r||document).querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var FAM={"Lutheran":"lutheran","Reformed":"reformed","Anglican":"anglican","Baptist":"baptist","Pentecostal / Wesleyan":"wesleyan"};
var FAMNAME={orthodox:"Eastern Orthodox",catholic:"Catholic",lutheran:"Lutheran",reformed:"Reformed",anglican:"Anglican",baptist:"Baptist",wesleyan:"Pentecostal / Wesleyan"};
var COLS=[["orthodox","Orthodox"],["catholic","Catholic"],["lutheran","Lutheran"],["reformed","Reformed"],["anglican","Anglican"],["baptist","Baptist"],["wesleyan","Pent./Wesl."]];
var STANCE={affirms:"Affirms",denies:"Denies",dogma:"Affirms (defined dogma)",both:"Peter and his confession",christ:"Christ is the rock",
  wording:"Liturgical wording only",distinguishes:"Sufficient for all, effective for the elect",differ:"Its confessions differ",none:"No source opened"};
var BADGE={agree:"Both tracks agree","disagree":"The tracks disagree","one-track":"Only one track opened",unsourced:"No opened source"};
var SBADGE={agree:"Both tracks agree","disagree":"The tracks disagree","one-track":"Only one track checked",unsourced:"No article checked"};
function lsGet(k,d){try{return localStorage.getItem(k)||d}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var state={mode:"verse",hl:lsGet("pw-hl",""),srcOrder:[],view:lsGet("pw-view","simple")==="full"?"full":"simple",note:null,last:"",jump:null};
var byId={}; PW.queries.forEach(function(q){byId[q.id]=q});
// every claim by id (ids are assigned at build time)
var CLAIM={}, CLAIMQ={};
(function walk(o,q){ if(!o||typeof o!=="object") return; if(Array.isArray(o)){o.forEach(function(x){walk(x,q)}); return}
  if(o.id&&o.src&&o.quote){CLAIM[o.id]=o; CLAIMQ[o.id]=q}
  for(var k in o) if(o.hasOwnProperty(k)&&typeof o[k]==="object") walk(o[k],q); })(PW.queries.map(function(q){return q}),null);
PW.queries.forEach(function(q){Object.keys(CLAIM).forEach(function(id){if(id.indexOf(q.id+".")===0) CLAIMQ[id]=q.id})});
function norm(s){return s.toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9':\s]/g," ").replace(/\s+/g," ").trim()}
function match(text,mode){
  var t=norm(text); if(!t) return null;
  var tc=t.replace(/\s/g,"");
  var best=null;
  PW.queries.forEach(function(q){ if(mode && q.type!==mode) return;
    (q.aliases||[]).forEach(function(a){var n=norm(a);
      if(t===n||tc===n.replace(/\s/g,"")) best=best||q;
      else if(q.type==="belief" && (t.indexOf(n)>=0)) best=best||q;
      else if(q.type==="verse" && n.length>5 && t.indexOf(n)>=0) best=best||q; });});
  return best;
}
// ---------- forgiving lookup ----------
var VIDX=PW.queries.filter(function(q){return q.type==="verse"}).map(function(q){var r=BK.parse(q.ref); return {q:q,b:r.b,c:r.c,v:r.v}});
var STOP={};"the a an of to for is are was were did do does who whom whose what which in on at and or not be by it its this that with from as if i me my we our you your about why how when there their they them he his him she her".split(" ").forEach(function(w){STOP[w]=1});
var SYN={jesus:"christ",christs:"christ",died:"die",dies:"die",dying:"die",death:"die",dead:"die",popes:"pope",papal:"pope",papacy:"pope",pontiff:"pope",vicar:"pope",
  peters:"peter",petrine:"peter",everyone:"all",everybody:"all",every:"all",whole:"all",chosen:"elect",chose:"elect",election:"elect",predestination:"elect",
  definite:"limited",particular:"limited",unlimited:"limited",roman:"rome",successors:"successor",succession:"successor",succeed:"successor",succeeds:"successor",
  atone:"atonement",atoning:"atonement",saved:"save",salvation:"save",saves:"save",leader:"head",loves:"love",loved:"love"};
function toks(s){return norm(s).replace(/'/g,"").split(/[^a-z0-9]+/).filter(function(w){return w.length>1&&!STOP[w]}).map(function(w){return SYN[w]||w.replace(/ies$/,"y").replace(/([^s])s$/,"$1")})}
var KW={}; PW.queries.forEach(function(q){var set={}; toks((q.aliases||[]).join(" ")+" "+(q.title||"")).forEach(function(w){if(!/^\d+$/.test(w)) set[w]=1}); KW[q.id]=set});
function kwScores(text){
  var tt=toks(text), uniq={}; tt.forEach(function(w){uniq[w]=1});
  var out=[]; PW.queries.forEach(function(q){var sc=0; Object.keys(uniq).forEach(function(w){if(KW[q.id][w]) sc++});
    var n=norm(text); (q.aliases||[]).forEach(function(a){var an=norm(a); if(an.length>3&&(n===an||n.indexOf(an)>=0)) sc+=2});
    if(sc>0) out.push({q:q,score:sc})});
  return out.sort(function(a,b){return b.score-a.score});
}
function resolve(text,mode){
  var t=String(text||"").trim(), out={text:t,parse:null,go:null,partial:false};
  if(!t) return out;
  var p=BK.parse(t); out.parse=p;
  if(p.ok&&p.kind!=="book"){
    var hits=VIDX.filter(function(x){return BK.contains(p,x)}); out.hits=hits;
    if(hits.length){out.go=hits[0].q; out.partial=p.kind!=="verse"}
    return out;
  }
  if(p.ok&&p.kind==="book") return out;
  if(p.b!=null||(p.books&&p.books.length&&p.nums)) return out;   // a book was recognized: never fall back to keyword guesses
  var ks=kwScores(t), pick=function(type){var f=ks.filter(function(x){return x.q.type===type}); return f.length?f[0].q:null};
  var old=match(t,mode)||match(t,null);
  if(old) out.go=old;
  else if(mode==="belief") out.go=pick("belief");
  else { var ex=ks.filter(function(x){return x.q.type==="verse"&&x.score>=2}); if(ex.length) out.go=ex[0].q }
  return out;
}
function closest(p,text){
  var list=[], seen={};
  function add(q){if(!seen[q.id]){seen[q.id]=1; list.push(q)}}
  kwScores(text||"").forEach(function(x){if(x.q.type===state.mode) add(x.q)});
  var vs=VIDX.slice();
  if(p&&(p.b!=null||(p.books&&p.books.length))){var b=p.b!=null?p.b:p.books[0], tst=BK.BOOKS[b].t;
    vs.sort(function(x,y){function k(z){return (z.b===b?0:1000)+(BK.BOOKS[z.b].t===tst?0:500)+Math.abs(z.b-b)} return k(x)-k(y)})}
  if(state.mode==="belief"){PW.queries.filter(function(q){return q.type==="belief"}).forEach(add); vs.forEach(function(x){add(x.q)})}
  else {vs.forEach(function(x){add(x.q)}); PW.queries.filter(function(q){return q.type==="belief"}).forEach(add)}
  return list.slice(0,6);
}
function suggest(text,mode){
  var t=String(text||"").trim(), items=[], seen={};
  function add(it){var k=it.key||it.label; if(seen[k]) return; seen[k]=1; items.push(it)}
  function addQ(q,why){add({key:q.id,label:q.ref||q.title,sub:(q.type==="belief"?"Belief question · ":"")+"Fully sourced"+(why?" · "+why:""),act:"go",id:q.id,ok:true})}
  if(!t){PW.queries.filter(function(q){return q.type===mode}).forEach(function(q){addQ(q)}); return items}
  var p=BK.parse(t);
  var KS=kwScores(t), top=KS.length?KS[0].score:0; KS=KS.filter(function(x){return top<2||x.score>=top});
  if(mode==="belief") KS.filter(function(x){return x.q.type==="belief"}).forEach(function(x){addQ(x.q)});
  if(p.ok&&p.kind!=="book"){
    var hits=VIDX.filter(function(x){return BK.contains(p,x)});
    hits.forEach(function(x){addQ(x.q,p.kind==="verse"?"":"in "+p.label)});
    if(!(p.kind==="verse"&&hits.length)) add({key:"miss",label:p.label,sub:"Not in the sourced corpus yet",act:"find",text:t});
    VIDX.filter(function(x){return x.b===p.b}).forEach(function(x){addQ(x.q,"same book")});
    if(items.length<3) closest(p,"").filter(function(q){return q.type==="verse"}).slice(0,2).forEach(function(q){addQ(q,"closest available")});
  } else if(p.ok&&p.kind==="book"){
    VIDX.filter(function(x){return x.b===p.b}).forEach(function(x){addQ(x.q)});
    add({key:"book"+p.b,label:BK.BOOKS[p.b].name,sub:"Book · add a chapter and verse",act:"fill",text:BK.BOOKS[p.b].name+" "});
  } else if(p.error==="chapter"){
    add({key:"bad",label:p.label,sub:BK.BOOKS[p.b].name+" has "+BK.BOOKS[p.b].ch+" chapter"+(BK.BOOKS[p.b].ch>1?"s":""),act:"none"});
    VIDX.filter(function(x){return x.b===p.b}).forEach(function(x){addQ(x.q,"same book")});
  } else if(p.books&&p.books.length){
    p.books.forEach(function(b){VIDX.filter(function(x){return x.b===b}).forEach(function(x){
      var r2=p.nums?BK.parse(BK.BOOKS[b].name+" "+p.nums):null; if(!r2||BK.contains(r2,x)) addQ(x.q)})});
    p.books.slice(0,6).forEach(function(b){var nm=BK.BOOKS[b].name;
      if(p.nums){var r2=BK.parse(nm+" "+p.nums); if(r2.ok) add({key:"m"+b,label:r2.label,sub:"Not in the sourced corpus yet",act:"find",text:r2.label})}
      else add({key:"book"+b,label:nm,sub:"Book · add a chapter and verse",act:"fill",text:nm+" "})});
  }
  if(!(p.b!=null)) KS.forEach(function(x){ if(x.q.type==="verse"||mode==="verse") addQ(x.q) });
  return items.slice(0,7);
}
// ---------- citation numbering ----------
function cite(src){var i=state.srcOrder.indexOf(src); if(i<0){state.srcOrder.push(src); i=state.srcOrder.length-1} return i+1}
function srcLink(c){var s=S[c.src]; var n=cite(c.src);
  return '<div class="cite">['+n+'] <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+'</a>'+(c.locator?' — '+esc(c.locator):'')+'</div>'}
function labelClass(l){return l.split(" ")[0]}
function claimHTML(c){
  var h='<div class="claim"'+(c.id?' id="c-'+esc(c.id)+'" tabindex="-1"':'')+'><div class="meta"><span class="lbl '+labelClass(c.label)+'">'+esc(c.label)+'</span><span>'+esc(c.authority)+'</span></div>';
  h+='<blockquote>“'+esc(c.quote)+'”</blockquote>';
  if(c.says) h+='<p class="says"><span class="k">Reading</span>'+esc(c.says)+'</p>';
  if(c.verses&&c.verses.length) h+='<p class="says"><span class="k">Verses used</span>'+esc(c.verses.join("; "))+'</p>';
  if(c.argument) h+='<p class="says argument"><span class="k">Argument</span>'+esc(c.argument)+'</p>';
  if(c.note) h+='<p class="says"><span class="k">Note</span>'+esc(c.note)+'</p>';
  return h+srcLink(c)+'</div>';
}
function filt(claims,point){return (claims||[]).filter(function(c){return !point||!c.points||c.points.indexOf(point)>=0})}
// ---------- text first ----------
function textHTML(q,compact){
  var t=q.text, B=PW.bible[t.key], h='<section class="block" id="text"><h2 class="sec">Text first</h2><div class="textpanel">';
  var showCtx=!compact&&state.ctx;
  function line(code,cls){var b=B[code]; var vs=showCtx?t.context:[t.focus];
    var v=vs.map(function(n){return '<span class="'+(n===t.focus?'':'ctx')+'"><sup>'+n+'</sup>'+esc(b.verses[String(n)])+'</span>'}).join(" ");
    return '<div class="tr '+(cls||"")+'"><div class="v">'+v+'</div><div class="lab">'+esc(b.name)+' · '+esc(b.note.split(";")[0])+' · <a href="'+esc(b.source_url)+'" target="_blank" rel="noopener noreferrer">source</a></div></div>'}
  var codes=compact?["web","kjv"]:t.translations;
  codes.forEach(function(c){h+=line(c)}); h+=line(t.original,"greek");
  h+='</div>';
  if(!compact) h+='<button class="ctxbtn" data-act="ctx">'+(showCtx?'Show verse '+t.focus+' only':'Show surrounding verses ('+t.context[0]+'–'+t.context[t.context.length-1]+')')+'</button>';
  if(t.note) h+='<p class="tnote">'+esc(t.note)+'</p>';
  return h+'</section>';
}
// ---------- agree / dissent grid ----------
function gridHTML(q,onlyPoint){
  var h='<section class="block" id="grid"><h2 class="sec">Where they agree and differ</h2><div class="gridwrap"><table class="grid"><thead><tr><th>Question</th>';
  COLS.forEach(function(c){h+='<th>'+c[1]+'</th>'}); h+='</tr></thead><tbody>';
  q.points.forEach(function(p){ if(onlyPoint&&p.id!==onlyPoint) return;
    h+='<tr><th>'+esc(p.q)+'</th>'; COLS.forEach(function(c){var v=p.cells[c[0]]||"none"; h+='<td><span class="st '+v+'">'+STANCE[v]+'</span></td>'}); h+='</tr>'});
  h+='</tbody></table></div><p class="hint">Protestant confessions are listed separately because they do not give one answer. Each cell sums up the cited texts below; it is not a separate claim.</p></section>';
  return h;
}
// ---------- tradition columns ----------
function colHTML(key,name,tr,point){
  var hl=state.hl===key?' hl':'';
  var h='<div class="col '+key+hl+'"><h3>'+name+'</h3>';
  if(tr.position&&!point) h+='<p class="pos">'+esc(tr.position)+'</p>';
  var cl=filt(tr.claims,point); cl.forEach(function(c){h+=claimHTML(c)});
  if(!cl.length) h+='<div class="gap">No source for this point was opened in this tradition, so nothing is shown.</div>';
  if(tr.dogma_note) h+='<div class="gap"><span class="k">Dogma vs theologoumenon</span>'+esc(tr.dogma_note)+'</div>';
  if(tr.opinion_note) h+='<div class="gap"><span class="k">Magisterium vs opinion</span>'+esc(tr.opinion_note)+'</div>';
  if(tr.oriental) h+='<div class="gap"><span class="k">Oriental Orthodox</span>'+esc(tr.oriental)+'</div>';
  return h+'</div>';
}
function protHTML(tr,point){
  var h='<div class="col protestant"><h3>Protestant</h3>';
  if(tr.split_reason&&!point) h+='<p class="pos">'+esc(tr.split_reason)+'</p>';
  tr.rows.forEach(function(r){var k=FAM[r.family]; var hl=state.hl===k?' hl':'';
    h+='<div class="row'+hl+'"><h4>'+esc(r.family)+'</h4>';
    if(r.position&&!point) h+='<p class="pos">'+esc(r.position)+'</p>';
    var cl=filt(r.claims,point); cl.forEach(function(c){h+=claimHTML(c)});
    if(!cl.length) h+='<div class="gap">'+(r.claims&&r.claims.length?'No source for this point was opened for this family.':'No confession for this family could be opened this run, so no claim is shown.')+'</div>';
    h+='</div>'});
  return h+'</div>';
}
function tradHTML(q,point){
  var T=q.traditions;
  var h='<section class="block" id="traditions"><h2 class="sec">Traditions</h2>';
  h+='<div class="tools"><label class="hint" style="margin:0;align-self:center" for="hl">Highlight (nothing is hidden):</label><select id="hl" data-act="hl">';
  [["","None"],["orthodox","Eastern Orthodox"],["catholic","Catholic"],["lutheran","Lutheran"],["reformed","Reformed"],["anglican","Anglican"],["baptist","Baptist"],["wesleyan","Pentecostal / Wesleyan"]].forEach(function(o){h+='<option value="'+o[0]+'"'+(state.hl===o[0]?' selected':'')+'>'+o[1]+'</option>'});
  h+='</select></div><div class="cols">'+colHTML("orthodox","Eastern Orthodox",T.orthodox,point)+colHTML("catholic","Catholic",T.catholic,point)+protHTML(T.protestant,point)+'</div></section>';
  return h;
}
// ---------- scholar ----------
function trackHTML(t,claims,gap){
  var name=t==="A"?"Track A · historical-critical journals":"Track B · evangelical academic journals";
  var h='<div class="track '+t+'"><h4>'+name+'</h4>'; (claims||[]).forEach(function(c){h+=claimHTML(c)});
  if(!(claims||[]).length) h+='<div class="gap">'+esc(gap||"No item from this track was opened on this question.")+'</div>';
  return h+'</div>';
}
function scholarHTML(q){
  var s=q.scholar, h='<section class="block" id="scholar"><h2 class="sec">Scholar</h2>';
  h+='<p class="hint">Two named tracks, kept apart (see <a href="method.html">Method</a>). They are never averaged, and neither is called “the consensus”. Entries qualify only by appearing in a listed journal.</p>';
  s.questions.forEach(function(x,i){
    h+='<div class="q"><span class="badge '+x.status+'">'+BADGE[x.status]+'</span><h3>'+(i+1)+'. '+esc(x.q)+'</h3><p class="statement">'+esc(x.statement)+'</p>';
    if(x.status!=="unsourced") h+='<div class="tracks">'+trackHTML("A",x.A,x.A_gap)+trackHTML("B",x.B,x.B_gap)+'</div>';
    h+='</div>'});
  h+='<div class="gap"><span class="k">Coverage</span>'+esc(s.coverage)+'</div></section>';
  return h;
}
function histHTML(q){
  if(!q.history) return "";
  var h='<section class="block" id="history"><h2 class="sec">History of interpretation (optional)</h2><details class="hist"><summary>Show how the reading developed</summary>';
  q.history.forEach(function(e){h+='<div class="era"><h4>'+esc(e.era)+'</h4>'; (e.claims||[]).forEach(function(c){h+=claimHTML(c)}); if(e.gap) h+='<div class="gap">'+esc(e.gap)+'</div>'; h+='</div>'});
  return h+'</details></section>';
}
function srcListHTML(){
  var h='<section class="block" id="sources"><h2 class="sec">Sources on this page</h2><ol class="srcs">';
  state.srcOrder.forEach(function(k){var s=S[k]; h+='<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+'</a>'+(s.track?' · Track '+s.track:'')+' · '+esc(s.license||"")+'</li>'});
  return h+'</ol><p class="hint">All sources opened and checked on '+esc(PW.reviewed)+' (America/Denver). Quotes are short excerpts. A claim whose source could not be opened is left out.</p></section>';
}
function toolsHTML(q){
  return '<div class="tools"><a class="btn" href="#/print/'+q.id+'">One-page view</a><button data-act="print">Print</button><button data-act="copy">Copy link</button></div>';
}

// ---------- one-page view ----------
function cnums(claims){var n=(claims||[]).map(function(c){return cite(c.src)}); n=n.filter(function(x,i){return n.indexOf(x)===i}); return n.length?' <span class="cn">['+n.join(", ")+']</span>':''}
function onePage(q){
  state.srcOrder=[]; var isB=q.type==="belief", base=isB?byId[q.from_query]:q, pt=isB?q.point:null, h='<div class="one">';
  h+='<div class="onehead"><b>Parallel Witness</b> · private study tool · '+(isB?'Belief question':'Verse')+'</div>';
  if(isB) h+='<div class="notice">This describes teachings. It does not issue a ruling or give pastoral advice.</div>';
  h+='<h1 class="qtitle">'+esc(q.title)+'</h1><p class="overview">'+esc(q.summary)+'</p>';
  if(!isB){var t=base.text,B=PW.bible[t.key];
    h+='<div class="onetext">'+["web","kjv",t.original].map(function(c){return '<p><sup>'+t.focus+'</sup>'+esc(B[c].verses[String(t.focus)])+' <span class="cn">'+esc(c==="sblgnt"?"SBLGNT":c.toUpperCase())+'</span></p>'}).join("")+'</div>';}
  h+=gridHTML(base,pt).replace(/<p class="hint">[\s\S]*?<\/p>/,"");
  var T=base.traditions; h+='<div class="onecols">';
  function cell(name,tr){var cl=filt(tr.claims,pt); return '<div><h4>'+name+'</h4><p>'+(isB&&cl.length?esc(cl.map(function(c){return c.says||c.quote}).join(" ")):esc(tr.position||""))+(cl.length?cnums(cl):' <i>No source opened.</i>')+'</p></div>'}
  h+=cell("Eastern Orthodox",T.orthodox)+cell("Catholic",T.catholic);
  T.protestant.rows.forEach(function(r){h+=cell("Protestant · "+r.family,r)}); h+='</div>';
  if(!isB){h+='<h2 class="sec">Scholar (Track A historical-critical · Track B evangelical; never averaged)</h2><ul class="onesch">';
    base.scholar.questions.forEach(function(x){h+='<li><b>'+esc(x.q)+'</b> <span class="badge '+x.status+'">'+BADGE[x.status]+'</span><br>'+esc(x.statement)+((x.A||[]).length?' A:'+cnums(x.A):'')+((x.B||[]).length?' B:'+cnums(x.B):'')+'</li>'});
    h+='</ul>';}
  h+='<h2 class="sec">Sources</h2><ol class="srcs onesrc">'; state.srcOrder.forEach(function(k){h+='<li>'+esc(S[k].title.split(' — ')[0])+(S[k].track?' (Track '+S[k].track+')':'')+'</li>'}); h+='</ol>';
  h+='<p class="onefoot">Full quotations, arguments and links: '+esc(location.href.replace(/#.*$/,""))+'#/q/'+q.id+' · Sources checked '+esc(PW.reviewed)+' (America/Denver). Describes teachings; does not rule between them.</p>';
  return h+'<div class="tools"><button data-act="print">Print</button><a class="btn" href="#/q/'+q.id+'">Back to full page</a></div></div>';
}
// ---------- pages ----------
function renderQuery(q,print){
  state.srcOrder=[]; var h='';
  if(q.type==="belief"){
    var base=byId[q.from_query];
    h+='<div class="notice"><b>This describes teachings.</b> It does not issue a ruling or give pastoral advice.</div>';
    h+='<h1 class="qtitle">'+esc(q.title)+'</h1><p class="overview"><b>Overview</b>'+esc(q.summary)+'</p>'+(print?'':toolsHTML(q));
    h+=gridHTML(base,q.point)+tradHTML(base,q.point);
    h+='<section class="block"><h2 class="sec">Text and Scholar</h2><p class="hint">This belief question is drawn from the verse page for <a href="#/q/'+base.id+'">'+esc(base.ref)+'</a>, which shows the text first and the Scholar tracks.</p></section>';
  } else {
    h+='<h1 class="qtitle">'+esc(q.title)+'</h1><p class="overview"><b>Overview</b>'+esc(q.summary)+'</p>'+(print?'':toolsHTML(q));
    h+=textHTML(q,print)+gridHTML(q)+tradHTML(q)+scholarHTML(q)+(print?'<p class="hint pv-only">The optional history-of-interpretation row is left out of the one-page view.</p>':histHTML(q));
  }
  h+=srcListHTML();
  if(print) h+='<p class="hint pv-only">Parallel Witness, a private study tool. It describes teachings; it does not rule between them. Sources checked '+esc(PW.reviewed)+' (America/Denver). '+esc(location.href.replace(/#.*$/,""))+'#/q/'+q.id+'</p>';
  return h;
}

// ---------- Simple view ----------
var sn=0, pageTerms={};
function T(t){return esc(t).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,function(m,a,k){k=(k||a).trim().toLowerCase(); pageTerms[k]=1; return '<button type="button" class="term" data-term="'+esc(k)+'" aria-haspopup="dialog">'+a+'</button>'})}
function refHTML(r){
  if(r.indexOf("method:")===0) return '<div class="ref"><div class="rmeta">This app’s Method page</div><a href="method.html">Read the Method</a></div>';
  var c=CLAIM[r]; if(!c) return '';
  var s=S[c.src];
  return '<div class="ref"><div class="rmeta"><span class="lbl '+c.label.split(" ")[0]+'">'+esc(c.label)+'</span> '+esc(c.authority)+'</div><blockquote>“'+esc(c.quote)+'”</blockquote>'+
    '<div class="rlinks"><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title.split(" — ")[0])+'</a>'+(c.locator&&s.title.indexOf(c.locator)<0?' · '+esc(c.locator):'')+'</div>'+
    '<button type="button" class="jump" data-jump="'+esc(r)+'">See it in Full detail</button></div>';
}
function sline(Sx,cls){ if(!Sx) return ''; var id="src"+(++sn), n=Sx.refs.length;
  return '<div class="sline '+(cls||'')+'"><p>'+T(Sx.t)+' <button type="button" class="srcbtn" data-src="'+id+'" aria-expanded="false" aria-controls="'+id+'">'+(n>1?'Sources ('+n+')':'Source')+'</button></p>'+
    '<div class="srcbox" id="'+id+'" hidden><div class="srch">Where this comes from</div>'+Sx.refs.map(refHTML).join("")+'</div></div>'}
function cellsFor(base,pid){var p=(base.points||[]).filter(function(x){return x.id===pid})[0]; return p?p.cells:{}}
function missing(base,pid){ if(!pid) return '';
  var c=cellsFor(base,pid), m=Object.keys(FAMNAME).filter(function(k){return (c[k]||"none")==="none"}).map(function(k){return FAMNAME[k]});
  return m.length?'<p class="missing">Not checked yet: '+esc(m.join(", "))+' (no source opened, so nothing is said).</p>':''}
var TRCLS={orthodox:"orthodox",catholic:"catholic"};
function cardHTML(cd){var k=cd.fam.length===1?cd.fam[0]:"multi";
  return '<div class="scard trad '+(cd.group?'prot ':'')+esc(k)+'"><h3>'+esc(cd.who)+'</h3>'+cd.s.map(function(x){return sline(x)}).join("")+'</div>'}
function simpleHTML(q){
  var sp=(PW.simple||{})[q.id]; if(!sp) return null;
  sn=0; pageTerms={};
  var isB=q.type==="belief", base=isB?byId[q.from_query]:q, h='';
  if(isB) h+='<div class="notice"><b>This page explains what different churches teach.</b> It doesn’t say who is right, and it isn’t personal or pastoral advice.</div>';
  h+='<h1 class="qtitle simple">'+esc(sp.title)+'</h1>';
  if(!isB){ var t=base.text, B=PW.bible[t.key][sp.verse.tr];
    h+='<section class="sblock"><div class="sverse"><p class="vt">'+esc(B.verses[String(t.focus)])+'</p><div class="lab">'+esc(base.ref)+' · '+esc(B.name)+' (public domain)</div></div>'+
      '<div class="plain"><div class="ptag">In plain words <span>· a summary, not a Bible translation</span></div>'+sline(sp.verse.plain)+'</div></section>';
  } else h+='<p class="based">Based on the sources for <a href="#/q/'+base.id+'">'+esc(base.ref)+'</a>.</p>';
  h+='<section class="sblock"><h2 class="sh">The big question</h2><div class="scard big">'+sline(sp.big)+'</div></section>';
  if((sp.agree||[]).length){ h+='<section class="sblock"><h2 class="sh">Where Christians agree</h2>';
    sp.agree.forEach(function(a){h+='<div class="scard agree">'+a.s.map(function(x){return sline(x)}).join("")+missing(base,a.point)+'</div>'}); h+='</section>'}
  h+='<section class="sblock"><h2 class="sh">Where they differ</h2>';
  if(sp.differ_intro&&sp.intro_where==="top") h+='<div class="intro">'+sline(sp.differ_intro)+'</div>';
  var nonP=sp.differ.filter(function(c){return !c.group}), P=sp.differ.filter(function(c){return c.group});
  nonP.forEach(function(c){h+=cardHTML(c)});
  if(P.length){ h+='<h3 class="sgroup">Protestant churches <span>· they don’t all agree, so each family is shown</span></h3>';
    if(sp.differ_intro&&sp.intro_where!=="top") h+='<div class="intro">'+sline(sp.differ_intro)+'</div>';
    P.forEach(function(c){h+=cardHTML(c)}); }
  h+=missing(base,sp.differ_point)+'</section>';
  h+='<section class="sblock"><h2 class="sh">What scholars say</h2>';
  if((sp.scholars||[]).length){
    h+='<p class="hint">Scholars here come in two groups, called '+T("[[tracks|track]]")+'. The app keeps them apart and never blends them.</p>';
    sp.scholars.forEach(function(it){ var x=it.sq!=null?base.scholar.questions[it.sq]:null;
      h+='<div class="scard sch">'+(x?'<span class="badge '+x.status+'">'+SBADGE[x.status]+'</span>':'');
      if(it.s.length) h+=it.s.map(function(z){return sline(z,/^\[\[Track A/.test(z.t)?"tA":(/^\[\[Track B/.test(z.t)?"tB":""))}).join("");
      else if(x) h+='<p>No checked article from either track on this question: '+esc(x.q)+'</p>';
      h+='</div>'});
    var nq=(base.scholar.questions||[]).length, shown=sp.scholars.filter(function(x){return x.sq!=null}).length;
    if(!isB&&nq>shown) h+='<p class="hint">Full detail shows all '+nq+' scholar questions, with each track’s quotes.</p>';
  } else h+='<p class="hint">Scholar articles weren’t checked separately for this belief question. The <a href="#/q/'+base.id+'">'+esc(base.ref)+'</a> page shows what scholars say about the verse.</p>';
  h+='</section>';
  var tl=Object.keys(pageTerms).filter(function(k){return PW.glossary[k]});
  if(tl.length) h+='<section class="sblock"><h2 class="sh">Words to know</h2><div class="words">'+tl.map(function(k){return '<button type="button" class="term chip" data-term="'+esc(k)+'" aria-haspopup="dialog">'+esc(PW.glossary[k].word)+'</button>'}).join("")+'</div></section>';
  h+='<div class="tofull"><p>Want every quote, every source, and the history behind it?</p><button type="button" data-view="full">Open Full detail</button></div>';
  return h;
}
function viewToggle(){
  return '<div class="viewtog" role="group" aria-label="Amount of detail"><button type="button" data-view="simple" aria-pressed="'+(state.view==="simple")+'" class="'+(state.view==="simple"?"on":"")+'">Simple</button><button type="button" data-view="full" aria-pressed="'+(state.view==="full")+'" class="'+(state.view==="full"?"on":"")+'">Full detail</button></div>';
}

function homeHTML(){
  return '<section class="block"><p class="hint">Type a verse any way you like: “jn 3 16”, “Mt 16.18”, “1 Cor 13:4”. Suggestions appear as you type. Only entries whose every claim was opened and checked can be shown. Anything else gets a “not in the sourced corpus yet” note, and nothing is made up.</p></section>';
}
function notFound(text){
  var r=resolve(text,state.mode), p=r.parse||{}, h='';
  if(p.ok){
    h+='<div class="notice"><b>'+esc(p.label)+'</b> is not in the sourced corpus yet.</div>';
    h+='<p class="understood">We read “'+esc(text)+'” as <b>'+esc(p.label)+'</b>'+(p.kind==="chapter"?' (the whole chapter)':(p.kind==="book"?' (the whole book)':''))+'.</p>';
  } else if(p.error==="chapter"){
    var bk=BK.BOOKS[p.b]; h+='<div class="notice">“'+esc(text)+'” doesn’t match a chapter. '+esc(bk.name)+' has '+bk.ch+' chapter'+(bk.ch>1?'s':'')+'.</div>';
  } else if(p.books&&p.books.length){
    h+='<div class="notice">“'+esc(text)+'” is not in the sourced corpus yet.</div><p class="understood">Which book did you mean?</p><div class="chips">'+
      p.books.slice(0,6).map(function(b){var l=BK.BOOKS[b].name+(p.nums?" "+p.nums:""); return '<button type="button" data-fill="'+esc(l)+'" data-submit="1">'+esc(BK.BOOKS[b].name)+'</button>'}).join("")+'</div>';
  } else {
    h+='<div class="notice">“'+esc(text)+'” is not in the sourced corpus yet.</div><p class="understood">'+(state.mode==="belief"?'It didn’t match a belief question that has been sourced.':'It didn’t match a Bible book or a sourced entry.')+'</p>';
  }
  h+='<p class="hint">This app only shows answers it has checked against real sources, so it won’t make one up.</p>';
  h+='<h2 class="sh">Closest available</h2><ul class="closest">'+closest(p,text).map(function(q){return '<li><a href="#/q/'+q.id+'"><b>'+esc(q.ref||q.title)+'</b><span>'+(q.type==="belief"?'Belief question · ':'')+'Fully sourced</span></a></li>'}).join("")+'</ul>';
  return h;
}
function askHTML(){
  var chips=PW.queries.filter(function(q){return q.type===state.mode}).map(function(q){return '<button type="button" data-q="'+q.id+'">'+esc(q.ref||q.title)+'</button>'}).join("");
  return '<div class="ask"><div class="seg" role="group" aria-label="Search for"><button type="button" data-mode="verse" aria-pressed="'+(state.mode==="verse")+'" class="'+(state.mode==="verse"?"on":"")+'">Verse</button><button type="button" data-mode="belief" aria-pressed="'+(state.mode==="belief")+'" class="'+(state.mode==="belief"?"on":"")+'">Belief</button></div>'+
   '<form id="f" role="search"><div class="combo"><label class="sr" for="qin" id="qin-l">'+(state.mode==="verse"?'Verse':'Belief question')+'</label>'+
   '<input id="qin" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sugg" aria-labelledby="qin-l" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="'+(state.mode==="verse"?'e.g. John 3:16 or jn 3 16':'e.g. Is the pope Peter’s successor?')+'">'+
   '<ul id="sugg" role="listbox" aria-label="Suggestions" hidden></ul></div><button class="go">Compare</button></form>'+
   '<div id="sugg-status" class="sr" aria-live="polite"></div>'+
   (state.mode==="belief"?'<p class="hint"><b>Belief mode describes teachings.</b> It does not issue a ruling or give pastoral advice.</p>':'')+
   '<div class="chips">'+chips+'</div></div>';
}
function noteHTML(){ var n=state.note; state.note=null; if(!n) return '';
  return '<div class="understood-note" role="status">'+esc(n)+'</div>'}
function setNav(i){var nav=document.querySelectorAll("nav.links a"); for(var k=0;k<nav.length;k++) nav[k].classList.toggle("on",k===i)}
function route(){
  var hsh=location.hash.replace(/^#\/?/,""), parts=hsh.split("/"), main=$("#main"), jumped=false;
  document.body.classList.remove("printview"); closeSheet(true);
  if(parts[0]==="method"&&window.PW_METHOD){main.innerHTML='<main class="method">'+window.PW_METHOD+'</main>'; document.title="Method · Parallel Witness"; setNav(1); return false}
  setNav(0);
  if(parts[0]==="print"&&byId[parts[1]]){document.body.classList.add("printview"); main.innerHTML=onePage(byId[parts[1]]); document.title=(byId[parts[1]].ref||byId[parts[1]].title)+" · Parallel Witness"; return false}
  if(parts[0]==="q"&&byId[parts[1]]){var q=byId[parts[1]]; state.mode=q.type;
    var simple=state.view==="simple"?simpleHTML(q):null;
    main.innerHTML=askHTML()+noteHTML()+viewToggle()+(simple!==null?simple:renderQuery(q,false)); document.body.classList.toggle("simpleview",simple!==null);
    document.title=(q.ref||q.title)+" · Parallel Witness";
    if(state.jump){var cid=state.jump; state.jump=null; var el=document.getElementById("c-"+cid);
      if(!el&&CLAIMQ[cid]&&CLAIMQ[cid]!==q.id){state.jump=cid; go("#/q/"+CLAIMQ[cid]); return true}
      if(el){var d=el.closest("details"); if(d) d.open=true; el.classList.add("flash"); setTimeout(function(){el.scrollIntoView({block:"center"}); try{el.focus({preventScroll:true})}catch(e){}},30); jumped=true}}
    return jumped}
  document.body.classList.remove("simpleview");
  if(parts[0]==="find"){var txt=decodeURIComponent(parts.slice(2).join("/")); state.mode=parts[1]==="belief"?"belief":"verse"; main.innerHTML=askHTML()+notFound(txt); var i=$("#qin"); if(i) i.value=txt; document.title="Not sourced yet · Parallel Witness"; return false}
  main.innerHTML=askHTML()+homeHTML(); document.title="Parallel Witness"; return false;
}
function go(h){ if(location.hash===h){ if(!route()) scrollTo(0,0) } else location.hash=h }
function submitText(v){
  v=String(v||"").trim(); if(!v) return;
  state.last=v; var r=resolve(v,state.mode);
  if(r.go){ var p=r.parse;
    if(r.partial) state.note="You asked for "+p.label+". Only "+r.go.ref+" is sourced so far, so that is what’s shown.";
    else if(p&&p.ok&&p.how!=="exact") state.note="Showing "+(r.go.ref||r.go.title)+" (we read “"+v+"” as "+p.label+").";
    go("#/q/"+r.go.id);
  } else go("#/find/"+state.mode+"/"+encodeURIComponent(v));
}
// ---------- combobox ----------
var sug={items:[],active:-1};
function renderSugg(){
  var inp=$("#qin"), ul=$("#sugg"); if(!inp||!ul) return;
  var items=sug.items=inp.value.trim()?suggest(inp.value,state.mode):[]; sug.active=-1;
  if(!items.length){ul.hidden=true; ul.innerHTML=""; inp.setAttribute("aria-expanded","false"); inp.removeAttribute("aria-activedescendant"); $("#sugg-status").textContent=inp.value.trim()?"No suggestions":""; return}
  ul.innerHTML=items.map(function(it,i){return '<li role="option" id="opt-'+i+'" aria-selected="false" data-i="'+i+'" class="'+(it.ok?'ok':(it.act==="none"?'dis':''))+'"'+(it.act==="none"?' aria-disabled="true"':'')+'><span class="ol">'+esc(it.label)+'</span><span class="os">'+(it.ok?'<span class="tick" aria-hidden="true">✓</span> ':'')+esc(it.sub)+'</span></li>'}).join("");
  ul.hidden=false; inp.setAttribute("aria-expanded","true");
  $("#sugg-status").textContent=items.length+" suggestion"+(items.length>1?"s":"")+". Use up and down arrows to choose.";
}
function setActive(i){var ul=$("#sugg"), inp=$("#qin"); if(!ul) return; var n=sug.items.length; if(!n) return;
  sug.active=(i+n)%n; [].forEach.call(ul.children,function(li,k){li.setAttribute("aria-selected",k===sug.active?"true":"false")});
  inp.setAttribute("aria-activedescendant","opt-"+sug.active); var li=ul.children[sug.active]; if(li&&li.scrollIntoView) li.scrollIntoView({block:"nearest"})}
function closeSugg(){var ul=$("#sugg"), inp=$("#qin"); if(ul){ul.hidden=true} if(inp){inp.setAttribute("aria-expanded","false"); inp.removeAttribute("aria-activedescendant")} sug.active=-1}
function choose(it){ if(!it||it.act==="none") return; var inp=$("#qin");
  if(it.act==="go"){closeSugg(); state.last=inp?inp.value:""; go("#/q/"+it.id)}
  else if(it.act==="find"){closeSugg(); submitText(it.text)}
  else if(it.act==="fill"){inp.value=it.text; inp.focus(); renderSugg()} }
document.addEventListener("input",function(e){if(e.target.id==="qin") renderSugg()});
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&!$("#sheet").hidden){closeSheet(); return}
  if(e.target.id!=="qin") return; var ul=$("#sugg"), open=ul&&!ul.hidden;
  if(e.key==="ArrowDown"){e.preventDefault(); if(!open) renderSugg(); setActive(sug.active+1)}
  else if(e.key==="ArrowUp"){e.preventDefault(); if(open) setActive(sug.active-1)}
  else if(e.key==="Escape"){if(open){e.preventDefault(); closeSugg()}}
  else if(e.key==="Enter"&&open&&sug.active>=0){e.preventDefault(); choose(sug.items[sug.active])}
});
document.addEventListener("focusout",function(e){if(e.target.id==="qin") setTimeout(function(){var a=document.activeElement; if(!a||a.id!=="qin") closeSugg()},180)});
document.addEventListener("focusin",function(e){if(e.target.id==="qin"&&e.target.value.trim()) renderSugg()});
document.addEventListener("mousedown",function(e){if(e.target.closest("#sugg li")) e.preventDefault()});
// ---------- glossary sheet ----------
var sheetFrom=null;
function openSheet(k,btn){var g=PW.glossary[k]; if(!g) return; var sh=$("#sheet"); sheetFrom=btn;
  sh.innerHTML='<div class="sheet-in"><h3 id="sheet-h">'+esc(g.word)+'</h3><p>'+esc(g.t)+'</p><div class="sheet-src"><span class="k">Based on</span>'+
    g.refs.map(function(r){if(r.indexOf("method:")===0) return '<a href="method.html">This app’s Method page</a>'; var c=CLAIM[r]; return c?'<a href="'+esc(S[c.src].url)+'" target="_blank" rel="noopener noreferrer">'+esc(S[c.src].title.split(" — ")[0])+'</a>':''}).filter(function(x,i,a){return x&&a.indexOf(x)===i}).join(" · ")+
    '</div><button type="button" class="close" data-act="closesheet">Close</button></div>';
  sh.hidden=false; var c=sh.querySelector(".close"); if(c) c.focus()}
function closeSheet(silent){var sh=$("#sheet"); if(!sh||sh.hidden) return; sh.hidden=true; if(!silent&&sheetFrom&&document.body.contains(sheetFrom)) sheetFrom.focus(); sheetFrom=null}
// ---------- clicks ----------
document.addEventListener("click",function(e){
  var li=e.target.closest("#sugg li"); if(li){choose(sug.items[+li.dataset.i]); return}
  var sh=$("#sheet"); if(sh&&!sh.hidden&&!e.target.closest("#sheet")&&!e.target.closest(".term")) closeSheet(true);
  var b=e.target.closest("[data-mode],[data-q],[data-act],[data-view],[data-src],[data-term],[data-jump],[data-fill]"); if(!b||b.tagName==="SELECT") return;
  if(b.dataset.mode){state.mode=b.dataset.mode; go("#/"); var i=$("#qin"); if(i) i.focus(); return}
  if(b.dataset.q){go("#/q/"+b.dataset.q); return}
  if(b.dataset.view){var y=scrollY, was=state.view; state.view=b.dataset.view; lsSet("pw-view",state.view); route(); if(was===state.view) return; var t=$(".viewtog"); if(t&&b.closest(".viewtog")) scrollTo(0,Math.min(y,t.getBoundingClientRect().top+scrollY-70)); else scrollTo(0,0); return}
  if(b.dataset.src){var box=document.getElementById(b.dataset.src), open=b.getAttribute("aria-expanded")==="true"; b.setAttribute("aria-expanded",open?"false":"true"); box.hidden=open; return}
  if(b.dataset.term){e.preventDefault(); openSheet(b.dataset.term,b); return}
  if(b.dataset.jump){state.view="full"; lsSet("pw-view","full"); state.jump=b.dataset.jump; if(!route()) scrollTo(0,0); return}
  if(b.dataset.fill){var inp=$("#qin"); if(inp){inp.value=b.dataset.fill; if(b.dataset.submit) submitText(b.dataset.fill); else {inp.focus(); renderSugg()}} return}
  var a=b.dataset.act;
  if(a==="closesheet"){closeSheet(); return}
  if(a==="ctx"){state.ctx=!state.ctx; route()}
  if(a==="print"){window.print()}
  if(a==="copy"){var u=location.href; (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){toast("Link copied")},function(){prompt("Copy this link",u)})}
});
document.addEventListener("change",function(e){if(e.target.id==="hl"){state.hl=e.target.value; lsSet("pw-hl",state.hl); var y=scrollY; route(); scrollTo(0,y)}});
document.addEventListener("submit",function(e){if(e.target.id!=="f") return; e.preventDefault(); closeSugg(); var v=$("#qin").value; if(document.activeElement) document.activeElement.blur(); submitText(v)});
function toast(m){var t=$("#toast"); t.textContent=m; t.classList.add("on"); setTimeout(function(){t.classList.remove("on")},1500)}
window.addEventListener("hashchange",function(){if(!route()) scrollTo(0,0)});
window.PWDebug={resolve:resolve,suggest:suggest,parse:BK.parse};
route();
})();
