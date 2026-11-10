(function(){
"use strict";
var PW=window.PW, S=PW.sources, $=function(s,r){return (r||document).querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var FAM={"Lutheran":"lutheran","Reformed":"reformed","Anglican":"anglican","Baptist":"baptist","Pentecostal / Wesleyan":"wesleyan"};
var COLS=[["orthodox","Orthodox"],["catholic","Catholic"],["lutheran","Lutheran"],["reformed","Reformed"],["anglican","Anglican"],["baptist","Baptist"],["wesleyan","Pent./Wesl."]];
var STANCE={affirms:"Affirms",denies:"Denies",dogma:"Affirms (defined dogma)",both:"Peter and his confession",christ:"Christ is the rock",
  wording:"Liturgical wording only",distinguishes:"Sufficient for all, effective for the elect",differ:"Its confessions differ",none:"No source opened"};
var BADGE={agree:"Both tracks agree","disagree":"The tracks disagree","one-track":"Only one track opened",unsourced:"No opened source"};
var state={mode:"verse",hl:localStorage.getItem("pw-hl")||"",srcOrder:[]};
var byId={}; PW.queries.forEach(function(q){byId[q.id]=q});
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
// ---------- citation numbering ----------
function cite(src){var i=state.srcOrder.indexOf(src); if(i<0){state.srcOrder.push(src); i=state.srcOrder.length-1} return i+1}
function srcLink(c){var s=S[c.src]; var n=cite(c.src);
  return '<div class="cite">['+n+'] <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+'</a>'+(c.locator?' — '+esc(c.locator):'')+'</div>'}
function labelClass(l){return l.split(" ")[0]}
function claimHTML(c){
  var h='<div class="claim"><div class="meta"><span class="lbl '+labelClass(c.label)+'">'+esc(c.label)+'</span><span>'+esc(c.authority)+'</span></div>';
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
function homeHTML(){
  return '<section class="block"><p class="hint">Only queries whose every claim was opened and checked are listed. Anything else returns nothing: no text is generated.</p></section>';
}
function notFound(text){
  var list=PW.queries.filter(function(q){return q.type===state.mode}).map(function(q){return '<li><a href="#/q/'+q.id+'">'+esc(q.ref||q.title)+'</a></li>'}).join("");
  return '<div class="notice">“'+esc(text)+'” is not in the sourced corpus yet. Nothing is generated, so no answer is shown.</div><p class="hint">Available '+(state.mode==="belief"?'belief questions':'verses')+':</p><ul class="hint">'+list+'</ul>';
}
function askHTML(){
  var chips=PW.queries.filter(function(q){return q.type===state.mode}).map(function(q){return '<button data-q="'+q.id+'">'+esc(q.ref||q.title)+'</button>'}).join("");
  return '<div class="ask"><div class="seg" role="tablist"><button data-mode="verse" class="'+(state.mode==="verse"?"on":"")+'">Verse</button><button data-mode="belief" class="'+(state.mode==="belief"?"on":"")+'">Belief</button></div>'+
   '<form id="f"><input id="qin" autocomplete="off" enterkeyhint="search" placeholder="'+(state.mode==="verse"?'e.g. John 3:16':'e.g. Is the pope Peter’s successor?')+'" aria-label="Query"><button class="go">Compare</button></form>'+
   (state.mode==="belief"?'<p class="hint"><b>Belief mode describes teachings.</b> It does not issue a ruling or give pastoral advice.</p>':'')+
   '<div class="chips">'+chips+'</div></div>';
}
function route(){
  var hsh=location.hash.replace(/^#\/?/,""), parts=hsh.split("/"), main=$("#main");
  document.body.classList.remove("printview");
  if(parts[0]==="print"&&byId[parts[1]]){document.body.classList.add("printview"); main.innerHTML=onePage(byId[parts[1]]); document.title=(byId[parts[1]].ref||byId[parts[1]].title)+" · Parallel Witness"; return}
  if(parts[0]==="q"&&byId[parts[1]]){var q=byId[parts[1]]; state.mode=q.type; main.innerHTML=askHTML()+renderQuery(q,false); document.title=(q.ref||q.title)+" · Parallel Witness"; return}
  if(parts[0]==="find"){var txt=decodeURIComponent(parts.slice(2).join("/")); state.mode=parts[1]==="belief"?"belief":"verse"; main.innerHTML=askHTML()+notFound(txt); return}
  main.innerHTML=askHTML()+homeHTML(); document.title="Parallel Witness";
}
document.addEventListener("click",function(e){
  var b=e.target.closest("[data-mode],[data-q],[data-act]"); if(!b||b.tagName==="SELECT") return;
  if(b.dataset.mode){state.mode=b.dataset.mode; location.hash="#/"; route(); return}
  if(b.dataset.q){location.hash="#/q/"+b.dataset.q; return}
  var a=b.dataset.act;
  if(a==="ctx"){state.ctx=!state.ctx; route()}
  if(a==="print"){window.print()}
  if(a==="copy"){var u=location.href; (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){toast("Link copied")},function(){prompt("Copy this link",u)})}
});
document.addEventListener("change",function(e){if(e.target.id==="hl"){state.hl=e.target.value; localStorage.setItem("pw-hl",state.hl); var y=scrollY; route(); scrollTo(0,y)}});
document.addEventListener("submit",function(e){if(e.target.id!=="f") return; e.preventDefault(); var v=$("#qin").value; var q=match(v,state.mode)||match(v,null);
  location.hash=q?"#/q/"+q.id:"#/find/"+state.mode+"/"+encodeURIComponent(v)});
function toast(m){var t=$("#toast"); t.textContent=m; t.classList.add("on"); setTimeout(function(){t.classList.remove("on")},1500)}
window.addEventListener("hashchange",function(){route(); scrollTo(0,0)});
route();
})();
