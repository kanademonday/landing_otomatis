/* ===== APLIKASI ===== */
const APP_VERSION = '1.0.2';
const DEG = CORE.DEG;
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = (n, d = 2) => (n == null || !isFinite(n)) ? '-' : Number(n).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------- LOG ---------- */
function safeStr(d) {
  if (d === undefined) return undefined;
  if (d instanceof Error) return d.name + ': ' + d.message + '\n' + (d.stack || '');
  if (typeof d === 'string') return d.length > 4000 ? d.slice(0, 4000) + '…(dipotong)' : d;
  try { const s = JSON.stringify(d); return s.length > 4000 ? s.slice(0, 4000) + '…(dipotong)' : s; } catch (e) { return String(d); }
}
const LOG = {
  entries: [], errors: 0, warns: 0,
  add(level, msg, data) {
    const e = { t: new Date().toISOString(), level, msg: String(msg), data: safeStr(data) };
    this.entries.push(e); if (this.entries.length > 4000) this.entries.shift();
    if (level === 'ERROR') this.errors++; if (level === 'WARN') this.warns++;
    (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)('[' + level + '] ' + msg, data ?? '');
    renderLog();
  },
  info(m, d) { this.add('INFO', m, d); }, warn(m, d) { this.add('WARN', m, d); }, error(m, d) { this.add('ERROR', m, d); },
  text() {
    const lines = [];
    lines.push('===== LOG PENCOCOK SITUASI BIDANG =====');
    lines.push('Versi aplikasi : ' + APP_VERSION);
    lines.push('Waktu unduh    : ' + new Date().toString());
    lines.push('Browser        : ' + navigator.userAgent);
    lines.push('Layar          : ' + screen.width + 'x' + screen.height + ' dpr ' + devicePixelRatio);
    lines.push('Protokol       : ' + location.protocol);
    lines.push('Library        : Leaflet=' + (window.L ? L.version : 'TIDAK ADA') + ', JSZip=' + (window.JSZip ? 'ada' : 'TIDAK ADA'));
    lines.push('Jumlah ERROR=' + this.errors + ' WARN=' + this.warns);
    lines.push('----- Ringkasan status -----');
    lines.push(stateSummary());
    lines.push('----- Catatan -----');
    for (const e of this.entries) lines.push(`[${e.t}] ${e.level.padEnd(5)} ${e.msg}${e.data !== undefined ? '\n        ' + e.data.replace(/\n/g, '\n        ') : ''}`);
    return lines.join('\n');
  }
};
let logTimer = null;
function renderLog() {
  const b = $('logBadge'); if (b) { b.textContent = LOG.errors ? LOG.errors + ' error' : LOG.entries.length; b.className = 'badge' + (LOG.errors ? ' b-low' : ''); }
  if (!$('log') || !$('log').classList.contains('open')) return;
  clearTimeout(logTimer);
  logTimer = setTimeout(() => {
    const pre = $('logPre');
    pre.innerHTML = LOG.entries.slice(-600).map(e => `<span class="l-${e.level}">[${e.t.slice(11, 19)}] ${e.level} ${esc(e.msg)}${e.data !== undefined ? ' — ' + esc(e.data.slice(0, 600)) : ''}</span>`).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }, 50);
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
window.addEventListener('error', e => LOG.error('Error tak tertangani: ' + e.message, { file: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack }));
window.addEventListener('unhandledrejection', e => LOG.error('Promise ditolak tak tertangani: ' + (e.reason && e.reason.message || e.reason), e.reason && e.reason.stack));

function toast(msg, kind = '') {
  const d = document.createElement('div'); d.className = kind; d.textContent = msg;
  $('toast').appendChild(d); setTimeout(() => d.remove(), kind === 'err' ? 9000 : 5000);
}
function safe(label, fn) {
  return async (...a) => {
    try { await fn(...a); }
    catch (err) { LOG.error(label + ' gagal: ' + err.message, err); toast(label + ' gagal: ' + err.message + ' (lihat 🧾 Log)', 'err'); }
  };
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  LOG.info('Unduh file: ' + name + ' (' + blob.size + ' byte)');
}
async function fetchJSON(url, opts, label, timeoutMs = 60000) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  LOG.info(`${label} → ${(opts && opts.method) || 'GET'} ${url.slice(0, 220)}`);
  let res;
  try { res = await fetch(url, { ...(opts || {}), signal: ctrl.signal }); }
  catch (e) {
    clearTimeout(tm);
    const m = e.name === 'AbortError' ? `Waktu habis (${timeoutMs / 1000} dtk)` : 'Gagal terhubung (cek internet / server menolak / CORS)';
    LOG.error(`${label}: ${m}`, { url: url.slice(0, 300), err: e.message });
    throw new Error(`${label}: ${m}`);
  }
  clearTimeout(tm);
  const txt = await res.text();
  LOG.info(`${label} ← HTTP ${res.status} (${txt.length} byte, ${Math.round(performance.now() - t0)} ms)`);
  if (!res.ok) { LOG.error(`${label}: HTTP ${res.status}`, txt.slice(0, 1000)); throw new Error(`${label}: HTTP ${res.status} ${txt.slice(0, 160)}`); }
  try { return JSON.parse(txt); } catch (e) { LOG.error(`${label}: respons bukan JSON`, txt.slice(0, 1000)); throw new Error(`${label}: respons bukan JSON`); }
}

/* ---------- STATE ---------- */
const S = {
  wil: null,          // {name, rings:[[ [lat,lon] ]], hasPoly}
  osm: null,          // {nodes:{id:[lat,lon]}, ways:[{id,name,hw,nodes}]}
  proj0: null,        // {lat0,lon0}
  img: null,          // {dataURL,w,h,name}
  roads: [], parcel: null, cps: [],
  cands: [], sel: -1, T: null,
  aiBackup: null, mapMode: null, cpIdx: 0
};
let PROJ = null, CTX = null, imgEl = null, inAreaFn = null;
function stateSummary() {
  const o = {
    input: { kota: $('inKota')?.value, kec: $('inKec')?.value, kel: $('inKel')?.value, luas: $('inLuas')?.value, lebar: $('inLebar')?.value, utara: $('inNorth')?.checked ? $('inNorthDeg').value + '°' : 'tidak' },
    wilayah: S.wil ? { nama: S.wil.name, poligon: S.wil.hasPoly, ring: S.wil.rings.length, titik: S.wil.rings.reduce((a, r) => a + r.length, 0) } : null,
    proj0: S.proj0,
    osm: S.osm ? { ruas: S.osm.ways.length, node: Object.keys(S.osm.nodes).length, bernama: S.osm.ways.filter(w => w.name).length } : null,
    gambar: S.img ? { nama: S.img.name, w: S.img.w, h: S.img.h } : null,
    sketsa: { jalan: S.roads.map(r => ({ nama: r.name, titik: r.pts.length })), bidang_titik: S.parcel ? S.parcel.length : 0, titik_ikat: S.cps.length },
    kandidat: S.cands.map(c => ({ label: c.label, skor: c.r ? +c.r.score.toFixed(3) : null, th: +(c.T.th / DEG).toFixed(2), s: +c.T.s.toFixed(4) })),
    terpilih: S.sel, T: S.T ? { s: S.T.s, th_deg: S.T.th / DEG, tx: S.T.tx, ty: S.T.ty } : null
  };
  return JSON.stringify(o, null, 1);
}

/* ---------- PETA ---------- */
let map = null; const G = {};
function initMap() {
  if (!window.L) {
    $('map').innerHTML = '<div style="padding:20px;color:#fca5a5">Library peta (Leaflet) gagal dimuat. Pastikan komputer terhubung ke internet lalu muat ulang halaman.</div>';
    LOG.error('Leaflet tidak termuat — peta tidak tersedia. Periksa koneksi internet/pemblokir.');
    return;
  }
  map = L.map('map', { preferCanvas: true, zoomControl: true }).setView([-0.49, 117.15], 12);
  const mk = (url, name, opt = {}) => {
    const l = L.tileLayer(url, { maxZoom: 21, maxNativeZoom: 19, ...opt });
    let n = 0; l.on('tileerror', () => { if (n++ === 0) LOG.warn('Gagal memuat ubin peta: ' + name + ' (coba ganti lapisan)'); });
    return l;
  };
  const base = {
    'Satelit (Esri)': mk('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Esri Satelit', { attribution: 'Citra © Esri, Maxar' }),
    'Jalan (Esri)': mk('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Esri Jalan', { attribution: '© Esri' }),
    'OpenStreetMap': mk('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'OSM', { attribution: '© OpenStreetMap contributors' })
  };
  base['Satelit (Esri)'].addTo(map);
  const labels = mk('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', 'Label');
  labels.addTo(map);
  for (const k of ['bnd', 'osm', 'cand', 'res', 'cp']) G[k] = L.layerGroup().addTo(map);
  L.control.layers(base, { 'Label tempat': labels, 'Batas wilayah': G.bnd, 'Jalan OSM': G.osm, 'Kandidat': G.cand, 'Hasil': G.res, 'Titik ikat': G.cp }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  map.on('click', e => onMapClick(e));
}

/* ---------- NAVIGASI ---------- */
let STEP = 1;
function go(n) {
  STEP = n;
  document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', +p.dataset.panel === n));
  $('mapWrap').classList.toggle('show', n !== 2);
  $('skWrap').classList.toggle('show', n === 2);
  $('cmpWrap').classList.toggle('show', n === 4);
  if (n === 3) renderReady();
  setTimeout(() => { map && map.invalidateSize(); skResize(); cmpDraw(); }, 60);
  LOG.info('Pindah ke langkah ' + n);
}
function markDone() {
  const d = { 1: !!S.osm, 2: !!(S.img && S.roads.length && S.parcel), 3: S.sel >= 0, 4: false };
  document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('done', d[b.dataset.step]));
}

/* ---------- LANGKAH 1: WILAYAH ---------- */
function isPoly(x) { return x.geojson && /Polygon/.test(x.geojson.type); }
const cariWilayah = safe('Pencarian wilayah', async () => {
  const kota = $('inKota').value.trim(), kec = $('inKec').value.trim(), kel = $('inKel').value.trim();
  if (!kel && !kec) throw new Error('Isi minimal Kelurahan/Desa atau Kecamatan.');
  const j = a => a.filter(Boolean).join(', ');
  const qs = [...new Set([j([kel, kec, kota]), j([kel, kota]), kel ? j(['Kelurahan ' + kel, kota]) : '', kel ? j(['Desa ' + kel, kec, kota]) : '', j([kel, kec]), j([kec, kota])].filter(s => s && s.includes(',') || s === kel))];
  $('wilList').innerHTML = '<div class="hint">Mencari…</div>';
  const res = [], seen = new Set();
  for (const q of qs) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.00005&addressdetails=1&countrycodes=id&limit=8&accept-language=id&q=' + encodeURIComponent(q);
    let r = [];
    try { r = await fetchJSON(url, { headers: { Accept: 'application/json' } }, `Nominatim "${q}"`, 30000); }
    catch (e) { LOG.warn('Query wilayah gagal, lanjut query lain', e.message); }
    for (const x of r) { const k = x.osm_type + x.osm_id; if (seen.has(k)) continue; seen.add(k); x._q = q; res.push(x); }
    if (res.some(x => isPoly(x) && kel && CORE.nameMatch(x.name, kel))) break;
    await sleep(1100); // kebijakan Nominatim: maks 1 permintaan/detik
  }
  const rank = x => (isPoly(x) ? 4 : 0) + (kel && CORE.nameMatch(x.name, kel) ? 5 : 0) + (x.category === 'boundary' || x.type === 'administrative' ? 2 : 0) + (kota && x.display_name.toLowerCase().includes(kota.toLowerCase()) ? 1 : 0);
  res.sort((a, b) => rank(b) - rank(a));
  LOG.info(`Hasil pencarian wilayah: ${res.length}`, res.slice(0, 8).map(x => ({ name: x.display_name, type: x.type, geo: x.geojson && x.geojson.type })));
  if (!res.length) {
    $('wilList').innerHTML = '<div class="hint">Tidak ditemukan. Coba ejaan lain, atau pakai <b>area manual</b> di bawah.</div>';
    toast('Wilayah tidak ditemukan di OpenStreetMap. Gunakan area manual.', 'warn'); return;
  }
  $('wilList').innerHTML = '';
  res.slice(0, 10).forEach((x, i) => {
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<b>${esc(x.name || '')}</b> <span class="badge ${isPoly(x) ? 'b-ok' : 'b-mid'}">${isPoly(x) ? 'ada batas' : 'titik saja'}</span><div class="hint">${esc(x.display_name)}</div>`;
    d.onclick = () => { document.querySelectorAll('#wilList .item').forEach(e => e.classList.remove('sel')); d.classList.add('sel'); pilihWilayah(x); };
    $('wilList').appendChild(d);
    if (i === 0) { d.classList.add('sel'); pilihWilayah(x); }
  });
});
function circleRing(lat, lon, r) {
  const p = CORE.makeProj(lat, lon), out = [];
  for (let i = 0; i < 64; i++) { const a = i / 64 * 2 * Math.PI; out.push(p.inv(r * Math.cos(a), r * Math.sin(a))); }
  return out;
}
function pilihWilayah(x) {
  let rings = [];
  if (isPoly(x)) {
    const g = x.geojson;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    rings = polys.map(p => p[0].map(c => [c[1], c[0]]));
  } else {
    rings = [circleRing(+x.lat, +x.lon, +$('inRad').value || 1500)];
    toast('Wilayah ini tidak punya batas poligon di OSM — dipakai lingkaran radius ' + ($('inRad').value || 1500) + ' m.', 'warn');
    LOG.warn('Wilayah tanpa poligon, pakai lingkaran', { lat: x.lat, lon: x.lon });
  }
  setWilayah({ name: x.display_name, rings, hasPoly: isPoly(x) });
}
function setWilayah(w) {
  S.wil = w; S.osm = null; S.cands = []; S.sel = -1; CTX = null;
  drawWilayah(); $('btnJalan').disabled = false;
  $('jalanInfo').textContent = 'Wilayah dipilih. Sekarang ambil data jalan.';
  G.osm && G.osm.clearLayers(); G.cand && G.cand.clearLayers(); G.res && G.res.clearLayers();
  LOG.info('Wilayah dipilih: ' + w.name, { ring: w.rings.length, titik: w.rings.reduce((a, r) => a + r.length, 0) });
  markDone();
}
function drawWilayah() {
  if (!map || !S.wil) return;
  G.bnd.clearLayers();
  const pl = L.polygon(S.wil.rings, { color: '#facc15', weight: 2, fill: false, dashArray: '6 4', interactive: false }).addTo(G.bnd);
  map.fitBounds(pl.getBounds(), { padding: [20, 20] });
}
function wilBBox() {
  let s = 90, n = -90, w = 180, e = -180;
  for (const r of S.wil.rings) for (const p of r) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  return { s, n, w, e };
}
function setProj() {
  const b = wilBBox(); S.proj0 = { lat0: (b.s + b.n) / 2, lon0: (b.w + b.e) / 2 };
  PROJ = CORE.makeProj(S.proj0.lat0, S.proj0.lon0);
  const ringsXY = S.wil.rings.map(r => r.map(p => PROJ.fwd(p[0], p[1])));
  inAreaFn = (x, y) => {
    for (const r of ringsXY) if (CORE.pointInRing(x, y, r)) return true;
    for (const r of ringsXY) if (CORE.plNearest(r.concat([r[0]]), [x, y]).d < 150) return true;
    return false;
  };
}
const EXCL_BASE = 'proposed|construction|abandoned|platform|raceway|bus_stop|elevator|corridor|razed|disused';
const EXCL_FOOT = '|footway|path|steps|track|cycleway|bridleway|pedestrian';
function hwExcl() { return new RegExp('^(' + EXCL_BASE + ($('inFoot').checked ? '' : EXCL_FOOT) + ')$'); }
async function fetchText(url, label, timeoutMs) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now(); LOG.info(`${label} → GET ${url.slice(0, 220)}`);
  let res;
  try { res = await fetch(url, { signal: ctrl.signal }); }
  catch (e) { clearTimeout(tm); const m = e.name === 'AbortError' ? `Waktu habis (${timeoutMs / 1000} dtk)` : 'Gagal terhubung'; LOG.error(`${label}: ${m}`, e.message); const er = new Error(`${label}: ${m}`); er.status = 0; throw er; }
  clearTimeout(tm);
  const txt = await res.text();
  LOG.info(`${label} ← HTTP ${res.status} (${txt.length} byte, ${Math.round(performance.now() - t0)} ms)`);
  if (!res.ok) { const er = new Error(`${label}: HTTP ${res.status} ${txt.slice(0, 160)}`); er.status = res.status; LOG.warn(`${label}: HTTP ${res.status}`, txt.slice(0, 400)); throw er; }
  return txt;
}
function jalanStatus(t) { $('jalanInfo').textContent = t; }
// Sumber 1: Overpass (beberapa server, waktu tunggu pendek)
async function viaOverpass(bb, round) {
  const ex = EXCL_BASE + ($('inFoot').checked ? '' : EXCL_FOOT);
  const q = `[out:json][timeout:50];way["highway"]["highway"!~"^(${ex})$"](${bb.s.toFixed(6)},${bb.w.toFixed(6)},${bb.n.toFixed(6)},${bb.e.toFixed(6)})->.w;.w out body;node(w.w);out skel qt;`;
  const mirrors = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const m of mirrors) {
    const host = new URL(m).host;
    jalanStatus(`Mengunduh dari server Overpass ${host} (putaran ${round})…`);
    try {
      const d = await fetchJSON(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 'Overpass ' + host, 60000);
      if (d && d.elements) {
        const nodes = {}, ways = [];
        for (const el of d.elements) {
          if (el.type === 'node') nodes[el.id] = [el.lat, el.lon];
          else if (el.type === 'way') { const t = el.tags || {}; ways.push({ id: el.id, hw: t.highway, nodes: el.nodes, name: [t.name, t.alt_name, t.old_name, t.short_name].filter(Boolean).join(' ; ') }); }
        }
        if (d.remark) LOG.warn('Catatan Overpass: ' + d.remark);
        if (ways.length || !d.remark) return { nodes, ways, src: 'Overpass ' + host };
      }
    } catch (e) { LOG.warn('Server Overpass ' + host + ' gagal, coba sumber lain'); }
  }
  return null;
}
// Sumber 2: API utama OpenStreetMap (api/0.6/map), dipecah otomatis bila area terlalu padat
function parseOsmXml(txt, acc) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML OSM tidak valid');
  const ex = hwExcl();
  for (const n of doc.getElementsByTagName('node')) acc.allNodes[n.getAttribute('id')] = [+n.getAttribute('lat'), +n.getAttribute('lon')];
  for (const w of doc.getElementsByTagName('way')) {
    const id = +w.getAttribute('id'); if (acc.seen.has(id)) continue;
    const t = {}; for (const tg of w.getElementsByTagName('tag')) t[tg.getAttribute('k')] = tg.getAttribute('v');
    if (!t.highway || ex.test(t.highway)) continue;
    acc.seen.add(id);
    acc.ways.push({ id, hw: t.highway, nodes: [...w.getElementsByTagName('nd')].map(nd => +nd.getAttribute('ref')), name: [t.name, t.alt_name, t.old_name, t.short_name].filter(Boolean).join(' ; ') });
  }
}
async function osmApiTile(bb, depth, acc, cnt) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bb.w.toFixed(6)},${bb.s.toFixed(6)},${bb.e.toFixed(6)},${bb.n.toFixed(6)}`;
  try {
    cnt.n++; jalanStatus(`Mengunduh dari API OpenStreetMap, petak ${cnt.n}…`);
    const txt = await fetchText(url, `OSM API petak ${cnt.n} (lvl ${depth})`, 90000);
    parseOsmXml(txt, acc);
    await sleep(300);
  } catch (e) {
    if ((e.status === 400 || e.status === 509 || e.status === 0) && depth < 4) {
      LOG.info(`Petak terlalu padat/gagal (HTTP ${e.status}) → dipecah 4`);
      const mx = (bb.w + bb.e) / 2, my = (bb.s + bb.n) / 2;
      for (const t of [{ s: bb.s, n: my, w: bb.w, e: mx }, { s: bb.s, n: my, w: mx, e: bb.e }, { s: my, n: bb.n, w: bb.w, e: mx }, { s: my, n: bb.n, w: mx, e: bb.e }]) await osmApiTile(t, depth + 1, acc, cnt);
    } else throw e;
  }
}
async function viaOsmApi(bb) {
  const acc = { allNodes: {}, ways: [], seen: new Set() }, cnt = { n: 0 };
  // mulai dengan petak ±0,02° agar jarang ditolak
  const step = 0.02, tiles = [];
  for (let s = bb.s; s < bb.n; s += step) for (let w = bb.w; w < bb.e; w += step) tiles.push({ s, n: Math.min(bb.n, s + step), w, e: Math.min(bb.e, w + step) });
  LOG.info(`Sumber cadangan: API OpenStreetMap, ${tiles.length} petak awal`);
  for (const t of tiles) await osmApiTile(t, 0, acc, cnt);
  const nodes = {};
  for (const w of acc.ways) for (const id of w.nodes) if (acc.allNodes[id]) nodes[id] = acc.allNodes[id];
  return { nodes, ways: acc.ways, src: 'API OpenStreetMap' };
}
// Sumber 3: file yang diunggah pengguna (.osm XML, JSON Overpass, GeoJSON)
async function viaFile(file) {
  const txt = await file.text();
  LOG.info('Impor file data jalan: ' + file.name + ' (' + txt.length + ' byte)');
  const t = txt.trimStart();
  if (t.startsWith('<')) {
    const acc = { allNodes: {}, ways: [], seen: new Set() }; parseOsmXml(txt, acc);
    const nodes = {}; for (const w of acc.ways) for (const id of w.nodes) if (acc.allNodes[id]) nodes[id] = acc.allNodes[id];
    return { nodes, ways: acc.ways, src: 'file ' + file.name };
  }
  const J = JSON.parse(txt);
  if (J.elements) {
    const nodes = {}, ways = [], ex = hwExcl();
    for (const el of J.elements) {
      if (el.type === 'node') nodes[el.id] = [el.lat, el.lon];
      else if (el.type === 'way' && el.tags && el.tags.highway && !ex.test(el.tags.highway)) {
        if (el.geometry) { el.nodes = el.geometry.map((g, i) => { const id = -(el.id * 10000 + i); nodes[id] = [g.lat, g.lon]; return id; }); }
        ways.push({ id: el.id, hw: el.tags.highway, nodes: el.nodes, name: [el.tags.name, el.tags.alt_name].filter(Boolean).join(' ; ') });
      }
    }
    return { nodes, ways, src: 'file ' + file.name };
  }
  if (J.type === 'FeatureCollection') {
    // GeoJSON: titik-titik yang sama koordinatnya dijadikan simpul yang sama
    const nodes = {}, ways = [], key = new Map(); let nid = 1;
    const idOf = c => { const k = c[1].toFixed(7) + ',' + c[0].toFixed(7); if (!key.has(k)) { key.set(k, nid); nodes[nid] = [c[1], c[0]]; nid++; } return key.get(k); };
    J.features.forEach((f, i) => {
      const g = f.geometry; if (!g) return; const p = f.properties || {};
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const l of lines) ways.push({ id: i + 1, hw: p.highway || 'road', nodes: l.map(idOf), name: p.name || '' });
    });
    return { nodes, ways, src: 'file ' + file.name };
  }
  throw new Error('Format file tidak dikenali. Gunakan .osm (XML), JSON Overpass, atau GeoJSON garis.');
}
function terimaJalan(D) {
  if (!D.ways.length) throw new Error('Tidak ada jalan di data (' + D.src + '). Coba centang gang/jalan setapak, atau perbesar area.');
  S.osm = { nodes: D.nodes, ways: D.ways };
  setProj(); CTX = null; drawOSM();
  const nodes = D.nodes; let km = 0;
  for (const w of D.ways) for (let i = 1; i < w.nodes.length; i++) { const a = nodes[w.nodes[i - 1]], c = nodes[w.nodes[i]]; if (a && c) { const p = PROJ.fwd(a[0], a[1]), r = PROJ.fwd(c[0], c[1]); km += Math.hypot(p[0] - r[0], p[1] - r[1]) / 1000; } }
  const named = D.ways.filter(w => w.name).length;
  $('jalanInfo').innerHTML = `✅ <b>${D.ways.length.toLocaleString('id')}</b> ruas jalan, total ±${km.toFixed(1)} km, ${named.toLocaleString('id')} ruas bernama.<br><span class="hint">Sumber: ${esc(D.src)}. Lanjut ke langkah 2.</span>`;
  LOG.info('Data jalan dimuat dari ' + D.src, { ruas: D.ways.length, node: Object.keys(nodes).length, km: +km.toFixed(2), bernama: named });
  toast('Data jalan berhasil dimuat (' + D.src + ').', 'ok'); markDone();
}
const ambilJalan = safe('Ambil data jalan', async () => {
  if (!S.wil) throw new Error('Pilih wilayah dulu.');
  const b = wilBBox(); const lat = (b.s + b.n) / 2;
  const dLa = 300 / 111000, dLo = 300 / (111000 * Math.cos(lat * DEG));
  const bb = { s: b.s - dLa, n: b.n + dLa, w: b.w - dLo, e: b.e + dLo };
  const areaKm = (bb.n - bb.s) * 111 * (bb.e - bb.w) * 111 * Math.cos(lat * DEG);
  LOG.info(`BBox data jalan ≈ ${areaKm.toFixed(1)} km²`, bb);
  if (areaKm > 400) toast(`Wilayah sangat luas (${areaKm.toFixed(0)} km²). Pengambilan & pencocokan bisa lambat.`, 'warn');
  $('btnJalan').disabled = true;
  try {
    let D = await viaOverpass(bb, 1);
    if (!D) {
      LOG.warn('Semua server Overpass gagal → beralih ke API utama OpenStreetMap');
      try { D = await viaOsmApi(bb); } catch (e) { LOG.error('API OpenStreetMap gagal', e); }
    }
    if (!D || !D.ways.length) {
      for (const wait of [10, 30]) {
        jalanStatus(`Semua server sibuk. Mencoba lagi dalam ${wait} detik…`); LOG.info(`Menunggu ${wait} dtk sebelum mencoba ulang Overpass`);
        await sleep(wait * 1000);
        D = await viaOverpass(bb, wait === 10 ? 2 : 3); if (D) break;
      }
    }
    if (!D) { jalanStatus('❌ Gagal dari semua sumber. Coba lagi nanti, atau pakai "Impor file data jalan" di bawah.'); throw new Error('Semua sumber data jalan gagal (server sibuk). Coba lagi beberapa menit lagi atau impor file.'); }
    terimaJalan(D);
  } finally { $('btnJalan').disabled = false; }
});
const imporJalan = safe('Impor data jalan', async file => {
  if (!S.wil) throw new Error('Pilih wilayah dulu (atau area manual), baru impor file.');
  terimaJalan(await viaFile(file));
});
function hwColor(hw) {
  if (/motorway|trunk|primary|secondary/.test(hw)) return '#f97316';
  if (/tertiary|residential|unclassified|road/.test(hw)) return '#38bdf8';
  if (/service|living_street/.test(hw)) return '#a3e635';
  return '#e879f9';
}
function drawOSM() {
  if (!map || !S.osm) return;
  G.osm.clearLayers();
  for (const w of S.osm.ways) {
    const ll = w.nodes.map(id => S.osm.nodes[id]).filter(Boolean);
    if (ll.length < 2) continue;
    const pl = L.polyline(ll, { color: hwColor(w.hw || ''), weight: 2, opacity: 0.85 });
    if (w.name) pl.bindTooltip(w.name.split(' ; ')[0] + ' (' + w.hw + ')', { sticky: true });
    pl.addTo(G.osm);
  }
}

/* ---------- LANGKAH 2: SKETSA ---------- */
const SK = { cv: null, ctx: null, dpr: 1, view: { s: 1, ox: 0, oy: 0 }, tool: 'road', cur: null, mouse: null, pan: null, dragV: null, downAt: null, moved: false, space: false, junc: [] };
function skResize() {
  if (!SK.cv) return;
  const r = SK.cv.parentElement.getBoundingClientRect(); if (!r.width) return;
  SK.dpr = devicePixelRatio || 1; SK.cv.width = r.width * SK.dpr; SK.cv.height = r.height * SK.dpr;
  if (!SK.fitted && S.img) { skFit(); SK.fitted = true; } else skDraw();
}
function skFit() {
  if (!S.img || !SK.cv) return;
  const W = SK.cv.width / SK.dpr, H = SK.cv.height / SK.dpr; if (!W) return;
  const s = Math.min(W / S.img.w, H / S.img.h) * 0.95;
  SK.view = { s, ox: (W - S.img.w * s) / 2, oy: (H - S.img.h * s) / 2 }; skDraw();
}
const toScr = p => [p[0] * SK.view.s + SK.view.ox, p[1] * SK.view.s + SK.view.oy];
const toImg = (x, y) => [(x - SK.view.ox) / SK.view.s, (y - SK.view.oy) / SK.view.s];
function skDraw() {
  const c = SK.ctx; if (!c) return;
  const W = SK.cv.width / SK.dpr, H = SK.cv.height / SK.dpr;
  c.setTransform(SK.dpr, 0, 0, SK.dpr, 0, 0); c.clearRect(0, 0, W, H);
  if (!S.img || !imgEl) { c.fillStyle = '#94a3b8'; c.font = '16px system-ui'; c.textAlign = 'center'; c.fillText('Muat gambar situasi (panel kiri) — atau tempel (Ctrl+V) / seret ke sini', W / 2, H / 2); return; }
  c.drawImage(imgEl, SK.view.ox, SK.view.oy, S.img.w * SK.view.s, S.img.h * SK.view.s);
  const line = (pts, col, w, close, dash) => {
    if (pts.length < 1) return; c.beginPath(); pts.forEach((p, i) => { const q = toScr(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
    if (close) c.closePath(); c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.setLineDash([]);
  };
  const dots = (pts, col, r = 3.5) => { c.fillStyle = col; for (const p of pts) { const q = toScr(p); c.beginPath(); c.arc(q[0], q[1], r, 0, 7); c.fill(); } };
  if (S.parcel) {
    c.beginPath(); S.parcel.forEach((p, i) => { const q = toScr(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath();
    c.fillStyle = 'rgba(168,85,247,.35)'; c.fill(); line(S.parcel, '#a855f7', 3, true); dots(S.parcel, '#a855f7');
  }
  S.roads.forEach((r, i) => {
    line(r.pts, 'rgba(0,0,0,.6)', 6); line(r.pts, '#ef4444', 3); dots(r.pts, '#fff', 3);
    const m = CORE.plPointAt(r.pts, CORE.plLen(r.pts) / 2), q = toScr(m);
    c.font = 'bold 12px system-ui'; c.textAlign = 'center'; const t = '#' + (i + 1) + (r.name ? ' ' + r.name : '');
    c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(t, q[0], q[1] - 8); c.fillStyle = '#fff'; c.fillText(t, q[0], q[1] - 8);
  });
  for (const j of SK.junc) { const q = toScr(j); c.beginPath(); c.arc(q[0], q[1], 7, 0, 7); c.strokeStyle = '#000'; c.lineWidth = 3; c.stroke(); c.strokeStyle = '#facc15'; c.lineWidth = 2; c.stroke(); }
  if (SK.cur) {
    const pts = SK.cur.pts.concat(SK.mouse ? [SK.mouse] : []);
    line(pts, '#f59e0b', 3, false, [6, 4]); dots(SK.cur.pts, '#f59e0b', 4);
  }
  S.cps.forEach((p, i) => {
    const q = toScr(p.img); c.beginPath(); c.arc(q[0], q[1], 9, 0, 7); c.fillStyle = p.ll ? '#22c55e' : '#facc15'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#000'; c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.fillText(String(i + 1), q[0], q[1] + 4);
  });
}
function snapPt(p) {
  const tv = 10 / SK.view.s, ts = 8 / SK.view.s;
  let best = null, bd = tv;
  const cands = []; S.roads.forEach(r => cands.push(...r.pts)); if (S.parcel) cands.push(...S.parcel);
  if (SK.cur && SK.cur.pts.length) cands.push(SK.cur.pts[0]);
  for (const q of cands) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q.slice(); } }
  if (best) return best;
  if (SK.cur && SK.cur.type === 'road') {
    let bs = null, bsd = ts;
    for (const r of S.roads) { const n = CORE.plNearest(r.pts, p); if (n.d < bsd) { bsd = n.d; bs = n.pt; } }
    if (bs) return bs.slice();
  }
  return p;
}
function hitVertex(x, y) {
  const t = 9;
  for (let i = 0; i < S.cps.length; i++) { const q = toScr(S.cps[i].img); if (Math.hypot(q[0] - x, q[1] - y) < t) return { k: 'cp', i }; }
  if (S.parcel) for (let j = 0; j < S.parcel.length; j++) { const q = toScr(S.parcel[j]); if (Math.hypot(q[0] - x, q[1] - y) < t) return { k: 'parcel', j }; }
  for (let i = 0; i < S.roads.length; i++) for (let j = 0; j < S.roads[i].pts.length; j++) { const q = toScr(S.roads[i].pts[j]); if (Math.hypot(q[0] - x, q[1] - y) < t) return { k: 'road', i, j }; }
  return null;
}
function setVertex(h, p) { if (h.k === 'cp') S.cps[h.i].img = p; else if (h.k === 'parcel') S.parcel[h.j] = p; else S.roads[h.i].pts[h.j] = p; }
function delVertex(h) {
  if (h.k === 'cp') { S.cps.splice(h.i, 1); }
  else if (h.k === 'parcel') { S.parcel.splice(h.j, 1); if (S.parcel.length < 3) S.parcel = null; }
  else { S.roads[h.i].pts.splice(h.j, 1); if (S.roads[h.i].pts.length < 2) S.roads.splice(h.i, 1); }
  onSketchChanged();
}
function skClick(x, y) {
  if (!S.img) return;
  let p = toImg(x, y);
  if (SK.tool === 'road' || SK.tool === 'parcel') {
    if (!SK.cur || SK.cur.type !== SK.tool) SK.cur = { type: SK.tool, pts: [] };
    const pts = SK.cur.pts;
    if (pts.length) { const q = toScr(pts[pts.length - 1]); if (Math.hypot(q[0] - x, q[1] - y) < 4) return; }
    if (SK.tool === 'parcel' && pts.length >= 3) { const q = toScr(pts[0]); if (Math.hypot(q[0] - x, q[1] - y) < 10) { skFinish(); return; } }
    p = snapPt(p); pts.push(p); skDraw();
  } else if (SK.tool === 'cp') {
    S.cps.push({ img: p, ll: null }); LOG.info('Titik ikat #' + S.cps.length + ' ditambahkan di sketsa', p.map(v => +v.toFixed(1))); onSketchChanged();
  }
}
function skFinish() {
  if (!SK.cur) return;
  const c = SK.cur; SK.cur = null;
  if (c.type === 'road') {
    if (c.pts.length >= 2) { S.roads.push({ name: $('inRoadName').value.trim(), pts: c.pts }); $('inRoadName').value = ''; LOG.info('Jalan sketsa ditambahkan', { no: S.roads.length, titik: c.pts.length, nama: S.roads[S.roads.length - 1].name }); }
    else toast('Garis jalan perlu minimal 2 titik.', 'warn');
  } else if (c.type === 'parcel') {
    if (c.pts.length >= 3) { S.parcel = c.pts; LOG.info('Bidang digambar', { titik: c.pts.length }); }
    else toast('Bidang perlu minimal 3 titik.', 'warn');
  }
  onSketchChanged();
}
function skUndo() {
  if (SK.cur && SK.cur.pts.length) { SK.cur.pts.pop(); if (!SK.cur.pts.length) SK.cur = null; skDraw(); }
}
function onSketchChanged() {
  try {
    if (S.img && S.roads.length) {
      const diag = Math.hypot(S.img.w, S.img.h);
      SK.junc = CORE.sketchJunctions(S.roads.map(r => r.pts.map(p => [p[0], -p[1]])), 0.015 * diag, 0.06 * diag).map(j => [j.x, -j.y]);
    } else SK.junc = [];
  } catch (e) { LOG.error('Deteksi simpang sketsa gagal', e); SK.junc = []; }
  renderRoadList(); renderParcelInfo(); skDraw(); markDone(); updateCpInfo();
  if (S.cands.length) { CTX = null; }
}
function renderRoadList() {
  const L0 = $('roadList'); L0.innerHTML = '';
  if (!S.roads.length) { L0.innerHTML = '<div class="hint">Belum ada jalan. Pilih alat 🛣️ Jalan lalu klik di sepanjang jalan pada gambar.</div>'; return; }
  S.roads.forEach((r, i) => {
    const d = document.createElement('div'); d.className = 'item row';
    d.innerHTML = `<span class="nf">#${i + 1}</span><input type="text" placeholder="nama jalan (opsional)" value="${esc(r.name)}"><span class="nf hint">${r.pts.length} titik</span><button class="nf dan" title="Hapus">✕</button>`;
    d.querySelector('input').oninput = e => { r.name = e.target.value; skDraw(); };
    d.querySelector('button').onclick = () => { S.roads.splice(i, 1); LOG.info('Jalan #' + (i + 1) + ' dihapus'); onSketchChanged(); };
    L0.appendChild(d);
  });
  const h = document.createElement('div'); h.className = 'hint'; h.textContent = `Simpang terdeteksi: ${SK.junc.length}` + (SK.junc.length ? '' : ' — tarik ujung jalan menempel ke jalan lain agar simpang terbaca.');
  L0.appendChild(h);
}
function getLuas() { const v = parseFloat($('inLuas').value); return v > 0 ? v : null; }
function getLebar() { const v = parseFloat($('inLebar').value); return v > 0 ? v : null; }
function renderParcelInfo() {
  const el = $('parcelInfo');
  if (!S.parcel) { el.innerHTML = 'Bidang: <b>belum digambar</b> (alat ⬛ Bidang, klik sudut-sudutnya, klik titik pertama/Enter untuk menutup).'; return; }
  const A = CORE.polyArea(S.parcel), L0 = getLuas();
  let h = `Bidang: ${S.parcel.length} titik sudut.`;
  if (L0) {
    const s = Math.sqrt(L0 / A);
    const sides = S.parcel.map((p, i) => { const q = S.parcel[(i + 1) % S.parcel.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) * s; });
    h += `<br>Skala dari luas: <b>${fmt(s, 3)} m/piksel</b>.<br>Perkiraan panjang sisi: ${sides.map(v => fmt(v, 1) + ' m').join(', ')}.<div class="hint">Bandingkan dengan ukuran yang tertulis di gambar. Jika jauh berbeda, cek luas atau gambar bidang.</div>`;
  }
  el.innerHTML = h;
}
function loadImageFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('File bukan gambar: ' + file.type, 'err'); LOG.error('File bukan gambar', { name: file.name, type: file.type }); return; }
  const fr = new FileReader();
  fr.onerror = () => LOG.error('Gagal membaca file gambar', fr.error);
  fr.onload = () => setImage(fr.result, file.name || 'tempelan.png');
  fr.readAsDataURL(file);
}
function setImage(dataURL, name, keep) {
  const im = new Image();
  im.onload = () => {
    imgEl = im; S.img = { dataURL, w: im.naturalWidth, h: im.naturalHeight, name };
    if (!keep) { S.roads = []; S.parcel = null; S.cps = []; S.cands = []; S.sel = -1; S.T = null; CTX = null; SK.cur = null; }
    SK.fitted = false; skResize(); skFit(); onSketchChanged();
    LOG.info('Gambar dimuat', { name, w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(dataURL.length * 0.75 / 1024) });
  };
  im.onerror = () => { LOG.error('Gambar tidak bisa dibuka (format tidak didukung?)', { name }); toast('Gambar tidak bisa dibuka.', 'err'); };
  im.src = dataURL;
}
function initSketch() {
  SK.cv = $('sk'); SK.ctx = SK.cv.getContext('2d');
  const pos = e => { const r = SK.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  SK.cv.addEventListener('pointerdown', e => {
    SK.cv.setPointerCapture(e.pointerId);
    const [x, y] = pos(e); SK.downAt = [x, y]; SK.moved = false;
    if (e.button === 1 || SK.tool === 'pan' || SK.space) { SK.pan = { x, y, ox: SK.view.ox, oy: SK.view.oy }; e.preventDefault(); return; }
    if (SK.tool === 'edit' && e.button === 0) { const h = hitVertex(x, y); if (h) SK.dragV = h; }
  });
  SK.cv.addEventListener('pointermove', e => {
    const [x, y] = pos(e); SK.mouse = toImg(x, y);
    if (SK.downAt && Math.hypot(x - SK.downAt[0], y - SK.downAt[1]) > 4) SK.moved = true;
    if (SK.pan) { SK.view.ox = SK.pan.ox + x - SK.pan.x; SK.view.oy = SK.pan.oy + y - SK.pan.y; }
    else if (SK.dragV) setVertex(SK.dragV, SK.mouse);
    skDraw();
  });
  SK.cv.addEventListener('pointerup', e => {
    const [x, y] = pos(e);
    if (SK.pan) SK.pan = null;
    else if (SK.dragV) { SK.dragV = null; onSketchChanged(); }
    else if (e.button === 0 && !SK.moved) skClick(x, y);
    SK.downAt = null;
  });
  SK.cv.addEventListener('dblclick', e => { e.preventDefault(); skFinish(); });
  SK.cv.addEventListener('contextmenu', e => {
    e.preventDefault(); const [x, y] = pos(e);
    if (SK.cur) { skUndo(); return; }
    const h = hitVertex(x, y); if (h) delVertex(h);
  });
  SK.cv.addEventListener('wheel', e => {
    e.preventDefault(); const [x, y] = pos(e); const k = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    SK.view.ox = x - (x - SK.view.ox) * k; SK.view.oy = y - (y - SK.view.oy) * k; SK.view.s *= k; skDraw();
  }, { passive: false });
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (STEP !== 2) return;
    if (e.key === 'Enter') skFinish();
    else if (e.key === 'Escape') { SK.cur = null; skDraw(); }
    else if (e.key === 'Backspace') { e.preventDefault(); skUndo(); }
    else if (e.key === ' ') { SK.space = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') SK.space = false; });
  document.querySelectorAll('#skTools [data-tool]').forEach(b => b.onclick = () => {
    if (SK.cur) skFinish();
    SK.tool = b.dataset.tool; document.querySelectorAll('#skTools [data-tool]').forEach(x => x.classList.toggle('on', x === b));
    SK.cv.style.cursor = SK.tool === 'pan' ? 'grab' : SK.tool === 'edit' ? 'pointer' : 'crosshair';
  });
  SK.cv.style.cursor = 'crosshair';
  $('skFinish').onclick = skFinish; $('skUndo').onclick = skUndo; $('skFit').onclick = skFit;
  $('skClear').onclick = () => {
    if (!S.roads.length && !S.parcel && !S.cps.length) return;
    if ($('skClear').dataset.arm !== '1') { $('skClear').dataset.arm = '1'; $('skClear').textContent = 'Yakin? klik lagi'; setTimeout(() => { $('skClear').dataset.arm = ''; $('skClear').textContent = '🗑 Semua'; }, 3000); return; }
    S.roads = []; S.parcel = null; S.cps = []; SK.cur = null; $('skClear').dataset.arm = ''; $('skClear').textContent = '🗑 Semua';
    LOG.info('Semua gambar sketsa dihapus'); onSketchChanged();
  };
  $('fileImg').onchange = e => loadImageFile(e.target.files[0]);
  const drop = ev => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) { loadImageFile(f); if (STEP !== 2) go(2); } };
  for (const el of [$('drop'), SK.cv]) { el.addEventListener('dragover', e => e.preventDefault()); el.addEventListener('drop', drop); }
  document.addEventListener('paste', e => {
    const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (it) { loadImageFile(it.getAsFile()); go(2); }
  });
  $('inLuas').oninput = renderParcelInfo;
  new ResizeObserver(() => { skResize(); cmpDraw(); }).observe($('skWrap'));
  new ResizeObserver(() => cmpDraw()).observe($('cmpWrap'));
}

/* ---------- AI (opsional) ---------- */
const aiDetect = safe('Deteksi AI', async () => {
  if (!S.img) throw new Error('Muat gambar dulu.');
  const key = $('inKey').value.trim(); if (!key) throw new Error('Isi API key Anthropic.');
  const model = $('inModel').value.trim() || 'claude-sonnet-5-5';
  const mx = 1568, k = Math.min(1, mx / Math.max(S.img.w, S.img.h));
  const cv = document.createElement('canvas'); cv.width = Math.round(S.img.w * k); cv.height = Math.round(S.img.h * k);
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(imgEl, 0, 0, cv.width, cv.height);
  const b64 = cv.toDataURL('image/jpeg', 0.9).split(',')[1];
  const prompt = `Ini gambar situasi bidang tanah (sketsa/denah/peta bidang). Tugas:
1) Telusuri GARIS TENGAH setiap jalan/gang yang tampak (polyline beberapa titik; ujung jalan yang bertemu jalan lain harus tepat di garis jalan tersebut agar simpang terbaca).
2) Batas BIDANG TANAH yang dimaksud (biasanya diarsir/diwarnai/diberi nomor/ukuran) sebagai poligon titik sudut.
3) Arah panah utara bila ada (derajat searah jarum jam dari arah atas gambar), selain itu null.
4) Luas tanah bila tertulis (m²), selain itu null.
Koordinat dinormalisasi 0–1000 (x dari kiri, y dari atas gambar).
Balas HANYA JSON tanpa teks lain:
{"roads":[{"name":"nama jalan atau \\"\\"","points":[[x,y],[x,y]]}],"parcel":[[x,y],...],"north_deg":null,"area_m2":null,"notes":"catatan singkat"}`;
  $('btnAI').disabled = true; $('btnAI').textContent = 'Memproses…';
  let r;
  try {
    r = await fetchJSON('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: prompt }] }] })
    }, 'Claude API (' + model + ')', 120000);
  } finally { $('btnAI').disabled = false; $('btnAI').textContent = 'Deteksi dengan AI'; }
  const txt = (r.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  LOG.info('Jawaban AI (mentah)', txt.slice(0, 3000));
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('Jawaban AI tidak berisi JSON.');
  let J; try { J = JSON.parse(m[0]); } catch (e) { throw new Error('JSON dari AI tidak valid: ' + e.message); }
  const sx = S.img.w / 1000, sy = S.img.h / 1000;
  const cv2 = p => [Math.max(0, Math.min(1000, +p[0])) * sx, Math.max(0, Math.min(1000, +p[1])) * sy];
  S.aiBackup = { roads: JSON.parse(JSON.stringify(S.roads)), parcel: S.parcel ? S.parcel.slice() : null };
  const roads = (J.roads || []).filter(x => x.points && x.points.length >= 2).map(x => ({ name: x.name || '', pts: x.points.map(cv2) }));
  if (roads.length) S.roads = roads;
  if (J.parcel && J.parcel.length >= 3) S.parcel = J.parcel.map(cv2);
  if (J.north_deg != null && isFinite(J.north_deg)) { $('inNorth').checked = true; $('inNorthDeg').value = Math.round(J.north_deg); }
  if (J.area_m2 && !getLuas()) $('inLuas').value = J.area_m2;
  $('btnAIUndo').disabled = false;
  LOG.info('Hasil AI diterapkan', { jalan: roads.length, bidang: S.parcel ? S.parcel.length : 0, utara: J.north_deg, luas: J.area_m2, catatan: J.notes });
  toast(`AI: ${roads.length} jalan, bidang ${J.parcel ? 'terdeteksi' : 'tidak terdeteksi'}. Periksa & perbaiki dengan alat Edit.`, 'ok');
  onSketchChanged();
});

/* ---------- LANGKAH 3: PENCOCOKAN ---------- */
function renderReady() {
  const ok = (b, t) => (b ? '✅ ' : '❌ ') + t;
  const L0 = getLuas(), Lb = getLebar();
  const items = [
    ok(!!S.wil, 'Wilayah: ' + (S.wil ? esc(S.wil.name.split(',').slice(0, 3).join(',')) : 'belum')),
    ok(!!S.osm, 'Data jalan OSM: ' + (S.osm ? S.osm.ways.length + ' ruas' : 'belum')),
    ok(!!S.img, 'Gambar situasi'),
    ok(S.roads.length > 0, `Jalan di sketsa: ${S.roads.length} (simpang ${SK.junc.length})`),
    ok(!!S.parcel, 'Bidang tanah digambar'),
    ok(!!(L0 || Lb), L0 ? 'Luas: ' + fmt(L0, 0) + ' m²' : Lb ? 'Perkiraan lebar gambar: ' + Lb + ' m' : 'Luas / perkiraan lebar belum diisi'),
    ($('inNorth').checked ? '✅ Arah utara: ' + $('inNorthDeg').value + '°' : '➖ Arah utara tidak diketahui (rotasi dicari bebas)')
  ];
  let warn = '';
  if (S.roads.length && !SK.junc.length) warn = '<br>⚠️ Sketsa tanpa simpang: hasil bisa sangat ambigu. Isi nama jalan, arah utara, atau gunakan titik ikat.';
  else if (SK.junc.length === 1 && !$('inNorth').checked) warn = '<br>⚠️ Hanya 1 simpang & arah utara tidak diketahui: banyak simpang serupa mungkin cocok. Isi arah utara / nama jalan bila ada.';
  $('readyInfo').innerHTML = items.join('<br>') + warn;
}
function buildCtx(s0) {
  const nodeXY = new Map();
  for (const id in S.osm.nodes) { const p = S.osm.nodes[id]; nodeXY.set(+id, PROJ.fwd(p[0], p[1])); }
  const t0 = performance.now();
  const ctx = CORE.prepareCtx({
    ways: S.osm.ways, nodeXY, roadsImg: S.roads, parcelImg: S.parcel, imgW: S.img.w, imgH: S.img.h,
    s0, tau: Math.max(2, +$('inTau').value || 12), inArea: inAreaFn, wRev: Math.min(0.6, Math.max(0, +$('inWrev').value || 0.3)),
    log: (l, m) => l === 'warn' ? LOG.warn(m) : LOG.info(m)
  });
  LOG.info(`Konteks pencocokan siap (${Math.round(performance.now() - t0)} ms)`);
  return ctx;
}
function ensureCtx() {
  if (CTX) return CTX;
  if (!S.osm || !S.img || !S.roads.length || !S.parcel || !PROJ) return null;
  try { CTX = buildCtx(S.T ? S.T.s : estS0()); } catch (e) { LOG.error('Gagal menyiapkan konteks skor', e); CTX = null; }
  return CTX;
}
function estS0() {
  const L0 = getLuas(), Lb = getLebar();
  if (L0 && S.parcel) return Math.sqrt(L0 / CORE.polyArea(S.parcel));
  if (Lb) return Lb / S.img.w;
  return null;
}
const runMatch = safe('Pencocokan', async () => {
  if (!S.osm) throw new Error('Data jalan belum diambil (langkah 1).');
  if (!S.img) throw new Error('Gambar situasi belum dimuat (langkah 2).');
  if (SK.cur) skFinish();
  if (!S.roads.length) throw new Error('Gambar minimal 1 jalan pada sketsa.');
  if (!S.parcel) throw new Error('Gambar bidang tanah pada sketsa.');
  const L0 = getLuas(), s0 = estS0();
  if (!s0) throw new Error('Isi luas tanah atau perkiraan lebar gambar (m).');
  const v = Math.min(0.6, Math.max(0.02, (+$('inScaleVar').value || 20) / 100));
  const scales = L0 ? [1 - v / 2, 1, 1 + v / 2].map(k => k * s0) : [0.6, 0.75, 0.9, 1.1, 1.3, 1.6].map(k => k * s0);
  const north = $('inNorth').checked, th0 = north ? CORE.normAng((+$('inNorthDeg').value || 0) * DEG) : null;
  const opt = { scales, th0, thTol: 30 * DEG, bounds: { smin: L0 ? s0 * (1 - v) : s0 * 0.4, smax: L0 ? s0 * (1 + v) : s0 * 2.5, th0, thTol: 30 * DEG } };
  LOG.info('Mulai pencocokan', { s0, scales, utara: north ? +$('inNorthDeg').value : null, tau: +$('inTau').value, jalanSketsa: S.roads.length, simpangSketsa: SK.junc.length });
  $('btnMatch').disabled = true; $('prog').style.width = '2%'; $('progTx').textContent = 'Menyiapkan peta jarak…';
  await sleep(30);
  const t0 = performance.now();
  try {
    CTX = buildCtx(s0);
    const out = await CORE.matchAll(CTX, opt, (f, t) => { $('prog').style.width = (f * 100).toFixed(0) + '%'; $('progTx').textContent = t; },
      (l, m) => l === 'warn' ? LOG.warn(m) : LOG.info(m));
    S.cands = out.map((c, i) => ({ T: c.T, r: c.r, label: '#' + (i + 1) }));
  } finally { $('btnMatch').disabled = false; }
  $('prog').style.width = '100%';
  const dt = ((performance.now() - t0) / 1000).toFixed(1);
  $('progTx').textContent = `Selesai dalam ${dt} dtk. ${S.cands.length} kandidat.`;
  LOG.info('Pencocokan selesai dalam ' + dt + ' dtk', S.cands.map(c => ({ label: c.label, skor: +c.r.score.toFixed(3), cocok: +c.r.within.toFixed(2), dev: +c.r.dev.toFixed(1), rev: +c.r.rev.toFixed(2), th: +(c.T.th / DEG).toFixed(1), s: +c.T.s.toFixed(4) })));
  renderCands(); drawCands(); if (S.cands.length) selectCand(0, true);
});
function conf(i) {
  const c = S.cands[i]; if (!c.r) return ['manual', 'b-mid'];
  const sc = c.r.score, gap = S.cands[i + 1] && S.cands[i + 1].r ? sc - S.cands[i + 1].r.score : 1;
  if (i === 0 && sc >= 0.8 && gap > 0.06) return ['keyakinan tinggi', 'b-ok'];
  if (sc >= 0.65) return [i === 0 && gap <= 0.06 ? 'ambigu' : 'sedang', 'b-mid'];
  return ['rendah', 'b-low'];
}
function renderCands() {
  const el = $('candList'); el.innerHTML = '';
  if (!S.cands.length) { el.innerHTML = '<div class="hint">Belum ada.</div>'; return; }
  S.cands.forEach((c, i) => {
    const [t, cl] = conf(i);
    const d = document.createElement('div'); d.className = 'item' + (i === S.sel ? ' sel' : '');
    d.innerHTML = `<b>${esc(c.label)}</b> skor <b>${c.r ? (c.r.score * 100).toFixed(0) + '%' : '-'}</b> <span class="badge ${cl}">${t}</span>
      <div class="hint">${c.r ? `titik sketsa cocok ${(c.r.within * 100).toFixed(0)}%, deviasi rata² ${fmt(c.r.dev, 1)} m, ` : ''}rotasi ${fmt(c.T.th / DEG, 1)}°, skala ${fmt(c.T.s, 3)} m/px${c.rms != null ? ', RMS titik ikat ' + fmt(c.rms, 2) + ' m' : ''}</div>`;
    d.onclick = () => selectCand(i, true);
    el.appendChild(d);
  });
  const h = document.createElement('div'); h.className = 'hint';
  h.innerHTML = 'Klik kandidat untuk melihatnya di peta. Bandingkan dengan citra satelit; pilih yang paling sesuai lalu buka langkah 4.';
  el.appendChild(h);
}
function parcelWorld(T, force) {
  let pts = S.parcel.map(p => CORE.fwdT(T, p[0], -p[1]));
  const L0 = getLuas();
  if (force && L0) {
    const A = CORE.polyArea(pts), c = CORE.centroid(pts), k = Math.sqrt(L0 / A);
    pts = pts.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
  }
  return pts;
}
const toLL = pts => pts.map(p => PROJ.inv(p[0], p[1]));
function drawCands() {
  if (!map) return; G.cand.clearLayers();
  S.cands.forEach((c, i) => {
    const ll = toLL(parcelWorld(c.T, false));
    L.polygon(ll, { color: i === S.sel ? '#f43f5e' : '#22c55e', weight: 2, fillOpacity: 0.15 }).on('click', () => selectCand(i, false)).addTo(G.cand);
    const cc = ll.reduce((a, p) => [a[0] + p[0] / ll.length, a[1] + p[1] / ll.length], [0, 0]);
    L.marker(cc, { icon: L.divIcon({ className: '', html: `<div class="cand-ic ${i === S.sel ? 'sel' : ''}" style="width:26px;height:26px">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .on('click', () => selectCand(i, false)).bindTooltip(c.label + (c.r ? ' — skor ' + (c.r.score * 100).toFixed(0) + '%' : '')).addTo(G.cand);
  });
}
function selectCand(i, fly) {
  S.sel = i; S.T = { ...S.cands[i].T };
  renderCands(); drawCands(); renderResult();
  if (fly && map) { const ll = toLL(parcelWorld(S.T, false)); map.fitBounds(L.latLngBounds(ll).pad(4), { maxZoom: 19 }); }
  LOG.info('Kandidat dipilih: ' + S.cands[i].label, { T: S.T }); markDone();
}

/* titik ikat manual */
function updateCpInfo() {
  const n = S.cps.length, m = S.cps.filter(c => c.ll).length;
  if ($('cpInfo')) $('cpInfo').textContent = n ? `Titik ikat di sketsa: ${n}, sudah dipasang di peta: ${m}.` + (n < 2 ? ' (perlu ≥2)' : '') : 'Belum ada titik ikat di sketsa.';
}
function startCP() {
  if (S.cps.length < 2) { toast('Tambahkan minimal 2 titik ikat pada sketsa (langkah 2, alat 📍).', 'warn'); return; }
  if (!PROJ) { if (S.wil) setProj(); else { toast('Pilih wilayah dulu.', 'warn'); return; } }
  S.cpIdx = S.cps.findIndex(c => !c.ll); if (S.cpIdx < 0) { computeManual(); return; }
  S.mapMode = 'cp'; if (map) map.getContainer().style.cursor = 'crosshair';
  toast(`Klik di peta lokasi titik ikat #${S.cpIdx + 1}`, '');
}
function onMapClick(e) {
  if (S.mapMode !== 'cp') return;
  const c = S.cps[S.cpIdx]; c.ll = [e.latlng.lat, e.latlng.lng];
  L.marker(e.latlng, { icon: L.divIcon({ className: '', html: `<div class="cp-ic" style="width:22px;height:22px">${S.cpIdx + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(G.cp);
  LOG.info(`Titik ikat #${S.cpIdx + 1} dipasang di peta`, c.ll);
  S.cpIdx = S.cps.findIndex(c => !c.ll);
  updateCpInfo(); skDraw();
  if (S.cpIdx < 0) { S.mapMode = null; map.getContainer().style.cursor = ''; computeManual(); }
  else toast(`Klik di peta lokasi titik ikat #${S.cpIdx + 1}`);
}
const computeManual = safe('Hitung titik ikat', async () => {
  const P = S.cps.filter(c => c.ll);
  if (P.length < 2) throw new Error('Perlu minimal 2 titik ikat.');
  const src = P.map(c => [c.img[0], -c.img[1]]), dst = P.map(c => PROJ.fwd(c.ll[0], c.ll[1]));
  const T = CORE.similarity2D(src, dst);
  if (!isFinite(T.s) || T.s <= 0) throw new Error('Titik ikat tidak valid (titik terlalu berdekatan?).');
  const L0 = getLuas();
  if (L0 && S.parcel) { const s0 = Math.sqrt(L0 / CORE.polyArea(S.parcel)); LOG.info(`Skala titik ikat ${T.s.toFixed(4)} vs skala dari luas ${s0.toFixed(4)} m/px (selisih ${((T.s / s0 - 1) * 100).toFixed(1)}%)`); }
  CTX = null; S.T = T; const ctx = ensureCtx();
  const cand = { T: { s: T.s, th: T.th, tx: T.tx, ty: T.ty }, r: ctx ? CORE.score(ctx, T, true) : null, label: 'Manual (titik ikat)', rms: P.length > 2 ? T.rms : null };
  S.cands = S.cands.filter(c => !c.label.startsWith('Manual'));
  S.cands.unshift(cand);
  LOG.info('Transformasi titik ikat', { s: T.s, th_deg: T.th / DEG, rms: T.rms, n: P.length });
  renderCands(); selectCand(0, true);
  toast('Posisi dari titik ikat dihitung.', 'ok');
});

/* ---------- LANGKAH 4: HASIL ---------- */
function geoArea(ll) {
  const R = 6378137; let a = 0;
  for (let i = 0; i < ll.length; i++) { const p1 = ll[i], p2 = ll[(i + 1) % ll.length]; a += (p2[1] - p1[1]) * DEG * (2 + Math.sin(p1[0] * DEG) + Math.sin(p2[0] * DEG)); }
  return Math.abs(a * R * R / 2);
}
function finalLL() { return toLL(parcelWorld(S.T, $('inForce').checked)); }
function renderResult() {
  if (!S.T || !S.parcel || !PROJ) { $('resInfo').textContent = 'Pilih kandidat dulu di langkah 3.'; return; }
  const ctx = ensureCtx();
  const r = ctx ? CORE.score(ctx, S.T, true) : null;
  if (S.sel >= 0 && r) S.cands[S.sel].rNow = r;
  if (map) {
    G.res.clearLayers();
    for (const rd of S.roads) L.polyline(toLL(rd.pts.map(p => CORE.fwdT(S.T, p[0], -p[1]))), { color: '#ef4444', weight: 3, dashArray: '8 6' }).bindTooltip('Jalan sketsa' + (rd.name ? ': ' + rd.name : '')).addTo(G.res);
    L.polygon(finalLL(), { color: '#f0abfc', weight: 3, fillColor: '#a855f7', fillOpacity: 0.35 }).bindTooltip('Bidang tanah').addTo(G.res);
  }
  const raw = parcelWorld(S.T, false), fin = parcelWorld(S.T, $('inForce').checked), ll = toLL(fin);
  const L0 = getLuas(), Araw = CORE.polyArea(raw), Ageo = geoArea(ll);
  const utm = ll.map(p => CORE.toUTM(p[0], p[1])), Autm = CORE.polyArea(utm.map(u => [u.E, u.N]));
  const tm3 = ll.map(p => CORE.toTM3(p[0], p[1])), Atm3 = CORE.polyArea(tm3.map(u => [u.E, u.N]));
  const sides = fin.map((p, i) => { const q = fin[(i + 1) % fin.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  const c = ll.reduce((a, p) => [a[0] + p[0] / ll.length, a[1] + p[1] / ll.length], [0, 0]);
  const cl = S.sel >= 0 ? conf(S.sel) : ['-', ''];
  $('resInfo').innerHTML = `<b>${esc(S.sel >= 0 ? S.cands[S.sel].label : '-')}</b> <span class="badge ${cl[1]}">${cl[0]}</span><br>
    ${r ? `Skor kecocokan: <b>${(r.score * 100).toFixed(1)}%</b> · titik jalan sketsa yang menempel jalan OSM: ${(r.within * 100).toFixed(0)}% · deviasi rata²: ${fmt(r.dev, 1)} m · jalan OSM di area sketsa yang tak tergambar: ${((r.rev) * 100).toFixed(0)}%<br>` : ''}
    Rotasi: ${fmt(S.T.th / DEG, 1)}° · Skala: ${fmt(S.T.s, 4)} m/px<br>
    Titik pusat: ${c[0].toFixed(7)}, ${c[1].toFixed(7)}<br>
    <table style="margin-top:6px"><tr><th style="text-align:left">Luas</th><th>m²</th></tr>
    <tr><td style="text-align:left">Input (sertifikat/keterangan)</td><td>${L0 ? fmt(L0, 0) : '-'}</td></tr>
    <tr><td style="text-align:left">Sketsa × skala hasil cocok</td><td>${fmt(Araw, 1)}${L0 ? ` (${Araw >= L0 ? '+' : ''}${fmt((Araw / L0 - 1) * 100, 1)}%)` : ''}</td></tr>
    <tr><td style="text-align:left">Poligon akhir — geodesik</td><td><b>${fmt(Ageo, 1)}</b></td></tr>
    <tr><td style="text-align:left">Poligon akhir — bidang UTM ${utm[0].zone}</td><td>${fmt(Autm, 1)}</td></tr>
    <tr><td style="text-align:left">Poligon akhir — TM-3 ${tm3[0].zone}</td><td>${fmt(Atm3, 1)}</td></tr></table>
    <div class="hint">Panjang sisi: ${sides.map(v => fmt(v, 2)).join(' · ')} m · keliling ${fmt(sides.reduce((a, b) => a + b, 0), 2)} m</div>`;
  $('vtx').innerHTML = `<table><tr><th>No</th><th>Lintang</th><th>Bujur</th><th>UTM E</th><th>UTM N</th><th>TM3 X</th><th>TM3 Y</th></tr>` +
    ll.map((p, i) => `<tr><td>${i + 1}</td><td>${p[0].toFixed(7)}</td><td>${p[1].toFixed(7)}</td><td>${utm[i].E.toFixed(2)}</td><td>${utm[i].N.toFixed(2)}</td><td>${tm3[i].E.toFixed(2)}</td><td>${tm3[i].N.toFixed(2)}</td></tr>`).join('') +
    `</table><div class="hint">UTM zona ${utm[0].zone} (WGS84). TM-3 zona ${tm3[0].zone} (k=0,9999; FE 200.000; FN 1.500.000) — cek ulang bila dipakai untuk keperluan resmi.</div>`;
  cmpDraw();
}
function adjust(kind) {
  if (!S.T) { toast('Pilih kandidat dulu.', 'warn'); return; }
  const st = +$('inStep').value, rs = +$('inRotStep').value * DEG;
  const c = CORE.centroid(parcelWorld(S.T, false));
  const rot = d => { const cs = Math.cos(d), sn = Math.sin(d), x = S.T.tx - c[0], y = S.T.ty - c[1]; S.T.tx = c[0] + cs * x - sn * y; S.T.ty = c[1] + sn * x + cs * y; S.T.th = CORE.normAng(S.T.th + d); };
  const scl = k => { S.T.s *= k; S.T.tx = c[0] + (S.T.tx - c[0]) * k; S.T.ty = c[1] + (S.T.ty - c[1]) * k; };
  ({ n: () => S.T.ty += st, s: () => S.T.ty -= st, e: () => S.T.tx += st, w: () => S.T.tx -= st, rl: () => rot(rs), rr: () => rot(-rs), sp: () => scl(1.01), sm: () => scl(1 / 1.01) })[kind]();
  if (S.sel >= 0) { S.cands[S.sel].T = { ...S.T }; if (!S.cands[S.sel].label.includes('disesuaikan')) S.cands[S.sel].label += ' (disesuaikan)'; }
  renderResult(); drawCands();
}

/* perbandingan */
function cmpDraw() {
  const cv = $('cmp'); if (!cv || !$('cmpWrap').classList.contains('show')) return;
  const r = cv.parentElement.getBoundingClientRect(); if (!r.width) return;
  const dpr = devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height; c.fillStyle = '#0b1220'; c.fillRect(0, 0, W, H);
  if (!S.img || !imgEl) { c.fillStyle = '#94a3b8'; c.font = '15px system-ui'; c.textAlign = 'center'; c.fillText('Belum ada gambar.', W / 2, H / 2); return; }
  // muat seluruh gambar + sedikit margin
  const s = Math.min(W / S.img.w, (H - 48) / S.img.h) * 0.92, ox = (W - S.img.w * s) / 2, oy = 48 + (H - 48 - S.img.h * s) / 2;
  const P = p => [p[0] * s + ox, p[1] * s + oy];
  c.fillStyle = '#e5e7eb'; c.font = 'bold 13px system-ui'; c.textAlign = 'left';
  c.fillText('PERBANDINGAN: gambar situasi vs jalan sebenarnya (OSM) di posisi hasil', 10, 18);
  c.globalAlpha = (+$('inOpa').value) / 100; c.drawImage(imgEl, ox, oy, S.img.w * s, S.img.h * s); c.globalAlpha = 1;
  const path = (pts, close) => { c.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); if (close) c.closePath(); };
  if (S.T && S.osm && PROJ) {
    c.save(); c.beginPath(); c.rect(0, 44, W, H); c.clip();
    const toIm = (lat, lon) => { const w = PROJ.fwd(lat, lon), m = CORE.invT(S.T, w[0], w[1]); return [m[0], -m[1]]; };
    const pad = Math.max(S.img.w, S.img.h) * 0.6;
    for (const w of S.osm.ways) {
      const pts = w.nodes.map(id => S.osm.nodes[id]).filter(Boolean).map(p => toIm(p[0], p[1]));
      if (pts.length < 2 || pts.every(p => p[0] < -pad || p[1] < -pad || p[0] > S.img.w + pad || p[1] > S.img.h + pad)) continue;
      path(pts); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#22d3ee'; c.lineWidth = 3; c.stroke();
    }
    const fin = parcelWorld(S.T, $('inForce').checked).map(w => { const m = CORE.invT(S.T, w[0], w[1]); return [m[0], -m[1]]; });
    path(fin, true); c.fillStyle = 'rgba(168,85,247,.35)'; c.fill(); c.strokeStyle = '#a855f7'; c.lineWidth = 3; c.stroke();
    c.restore();
  }
  for (const rd of S.roads) { path(rd.pts); c.setLineDash([8, 6]); c.strokeStyle = '#ef4444'; c.lineWidth = 2.5; c.stroke(); c.setLineDash([]); }
  if (S.T && S.sel >= 0) {
    const rr = S.cands[S.sel].rNow || S.cands[S.sel].r;
    if (rr) { c.fillStyle = '#facc15'; c.font = 'bold 13px system-ui'; c.textAlign = 'left'; c.fillText(`Skor ${(rr.score * 100).toFixed(1)}% · deviasi rata² ${fmt(rr.dev, 1)} m`, 10, 36); }
  }
}

/* ---------- EKSPOR ---------- */
const xmlEsc = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
function baseName() {
  const n = ($('inNama').value.trim() || 'bidang') + '_' + ($('inKel').value.trim() || 'lokasi');
  return n.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
}
function needResult() { if (!S.T || !S.parcel || !PROJ) throw new Error('Belum ada hasil. Jalankan pencocokan & pilih kandidat.'); }
function buildKML(overlayHref) {
  needResult();
  const ll = finalLL(), ring = ll.concat([ll[0]]);
  const coords = ring.map(p => `${p[1].toFixed(8)},${p[0].toFixed(8)},0`).join(' ');
  const L0 = getLuas(), Ag = geoArea(ll), cand = S.sel >= 0 ? S.cands[S.sel] : null, r = cand && (cand.rNow || cand.r);
  const nama = $('inNama').value.trim() || 'Bidang Tanah';
  const desc = `Kelurahan/Desa: ${$('inKel').value}\nKecamatan: ${$('inKec').value}\nKota/Kab: ${$('inKota').value}\nLuas input: ${L0 ? L0 + ' m²' : '-'}\nLuas poligon (geodesik): ${Ag.toFixed(1)} m²\n` +
    `Metode: ${cand ? cand.label : '-'}${r ? `, skor kecocokan ${(r.score * 100).toFixed(1)}%, deviasi rata² ${r.dev.toFixed(1)} m` : ''}\n` +
    `Dibuat: ${new Date().toLocaleString('id-ID')} dengan Pencocok Situasi Bidang v${APP_VERSION}\nCATATAN: posisi hasil pencocokan sketsa, bukan hasil ukur. Verifikasi di lapangan/BPN.`;
  const roads = S.roads.map((rd, i) => {
    const l2 = toLL(rd.pts.map(p => CORE.fwdT(S.T, p[0], -p[1])));
    return `<Placemark><name>${xmlEsc(rd.name || 'Jalan sketsa ' + (i + 1))}</name><styleUrl>#jalan</styleUrl><LineString><tessellate>1</tessellate><coordinates>${l2.map(p => `${p[1].toFixed(8)},${p[0].toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>`;
  }).join('\n');
  const verts = ll.map((p, i) => `<Placemark><name>${i + 1}</name><styleUrl>#titik</styleUrl><Point><coordinates>${p[1].toFixed(8)},${p[0].toFixed(8)},0</coordinates></Point></Placemark>`).join('\n');
  let overlay = '';
  if (overlayHref) {
    const corners = [[0, S.img.h], [S.img.w, S.img.h], [S.img.w, 0], [0, 0]].map(p => { const w = CORE.fwdT(S.T, p[0], -p[1]); return PROJ.inv(w[0], w[1]); });
    overlay = `<GroundOverlay><name>Gambar situasi (overlay)</name><visibility>1</visibility><color>b3ffffff</color><drawOrder>1</drawOrder><Icon><href>${overlayHref}</href></Icon><gx:LatLonQuad><coordinates>${corners.map(p => `${p[1].toFixed(8)},${p[0].toFixed(8)},0`).join(' ')}</coordinates></gx:LatLonQuad></GroundOverlay>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
<name>${xmlEsc(nama)} - ${xmlEsc($('inKel').value || '')}</name>
<Style id="bidang"><LineStyle><color>ff00ffff</color><width>3</width></LineStyle><PolyStyle><color>5900ffff</color></PolyStyle></Style>
<Style id="jalan"><LineStyle><color>ff0000ff</color><width>2</width></LineStyle></Style>
<Style id="titik"><IconStyle><scale>0.6</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>
<Placemark><name>${xmlEsc(nama)}</name><description><![CDATA[${desc}]]></description><styleUrl>#bidang</styleUrl>
<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Folder><name>Titik sudut</name><visibility>0</visibility>
${verts}
</Folder>
<Folder><name>Jalan dari sketsa</name>
${roads}
</Folder>
${overlay}
</Document>
</kml>`;
}
const expKML = safe('Ekspor KML', async () => { const k = buildKML(null); download(new Blob([k], { type: 'application/vnd.google-earth.kml+xml' }), baseName() + '.kml'); toast('KML diunduh. Buka dengan Google Earth Pro (File › Open).', 'ok'); });
const expKMZ = safe('Ekspor KMZ', async () => {
  if (!window.JSZip) throw new Error('Library JSZip tidak termuat (butuh internet). Gunakan ekspor KML.');
  const m = S.img.dataURL.match(/^data:image\/(\w+);base64,(.*)$/); if (!m) throw new Error('Format gambar tidak dikenali untuk overlay.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const zip = new JSZip(); zip.file('doc.kml', buildKML('files/sketsa.' + ext)); zip.file('files/sketsa.' + ext, m[2], { base64: true });
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
  download(blob, baseName() + '.kmz'); toast('KMZ diunduh (poligon + jalan + overlay gambar situasi).', 'ok');
});
const expGeo = safe('Ekspor GeoJSON', async () => {
  needResult(); const ll = finalLL();
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { nama: $('inNama').value || 'Bidang', luas_input_m2: getLuas(), luas_geodesik_m2: +geoArea(ll).toFixed(2) }, geometry: { type: 'Polygon', coordinates: [ll.concat([ll[0]]).map(p => [+p[1].toFixed(8), +p[0].toFixed(8)])] } },
    ...S.roads.map((rd, i) => ({ type: 'Feature', properties: { jenis: 'jalan_sketsa', nama: rd.name || 'Jalan ' + (i + 1) }, geometry: { type: 'LineString', coordinates: toLL(rd.pts.map(p => CORE.fwdT(S.T, p[0], -p[1]))).map(p => [+p[1].toFixed(8), +p[0].toFixed(8)]) } }))] };
  download(new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }), baseName() + '.geojson');
});
const expCSV = safe('Ekspor CSV', async () => {
  needResult(); const ll = finalLL();
  const rows = ['No,Lintang,Bujur,UTM_Zona,UTM_E,UTM_N,TM3_Zona,TM3_X,TM3_Y'];
  ll.forEach((p, i) => { const u = CORE.toUTM(p[0], p[1]), t = CORE.toTM3(p[0], p[1]); rows.push([i + 1, p[0].toFixed(8), p[1].toFixed(8), u.zone, u.E.toFixed(3), u.N.toFixed(3), t.zone, t.E.toFixed(3), t.N.toFixed(3)].join(',')); });
  download(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' }), baseName() + '_koordinat.csv');
});
const expPNG = safe('Ekspor PNG', async () => {
  if (STEP !== 4) go(4); await sleep(120); cmpDraw();
  await new Promise((res, rej) => $('cmp').toBlob(b => { if (!b) return rej(new Error('Kanvas kosong')); download(b, baseName() + '_perbandingan.png'); res(); }, 'image/png'));
});

/* ---------- PROYEK ---------- */
const saveProj = safe('Simpan proyek', async () => {
  const o = {
    app: 'pencocok-situasi-bidang', version: APP_VERSION, saved: new Date().toISOString(),
    input: { kota: $('inKota').value, kec: $('inKec').value, kel: $('inKel').value, luas: $('inLuas').value, lebar: $('inLebar').value, north: $('inNorth').checked, northDeg: $('inNorthDeg').value, nama: $('inNama').value, foot: $('inFoot').checked, tau: $('inTau').value, scaleVar: $('inScaleVar').value, wrev: $('inWrev').value, force: $('inForce').checked },
    wil: S.wil, osm: S.osm, img: S.img, roads: S.roads, parcel: S.parcel, cps: S.cps, cands: S.cands.map(c => ({ T: c.T, r: c.r, label: c.label, rms: c.rms })), sel: S.sel, T: S.T
  };
  download(new Blob([JSON.stringify(o)], { type: 'application/json' }), baseName() + '_proyek.json');
});
const loadProj = safe('Muat proyek', async file => {
  const o = JSON.parse(await file.text());
  if (o.app !== 'pencocok-situasi-bidang') throw new Error('Bukan file proyek aplikasi ini.');
  const I = o.input || {};
  for (const [k, id] of [['kota', 'inKota'], ['kec', 'inKec'], ['kel', 'inKel'], ['luas', 'inLuas'], ['lebar', 'inLebar'], ['northDeg', 'inNorthDeg'], ['nama', 'inNama'], ['tau', 'inTau'], ['scaleVar', 'inScaleVar'], ['wrev', 'inWrev']]) if (I[k] != null) $(id).value = I[k];
  $('inNorth').checked = !!I.north; $('inFoot').checked = I.foot !== false; $('inForce').checked = I.force !== false;
  S.wil = o.wil; S.osm = o.osm; S.roads = o.roads || []; S.parcel = o.parcel; S.cps = o.cps || []; S.cands = o.cands || []; S.sel = o.sel ?? -1; S.T = o.T; CTX = null;
  if (S.wil) { drawWilayah(); setProj(); $('btnJalan').disabled = false; }
  if (S.osm) { drawOSM(); $('jalanInfo').textContent = `✅ ${S.osm.ways.length} ruas jalan (dari proyek).`; }
  if (o.img) setImage(o.img.dataURL, o.img.name, true);
  LOG.info('Proyek dimuat: ' + file.name, { versi: o.version, disimpan: o.saved });
  setTimeout(() => { onSketchChanged(); renderCands(); drawCands(); if (S.sel >= 0 && S.cands[S.sel]) selectCand(S.sel, true); markDone(); }, 300);
  toast('Proyek dimuat.', 'ok');
});

/* ---------- INIT ---------- */
function init() {
  if ($('verLink')) $('verLink').textContent = 'v' + APP_VERSION;
  LOG.info(`Aplikasi dimulai v${APP_VERSION}`, { ua: navigator.userAgent, protokol: location.protocol });
  if (!window.JSZip) LOG.warn('JSZip tidak termuat — ekspor KMZ tidak tersedia (KML tetap bisa).');
  initMap(); initSketch();
  document.querySelectorAll('#steps button').forEach(b => b.onclick = () => go(+b.dataset.step));
  $('btnCari').onclick = cariWilayah;
  for (const id of ['inKota', 'inKec', 'inKel']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') cariWilayah(); });
  $('btnManualArea').onclick = safe('Area manual', async () => {
    if (!map) throw new Error('Peta tidak tersedia.');
    const c = map.getCenter(), r = +$('inRad').value || 1500;
    setWilayah({ name: `Area manual (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}) r=${r} m`, rings: [circleRing(c.lat, c.lng, r)], hasPoly: false });
  });
  $('btnJalan').onclick = ambilJalan;
  $('fileOsm').onchange = e => { if (e.target.files[0]) imporJalan(e.target.files[0]); e.target.value = ''; };
  $('btnAI').onclick = aiDetect;
  $('btnAIUndo').onclick = () => { if (!S.aiBackup) return; S.roads = S.aiBackup.roads; S.parcel = S.aiBackup.parcel; S.aiBackup = null; $('btnAIUndo').disabled = true; LOG.info('Hasil AI dibatalkan'); onSketchChanged(); };
  $('btnMatch').onclick = runMatch;
  $('btnCP').onclick = startCP;
  $('btnCPReset').onclick = () => { S.cps.forEach(c => c.ll = null); G.cp && G.cp.clearLayers(); S.mapMode = null; updateCpInfo(); skDraw(); LOG.info('Titik ikat di peta diulang'); };
  document.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => adjust(b.dataset.mv));
  $('inForce').onchange = renderResult; $('inOpa').oninput = cmpDraw;
  $('btnKML').onclick = expKML; $('btnKMZ').onclick = expKMZ; $('btnGeo').onclick = expGeo; $('btnCSV').onclick = expCSV; $('btnPNG').onclick = expPNG;
  $('btnSave').onclick = saveProj; $('fileProj').onchange = e => { if (e.target.files[0]) loadProj(e.target.files[0]); e.target.value = ''; };
  $('btnLog').onclick = () => { $('log').classList.toggle('open'); renderLog(); };
  $('logClose').onclick = () => $('log').classList.remove('open');
  $('logClear').onclick = () => { LOG.entries = []; LOG.errors = 0; LOG.warns = 0; renderLog(); };
  $('logDl').onclick = () => { const t = new Date(), p = n => String(n).padStart(2, '0'); download(new Blob([LOG.text()], { type: 'text/plain' }), `log-poligon-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}.txt`); };
  $('logCopy').onclick = async () => { try { await navigator.clipboard.writeText(LOG.text()); toast('Log disalin.', 'ok'); } catch (e) { toast('Gagal menyalin; gunakan Unduh log.', 'warn'); } };
  renderRoadList(); renderParcelInfo(); updateCpInfo(); go(1);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
