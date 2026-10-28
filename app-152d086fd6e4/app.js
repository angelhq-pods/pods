(() => {
'use strict';
const TZ = 'America/Phoenix';
const SHOWS = [
  { key:'x',  path:'e3be17b285832ee8cf1c74da', name:'X Briefing', full:'Daily X Briefing', by:'Mr. X', accent:'#FF2D55', thumb:'icons/x-thumb.jpg', cadence:'Daily' },
  { key:'ma', path:'6a43a82a2a28f2f3d3a26f1e', name:'Market Analyst', full:'Market Analyst Briefing', by:'Market Analyst', accent:'#FF8B1E', thumb:'icons/ma-thumb.jpg', cadence:'Weekly' },
];
const SHOW = Object.fromEntries(SHOWS.map(s => [s.key, s]));
const IT = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
const LS = 'briefs.v1', LSF = 'briefs.feeds.v1';

const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audio = $('#audio');

// ---------- persistent state ----------
let st = { pos:{}, done:{}, dur:{}, last:null, speed:1, seen:{} };
try { Object.assign(st, JSON.parse(localStorage.getItem(LS) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch {} };

// ---------- feeds ----------
let shows = {};            // key -> {title, desc, cover, episodes:[]}
let byId = {};
let feedErr = {};
let lastFetch = 0;

function parseDur(s) {
  if (!s) return 0; s = s.trim();
  if (/^\d+$/.test(s)) return +s;
  return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
}
function parseFeed(xml, show) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Feed could not be read');
  const ch = doc.querySelector('channel');
  const itImg = ch.getElementsByTagNameNS(IT, 'image')[0];
  const cover = (itImg && itImg.getAttribute('href')) || ch.querySelector('image > url')?.textContent || show.thumb;
  const episodes = [...ch.querySelectorAll('item')].map(it => {
    const enc = it.querySelector('enclosure');
    const guid = it.querySelector('guid')?.textContent.trim() || enc?.getAttribute('url');
    return {
      id: guid, show: show.key,
      title: it.querySelector('title')?.textContent.trim() || 'Episode',
      desc: (it.getElementsByTagNameNS(IT, 'summary')[0]?.textContent || it.querySelector('description')?.textContent || '').trim(),
      url: enc?.getAttribute('url'),
      length: +(enc?.getAttribute('length') || 0),
      pub: Date.parse(it.querySelector('pubDate')?.textContent || '') || 0,
      dur: parseDur(it.getElementsByTagNameNS(IT, 'duration')[0]?.textContent),
    };
  }).filter(e => e.url);
  return { title: ch.querySelector('title')?.textContent.trim(), desc: ch.querySelector('description')?.textContent.trim(), cover, episodes };
}
function index() {
  byId = {};
  for (const k in shows) for (const e of shows[k].episodes) { e.cover = shows[k].cover; byId[e.id] = e; }
}
function allEpisodes() { return Object.values(byId).sort((a, b) => b.pub - a.pub); }

async function loadFeeds(manual) {
  const btn = $('#refresh'); btn.classList.add('spin');
  const before = new Set(Object.keys(byId));
  await Promise.all(SHOWS.map(async s => {
    try {
      const r = await fetch(`../${s.path}/feed.xml`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      shows[s.key] = parseFeed(await r.text(), s);
      delete feedErr[s.key];
    } catch (e) { feedErr[s.key] = e.message || String(e); }
  }));
  lastFetch = Date.now();
  index();
  try { localStorage.setItem(LSF, JSON.stringify(shows)); } catch {}
  btn.classList.remove('spin');
  render();
  restoreLast();
  if (manual) {
    const fresh = Object.keys(byId).filter(id => !before.has(id)).length;
    toast(Object.keys(feedErr).length ? 'Offline: showing saved episodes' : fresh ? `${fresh} new episode${fresh > 1 ? 's' : ''}` : 'Up to date');
  }
}

// ---------- formatting ----------
const dayKey = t => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
function fmtDate(t) {
  if (!t) return '';
  const k = dayKey(t), today = dayKey(Date.now()), yest = dayKey(Date.now() - 864e5);
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  return new Date(t).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtLen(sec) {
  sec = Math.round(sec || 0); const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${Math.max(1, m)} min`;
}
function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
const durOf = e => st.dur[e.id] || e.dur || 0;
const progOf = e => st.done[e.id] ? 1 : (durOf(e) ? Math.min(1, (st.pos[e.id] || 0) / durOf(e)) : 0);
const isNew = e => !st.done[e.id] && !(st.pos[e.id] > 0);
function timeLabel(e) {
  if (st.done[e.id]) return 'Played';
  const p = st.pos[e.id] || 0, d = durOf(e);
  if (p > 0 && d) return `${fmtLen(d - p)} left`;
  return fmtLen(d);
}

// ---------- views ----------
let filter = 'all';
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path class="fill" d="M7 4.5v15l13-7.5z"/></svg>';
function row(e, showShow = true) {
  const s = SHOW[e.show], p = progOf(e), cur = current && current.id === e.id;
  const playing = cur && !audio.paused;
  return `<div class="ep${st.done[e.id] ? ' finished' : ''}${cur ? ' playing' : ''}${cur && audio.paused ? ' paused' : ''}" data-id="${esc(e.id)}" style="--c:${s.accent}" role="button" tabindex="0">
    <div class="ep-art"><img loading="lazy" src="${esc(e.cover)}" onerror="this.src='${s.thumb}'" alt="">${p > 0 && p < 1 ? `<div class="bar"><span style="width:${(p * 100).toFixed(1)}%"></span></div>` : ''}</div>
    <div class="ep-body">
      <div class="ep-top">${showShow ? esc(s.name) : esc(fmtDate(e.pub))}${isNew(e) ? '<span class="new">New</span>' : ''}${st.done[e.id] ? '<span class="done"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>Played</span>' : ''}</div>
      <div class="ep-title">${esc(e.title)}</div>
      <div class="ep-meta">${showShow ? esc(fmtDate(e.pub)) + ' · ' : ''}${esc(timeLabel(e))}</div>
    </div>
    <button class="ep-go" aria-label="${playing ? 'Pause' : 'Play'}">${cur ? '<span class="eq"><i></i><i></i><i></i></span>' : ICON_PLAY}</button>
  </div>`;
}
function errBox() {
  const keys = Object.keys(feedErr);
  return keys.length ? `<div class="err">Couldn't refresh ${keys.map(k => SHOW[k].name).join(' and ')} (${esc(Object.values(feedErr)[0])}). Showing saved episodes.</div>` : '';
}
function viewLatest() {
  const eps = allEpisodes();
  if (!eps.length) return `<div class="h-eyebrow">Latest</div>${Object.keys(feedErr).length ? errBox() : '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'}`;
  const inProg = current && !st.done[current.id] && (st.pos[current.id] || 0) > 0 ? current : null;
  const hero = inProg || eps.find(isNew) || eps[0];
  const s = SHOW[hero.show];
  const unplayed = eps.filter(isNew).length;
  const today = eps.filter(e => dayKey(e.pub) === dayKey(Date.now())).length;
  const left = eps.filter(e => !st.done[e.id]).reduce((a, e) => a + Math.max(0, durOf(e) - (st.pos[e.id] || 0)), 0);
  const list = filter === 'new' ? eps.filter(isNew) : filter === 'x' || filter === 'ma' ? eps.filter(e => e.show === filter) : eps;
  return `
  <div class="h-eyebrow">${inProg ? 'Continue listening' : isNew(hero) ? 'Up next' : 'Latest'}</div>
  <div class="hero" data-id="${esc(hero.id)}" style="--c:${s.accent}">
    <img class="hero-bg" src="${esc(hero.cover)}" onerror="this.src='${s.thumb}'" alt="">
    <div class="hero-body">
      <span class="pill" style="--c:${s.accent}"><i></i>${esc(s.full)}</span>
      <h3>${esc(hero.title)}</h3>
      <div class="meta">${esc(fmtDate(hero.pub))} · ${esc(timeLabel(hero))}</div>
      <div class="hero-actions"><button class="btn-play" data-play="${esc(hero.id)}">${current && current.id === hero.id && !audio.paused ? '<svg viewBox="0 0 24 24"><path class="fill" d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/></svg>Pause' : ICON_PLAY + ((st.pos[hero.id] || 0) > 0 && !st.done[hero.id] ? 'Resume' : 'Play')}</button></div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><b>${unplayed}</b><span>Unplayed</span></div>
    <div class="stat"><b>${today}</b><span>New today</span></div>
    <div class="stat"><b>${Math.round(left / 60)}<small style="font-size:14px"> min</small></b><span>To catch up</span></div>
  </div>
  ${errBox()}
  <div class="seg">${[['all', 'All'], ['new', 'Unplayed'], ['x', 'X Briefing'], ['ma', 'Market Analyst']].map(([k, l]) => `<button data-filter="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="list">${list.map(e => row(e)).join('') || '<div class="empty">All caught up.</div>'}</div>`;
}
function viewShow(key) {
  const s = SHOW[key], sh = shows[key];
  if (!sh) return feedErr[key] ? errBox() : '<div class="skel" style="height:300px"></div><div class="skel"></div>';
  const eps = sh.episodes.slice().sort((a, b) => b.pub - a.pub);
  const next = eps.find(isNew) || eps[0];
  return `
  <div class="show-head" style="--c:${s.accent}">
    <div class="blur" style="background-image:url('${esc(sh.cover)}')"></div>
    <img class="show-cover" src="${esc(sh.cover)}" onerror="this.src='${s.thumb}'" alt="${esc(s.full)} cover">
    <div class="h1">${esc(s.full)}</div>
    <div class="sub">${esc(s.cadence)} · by ${esc(s.by)} · ${eps.length} episode${eps.length === 1 ? '' : 's'}</div>
    <div class="show-desc">${esc(sh.desc)}</div>
    ${next ? `<div class="show-actions"><button class="btn-play" data-play="${esc(next.id)}">${ICON_PLAY}${isNew(next) ? 'Play newest' : 'Play latest'}</button><button class="btn-ghost" data-markall="${key}">Mark all played</button></div>` : ''}
  </div>
  ${errBox()}
  <div class="list">${eps.map(e => row(e, false)).join('') || '<div class="empty">No episodes yet.</div>'}</div>`;
}
function route() { const h = location.hash.replace(/^#\/?/, ''); return h.startsWith('show/') ? h.slice(5) : 'latest'; }
function render() {
  const r = route(), v = $('#view');
  v.innerHTML = r === 'latest' ? viewLatest() : SHOW[r] ? viewShow(r) : viewLatest();
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (SHOW[r] ? r : 'latest')));
}
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

$('#view').addEventListener('click', ev => {
  const f = ev.target.closest('[data-filter]'); if (f) { filter = f.dataset.filter; render(); return; }
  const m = ev.target.closest('[data-markall]');
  if (m) { for (const e of shows[m.dataset.markall].episodes) { st.done[e.id] = 1; delete st.pos[e.id]; } save(); render(); toast('Marked all played'); return; }
  const p = ev.target.closest('[data-play]'); if (p) { toggleEp(p.dataset.play); return; }
  const go = ev.target.closest('.ep-go'); const r = ev.target.closest('.ep');
  if (go && r) { toggleEp(r.dataset.id); return; }
  if (r) { const e = byId[r.dataset.id]; if (current && current.id === e.id) openPlayer(); else { play(e); openPlayer(); } return; }
  const h = ev.target.closest('.hero'); if (h) { const e = byId[h.dataset.id]; if (!(current && current.id === e.id)) load(e, false); openPlayer(); }
});
function toggleEp(id) { const e = byId[id]; if (current && current.id === id) { audio.paused ? resume() : audio.pause(); } else play(e); }

// ---------- player ----------
let current = null, pendingSeek = null, lastSave = 0;
function load(e, autoplay) {
  if (current && current.id !== e.id) savePos(true);
  current = e; st.last = e.id; save();
  const s = SHOW[e.show];
  document.documentElement.style.setProperty('--accent', s.accent);
  const start = st.done[e.id] ? 0 : (st.pos[e.id] || 0);
  pendingSeek = start > 0 ? start : null;
  audio.src = e.url;
  audio.playbackRate = st.speed || 1;
  audio.defaultPlaybackRate = st.speed || 1;
  if (start > 0) { try { audio.currentTime = start; } catch {} }
  paintPlayer(); setMediaSession(); checkTranscript(e);
  $('#mini').classList.remove('hidden');
  if (autoplay) resume();
  render();
}
function play(e) { if (st.done[e.id]) { delete st.done[e.id]; st.pos[e.id] = 0; save(); } load(e, true); }
function resume() {
  if (!current) return;
  audio.playbackRate = st.speed || 1;
  const pr = audio.play();
  if (pr && pr.catch) pr.catch(err => { if (err.name !== 'AbortError') toast('Tap play to start audio'); });
}
function savePos(force) {
  if (!current) return;
  const now = Date.now(); if (!force && now - lastSave < 2000) return; lastSave = now;
  const t = audio.currentTime || 0, d = audio.duration;
  if (isFinite(d) && d > 0) st.dur[current.id] = d;
  if (t > 1) st.pos[current.id] = t;
  if (isFinite(d) && d > 30 && t > d - 8) { st.done[current.id] = 1; delete st.pos[current.id]; }
  save();
}
function paintPlayer() {
  const e = current; if (!e) return;
  const s = SHOW[e.show];
  for (const id of ['#mini', '#player']) $(id).classList.toggle('is-playing', !audio.paused);
  $('.mini-art').src = e.cover; $('.mini-art').onerror = function () { this.src = s.thumb; };
  $('.mini-show').textContent = s.name; $('.mini-title').textContent = e.title;
  $('#p-art').src = e.cover; $('#p-art').onerror = function () { this.src = s.thumb; };
  $('.player-bg').style.backgroundImage = `url('${e.cover}')`;
  $('#p-show').textContent = s.full; $('#p-show').style.color = s.accent;
  $('#p-title').textContent = e.title; $('#p-date').textContent = `${fmtDate(e.pub)} · ${s.by}`;
  $('#p-desc').textContent = e.desc;
  $('#p-speed').textContent = (st.speed || 1) + '×';
  $('#p-play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  $('.mini-play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  paintTime();
}
let seeking = false;
function paintTime() {
  if (!current) return;
  const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durOf(current);
  const t = pendingSeek != null && audio.readyState < 1 ? pendingSeek : audio.currentTime || 0;
  const pct = d ? Math.min(100, t / d * 100) : 0;
  $('.mini-progress span').style.width = pct + '%';
  if (!seeking) { $('#p-seek').value = Math.round(pct * 10); $('#p-seek').style.setProperty('--p', pct + '%'); }
  $('#p-cur').textContent = clock(seeking ? $('#p-seek').value / 1000 * d : t);
  $('#p-rem').textContent = '-' + clock(d - (seeking ? $('#p-seek').value / 1000 * d : t));
}
audio.addEventListener('loadedmetadata', () => {
  if (pendingSeek != null) { try { audio.currentTime = Math.min(pendingSeek, audio.duration - 1); } catch {} pendingSeek = null; }
  if (current && isFinite(audio.duration)) { st.dur[current.id] = audio.duration; save(); }
  paintTime(); posState();
});
audio.addEventListener('timeupdate', () => { paintTime(); savePos(false); posStateThrottled(); });
audio.addEventListener('play', () => { paintPlayer(); render(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { savePos(true); paintPlayer(); render(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('ended', () => { if (current) { st.done[current.id] = 1; delete st.pos[current.id]; save(); toast('Finished · marked as played'); } paintPlayer(); render(); });
audio.addEventListener('ratechange', posState);
audio.addEventListener('error', () => { if (current) toast("Couldn't load audio. Check your connection."); });
function skip(sec) {
  if (!current) return;
  const d = audio.duration || durOf(current);
  audio.currentTime = Math.max(0, Math.min((d || 1e9) - 0.5, (audio.currentTime || 0) + sec));
  paintTime(); savePos(true); posState();
}
document.querySelectorAll('[data-skip]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); skip(+b.dataset.skip); }));
$('.mini-play').addEventListener('click', ev => { ev.stopPropagation(); audio.paused ? resume() : audio.pause(); });
$('#p-play').addEventListener('click', () => audio.paused ? resume() : audio.pause());
$('#mini').addEventListener('click', openPlayer);
$('#p-close').addEventListener('click', closePlayer);
$('#p-speed').addEventListener('click', () => {
  const i = SPEEDS.indexOf(st.speed || 1); st.speed = SPEEDS[(i + 1) % SPEEDS.length];
  audio.playbackRate = st.speed; audio.defaultPlaybackRate = st.speed; save(); paintPlayer(); toast(`Speed ${st.speed}×`);
});
$('#p-more').addEventListener('click', () => {
  if (!current) return;
  if (st.done[current.id]) { delete st.done[current.id]; toast('Marked unplayed'); }
  else { st.done[current.id] = 1; delete st.pos[current.id]; audio.pause(); toast('Marked as played'); }
  save(); render();
});
const seek = $('#p-seek');
seek.addEventListener('input', () => { seeking = true; seek.style.setProperty('--p', seek.value / 10 + '%'); paintTime(); });
seek.addEventListener('change', () => {
  const d = audio.duration || durOf(current);
  if (d) { if (audio.readyState >= 1) audio.currentTime = seek.value / 1000 * d; else pendingSeek = seek.value / 1000 * d; }
  seeking = false; paintTime(); savePos(true); posState();
});
function openPlayer() { if (!current) return; $('#player').classList.add('open'); $('#player').setAttribute('aria-hidden', 'false'); history.pushState({ sheet: 'player' }, ''); }
function closePlayer(fromPop) { $('#player').classList.remove('open'); $('#player').setAttribute('aria-hidden', 'true'); if (fromPop !== true && history.state && history.state.sheet) history.back(); }
window.addEventListener('popstate', () => { if ($('#tx').classList.contains('open')) { $('#tx').classList.remove('open'); return; } if ($('#player').classList.contains('open')) closePlayer(true); });
// swipe down to close sheets
for (const sh of ['#player', '#tx']) {
  let y0 = null; const el = $(sh);
  el.addEventListener('touchstart', e => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  el.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110 && !seeking) { sh === '#tx' ? closeTx() : closePlayer(); } y0 = null; }, { passive: true });
}

// ---------- media session ----------
function setMediaSession() {
  if (!('mediaSession' in navigator) || !current) return;
  const s = SHOW[current.show];
  const abs = u => new URL(u, location.href).href;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title, artist: s.full, album: `${s.by} · ${fmtDate(current.pub)}`,
      artwork: [
        { src: abs(current.cover), sizes: '3000x3000', type: 'image/jpeg' },
        { src: abs(s.thumb), sizes: '512x512', type: 'image/jpeg' },
      ],
    });
  } catch {}
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
  h('play', () => resume());
  h('pause', () => audio.pause());
  h('stop', () => audio.pause());
  h('seekbackward', d => skip(-((d && d.seekOffset) || 15)));
  h('seekforward', d => skip((d && d.seekOffset) || 30));
  h('seekto', d => { if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; savePos(true); posState(); });
  // Leave previous/next unset so iOS shows the 15/30 skip buttons on the lock screen.
}
let lastPos = 0;
function posStateThrottled() { const n = Date.now(); if (n - lastPos > 5000) { lastPos = n; posState(); } }
function posState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = audio.duration; if (!isFinite(d) || d <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(d, audio.currentTime || 0) }); } catch {}
}

// ---------- transcripts ----------
const txCache = {};
async function findTranscript(e) {
  if (e.id in txCache) return txCache[e.id];
  const cands = [e.url.replace(/\.mp3(\?.*)?$/i, '.txt'), `transcripts/${encodeURIComponent(e.id)}.txt`];
  for (const u of cands) {
    try {
      const r = await fetch(u, { cache: 'no-cache' });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && !/html/i.test(ct)) { const t = (await r.text()).trim(); if (t.length > 40) return (txCache[e.id] = t); }
    } catch {}
  }
  return (txCache[e.id] = null);
}
async function checkTranscript(e) {
  const b = $('#p-tx'); b.hidden = true;
  const t = await findTranscript(e);
  if (current && current.id === e.id) b.hidden = !t;
}
$('#p-tx').addEventListener('click', async () => {
  const e = current, t = await findTranscript(e); if (!t) return;
  const s = SHOW[e.show];
  $('#tx-body').innerHTML = `<h1 style="color:${s.accent}">${esc(s.full)}</h1><div class="tx-meta">${esc(e.title)} · ${esc(fmtDate(e.pub))}</div>` +
    t.split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  $('#tx').classList.add('open'); $('#tx').scrollTop = 0; history.pushState({ sheet: 'tx' }, '');
});
function closeTx() { $('#tx').classList.remove('open'); if (history.state && history.state.sheet === 'tx') history.back(); }
$('#tx-close').addEventListener('click', closeTx);

// ---------- misc ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }
function restoreLast() { if (!current && st.last && byId[st.last]) load(byId[st.last], false); }
$('#refresh').addEventListener('click', () => loadFeeds(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') savePos(true);
  else if (Date.now() - lastFetch > 5 * 60e3) loadFeeds(false);
});
window.addEventListener('pagehide', () => savePos(true));

try { const cached = JSON.parse(localStorage.getItem(LSF) || 'null'); if (cached) { shows = cached; index(); } } catch {}
render(); restoreLast();
loadFeeds(false);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__briefs = { get current() { return current; }, audio, st, byId };
})();
