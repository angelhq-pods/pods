// La Ventanita: single-show player. Reads episodes.json (newest first), remembers position per episode.
(() => {
  const $ = s => document.querySelector(s);
  const audio = $('#audio');
  const FEED = new URL('feed.xml', location.href).href;
  let eps = [], cur = null;
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fecha = iso => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${dias[dt.getDay()]} ${d} de ${meses[m - 1]}`; };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const posKey = e => `pos:${e.key}`;
  const toSec = t => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);

  function notesHTML(e) {
    let h = '<details><summary>Fuentes y notas del episodio</summary>';
    if (e.summary) h += `<p>${esc(e.summary)}</p>`;
    if (e.segments && e.segments.length) h += '<h3>En este episodio</h3><ul>' + e.segments.map(s => `<li><button class="seg" data-t="${toSec(s.t)}"><b>${esc(s.t)}</b>${esc(s.name)}</button></li>`).join('') + '</ul>';
    if (e.unconfirmed && e.unconfirmed.length) h += '<h3>Sin confirmar / con matices</h3><ul>' + e.unconfirmed.map(u => `<li>${esc(u)}</li>`).join('') + '</ul>';
    if (e.sources && e.sources.length) h += '<h3>Fuentes</h3><ul>' + e.sources.map(s => `<li><b>${esc(s.outlet)}:</b> <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('') + '</ul>';
    if (e.humor_note) h += `<p class="small">${esc(e.humor_note)}</p>`;
    return h + '</details>';
  }

  function select(e, autoplay) {
    if (cur && audio.currentTime) localStorage.setItem(posKey(cur), audio.currentTime);
    cur = e;
    const isNewest = e === eps[0];
    $('#now-kicker').textContent = isNewest ? (e.kind === 'semanal' ? 'Lo más nuevo · Especial de fin de semana' : 'El episodio de hoy') : 'Escuchando';
    $('#now-title').textContent = e.title;
    $('#now-meta').textContent = `${fecha(e.date)} · ${e.minutes} minutos`;
    $('#now-notes').innerHTML = notesHTML(e);
    audio.src = e.url;
    const saved = Number(localStorage.getItem(posKey(e)) || 0);
    audio.addEventListener('loadedmetadata', () => { if (saved > 5 && saved < audio.duration - 10) audio.currentTime = saved; }, { once: true });
    document.querySelectorAll('.list li').forEach(li => li.classList.toggle('cur', li.dataset.key === e.key));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: e.title, artist: 'La Ventanita', album: 'La Ventanita', artwork: [{ src: 'icons/cover-600.jpg', sizes: '600x600', type: 'image/jpeg' }] });
    }
    if (autoplay) { audio.play().catch(() => {}); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  function renderList() {
    $('#list').innerHTML = eps.map(e => `<li data-key="${esc(e.key)}"><button class="go" aria-label="Escuchar ${esc(e.title)}">▶</button><div><div class="t">${esc(e.title)}</div><div class="d">${fecha(e.date)} · ${e.minutes} min${e.kind === 'semanal' ? ' · Especial' : ''}</div></div></li>`).join('');
    $('#list').querySelectorAll('li').forEach(li => li.querySelector('.go').onclick = () => select(eps.find(x => x.key === li.dataset.key), true));
  }

  $('#play').onclick = () => { if (!cur) return; audio.paused ? audio.play() : audio.pause(); };
  $('#back').onclick = () => audio.currentTime = Math.max(0, audio.currentTime - 15);
  $('#fwd').onclick = () => audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 30);
  document.querySelectorAll('.speed button').forEach(b => b.onclick = () => {
    audio.playbackRate = Number(b.dataset.rate); localStorage.setItem('rate', b.dataset.rate);
    document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', x === b));
  });
  const r0 = localStorage.getItem('rate'); if (r0) { const b = document.querySelector(`.speed button[data-rate="${r0}"]`); if (b) b.click(); }
  audio.onplay = () => { $('#now').classList.add('playing'); $('#play').setAttribute('aria-label', 'Pausa'); audio.playbackRate = Number(localStorage.getItem('rate') || 1); };
  audio.onpause = () => { $('#now').classList.remove('playing'); $('#play').setAttribute('aria-label', 'Reproducir'); if (cur) localStorage.setItem(posKey(cur), audio.currentTime); };
  audio.ontimeupdate = () => { $('#cur').textContent = fmt(audio.currentTime); if (audio.duration) $('#seek').value = audio.currentTime / audio.duration * 1000; };
  audio.ondurationchange = () => $('#dur').textContent = fmt(audio.duration);
  audio.onended = () => { if (cur) localStorage.removeItem(posKey(cur)); };
  $('#seek').oninput = e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; };
  $('#now-notes').addEventListener('click', ev => { const b = ev.target.closest('.seg'); if (b) { audio.currentTime = Number(b.dataset.t); audio.play().catch(() => {}); } });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('seekbackward', () => $('#back').click());
    navigator.mediaSession.setActionHandler('seekforward', () => $('#fwd').click());
  }
  $('#feed-url').textContent = FEED;
  $('#copy-feed').onclick = async () => { try { await navigator.clipboard.writeText(FEED); $('#copy-feed').textContent = '¡Copiado!'; } catch { prompt('Copie el enlace:', FEED); } };

  fetch('episodes.json', { cache: 'no-store' }).then(r => r.json()).then(list => {
    eps = list.map(e => ({ ...e, url: `episodes/${e.file}`, minutes: Math.max(1, Math.round(toSec(e.duration) / 60)) }));
    renderList();
    if (eps.length) select(eps[0], false); else $('#now-kicker').textContent = 'Todavía no hay episodios.';
  }).catch(() => { $('#now-kicker').textContent = 'No se pudo cargar. Revise su conexión e intente de nuevo.'; });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
