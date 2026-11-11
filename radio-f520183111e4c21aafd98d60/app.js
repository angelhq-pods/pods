(() => {
const TZ = 'America/Phoenix';
const BUILD = '20261110a';
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const audio = $('#audio');
const main = $('#main');

let catalog = { shows: [] };
let queue = [];
let qIndex = 0;
let rec = { show: null, label: '', kind: '' };
let pendingSeek = null;

function ymdInTZ(date, tz=TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function todayYMD() { return ymdInTZ(new Date()); }
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function lastWeekRange(today = todayYMD()) {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const sinceMon = (dow + 6) % 7;
  const thisMon = addDays(today, -sinceMon);
  return [addDays(thisMon, -7), addDays(thisMon, -1)];
}
function niceDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtDur(sec) {
  sec = Math.round(+sec || 0);
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function parseDur(s) {
  if (!s) return 0;
  s = String(s).trim();
  if (/^\d+$/.test(s)) return +s;
  return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || 0;
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function findShow(q) {
  const n = norm(q);
  if (!n) return null;
  return catalog.shows.find(s => norm(s.id) === n)
    || catalog.shows.find(s => norm(s.name) === n)
    || catalog.shows.find(s => (s.aliases || []).some(a => norm(a) === n))
    || null;
}

function parseRss(xml, show) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Feed could not be read');
  const IT = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
  const ch = doc.querySelector('channel');
  const itImg = ch && ch.getElementsByTagNameNS(IT, 'image')[0];
  const cover = (itImg && itImg.getAttribute('href')) || ch?.querySelector('image > url')?.textContent || show.artwork || '';
  const episodes = [...(ch ? ch.querySelectorAll('item') : [])].map(it => {
    const enc = it.querySelector('enclosure');
    const pubRaw = it.querySelector('pubDate')?.textContent || '';
    const pub = Date.parse(pubRaw) || 0;
    return {
      id: (it.querySelector('guid')?.textContent || enc?.getAttribute('url') || '').trim(),
      title: (it.querySelector('title')?.textContent || 'Episode').trim(),
      url: enc?.getAttribute('url') || '',
      pub,
      date: pub ? ymdInTZ(new Date(pub)) : '',
      dur: parseDur(it.getElementsByTagNameNS(IT, 'duration')[0]?.textContent),
      cover,
      showId: show.id,
      showName: show.name
    };
  }).filter(e => e.url);
  episodes.sort((a, b) => b.pub - a.pub);
  return episodes;
}

function parseEpisodesJson(text, show) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data.episodes || []);
  const base = show.feed.replace(/[^/]+$/, '');
  return list.map((e, i) => {
    const audioPath = e.audio || e.file || e.url || '';
    const url = audioPath ? new URL(audioPath, base).href : '';
    const cover = e.cover ? new URL(e.cover, base).href : (show.artwork || '');
    const id = String(e.id || '');
    const week = (id.match(/^week-(.+)$/i) || [])[1] || '';
    const month = e.months != null ? String(e.months) : ((id.match(/^month-(.+)$/i) || [])[1] || '');
    return {
      id: id || url,
      title: e.title || 'Episode',
      url,
      pub: e.date ? Date.parse(e.date + 'T12:00:00-07:00') || 0 : 0,
      date: e.date || '',
      dur: +e.duration || 0,
      cover,
      week,
      month,
      order: e.order != null ? +e.order : i,
      showId: show.id,
      showName: show.name
    };
  }).filter(e => e.url).sort((a, b) => a.order - b.order);
}

async function loadEpisodes(show) {
  const url = show.feed + (show.feed.includes('?') ? '&' : '?') + 'v=' + Date.now();
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load the feed (' + r.status + ')');
  const text = await r.text();
  if ((show.format || 'rss') === 'episodes-json') return parseEpisodesJson(text, show);
  return parseRss(text, show);
}

function resolveQueue(episodes, show, params) {
  const type = show.type || 'dated';
  let items = episodes.slice();
  let label = 'Newest';
  let kind = 'newest';

  const date = params.get('date');
  const range = (params.get('range') || '').toLowerCase();
  const week = params.get('week');
  const month = params.get('month');
  const nRaw = params.get('n');
  const n = nRaw && /^\d+$/.test(nRaw) ? Math.max(1, Math.min(100, +nRaw)) : 0;

  if (type === 'week-month' && (week || month)) {
    if (week) {
      const w = norm(week).replace(/^week /, '');
      items = items.filter(e => norm(e.week) === w || norm(e.id) === 'week ' + w);
      label = 'Week ' + w;
      kind = 'week';
    } else {
      const m = norm(month).replace(/^month /, '');
      items = items.filter(e => norm(e.month) === m || norm(e.id) === 'month ' + m);
      label = 'Month ' + m;
      kind = 'month';
    }
  } else if (type === 'dated' && date) {
    items = items.filter(e => e.date === date);
    label = niceDate(date);
    kind = 'date';
  } else if (type === 'dated' && range === 'yesterday') {
    const y = addDays(todayYMD(), -1);
    items = items.filter(e => e.date === y);
    label = 'Yesterday, ' + niceDate(y);
    kind = 'yesterday';
  } else if (type === 'dated' && range === 'last-week') {
    const [a, b] = lastWeekRange();
    items = items.filter(e => e.date >= a && e.date <= b).sort((x, y) => x.pub - y.pub);
    label = 'Last week, ' + niceDate(a) + '–' + niceDate(b);
    kind = 'last-week';
    if (n) {
      items = items.slice(-n);
      label = 'Last ' + items.length + ' of last week, oldest first';
    }
    return { items, label, kind, needsPick: false };
  } else if (n) {
    if (type === 'week-month') {
      items = items.slice().sort((a, b) => a.order - b.order).slice(0, n);
      label = 'First ' + items.length + ', in order';
    } else {
      items = items.slice().sort((a, b) => b.pub - a.pub).slice(0, n).reverse();
      label = 'Last ' + items.length + ', oldest first';
    }
    kind = 'n';
    return { items, label, kind, needsPick: false };
  } else if (type === 'week-month') {
    return { items: [], label: 'Pick a week or month', kind: 'pick', needsPick: true, all: episodes };
  } else {
    items = items.slice(0, 1);
    label = 'Newest';
    kind = 'newest';
  }

  if (kind !== 'n' && kind !== 'last-week') items = items.slice().sort((a, b) => a.pub - b.pub || a.order - b.order);
  if (n && kind !== 'n') {
    items = items.slice(-n);
    label = 'Last ' + items.length + ' · ' + label;
  }
  return { items, label, kind, needsPick: false };
}

function setAccent(show) {
  document.documentElement.style.setProperty('--accent', (show && show.accent) || '#FF4D1C');
}

function hashParams() {
  const h = location.hash.replace(/^#/, '');
  const q = h.indexOf('?');
  const action = (q < 0 ? h : h.slice(0, q)).toLowerCase();
  const params = new URLSearchParams(q < 0 ? '' : h.slice(q + 1));
  return { action, params };
}

function renderHome() {
  rec = { show: null, label: '', kind: '' };
  queue = [];
  $('#home').hidden = true;
  setAccent(null);
  document.title = 'Radio';
  main.innerHTML = `
    <h1>What do you want to hear?</h1>
    <p class="lede">Open a play link, or tap a show to queue the latest episode.</p>
    <ul class="shows">
      ${catalog.shows.map(s => `
        <li>
          <button type="button" class="show" data-id="${esc(s.id)}">
            <img class="art" src="${esc(s.artwork || '')}" alt="">
            <div>
              <h2>${esc(s.name)}</h2>
              <p>${s.type === 'week-month' ? 'By week or month' : 'Latest episode'}</p>
            </div>
          </button>
        </li>`).join('')}
    </ul>`;
  main.querySelectorAll('.show').forEach(btn => btn.addEventListener('click', () => {
    location.hash = '#play?show=' + encodeURIComponent(btn.dataset.id);
  }));
}

function renderPick(show, episodes, err) {
  const weeks = episodes.filter(e => e.week);
  const months = episodes.filter(e => e.month);
  main.innerHTML = `
    <h1>${esc(show.name)}</h1>
    <p class="lede">${err ? esc(err) : 'Pick a week or a month.'}</p>
    ${weeks.length ? `<div class="section">Weeks</div><div class="picks">${weeks.map(e =>
      `<button type="button" data-hash="#play?show=${esc(show.id)}&week=${esc(e.week)}">${esc(e.title.replace(/:.*$/, ''))}</button>`
    ).join('')}</div>` : ''}
    ${months.length ? `<div class="section">Months</div><div class="picks">${months.map(e =>
      `<button type="button" data-hash="#play?show=${esc(show.id)}&month=${esc(e.month)}">${esc('Month ' + e.month)}</button>`
    ).join('')}</div>` : ''}`;
  main.querySelectorAll('[data-hash]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.hash; }));
}

function renderQueue(show, result, err) {
  const items = result.items;
  const playing = items[qIndex];
  main.innerHTML = `
    <h1>${esc(show.name)}</h1>
    <p class="lede">${esc(result.label)}${items.length ? ' · ' + items.length + ' episode' + (items.length === 1 ? '' : 's') : ''}</p>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    ${!items.length && !err ? `<p class="err">No episodes matched that request.</p>` : ''}
    <ol class="queue">
      ${items.map((e, i) => `
        <li class="ep${i === qIndex ? ' on' : ''}" data-i="${i}" data-date="${esc(e.date || '')}" data-id="${esc(e.id)}">
          <span class="n">${i + 1}</span>
          <div>
            <div class="t">${esc(e.title)}</div>
            <div class="s">${[e.date ? niceDate(e.date) : '', e.dur ? fmtDur(e.dur) : ''].filter(Boolean).join(' · ')}</div>
          </div>
        </li>`).join('')}
    </ol>
    ${items.length ? `
      <div class="controls">
        <div class="time"><span id="cur">0:00</span><span id="dur">${fmtDur(playing?.dur)}</span></div>
        <div class="bar" id="bar"><span id="fill"></span></div>
        <button type="button" class="play" id="play">${iconPlay()}Play</button>
        <div class="row">
          <button type="button" id="prev" ${qIndex <= 0 ? 'disabled' : ''}>Previous</button>
          <button type="button" id="next" ${qIndex >= items.length - 1 ? 'disabled' : ''}>Next</button>
        </div>
      </div>` : ''}`;
  main.querySelectorAll('.ep').forEach(el => el.addEventListener('click', () => jump(+el.dataset.i, true)));
  const play = $('#play');
  if (play) play.addEventListener('click', toggle);
  const prev = $('#prev'), next = $('#next');
  if (prev) prev.addEventListener('click', () => jump(qIndex - 1, true));
  if (next) next.addEventListener('click', () => jump(qIndex + 1, true));
  paintPlay();
}

function iconPlay(){ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
function iconPause(){ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'; }

function paintPlay() {
  const btn = $('#play');
  if (!btn) return;
  const on = queue.length && !audio.paused && !audio.ended;
  btn.innerHTML = (on ? iconPause() + 'Pause' : iconPlay() + (qIndex === 0 && audio.currentTime < 1 ? 'Play' : 'Resume'));
}

function loadCurrent(autoplay) {
  const e = queue[qIndex];
  if (!e) return;
  pendingSeek = null;
  audio.src = e.url;
  try { audio.currentTime = 0; } catch {}
  bindSession(e);
  main.querySelectorAll('.ep').forEach((el, i) => el.classList.toggle('on', i === qIndex));
  const prev = $('#prev'), next = $('#next'), dur = $('#dur');
  if (prev) prev.disabled = qIndex <= 0;
  if (next) next.disabled = qIndex >= queue.length - 1;
  if (dur) dur.textContent = fmtDur(e.dur);
  if (autoplay) {
    const p = audio.play();
    if (p && p.catch) p.catch(err => { if (err.name !== 'AbortError') statusToast('Tap Play to start'); });
  }
  paintPlay();
}

function jump(i, autoplay) {
  if (i < 0 || i >= queue.length) return;
  qIndex = i;
  loadCurrent(autoplay);
}

function toggle() {
  if (!queue.length) return;
  if (!audio.src) { loadCurrent(true); return; }
  if (audio.paused) {
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  } else audio.pause();
}

function bindSession(e) {
  if (!('mediaSession' in navigator)) return;
  const art = e.cover ? [{ src: e.cover, sizes: '512x512' }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: e.title,
    artist: e.showName || 'Radio',
    album: rec.label || e.showName || 'Radio',
    artwork: art
  });
  const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', () => jump(qIndex - 1, true));
  set('nexttrack', () => jump(qIndex + 1, true));
  set('seekbackward', ev => { audio.currentTime = Math.max(0, audio.currentTime - (ev.seekOffset || 10)); });
  set('seekforward', ev => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (ev.seekOffset || 10)); });
  set('seekto', ev => { if (ev.seekTime != null) audio.currentTime = ev.seekTime; });
}

function paintTime() {
  const cur = $('#cur'), fill = $('#fill'), dur = $('#dur');
  const t = audio.currentTime || 0;
  const d = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (queue[qIndex]?.dur || 0);
  if (cur) cur.textContent = fmtDur(t);
  if (dur && d) dur.textContent = fmtDur(d);
  if (fill && d) fill.style.width = Math.min(100, (t / d) * 100) + '%';
  if ('mediaSession' in navigator && d) {
    try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(t, d) }); } catch {}
  }
}

audio.addEventListener('play', () => { paintPlay(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { paintPlay(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('timeupdate', paintTime);
audio.addEventListener('loadedmetadata', paintTime);
audio.addEventListener('ended', () => {
  if (qIndex < queue.length - 1) jump(qIndex + 1, true);
  else paintPlay();
});

function statusToast(msg) {
  const el = $('.lede');
  if (el) el.textContent = msg;
}

async function route() {
  const { action, params } = hashParams();
  if (action !== 'play') {
    if (audio.src && !audio.paused) { /* keep playing if user goes home? stop. */ audio.pause(); audio.removeAttribute('src'); }
    renderHome();
    return;
  }
  const show = findShow(params.get('show') || '');
  $('#home').hidden = false;
  if (!show) {
    setAccent(null);
    main.innerHTML = `<p class="err">That show isn’t in the catalog. Check the link and try again.</p>`;
    return;
  }
  setAccent(show);
  document.title = show.name + ' · Radio';
  main.innerHTML = `<p class="muted">Loading ${esc(show.name)}…</p>`;
  try {
    const episodes = await loadEpisodes(show);
    const result = resolveQueue(episodes, show, params);
    rec = { show, label: result.label, kind: result.kind };
    if (result.needsPick) {
      queue = [];
      renderPick(show, result.all || episodes);
      return;
    }
    queue = result.items;
    qIndex = 0;
    const err = queue.length ? '' : (
      result.kind === 'yesterday' ? 'No episode for yesterday.' :
      result.kind === 'date' ? 'No episode for that date.' :
      result.kind === 'last-week' ? 'No episodes in last week’s range.' :
      'No episodes matched that request.'
    );
    renderQueue(show, result, err);
    if (queue[0]) {
      audio.src = queue[0].url;
      bindSession(queue[0]);
    }
  } catch (e) {
    main.innerHTML = `<p class="err">${esc(e.message || 'Could not load that show.')}</p>`;
  }
}

async function boot() {
  try {
    const r = await fetch('catalog.json?v=' + BUILD + '&t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('Catalog could not be loaded');
    catalog = await r.json();
    if (!Array.isArray(catalog.shows)) throw new Error('Catalog is missing shows');
    await route();
  } catch (e) {
    main.innerHTML = `<p class="err">${esc(e.message || 'Radio could not load.')}</p>`;
  }
}

window.addEventListener('hashchange', () => { route(); });
$('#home').addEventListener('click', () => { location.hash = ''; });
boot();

window.__radio = { findShow, resolveQueue, parseRss, parseEpisodesJson, lastWeekRange, todayYMD, addDays, ymdInTZ, get queue(){ return queue; }, get catalog(){ return catalog; } };
})();
