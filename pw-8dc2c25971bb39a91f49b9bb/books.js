/* Parallel Witness: 66-book table (Protestant / KJV order) and a forgiving reference parser.
   Each book: [display name, chapters, testament, aliases...]. Aliases are lowercase with no spaces or dots.
   Numbered books list their base aliases once; the parser adds the number (1, I, 1st, First …). */
(function(){
"use strict";
var B=[
["Genesis",50,"OT","genesis","gen","ge","gn"],
["Exodus",40,"OT","exodus","exod","exo","ex","exd"],
["Leviticus",27,"OT","leviticus","lev","le","lv"],
["Numbers",36,"OT","numbers","num","nu","nm","nb"],
["Deuteronomy",34,"OT","deuteronomy","deut","deu","de","dt"],
["Joshua",24,"OT","joshua","josh","jos","jsh"],
["Judges",21,"OT","judges","judg","jdg","jg","jdgs"],
["Ruth",4,"OT","ruth","rth","ru"],
["1 Samuel",31,"OT","#1","samuel","sam","sa","sm"],
["2 Samuel",24,"OT","#2","samuel","sam","sa","sm"],
["1 Kings",22,"OT","#1","kings","kgs","ki","kin","kg"],
["2 Kings",25,"OT","#2","kings","kgs","ki","kin","kg"],
["1 Chronicles",29,"OT","#1","chronicles","chron","chr","chro","ch"],
["2 Chronicles",36,"OT","#2","chronicles","chron","chr","chro","ch"],
["Ezra",10,"OT","ezra","ezr"],
["Nehemiah",13,"OT","nehemiah","neh","ne"],
["Esther",10,"OT","esther","esth","est","es"],
["Job",42,"OT","job","jb"],
["Psalms",150,"OT","psalms","psalm","ps","psa","pss","psm","pslm","psalter"],
["Proverbs",31,"OT","proverbs","proverb","prov","pro","prv","pr"],
["Ecclesiastes",12,"OT","ecclesiastes","eccl","eccles","ecc","ec","qoh","qoheleth"],
["Song of Songs",8,"OT","songofsongs","songofsolomon","song","songs","sos","sng","ss","canticles","canticleofcanticles","canticle","cant"],
["Isaiah",66,"OT","isaiah","isa","is"],
["Jeremiah",52,"OT","jeremiah","jer","je","jr"],
["Lamentations",5,"OT","lamentations","lam","la"],
["Ezekiel",48,"OT","ezekiel","ezek","eze","ezk"],
["Daniel",12,"OT","daniel","dan","da","dn"],
["Hosea",14,"OT","hosea","hos","ho"],
["Joel",3,"OT","joel","jl"],
["Amos",9,"OT","amos","am"],
["Obadiah",1,"OT","obadiah","obad","ob"],
["Jonah",4,"OT","jonah","jon","jnh"],
["Micah",7,"OT","micah","mic","mc"],
["Nahum",3,"OT","nahum","nah","na"],
["Habakkuk",3,"OT","habakkuk","hab","hb"],
["Zephaniah",3,"OT","zephaniah","zeph","zep","zp"],
["Haggai",2,"OT","haggai","hag","hg"],
["Zechariah",14,"OT","zechariah","zech","zec","zc"],
["Malachi",4,"OT","malachi","mal","ml"],
["Matthew",28,"NT","matthew","matt","mat","mt"],
["Mark",16,"NT","mark","mrk","mar","mk","mr"],
["Luke",24,"NT","luke","luk","lk"],
["John",21,"NT","john","jn","jhn","joh"],
["Acts",28,"NT","acts","act","ac","actsoftheapostles"],
["Romans",16,"NT","romans","rom","ro","rm"],
["1 Corinthians",16,"NT","#1","corinthians","cor","co","corinth"],
["2 Corinthians",13,"NT","#2","corinthians","cor","co","corinth"],
["Galatians",6,"NT","galatians","gal","ga"],
["Ephesians",6,"NT","ephesians","eph","ephes"],
["Philippians",4,"NT","philippians","phil","php","pp","philip"],
["Colossians",4,"NT","colossians","col"],
["1 Thessalonians",5,"NT","#1","thessalonians","thess","thes","th"],
["2 Thessalonians",3,"NT","#2","thessalonians","thess","thes","th"],
["1 Timothy",6,"NT","#1","timothy","tim","ti","tm"],
["2 Timothy",4,"NT","#2","timothy","tim","ti","tm"],
["Titus",3,"NT","titus","tit"],
["Philemon",1,"NT","philemon","philem","phlm","phm","phile"],
["Hebrews",13,"NT","hebrews","heb","he"],
["James",5,"NT","james","jas","jam","jm","jms"],
["1 Peter",5,"NT","#1","peter","pet","pe","pt","ptr"],
["2 Peter",3,"NT","#2","peter","pet","pe","pt","ptr"],
["1 John",5,"NT","#1","john","jn","jhn","joh","jo"],
["2 John",1,"NT","#2","john","jn","jhn","joh","jo"],
["3 John",1,"NT","#3","john","jn","jhn","joh","jo"],
["Jude",1,"NT","jude","jd"],
["Revelation",22,"NT","revelation","revelations","rev","re","rv","apocalypse","apoc","revelationofjohn"]
];
var BOOKS=[], ALIAS={}, KEYS=[];
B.forEach(function(r,i){
  var num="", al=r.slice(3);
  if(al[0]&&al[0].charAt(0)==="#"){num=al.shift().slice(1)}
  var bk={i:i,name:r[0],ch:r[1],t:r[2],num:num,aliases:[]};
  al.forEach(function(a){var k=num+a; bk.aliases.push(k); if(!(k in ALIAS)){ALIAS[k]=i; KEYS.push(k)}});
  BOOKS.push(bk);
});
var NUMW={"1":"1","2":"2","3":"3","i":"1","ii":"2","iii":"3","1st":"1","2nd":"2","3rd":"3","first":"1","second":"2","third":"3","one":"1","two":"2","three":"3"};
// Damerau-Levenshtein (optimal string alignment)
function dist(a,b){var m=a.length,n=b.length,d=[],i,j;
  for(i=0;i<=m;i++){d[i]=[i]} for(j=0;j<=n;j++){d[0][j]=j}
  for(i=1;i<=m;i++)for(j=1;j<=n;j++){var c=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)}
  return d[m][n]}
function clean(s){return String(s||"").toLowerCase().replace(/[\u2013\u2014\u2212]/g,"-").replace(/[\u2019']/g,"").replace(/\s+/g," ").trim()}
// Resolve a book phrase. Returns {exact:[i], prefix:[i...], fuzzy:[i...]}
function findBook(phrase){
  var p=clean(phrase).replace(/\./g," ").replace(/\s+/g," ").trim();
  p=p.replace(/^(the\s+)?(holy\s+)?(gospel\s+(of|according\s+to)\s+(saint\s+|st\s+)?|book\s+of\s+(the\s+)?|(first|second|third|1st|2nd|3rd|[123])?\s*(epistle|letter)\s+(of\s+|to\s+)(the\s+)?|saint\s+|st\s+)/,function(m){var n=m.match(/(first|second|third|1st|2nd|3rd|[123])/); return n?n[1]+" ":""});
  var num="", m=p.match(/^(iii|ii|i|1st|2nd|3rd|first|second|third|one|two|three)\s+(.*)$/)||p.match(/^([123])\s*([a-z].*)$/);
  if(m){num=NUMW[m[1]]; p=m[2]}
  p=p.replace(/^(saint|st)\s+/,"").replace(/\s+(epistle|letter)$/,"");
  var key=num+p.replace(/[^a-z]/g,"");
  var out={exact:[],prefix:[],fuzzy:[],key:key,num:num};
  if(!p.replace(/[^a-z]/g,"")) return out;
  if(key in ALIAS){out.exact=[ALIAS[key]]; return out}
  var seen={};
  KEYS.forEach(function(k){ if(k.length>key.length && k.indexOf(key)===0 && (!num||k.charAt(0)===num) && !seen[ALIAS[k]]){seen[ALIAS[k]]=1; out.prefix.push(ALIAS[k])} });
  var base=key.replace(/^[123]/,"");
  if(base.length>=3){
    var lim=base.length<=4?1:(base.length<=8?2:3);
    var pass=function(keys){var best=99, cand=[];
      keys.forEach(function(k){ if(num&&k.charAt(0)!==num) return; if(!num&&/^[123]/.test(k)) return;
        var kb=k.replace(/^[123]/,""); if(kb.length<3) return;
        var d=dist(base,kb); if(d<=lim){ if(d<best){best=d;cand=[]} if(d===best&&cand.indexOf(ALIAS[k])<0) cand.push(ALIAS[k]) } });
      return cand};
    // full book names first (so "jhon" is John, not the Jonah abbreviation "jon"), then every alias
    var full=pass(BOOKS.map(function(b){return b.aliases[0]}));
    out.fuzzy=full.length?full:pass(KEYS);
  }
  return out;
}
function label(r){
  var b=BOOKS[r.b], n=b.name; if(b.name==="Psalms"&&(r.kind==="chapter"||r.kind==="verse"||r.kind==="range")&&!(r.c2&&r.c2!==r.c)) n="Psalm";
  if(r.kind==="book") return b.name;
  var s=n+" "+(b.ch===1&&r.v?"":r.c+(r.v?":":""))+(r.v||"");
  if(b.ch===1&&r.v) s=n+" "+r.v;
  if(r.kind==="chapter") return n+" "+r.c+(r.c2&&r.c2!==r.c?"\u2013"+r.c2:"");
  if(r.c2&&r.c2!==r.c) s+="\u2013"+r.c2+":"+r.v2;
  else if(r.v2&&r.v2!==r.v) s+="\u2013"+r.v2;
  return s;
}
// Parse a reference. Returns {ok, b, c, v, c2, v2, kind, label, how, books(ambiguous), error}
function parse(text){
  var t=clean(text); if(!t) return {ok:false,empty:true};
  var m=t.match(/^(.*?[a-z][a-z.\s]*?)\s*(\d[\d\s:.,v\-]*(?:verses?|vv?)?[\d\s:.,v\-]*)?$/);
  // keep a leading book number ("1 cor 13:4", "1cor13:4")
  if(!m) return {ok:false};
  var bookPart=m[1], nums=(m[2]||"").trim();
  var fb=findBook(bookPart), cands=fb.exact.length?fb.exact:(fb.prefix.length===1?fb.prefix:(fb.fuzzy.length===1&&!fb.prefix.length?fb.fuzzy:[]));
  var res={ok:false,input:text,bookKey:fb.key,nums:nums,bookText:bookPart.trim()};
  if(!cands.length){res.books=fb.prefix.concat(fb.fuzzy.filter(function(x){return fb.prefix.indexOf(x)<0})); res.error=res.books.length?"ambiguous":"nobook"; return res}
  res.b=cands[0]; res.how=fb.exact.length?"exact":(fb.prefix.length?"prefix":"fuzzy");
  var bk=BOOKS[res.b];
  if(!nums){res.ok=true; res.kind="book"; res.label=bk.name; return res}
  var s=nums.replace(/verses?|vv?\.?/g,":").replace(/[.,]/g,":").replace(/\s*:\s*/g,":").replace(/\s*-\s*/g,"-").replace(/\s+/g,":").replace(/:+/g,":").replace(/[:\-]+$/,"");
  var n=s.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
  if(!n){res.error="numbers"; return res}
  var a=+n[1], b=n[2]?+n[2]:null, c=n[3]?+n[3]:null, d=n[4]?+n[4]:null;
  if(bk.ch===1&&b===null){ b=a; a=1; if(c!==null&&d===null){} }   // Jude 3 = Jude 1:3
  res.c=a; res.v=b;
  if(b===null){ res.kind="chapter"; if(c!==null) res.c2=c; }
  else if(c!==null&&d!==null){ res.kind="range"; res.c2=c; res.v2=d }
  else if(c!==null){ res.kind="range"; res.v2=c }
  else res.kind="verse";
  if(a<1||a>bk.ch||(res.c2&&res.c2>bk.ch)){ res.error="chapter"; res.label=label(res); return res }
  if(res.v===0){res.error="numbers"; return res}
  res.ok=true; res.label=label(res); return res;
}
// does reference r contain verse (b,c,v)?
function contains(r,x){
  if(!r.ok||r.b!==x.b) return false;
  if(r.kind==="book") return true;
  var c1=r.c, c2=r.c2||r.c;
  if(x.c<c1||x.c>c2) return false;
  if(r.kind==="chapter") return true;
  var s=r.c*1000+r.v, e=(r.c2||r.c)*1000+(r.v2||r.v), p=x.c*1000+x.v;
  return p>=s&&p<=e;
}
window.PWBooks={BOOKS:BOOKS,ALIAS:ALIAS,parse:parse,findBook:findBook,contains:contains,label:label,dist:dist};
})();
