/* ===== FITUR: ekspor AutoCAD, bidang lain (peta analog), gambar di atas peta, pratinjau kandidat, riwayat ===== */
const SET = { crs: 'tm3-50.2' };
const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
try { const v = localStorage.getItem('plotkw.crs'); if (v && CORE.CRS[v]) SET.crs = v; } catch (e) { /* abaikan */ }
/* ---------- ekspor AutoCAD ---------- */
function cornersCRS() { // sudut gambar → koordinat CRS
  return [[0, 0], [S.img.w, 0], [S.img.w, S.img.h], [0, S.img.h]].map(p => { const w = CORE.fwdT(S.T, p[0], -p[1]); const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
}
const ekspDXF = safe('Ekspor DXF', async () => {
  needResult();
  const toXY = pts => pts.map(w => { const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
  const fin = finalXY();
  const items = [{ layer: 'BIDANG', pts: fin, closed: true }], texts = [];
  const nama = $('inNama').value.trim() || 'Bidang';
  texts.push({ layer: 'LABEL', at: CORE.centroid(fin), h: 1.5, text: nama + ' L=' + CORE.polyArea(fin).toFixed(2) });
  fin.forEach((p, i) => texts.push({ layer: 'NOMOR_TITIK', at: p, h: 0.8, text: String(i + 1) }));
  for (const ex of S.extra) {
    const xy = toXY(ex.pts.map(p => CORE.fwdT(S.T, p[0], -p[1])));
    items.push({ layer: 'BIDANG_TAMBAHAN', pts: xy, closed: true });
    if (ex.label) texts.push({ layer: 'LABEL', at: CORE.centroid(xy), h: 1.2, text: ex.label });
  }
  for (const rd of S.roads) items.push({ layer: 'JALAN_SKETSA', pts: toXY(rd.pts.map(p => CORE.fwdT(S.T, p[0], -p[1]))), closed: false });
  items.push({ layer: 'BINGKAI_GAMBAR', pts: cornersCRS(), closed: true });
  const layers = [{ name: 'BIDANG', color: 1 }, { name: 'BIDANG_TAMBAHAN', color: 30 }, { name: 'JALAN_SKETSA', color: 5 }, { name: 'BINGKAI_GAMBAR', color: 8 }, { name: 'LABEL', color: 7 }, { name: 'NOMOR_TITIK', color: 2 }];
  download(new Blob([CORE.dxfR12(layers, items, texts)], { type: 'application/dxf' }), `${baseName()}_${SET.crs}.dxf`);
  toast(`DXF (${CORE.CRS[SET.crs].nama}) diunduh. Layer BINGKAI_GAMBAR = posisi gambar sketsa untuk ALIGN.`, 'ok');
});
/* ---------- pemeriksaan hasil ---------- */
function cekKewajaran(r) {
  const out = [], lin = getLuas();
  const raw = S.T && S.parcel ? CORE.polyArea(parcelWorld(S.T, false)) : 0;
  const tanda = (lvl, t) => out.push(`<li class="qc-${lvl}">${t}</li>`);
  if (lin && S.parcel) { const sk = cekSkala(Math.sqrt(lin / CORE.polyArea(S.parcel))); if (sk && Math.abs(sk.beda) > 10) tanda('info', `Ukuran bidang menurut skala 1:${esc($('inSkala').value)} berbeda ${fmt(sk.beda, 1)}% dari luas. Wajar bila hasil scan PDF tidak seukuran kertas aslinya; luas tetap dipakai sebagai acuan. Bila bentuk bidang tampak salah, periksa luas atau gambarnya.`); else if (sk) tanda('ok', `Luas cocok dengan skala 1:${esc($('inSkala').value)} pada gambar (selisih ${fmt(sk.beda, 1)}%).`); }
  if (lin) { const d = (raw / lin - 1) * 100; Math.abs(d) > 10 ? tanda('warn', `Bidang pada gambar × skala hasil cocok = ${fmt(raw, 0)} m² (selisih ${fmt(d, 1)}% dari luas yang diisi). Gambar mungkin tidak berskala, atau luasnya keliru.`) : tanda('ok', `Skala hasil cocok konsisten dengan luas (selisih ${fmt(d, 1)}%).`); }
  if (r) {
    if (r.score < 0.65) tanda('bad', 'Skor kecocokan jalan rendah. Posisi belum meyakinkan.');
    else if (r.score < 0.8) tanda('warn', 'Skor kecocokan sedang. Bandingkan gambar dengan citra satelit sebelum dipakai.');
    else tanda('ok', 'Jalan pada gambar menempel baik pada jalan nyata.');
    const cs = S.sel >= 0 ? S.cands[S.sel] : null;
    if (cs && cs.nama === false) tanda('warn', S.cands.some(x => x.nama) ? 'Nama jalan pada gambar tidak cocok di kandidat ini, padahal cocok di kandidat lain. Bandingkan keduanya di citra satelit; nama di gambar bisa saja sudah berubah.' : 'Nama jalan pada gambar tidak cocok dengan nama di peta. Bisa jadi nama jalan sudah berubah; hasil tetap berdasarkan bentuk jalan.');
    else if (cs && cs.nama === true) tanda('ok', 'Nama jalan pada gambar sesuai dengan nama jalan di peta.');
    const dth = Math.abs(CORE.normAng(S.T.th)) / DEG, nm = $('inNorthMode').value;
    if (nm !== 'bebas' && dth > 8) tanda('warn', `Agar cocok, gambar harus diputar ${fmt(dth, 1)}° dari arah utaranya. Panah utara di gambar mungkin kurang tepat; periksa di citra satelit.`);
    else if (nm === 'bebas') tanda('info', `Hasil cocok memutar gambar ${fmt(dth, 1)}° dari arah atas gambar.`);
    const c = S.cands; if (c.length > 1 && c[0].r && c[1].r && c[0].r.score - c[1].r.score < 0.06) tanda('warn', 'Ada kandidat lain dengan skor hampir sama. Posisi bisa tertukar; lihat pratinjau di langkah 3.');
  }
  tanda('info', 'Nyalakan "Gambar di peta" dan bandingkan atap, pagar, dan batas kebun di citra satelit.');
  return `<ul class="qc">${out.join('')}</ul>`;
}

/* ---------- kop gambar ---------- */
function updateKop() {
  const k = $('kop'); if (!k) return;
  const cand = S.sel >= 0 ? S.cands[S.sel] : null, r = cand && (cand.rNow || cand.r);
  const luasHasil = S.T && S.parcel && PROJ ? CORE.polyArea(finalXY()) : null;
  k.querySelector('[data-k=bidang]').textContent = $('inNama').value.trim() || 'Bidang tanpa nama';
  k.querySelector('[data-k=wil]').textContent = $('inKel').value ? kelLabel() : 'Pilih kelurahan';
  k.querySelector('[data-k=luas]').textContent = getLuas() ? fmt(getLuas(), 0) + ' m²' : '–';
  k.querySelector('[data-k=hasil]').textContent = luasHasil ? fmt(luasHasil, 1) + ' m²' : '–';
  k.querySelector('[data-k=skor]').textContent = r ? (r.score * 100).toFixed(0) + '%' : '–';
  k.querySelector('[data-k=kand]').textContent = cand ? cand.label.replace(' (disesuaikan)', '') + (cand.label.includes('disesuaikan') ? ', digeser' : '') : '–';
  k.querySelector('[data-k=crs]').textContent = CORE.CRS[SET.crs].nama.split(' (')[0];
}

/* ---------- bidang lain pada gambar yang sama (peta analog) ---------- */
function renderExtraList() {
  const el = $('extraList'); if (!el) return;
  if (!S.extra.length) { el.innerHTML = '<p class="hint">Untuk peta analog berisi banyak bidang: gambar bidang lain dengan alat <b>Bidang lain</b>. Setelah dicocokkan, semuanya ikut mendapat koordinat dan ikut diekspor.</p>'; return; }
  el.innerHTML = '';
  S.extra.forEach((ex, i) => {
    const d = document.createElement('div'); d.className = 'item row';
    d.innerHTML = `<span class="nf swatch-or"></span><input type="text" placeholder="label bidang" value="${esc(ex.label || '')}"><span class="nf hint">${ex.pts.length} titik</span><button class="nf dan" title="Hapus bidang ini" aria-label="Hapus">✕</button>`;
    d.querySelector('input').oninput = e => { ex.label = e.target.value; skDraw(); };
    d.querySelector('button').onclick = () => { S.extra.splice(i, 1); onSketchChanged(); };
    el.appendChild(d);
  });
}

/* ---------- gambar situasi di atas peta (transparan) ---------- */
let OV = null;
function buatOverlay() {
  if (!window.L || !L.Layer || OV) return;
  const Kelas = L.Layer.extend({
    onAdd(m) {
      this._img = L.DomUtil.create('img', 'sk-ov');
      Object.assign(this._img.style, { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', pointerEvents: 'none', maxWidth: 'none', zIndex: 250 });
      m.getPanes().overlayPane.appendChild(this._img);
      m.on('zoomend moveend viewreset resize', this.atur, this);
      m.on('zoomstart', this.sembunyi, this);
      this.atur();
    },
    onRemove(m) { this._img.remove(); m.off('zoomend moveend viewreset resize', this.atur, this); m.off('zoomstart', this.sembunyi, this); },
    sembunyi() { if (this._img) this._img.style.visibility = 'hidden'; },
    atur() {
      const im = this._img; if (!im || !S.img || !S.T || !PROJ) { if (im) im.style.display = 'none'; return; }
      if (im.dataset.src !== S.img.name + S.img.w) { im.src = S.img.dataURL; im.dataset.src = S.img.name + S.img.w; }
      const pt = (x, y) => { const w = CORE.fwdT(S.T, x, -y); const ll = PROJ.inv(w[0], w[1]); return this._map.latLngToLayerPoint(ll); };
      const p0 = pt(0, 0), p1 = pt(S.img.w, 0), p2 = pt(0, S.img.h);
      const a = (p1.x - p0.x) / S.img.w, b = (p1.y - p0.y) / S.img.w, c = (p2.x - p0.x) / S.img.h, d = (p2.y - p0.y) / S.img.h;
      im.style.width = S.img.w + 'px'; im.style.height = S.img.h + 'px';
      im.style.transform = `matrix(${a},${b},${c},${d},${p0.x},${p0.y})`;
      im.style.opacity = (+$('inOvOpa').value) / 100; im.style.display = ''; im.style.visibility = 'visible';
    }
  });
  OV = new Kelas();
}
function aturOverlay() {
  if (!map) return;
  try { buatOverlay(); } catch (e) { LOG.warn('Gambar di peta tidak tersedia', e.message); return; }
  if (!OV) return;
  const on = $('inOv').checked && S.img && S.T;
  $('ovCtl').hidden = !(S.img && S.T);
  if (on && !map.hasLayer(OV)) OV.addTo(map);
  else if (!on && map.hasLayer(OV)) map.removeLayer(OV);
  if (on) OV.atur();
}

/* ---------- pratinjau kandidat & panel perbandingan ---------- */
// Menggambar gambar situasi + jalan nyata (dipindah ke koordinat gambar) + bidang, untuk transformasi T
function gambarBanding(cv, T, o = {}) {
  const r = cv.getBoundingClientRect(); if (!r.width) return;
  const dpr = devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, top = o.top || 0;
  c.fillStyle = '#e6eae6'; c.fillRect(0, 0, W, H);
  if (!S.img || !imgEl) return null;
  const s = Math.min(W / S.img.w, (H - top) / S.img.h) * (o.thumb ? 1 : 0.92), ox = (W - S.img.w * s) / 2, oy = top + (H - top - S.img.h * s) / 2;
  const P = p => [p[0] * s + ox, p[1] * s + oy];
  const path = (pts, close) => { c.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); if (close) c.closePath(); };
  c.globalAlpha = o.opa ?? 0.7; c.drawImage(imgEl, ox, oy, S.img.w * s, S.img.h * s); c.globalAlpha = 1;
  if (T && S.osm && PROJ) {
    c.save(); c.beginPath(); c.rect(0, top, W, H); c.clip();
    const pad = Math.max(S.img.w, S.img.h) * 0.6;
    for (const w of S.osm.ways) {
      const pts = w.nodes.map(id => S.osm.nodes[id]).filter(Boolean).map(p => { const q = PROJ.fwd(p[0], p[1]), m = CORE.invT(T, q[0], q[1]); return [m[0], -m[1]]; });
      if (pts.length < 2 || pts.every(p => p[0] < -pad || p[1] < -pad || p[0] > S.img.w + pad || p[1] > S.img.h + pad)) continue;
      path(pts); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = o.thumb ? 4 : 6; c.stroke(); c.strokeStyle = '#0e8fb3'; c.lineWidth = o.thumb ? 2 : 3; c.stroke();
    }
    if (S.parcel) {
      const fin = o.thumb ? S.parcel : parcelWorld(T, $('inForce').checked).map(w => { const m = CORE.invT(T, w[0], w[1]); return [m[0], -m[1]]; });
      path(fin, true); c.fillStyle = 'rgba(168,85,247,.35)'; c.fill(); c.strokeStyle = '#a855f7'; c.lineWidth = o.thumb ? 2 : 3; c.stroke();
    }
    c.restore();
  }
  for (const ex of S.extra) { path(ex.pts, true); c.fillStyle = 'rgba(232,137,47,.25)'; c.fill(); c.strokeStyle = '#c8641a'; c.lineWidth = o.thumb ? 1.5 : 2; c.stroke(); }
  for (const rd of S.roads) { path(rd.pts); c.setLineDash(o.thumb ? [5, 4] : [8, 6]); c.strokeStyle = '#ef4444'; c.lineWidth = o.thumb ? 1.8 : 2.5; c.stroke(); c.setLineDash([]); }
  return c;
}
function gambarPratinjau() {
  document.querySelectorAll('#candList canvas[data-ci]').forEach(cv => { const cd = S.cands[+cv.dataset.ci]; if (cd) gambarBanding(cv, cd.T, { thumb: true, opa: 0.55 }); });
}

/* ---------- riwayat (Ctrl+Z) ---------- */
const HIST = { stack: [], last: null };
function snapSketsa() { return JSON.stringify({ roads: S.roads, parcel: S.parcel, extra: S.extra, cps: S.cps.map(c => ({ img: c.img, ll: null })) }); }
function catatRiwayat() {
  const now = snapSketsa();
  if (HIST.last !== null && HIST.last !== now) { HIST.stack.push(HIST.last); if (HIST.stack.length > 100) HIST.stack.shift(); }
  HIST.last = now;
}
function resetRiwayat() { HIST.stack = []; HIST.last = snapSketsa(); }
function urungkan() {
  if (SK.cur && SK.cur.pts.length) { skUndo(); return; }
  const prev = HIST.stack.pop(); if (!prev) { toast('Tidak ada yang bisa diurungkan.'); return; }
  const o = JSON.parse(prev); S.roads = o.roads; S.parcel = o.parcel; S.extra = o.extra; S.cps = o.cps;
  HIST.last = prev; HIST.skip = true; onSketchChanged(); HIST.skip = false;
}

/* ---------- putar gambar agar utara menghadap ke atas ---------- */
const ROT = { deg: 0, orig: null, el: null };
function rotAsli(dataURL, w, h) { ROT.deg = 0; ROT.orig = { dataURL, w, h, mime: (dataURL.match(/^data:(image\/\w+)/) || [])[1] || 'image/png' }; ROT.el = null; tampilRot(); }
function ukuranPutar(w, h, deg) { const a = deg * DEG; return [Math.round(Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))), Math.round(Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)))]; }
// titik gambar asli → gambar terputar (deg searah jarum jam di layar)
function keRot(p, deg, w0, h0, w1, h1) { const a = deg * DEG, c = Math.cos(a), s = Math.sin(a), dx = p[0] - w0 / 2, dy = p[1] - h0 / 2; return [c * dx - s * dy + w1 / 2, s * dx + c * dy + h1 / 2]; }
function keAsli(p, deg, w0, h0, w1, h1) { const a = -deg * DEG, c = Math.cos(a), s = Math.sin(a), dx = p[0] - w1 / 2, dy = p[1] - h1 / 2; return [c * dx - s * dy + w0 / 2, s * dx + c * dy + h0 / 2]; }
function tampilRot() { const e = $('rotInfo'); if (e) e.textContent = ROT.deg ? `Gambar sudah diputar ${fmt(ROT.deg, 1)}° dari aslinya.` : 'Gambar belum diputar.'; }
const putarGambar = safe('Putar gambar', async (delta) => {
  if (!S.img || !ROT.orig) throw new Error('Muat gambar dulu.');
  if (SK.cur) SK.cur = null;
  let nd = ROT.deg + delta; while (nd > 180) nd -= 360; while (nd <= -180) nd += 360;
  nd = Math.round(nd * 100) / 100;
  const o = ROT.orig;
  if (!ROT.el) { ROT.el = new Image(); ROT.el.src = o.dataURL; await new Promise((ok, no) => { ROT.el.onload = ok; ROT.el.onerror = () => no(new Error('Gambar asli tidak bisa dibaca')); }); }
  const [w1, h1] = ukuranPutar(o.w, o.h, nd);
  if (w1 * h1 > 40e6) throw new Error('Gambar terlalu besar untuk diputar. Perkecil resolusi gambar terlebih dahulu.');
  const cv = document.createElement('canvas'); cv.width = w1; cv.height = h1;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, w1, h1);
  c.translate(w1 / 2, h1 / 2); c.rotate(nd * DEG); c.drawImage(ROT.el, -o.w / 2, -o.h / 2);
  // pindahkan semua titik yang sudah digambar ke koordinat gambar baru
  const W0 = S.img.w, H0 = S.img.h, ubah = p => keRot(keAsli(p, ROT.deg, o.w, o.h, W0, H0), nd, o.w, o.h, w1, h1);
  S.roads.forEach(r => r.pts = r.pts.map(ubah));
  if (S.parcel) S.parcel = S.parcel.map(ubah);
  S.extra.forEach(e => e.pts = e.pts.map(ubah));
  S.cps.forEach(cp => cp.img = ubah(cp.img));
  ROT.deg = nd;
  S.cands = []; S.sel = -1; S.T = null; CTX = null; S.adj = { dx: 0, dy: 0, dth: 0 };
  if (map) { G.cand.clearLayers(); G.res.clearLayers(); }
  $('candList').innerHTML = '<p class="hint">Gambar diputar; jalankan pencocokan lagi.</p>';
  const url = cv.toDataURL(o.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  setImage(url, S.img.name, true, true);
  for (let i = 0; i < 100 && !(S.img && S.img.dataURL === url); i++) await sleep(50);
  LOG.info(`Gambar diputar ${fmt(delta, 1)}° (total ${fmt(nd, 1)}°)`, { w: w1, h: h1 });
  tampilRot(); aturOverlay();
});
function selesaiPanahUtara(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.hypot(dx, dy) < 5) { toast('Panah terlalu pendek. Klik pangkal lalu ujung panah utara.', 'warn'); return; }
  const phi = Math.atan2(dx, -dy) / DEG; // sudut panah dari arah atas, searah jarum jam
  if ($('inNorthMode').value === 'bebas') $('inNorthMode').value = 'kira';
  LOG.info(`Panah utara ditandai: ${fmt(phi, 1)}° dari atas gambar`);
  if (Math.abs(phi) < 0.3) { toast('Panah utara sudah menghadap ke atas.', 'ok'); return; }
  const janji = putarGambar(-phi);
  toast(`Gambar diputar ${fmt(-phi, 1)}° agar utara menghadap ke atas.`, 'ok');
  return janji;
}

/* ---------- geser/putar bidang saja & sejajarkan dengan jalan ---------- */
function terapkanAdj(pts) {
  const a = S.adj; if (!a || (!a.dx && !a.dy && !a.dth)) return pts;
  const c = CORE.centroid(pts), cs = Math.cos(a.dth), sn = Math.sin(a.dth);
  return pts.map(p => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + cs * x - sn * y + a.dx, c[1] + sn * x + cs * y + a.dy]; });
}
function tandaiDisesuaikan() { if (S.sel >= 0 && !S.cands[S.sel].label.includes('disesuaikan')) S.cands[S.sel].label += ' (disesuaikan)'; }

/* ---------- salin ke AutoCAD (tempel di command line) ---------- */
// Satu baris AutoLISP: dibaca AutoCAD sebagai satu ekspresi (tidak terpotong per baris),
// titik WCS dikonversi ke UCS aktif dengan (trans), "_non" mematikan OSNAP per titik.
function poligonAcad() {
  needResult();
  const toXY = pts => pts.map(w => { const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
  const polys = [finalXY()];
  for (const ex of S.extra) polys.push(toXY(ex.pts.map(p => CORE.fwdT(S.T, p[0], -p[1]))));
  return polys;
}
function perintahAcad() {
  const polys = poligonAcad(), f = v => v.toFixed(4);
  if ($('inAcadFmt').value === 'teks') // AutoCAD LT: satu baris, spasi = Enter
    return polys.map(P => '_.PLINE ' + P.map(q => `_non ${f(q[0])},${f(q[1])}`).join(' ') + ' _C').join(' ');
  const L0 = polys.map(P => '(' + P.map(q => `(${f(q[0])} ${f(q[1])} 0.0)`).join(' ') + ')').join(' ');
  return `(progn (foreach pl '(${L0}) (command "_.PLINE") (foreach p pl (command "_non" (trans p 0 1))) (command "_C")) (princ "\\nPlot Bidang: ${polys.length} polyline digambar.") (princ))`;
}
function isiAcadTxt() { try { $('acadTxt').value = S.T && S.parcel && PROJ ? perintahAcad() : ''; } catch (e) { $('acadTxt').value = ''; } }
const salinAcad = safe('Salin untuk AutoCAD', async () => {
  const txt = perintahAcad(); $('acadTxt').value = txt;
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
    const ta = $('acadTxt'); ta.closest('details').open = true; ta.focus(); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
  }
  const n = 1 + S.extra.length;
  LOG.info(`Perintah AutoCAD disalin (${$('inAcadFmt').value}): ${n} polyline, ${CORE.CRS[SET.crs].nama}, ${txt.length} karakter`);
  toast(ok ? `Tersalin (${n} bidang). Di AutoCAD: Esc, klik command line, Ctrl+V, lalu Enter.` : 'Browser menolak menyalin otomatis. Teks sudah dipilih di kotak "Lihat isi yang disalin"; tekan Ctrl+C.', ok ? 'ok' : 'warn');
});

/* ---------- berkas BT / SU (PDF hasil scan) — diproses hanya di browser ---------- */
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/';
let PDFJS = null;
async function muatPdfjs() {
  if (PDFJS) return PDFJS;
  try { PDFJS = await import(PDFJS_URL + 'pdf.min.mjs'); }
  catch (e) { LOG.error('Pembaca PDF (pdf.js) gagal dimuat', e.message); throw new Error('Pembaca PDF gagal dimuat (butuh internet). Coba muat ulang halaman.'); }
  PDFJS.GlobalWorkerOptions.workerSrc = PDFJS_URL + 'pdf.worker.min.mjs';
  return PDFJS;
}
// Kode wilayah pada nama file: 16 01 KK LL (prov, kota, kecamatan, kelurahan)
const KODE_KEC = { '01': 'Palaran', '02': 'Samarinda Seberang', '03': 'Samarinda Ulu', '04': 'Samarinda Ilir', '05': 'Samarinda Utara', '06': 'Sungai Kunjang', '07': 'Sambutan', '08': 'Sungai Pinang', '09': 'Samarinda Kota', '10': 'Loa Janan Ilir' };
const KODE_KEL = { '16010401': ['Samarinda Ilir', 'Selili'] };   // diketahui pasti
try { Object.assign(KODE_KEL, JSON.parse(localStorage.getItem('plotkw.kode') || '{}')); } catch (e) { /* abaikan */ }
function bacaNamaFile(n) {
  const nm = n.replace(/\.[^.]+$/, '');
  let m = nm.match(/(?:^|[^A-Za-z])(SU|GS)[_\s-]?(\d{8})[_\s-]?(\d{1,6})[_\s-]?(\d{4})(?!\d)/i);
  if (m) return { jenis: 'SU', kode: m[2], nomor: m[3], tahun: m[4], label: `SU ${m[3]}/${m[4]}` };
  m = nm.match(/(?:^|[^A-Za-z])BT[_\s-]?(\d{8})(\d)(\d{5})(?!\d)/i);
  if (m) return { jenis: 'BT', kode: m[1], jenisHak: m[2], nomor: m[3], label: `BT hak ${m[3]}` + (m[2] === '1' ? ' (HM)' : '') };
  return { jenis: '?', kode: null, label: nm.slice(0, 40) };
}
const DOCS = { list: [], kodeTunggu: null };
const bukaBerkas = safe('Buka berkas', async files => {
  const arr = [...files];
  const gambar = arr.filter(f => /^image\//.test(f.type)), pdfs = arr.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (gambar.length) loadImageFile(gambar[0]);
  if (!pdfs.length) return;
  const lib = await muatPdfjs();
  for (const f of pdfs) {
    const info = bacaNamaFile(f.name);
    const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const d = { id: 'd' + Date.now().toString(36) + DOCS.list.length, nama: f.name, info, pdf, n: pdf.numPages, thumbs: [] };
    DOCS.list.push(d);
    LOG.info(`Berkas dibuka: ${info.jenis} (${pdf.numPages} hal.)`, { kode: info.kode, nomor: info.nomor, tahun: info.tahun });
    for (let i = 1; i <= pdf.numPages; i++) d.thumbs.push(await renderHalaman(pdf, i, 150));
    terapkanKode(info);
    if (CACHE_BACA[kunciBerkas(d)]) AI.hasil[d.id] = CACHE_BACA[kunciBerkas(d)];
  }
  renderDocs();
  const su = DOCS.list.filter(d => d.info.jenis === 'SU').at(-1);
  if (su && !S.img) toast('Klik halaman gambar pada surat ukur (yang ada panah utara dan skala), lalu "Pakai sebagai gambar situasi".', 'ok');
});
// Render satu halaman: lebar target (px) atau dpi target ({dpi})
async function renderHalaman(pdf, no, lebar, dpi, panjang) {
  const pg = await pdf.getPage(no), v1 = pg.getViewport({ scale: 1 });
  let sc = panjang ? panjang / Math.max(v1.width, v1.height) : dpi ? dpi / 72 : lebar / v1.width;
  const maks = 3600; if (v1.width * sc > maks || v1.height * sc > maks) sc = maks / Math.max(v1.width, v1.height);
  const vp = pg.getViewport({ scale: sc }), cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: c, viewport: vp }).promise;
  return { url: cv.toDataURL('image/jpeg', 0.9), w: cv.width, h: cv.height, dpi: 72 * sc };
}
function terapkanKode(info) {
  if (!info.kode) return;
  const k = KODE_KEL[info.kode];
  if (k) {
    if ($('inKec').value !== k[0] || $('inKel').value !== k[1]) { $('inKec').value = k[0]; isiKelurahan(); $('inKel').value = k[1]; pilihDariDaftar(); }
  } else {
    const kec = KODE_KEC[info.kode.slice(4, 6)];
    if (kec && $('inKec').value !== kec) { $('inKec').value = kec; isiKelurahan(); }
    DOCS.kodeTunggu = info.kode;
    toast(`Kode wilayah ${info.kode} belum dikenal${kec ? ` (perkiraan Kec. ${kec})` : ''}. Pilih kelurahannya di langkah 1; aplikasi akan mengingatnya.`, 'warn');
  }
  if (!$('inNama').value.trim()) $('inNama').value = info.label;
  updateKop();
}
function ingatKode() { // dipanggil saat kelurahan dipilih manual
  if (!DOCS.kodeTunggu || !$('inKel').value || $('inKel').value === '*') return;
  KODE_KEL[DOCS.kodeTunggu] = [$('inKec').value, $('inKel').value];
  try { const L0 = JSON.parse(localStorage.getItem('plotkw.kode') || '{}'); L0[DOCS.kodeTunggu] = KODE_KEL[DOCS.kodeTunggu]; localStorage.setItem('plotkw.kode', JSON.stringify(L0)); } catch (e) { /* abaikan */ }
  LOG.info(`Kode wilayah ${DOCS.kodeTunggu} diingat sebagai ${$('inKel').value}, ${$('inKec').value}`);
  toast(`Kode ${DOCS.kodeTunggu} sekarang dikenal sebagai ${$('inKel').value}.`, 'ok');
  DOCS.kodeTunggu = null;
}
function renderDocs() {
  const el = $('docList'); if (!el) return;
  if (!DOCS.list.length) { el.innerHTML = ''; return; }
  el.innerHTML = DOCS.list.map(d => {
    const k = d.info.kode ? (KODE_KEL[d.info.kode] ? `${KODE_KEL[d.info.kode][1]}, ${KODE_KEL[d.info.kode][0]}` : `kode ${d.info.kode} (belum dikenal)`) : 'kode wilayah tidak terbaca dari nama file';
    return `<div class="doc"><div class="doc-h"><b>${esc(d.info.label)}</b><span class="hint">${esc(k)}</span>${d.info.jenis === 'SU' ? `<button class="btn kecil pri nf" data-digit="${d.id}" title="Baca, ambil halaman gambar, telusuri, putar ke utara, lalu cocokkan">Digitasi otomatis</button>` : ''}<button class="btn kecil nf" data-baca="${d.id}">${AI.hasil[d.id] ? 'Baca ulang' : 'Baca otomatis'}</button><button class="btn kecil nf" data-hapus="${d.id}" aria-label="Tutup berkas">✕</button></div>
      <div class="thumbs">${d.thumbs.map((t, i) => `<button class="thumb" data-doc="${d.id}" data-pg="${i + 1}" title="Halaman ${i + 1}"><img src="${t.url}" alt="Halaman ${i + 1}"><span>${i + 1}</span></button>`).join('')}</div>
      <div data-hasil="${d.id}">${htmlHasil(d)}</div></div>`;
  }).join('');
  el.querySelectorAll('.thumb').forEach(b => b.onclick = () => bukaPenampil(b.dataset.doc, +b.dataset.pg));
  el.querySelectorAll('[data-hapus]').forEach(b => b.onclick = () => { DOCS.list = DOCS.list.filter(d => d.id !== b.dataset.hapus); renderDocs(); });
  el.querySelectorAll('[data-baca]').forEach(b => b.onclick = () => bacaBerkas(b.dataset.baca, !!AI.hasil[b.dataset.baca]));
  el.querySelectorAll('[data-digit]').forEach(b => b.onclick = () => digitasiOtomatis(b.dataset.digit));
  el.querySelectorAll('[data-isi]').forEach(b => b.onclick = () => isiDariHasil(b.dataset.isi));
  el.querySelectorAll('[data-gbr]').forEach(b => b.onclick = () => { const d = DOCS.list.find(x => x.id === b.dataset.gbr); if (d) bukaPenampil(d.id, AI.hasil[d.id].gabung.halamanGambar); });
  $('btnBacaSemua').hidden = DOCS.list.length < 2;
}
const VW = { doc: null, pg: 1, z: 1 };
const bukaPenampil = safe('Buka halaman', async (id, pg) => {
  const d = DOCS.list.find(x => x.id === id); if (!d) return;
  VW.doc = d; VW.pg = pg; VW.z = 1;
  $('vwJudul').textContent = `${d.info.label}, halaman ${pg} dari ${d.n}`;
  $('vwImg').src = d.thumbs[pg - 1].url; $('viewer').hidden = false;
  const hd = await renderHalaman(d.pdf, pg, null, 150); // tajam untuk dibaca
  if (VW.doc === d && VW.pg === pg) { $('vwImg').src = hd.url; aturZoom(); }
});
function aturZoom() { $('vwImg').style.width = (VW.z * 100) + '%'; $('vwZ').textContent = Math.round(VW.z * 100) + '%'; }
function geserHalaman(dt) { if (!VW.doc) return; const p = VW.pg + dt; if (p >= 1 && p <= VW.doc.n) bukaPenampil(VW.doc.id, p); }
const pakaiHalaman = safe('Pakai halaman', async () => {
  const d = VW.doc; if (!d) return;
  $('vwPakai').disabled = true; $('vwPakai').textContent = 'Menyiapkan gambar…';
  try {
    const r = await renderHalaman(d.pdf, VW.pg, null, 200);
    $('viewer').hidden = true;
    setImage(r.url, `${d.info.label} hal ${VW.pg}`, false, false, { dpi: r.dpi });
    if (d.info.jenis === 'SU' && !$('inSkala').value) $('inSkala').value = 500;
    LOG.info(`Halaman ${VW.pg} dari ${d.info.jenis} dipakai sebagai gambar situasi`, { dpi: +r.dpi.toFixed(1), w: r.w, h: r.h });
    toast('Gambar siap. Periksa skala (biasanya 1:500), putar agar utara di atas, lalu telusuri jalan dan bidang.', 'ok');
    go(2);
  } finally { $('vwPakai').disabled = false; $('vwPakai').textContent = 'Pakai sebagai gambar situasi'; }
});
// Pemeriksaan skala gambar (1:N) terhadap skala dari luas
function cekSkala(sLuas) {
  const N = parseFloat($('inSkala').value), dpi = S.img && S.img.dpi;
  if (!N || !dpi) return null;
  const sSk = N * 0.0254 / dpi; // meter per piksel menurut skala gambar
  return { sSk, beda: sLuas ? (sLuas / sSk - 1) * 100 : null };
}

/* ---------- baca otomatis dengan AI lokal (Ollama) — gratis, berkas tetap di komputer ---------- */
// Dua penyedia: 'groq' (online, gratis dengan batas pemakaian; tidak dipakai untuk pelatihan) atau 'ollama' (di komputer sendiri)
const AI_BAWAAN = { groq: 'qwen/qwen3.8-27b', ollama: 'qwen2.5vl:7b', claude: 'claude-haiku-5-5' };
// Harga Claude per juta token (USD) untuk perkiraan biaya: [masukan, keluaran]
const HARGA_CLAUDE = [[/haiku/i, 0.10, 0.50], [/sonnet/i, 2, 10], [/opus/i, 4, 20]];
// Urutan pilihan model pembaca gambar di Groq (model "Preview" bisa berganti nama)
const GROQ_VISION = [/^qwen\/qwen3\.\d+-27b$/, /qwen.*vl/i, /llama-4-(scout|maverick)/i, /vision/i];
function pilihModelVisi(ada) {
  for (const re of GROQ_VISION) { const m = ada.filter(x => re.test(x)).sort().reverse()[0]; if (m) return m; }
  return null;
}
const AI = { prov: 'groq', key: '', keys: {}, url: 'http://localhost:11434', model: AI_BAWAAN.groq, models: {}, hasil: {}, sibuk: false, pakai: { masuk: 0, keluar: 0, usd: 0, n: 0 } };
try {
  const v = JSON.parse(localStorage.getItem('plotkw.ai') || '{}');
  AI.prov = v.prov || AI.prov; AI.url = v.url || AI.url;
  AI.keys = v.keys || (v.key ? { [v.prov || 'groq']: v.key } : {}); AI.models = v.models || (v.model ? { [v.prov || 'groq']: v.model } : {});
  AI.key = AI.keys[AI.prov] || ''; AI.model = AI.models[AI.prov] || AI_BAWAAN[AI.prov];
  Object.assign(AI.pakai, JSON.parse(localStorage.getItem('plotkw.aipakai') || '{}'));
} catch (e) { /* abaikan */ }
function simpanSetAI() {
  AI.prov = $('inAiProv').value; AI.key = $('inAiKey').value.trim(); AI.url = ($('inAiUrl').value.trim() || AI.url).replace(/\/+$/, '');
  AI.model = $('inAiModel').value.trim() || AI_BAWAAN[AI.prov];
  AI.keys[AI.prov] = AI.key; AI.models[AI.prov] = AI.model;
  try { localStorage.setItem('plotkw.ai', JSON.stringify({ prov: AI.prov, keys: AI.keys, url: AI.url, models: AI.models })); } catch (e) { /* abaikan */ }
}
function gantiPenyedia() {
  const lama = AI.prov, baru = $('inAiProv').value;
  AI.keys[lama] = $('inAiKey').value.trim(); AI.models[lama] = $('inAiModel').value.trim() || AI_BAWAAN[lama];
  AI.prov = baru; AI.key = AI.keys[baru] || ''; AI.model = AI.models[baru] || AI_BAWAAN[baru];
  isiSetAI(); simpanSetAI(); $('aiStatus').textContent = '';
}
function isiSetAI() {
  $('inAiProv').value = AI.prov; $('inAiKey').value = AI.key; $('inAiUrl').value = AI.url; $('inAiModel').value = AI.model;
  $('inAiKey').placeholder = AI.prov === 'claude' ? 'sk-ant-…' : 'gsk_…';
  document.querySelectorAll('[data-prov]').forEach(e => { e.hidden = !e.dataset.prov.split(' ').includes(AI.prov); });
  tampilPakai();
}
function tampilPakai() {
  const el = $('aiPakai'); if (!el) return;
  const p = AI.pakai;
  el.textContent = p.n ? `Pemakaian Claude di browser ini: ${p.n} permintaan, ${(p.masuk / 1000).toFixed(1)} rb token masuk, ${(p.keluar / 1000).toFixed(1)} rb token keluar, sekitar US$${p.usd.toFixed(4)} (± Rp${Math.round(p.usd * 16500).toLocaleString('id-ID')}).` : 'Belum ada pemakaian Claude di browser ini.';
}
function catatPakai(model, u) {
  if (!u) return 0;
  const h = HARGA_CLAUDE.find(x => x[0].test(model)) || HARGA_CLAUDE[0];
  const masuk = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1, keluar = u.output_tokens || 0;
  const usd = (masuk * h[1] + keluar * h[2]) / 1e6;
  Object.assign(AI.pakai, { masuk: AI.pakai.masuk + (u.input_tokens || 0), keluar: AI.pakai.keluar + keluar, usd: AI.pakai.usd + usd, n: AI.pakai.n + 1 });
  try { localStorage.setItem('plotkw.aipakai', JSON.stringify(AI.pakai)); } catch (e) { /* abaikan */ }
  tampilPakai();
  return usd;
}
// Simpan hasil baca per berkas, agar membuka berkas yang sama tidak membayar/membaca ulang
const CACHE_BACA = (() => { try { return JSON.parse(localStorage.getItem('plotkw.baca') || '{}'); } catch (e) { return {}; } })();
const kunciBerkas = d => d.nama + '|' + d.n;
function simpanCacheBaca(d) {
  CACHE_BACA[kunciBerkas(d)] = AI.hasil[d.id];
  const ks = Object.keys(CACHE_BACA); if (ks.length > 300) delete CACHE_BACA[ks[0]];
  try { localStorage.setItem('plotkw.baca', JSON.stringify(CACHE_BACA)); } catch (e) { /* abaikan */ }
}
const SKEMA_BACA = {
  type: 'object',
  properties: {
    jenis_halaman: { type: 'string', enum: ['formulir_surat_ukur', 'gambar_bidang', 'buku_tanah', 'lainnya'] },
    desa_kelurahan: { type: ['string', 'null'] }, kecamatan: { type: ['string', 'null'] },
    jalan: { type: 'array', items: { type: 'string' } },
    luas_angka: { type: ['number', 'null'] }, luas_terbilang: { type: ['string', 'null'] },
    skala: { type: ['number', 'null'] }, nomor_surat_ukur: { type: ['string', 'null'] }, tahun: { type: ['string', 'null'] },
    nib: { type: ['string', 'null'] }, nomor_hak: { type: ['string', 'null'] },
    ukuran_sisi_m: { type: 'array', items: { type: 'number' } },
    keterbacaan: { type: 'string', enum: ['baik', 'sedang', 'buruk'] }
  },
  required: ['jenis_halaman', 'desa_kelurahan', 'kecamatan', 'jalan', 'luas_angka', 'luas_terbilang', 'skala', 'nomor_surat_ukur', 'tahun', 'nib', 'nomor_hak', 'ukuran_sisi_m', 'keterbacaan']
};
const PROMPT_BACA = `Ini satu halaman hasil scan dokumen pertanahan Indonesia lama dari Kota Samarinda (Buku Tanah, Surat Ukur, atau Gambar Situasi). Tulisannya bisa ketikan mesin tik atau tulisan tangan.
Baca dengan teliti dan isi JSON sesuai skema:
- jenis_halaman: formulir_surat_ukur (isian data surat ukur/gambar situasi), gambar_bidang (halaman berisi gambar/sketsa bidang tanah), buku_tanah, atau lainnya.
- desa_kelurahan, kecamatan: seperti tertulis.
- jalan: nama jalan/gang yang tertulis (di isian atau di gambar).
- luas_angka: luas tanah dalam m² (angka saja). luas_terbilang: luas yang ditulis dengan huruf, bila ada.
- skala: angka N dari "Skala 1 : N" bila ada.
- ukuran_sisi_m: angka-angka ukuran sisi bidang yang tertulis pada gambar (meter).
- nomor_surat_ukur, tahun, nib, nomor_hak bila tertulis.
Aturan: JANGAN menebak. Bila tidak terbaca atau tidak ada, isi null (atau [] untuk daftar). Jangan menuliskan nama orang.`;
async function panggilAI(gambarB64, prompt, skema, maxTok) {
  if (AI.prov === 'claude') return panggilClaude(gambarB64, prompt, skema, maxTok);
  return AI.prov === 'ollama' ? panggilOllama(gambarB64, prompt, skema) : panggilGroq(gambarB64, prompt, skema);
}
// Claude: jawaban terstruktur lewat satu "alat" wajib; beberapa gambar dalam satu permintaan
async function panggilClaude(gambar, prompt, skema, maxTok = 1500) {
  if (!AI.key) throw new Error('Isi kunci API Claude dulu (console.anthropic.com).');
  const imgs = Array.isArray(gambar) ? gambar : [gambar];
  const body = JSON.stringify({
    model: AI.model, max_tokens: maxTok,
    tools: [{ name: 'kirim_hasil', description: 'Kirim hasil pembacaan dalam format terstruktur.', input_schema: skema }],
    tool_choice: { type: 'tool', name: 'kirim_hasil' },
    messages: [{ role: 'user', content: [...imgs.map(b => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } })), { type: 'text', text: prompt }] }]
  });
  for (let coba = 0; coba < 4; coba++) {
    const t0 = performance.now(); let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body,
        headers: { 'content-type': 'application/json', 'x-api-key': AI.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    } catch (e) { LOG.error('Claude tidak bisa dihubungi', e.message); throw new Error('Claude tidak bisa dihubungi. Periksa internet.'); }
    const txt = await res.text();
    if (res.status === 429 || res.status === 529 || res.status >= 500) {
      const tunggu = Math.min(60, +(res.headers.get('retry-after') || 0) || 5 * (coba + 1));
      LOG.warn(`Claude sibuk (HTTP ${res.status}), menunggu ${tunggu} dtk`, txt.slice(0, 200)); toast(`Claude sedang sibuk. Mencoba lagi dalam ${tunggu} detik…`, 'warn');
      await sleep(tunggu * 1000); continue;
    }
    if (!res.ok) {
      LOG.error('Claude: HTTP ' + res.status, txt.slice(0, 500));
      throw new Error(res.status === 401 ? 'Kunci API Claude tidak valid.' : /credit|billing|balance/i.test(txt) ? 'Saldo kredit API Claude habis. Isi saldo di console.anthropic.com.' : /model/i.test(txt) ? `Model "${AI.model}" tidak tersedia. Coba claude-haiku-5-5.` : `Claude: HTTP ${res.status} ${txt.slice(0, 120)}`);
    }
    const J = JSON.parse(txt), alat = (J.content || []).find(c => c.type === 'tool_use');
    const usd = catatPakai(AI.model, J.usage);
    if (!alat) { LOG.error('Jawaban Claude tanpa hasil terstruktur', txt.slice(0, 800)); throw new Error('Jawaban AI tidak bisa dibaca.'); }
    LOG.info(`Claude menjawab dalam ${((performance.now() - t0) / 1000).toFixed(1)} dtk`, { model: AI.model, masuk: J.usage && J.usage.input_tokens, keluar: J.usage && J.usage.output_tokens, usd: +usd.toFixed(5), berhenti: J.stop_reason });
    return alat.input;
  }
  throw new Error('Claude masih sibuk. Coba lagi beberapa menit lagi.');
}
async function panggilGroq(gambarB64, prompt, skema) {
  if (!AI.key) throw new Error('Isi kunci API Groq dulu (gratis, lihat panduan di bagian Baca otomatis).');
  const isiPrompt = prompt + '\n\nBalas HANYA dengan satu objek JSON yang mengikuti skema ini:\n' + JSON.stringify(skema);
  for (let coba = 0; coba < 4; coba++) {
    const t0 = performance.now(); let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.key },
        body: JSON.stringify({ model: AI.model, temperature: 0, response_format: { type: 'json_object' }, reasoning_effort: 'none',
          messages: [{ role: 'user', content: [{ type: 'text', text: isiPrompt }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + gambarB64 } }] }] })
      });
    } catch (e) { LOG.error('Groq tidak bisa dihubungi', e.message); throw new Error('Layanan AI online (Groq) tidak bisa dihubungi. Periksa internet.'); }
    const txt = await res.text();
    if (res.status === 429) { // batas pemakaian gratis: tunggu lalu ulangi
      const tunggu = Math.min(60, +(res.headers.get('retry-after') || 0) || 10 * (coba + 1));
      LOG.warn(`Batas pemakaian Groq tercapai, menunggu ${tunggu} dtk`, txt.slice(0, 200)); toast(`Batas pemakaian gratis tercapai. Menunggu ${tunggu} detik lalu mencoba lagi…`, 'warn');
      await sleep(tunggu * 1000); continue;
    }
    if (res.status === 400 && /reasoning_effort/i.test(txt) && coba === 0) { LOG.warn('Model tidak mendukung reasoning_effort, dicoba tanpa'); continue; }
    if ((res.status === 404 || res.status === 400) && /model/i.test(txt) && !AI._gantiOtomatis) {
      AI._gantiOtomatis = true;
      try {
        const lm = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + AI.key } });
        const ganti = pilihModelVisi(((await lm.json()).data || []).map(m => m.id));
        if (ganti && ganti !== AI.model) { LOG.info('Model Groq diganti otomatis saat membaca', { dari: AI.model, ke: ganti }); $('inAiModel').value = ganti; simpanSetAI(); toast(`Model AI diganti otomatis ke ${ganti}.`, 'ok'); continue; }
      } catch (e) { /* lanjut ke pesan galat */ }
    }
    if (!res.ok) {
      LOG.error('Groq: HTTP ' + res.status, txt.slice(0, 500));
      throw new Error(res.status === 401 ? 'Kunci API Groq tidak valid.' : res.status === 404 || /model/i.test(txt) && res.status === 400 ? `Model "${AI.model}" tidak tersedia di Groq. Cek daftar model di console.groq.com.` : `Groq: HTTP ${res.status} ${txt.slice(0, 120)}`);
    }
    let isi;
    try { const c = JSON.parse(txt).choices[0].message.content; isi = JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); }
    catch (e) { LOG.error('Jawaban AI bukan JSON', txt.slice(0, 800)); throw new Error('Jawaban AI tidak bisa dibaca.'); }
    LOG.info(`AI online menjawab dalam ${((performance.now() - t0) / 1000).toFixed(1)} dtk`);
    return isi;
  }
  throw new Error('Batas pemakaian gratis Groq masih penuh. Coba lagi beberapa menit lagi.');
}
async function panggilOllama(gambarB64, prompt, skema) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(AI.url + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AI.model, stream: false, format: skema, options: { temperature: 0, num_ctx: 8192 }, messages: [{ role: 'user', content: prompt, images: [gambarB64] }] })
    });
  } catch (e) {
    LOG.error('AI lokal tidak bisa dihubungi', { url: AI.url, err: e.message });
    throw new Error(`AI lokal (Ollama) tidak bisa dihubungi di ${AI.url}. Pastikan Ollama berjalan dan OLLAMA_ORIGINS sudah diatur.`);
  }
  const txt = await res.text();
  if (!res.ok) { LOG.error('AI lokal: HTTP ' + res.status, txt.slice(0, 500)); throw new Error(`AI lokal: HTTP ${res.status}. ${/not found/i.test(txt) ? `Model "${AI.model}" belum diunduh; jalankan: ollama pull ${AI.model}` : txt.slice(0, 120)}`); }
  let isi;
  try { isi = JSON.parse(JSON.parse(txt).message.content); } catch (e) { LOG.error('Jawaban AI bukan JSON', txt.slice(0, 800)); throw new Error('Jawaban AI tidak bisa dibaca.'); }
  LOG.info(`AI lokal menjawab dalam ${((performance.now() - t0) / 1000).toFixed(1)} dtk`);
  return isi;
}
const tesAI = safe('Tes AI', async () => {
  simpanSetAI(); $('aiStatus').textContent = 'Menghubungi…';
  const lencana = (k, t) => `<span class="${k}" style="padding:2px 6px;border-radius:4px">${t}</span> `;
  if (AI.prov === 'groq') {
    if (!AI.key) { $('aiStatus').innerHTML = lencana('qc-warn', 'Belum ada kunci') + 'Isi kunci API Groq.'; return; }
    let r; try { r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + AI.key } }); }
    catch (e) { $('aiStatus').innerHTML = lencana('qc-bad', 'Tidak terhubung') + 'Periksa internet.'; throw new Error('Groq tidak bisa dihubungi'); }
    if (r.status === 401) { $('aiStatus').innerHTML = lencana('qc-bad', 'Kunci salah') + 'Periksa kunci API.'; return; }
    const ada = ((await r.json()).data || []).map(m => m.id);
    if (ada.includes(AI.model)) { $('aiStatus').innerHTML = lencana('qc-ok', 'Siap') + `Model ${esc(AI.model)} tersedia.`; LOG.info('Tes AI Groq', { model: AI.model, tersedia: true }); return; }
    const ganti = pilihModelVisi(ada);
    if (ganti) {
      const lama = AI.model; $('inAiModel').value = ganti; simpanSetAI();
      $('aiStatus').innerHTML = lencana('qc-ok', 'Siap') + `Model ${esc(lama)} tidak tersedia, otomatis diganti ke ${esc(ganti)}.`;
      LOG.info('Model Groq diganti otomatis', { dari: lama, ke: ganti });
    } else {
      $('aiStatus').innerHTML = lencana('qc-warn', 'Model tidak ada') + `Tidak ada model pembaca gambar yang dikenali. Cek console.groq.com/docs/vision. Tersedia: ${esc(ada.slice(0, 10).join(', '))}`;
      LOG.warn('Tidak ada model visi Groq yang dikenali', ada);
    }
    return;
  }
  if (AI.prov === 'claude') {
    if (!AI.key) { $('aiStatus').innerHTML = lencana('qc-warn', 'Belum ada kunci') + 'Isi kunci API Claude.'; return; }
    let r; try { r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': AI.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }); }
    catch (e) { $('aiStatus').innerHTML = lencana('qc-bad', 'Tidak terhubung') + 'Periksa internet.'; throw new Error('Claude tidak bisa dihubungi'); }
    if (r.status === 401) { $('aiStatus').innerHTML = lencana('qc-bad', 'Kunci salah') + 'Periksa kunci API.'; return; }
    const ada = ((await r.json()).data || []).map(m => m.id);
    if (!ada.includes(AI.model)) { const h = ada.filter(x => /haiku/.test(x)).sort().reverse()[0]; if (h) { $('inAiModel').value = h; simpanSetAI(); } }
    $('aiStatus').innerHTML = ada.includes(AI.model) ? lencana('qc-ok', 'Siap') + `Model ${esc(AI.model)} tersedia.` : lencana('qc-warn', 'Model tidak ada') + `Tersedia: ${esc(ada.slice(0, 8).join(', '))}`;
    LOG.info('Tes AI Claude', { model: AI.model, tersedia: ada.includes(AI.model) });
    return;
  }
  let r;
  try { r = await fetch(AI.url + '/api/tags'); } catch (e) { $('aiStatus').innerHTML = lencana('qc-bad', 'Tidak terhubung') + 'Ollama belum berjalan, atau OLLAMA_ORIGINS belum diatur.'; throw new Error('Ollama tidak bisa dihubungi di ' + AI.url); }
  const ada = ((await r.json()).models || []).map(m => m.name);
  $('aiStatus').innerHTML = ada.includes(AI.model) ? lencana('qc-ok', 'Siap') + `Model ${esc(AI.model)} tersedia.` : lencana('qc-warn', 'Model belum ada') + `Jalankan <code>ollama pull ${esc(AI.model)}</code>.`;
  LOG.info('Tes AI lokal', { url: AI.url, model: AI.model, tersedia: ada });
});
// Angka terbilang Indonesia → angka (untuk cek silang luas ketikan)
function terbilang(t) {
  if (!t) return null;
  const w = t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  const S1 = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
  let total = 0, cur = 0, ada = false;
  for (const x of w) {
    if (x === 'koma') break;
    if (x in S1) { cur += S1[x]; ada = true; }
    else if (x === 'sepuluh') { cur += 10; ada = true; } else if (x === 'sebelas') { cur += 11; ada = true; }
    else if (x === 'belas') { cur = (cur % 10) + 10 + (cur - cur % 10); ada = true; }
    else if (x === 'puluh') { cur = (cur % 10) * 10 + (cur - cur % 10); ada = true; }
    else if (x === 'seratus') { cur += 100; ada = true; } else if (x === 'ratus') { cur = (cur % 100) * 100 + (cur - cur % 100); ada = true; }
    else if (x === 'seribu') { total += 1000; ada = true; } else if (x === 'ribu') { total += (cur || 1) * 1000; cur = 0; ada = true; }
  }
  return ada ? total + cur : null;
}
function gabungHasil(hal) {
  const g = { kelurahan: null, kecamatan: null, jalan: [], luas: null, luasTerbilang: null, skala: null, nomorSU: null, tahun: null, nib: null, nomorHak: null, sisi: [], halamanGambar: null, catatan: [] };
  hal.forEach((h, i) => {
    if (!h) return;
    const ambil = (k, v) => { if (v != null && v !== '' && g[k] == null) g[k] = v; };
    ambil('kelurahan', h.desa_kelurahan); ambil('kecamatan', h.kecamatan); ambil('luas', h.luas_angka); ambil('luasTerbilang', h.luas_terbilang);
    ambil('skala', h.skala); ambil('nomorSU', h.nomor_surat_ukur); ambil('tahun', h.tahun); ambil('nib', h.nib); ambil('nomorHak', h.nomor_hak);
    for (const j of h.jalan || []) if (j && !g.jalan.some(x => CORE.nameMatch(x, j))) g.jalan.push(j);
    if (h.jenis_halaman === 'gambar_bidang' && g.halamanGambar == null) g.halamanGambar = i + 1;
    if (h.ukuran_sisi_m && h.ukuran_sisi_m.length && !g.sisi.length) g.sisi = h.ukuran_sisi_m;
    if (h.keterbacaan === 'buruk') g.catatan.push(`Halaman ${i + 1} sulit dibaca.`);
  });
  const tb = terbilang(g.luasTerbilang);
  if (g.luas != null && tb != null && Math.abs(tb - g.luas) > 0.5) g.catatan.push(`Luas angka (${g.luas}) berbeda dengan luas terbilang (${tb}). Periksa di dokumen.`);
  if (g.luas == null && tb != null) { g.luas = tb; g.catatan.push('Luas diambil dari tulisan huruf (terbilang).'); }
  return g;
}
const bacaBerkas = safe('Baca otomatis', async (id, paksa) => {
  const d = DOCS.list.find(x => x.id === id); if (!d) return;
  if (!paksa && CACHE_BACA[kunciBerkas(d)]) { AI.hasil[id] = CACHE_BACA[kunciBerkas(d)]; LOG.info(`Hasil baca ${d.info.label} diambil dari simpanan (tanpa memanggil AI)`); renderDocs(); return; }
  if (AI.sibuk) { toast('AI masih membaca berkas lain. Tunggu sebentar.', 'warn'); return; }
  simpanSetAI(); AI.sibuk = true;
  const el = document.querySelector(`[data-hasil="${id}"]`);
  try {
    let hal = [];
    if (AI.prov === 'claude') { // satu permintaan untuk semua halaman, gambar dibatasi 1568 px
      if (el) el.innerHTML = `<p class="hint">Membaca ${d.n} halaman sekaligus dengan Claude…</p>`;
      const imgs = [];
      for (let i = 1; i <= d.n; i++) imgs.push((await renderHalaman(d.pdf, i, null, null, 1568)).url.split(',')[1]);
      const J = await panggilAI(imgs, `Berikut ${d.n} halaman, berurutan dari halaman 1. Isi satu objek per halaman sesuai urutan.\n\n` + PROMPT_BACA,
        { type: 'object', properties: { halaman: { type: 'array', items: SKEMA_BACA } }, required: ['halaman'] }, 600 * d.n);
      hal = (J.halaman || []).slice(0, d.n); while (hal.length < d.n) hal.push(null);
    } else for (let i = 1; i <= d.n; i++) {
      if (el) el.innerHTML = `<p class="hint">Membaca halaman ${i} dari ${d.n} dengan AI…</p>`;
      const r = await renderHalaman(d.pdf, i, null, 120);
      hal.push(await panggilAI(r.url.split(',')[1], PROMPT_BACA, SKEMA_BACA));
    }
    const g = gabungHasil(hal);
    AI.hasil[id] = { halaman: hal, gabung: g }; simpanCacheBaca(d);
    LOG.info(`Hasil baca ${d.info.jenis} ${d.info.nomor || ''}`, { luas: g.luas, skala: g.skala, kel: g.kelurahan, kec: g.kecamatan, jalan: g.jalan, halGambar: g.halamanGambar, catatan: g.catatan });
    renderDocs();
  } finally { AI.sibuk = false; }
});
async function bacaSemua() {
  const L0 = DOCS.list.filter(d => !AI.hasil[d.id]);
  if (!L0.length) { toast('Semua berkas sudah dibaca.'); return; }
  for (const d of L0) await bacaBerkas(d.id);
  toast(`${L0.length} berkas selesai dibaca. Periksa hasilnya sebelum dipakai.`, 'ok');
}
function htmlHasil(d) {
  const h = AI.hasil[d.id]; if (!h) return '';
  const g = h.gabung, kodeK = d.info.kode && KODE_KEL[d.info.kode];
  const baris = [];
  const row = (k, v) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && baris.push(`<tr><td>${k}</td><td>${esc(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`);
  row('Kelurahan', g.kelurahan); row('Kecamatan', g.kecamatan); row('Luas (m²)', g.luas); row('Luas terbilang', g.luasTerbilang);
  row('Skala 1:', g.skala); row('Jalan', g.jalan); row('Ukuran sisi (m)', g.sisi); row('Nomor SU', g.nomorSU); row('Tahun', g.tahun); row('NIB', g.nib); row('Nomor hak', g.nomorHak);
  row('Halaman gambar', g.halamanGambar);
  const cat = g.catatan.slice();
  if (kodeK && g.kelurahan && normKey(g.kelurahan) && !normKey(kodeK[1]).includes(normKey(g.kelurahan).slice(0, 4))) cat.push(`Kelurahan terbaca "${g.kelurahan}", sedangkan kode file menunjuk ${kodeK[1]}.`);
  return `<div class="hasil-ai"><p class="hint" style="margin:6px 0 2px">Hasil baca AI. <b>Periksa dengan dokumen</b> sebelum dipakai.</p>
    <table>${baris.join('') || '<tr><td>Tidak ada yang terbaca.</td></tr>'}</table>
    ${cat.length ? `<ul class="qc">${cat.map(c => `<li class="qc-warn">${esc(c)}</li>`).join('')}</ul>` : ''}
    <div class="row" style="margin-top:6px"><button class="btn kecil pri nf" data-isi="${d.id}">Isi ke formulir</button>${g.halamanGambar ? `<button class="btn kecil nf" data-gbr="${d.id}">Buka halaman gambar (${g.halamanGambar})</button>` : ''}</div></div>`;
}
function isiDariHasil(id) {
  const d = DOCS.list.find(x => x.id === id), h = AI.hasil[id]; if (!d || !h) return;
  const g = h.gabung, diisi = [];
  if (g.luas) { $('inLuas').value = g.luas; diisi.push('luas'); }
  if (g.skala) { $('inSkala').value = g.skala; diisi.push('skala'); }
  if (d.info.kode && !KODE_KEL[d.info.kode] && g.kelurahan) {
    for (const [kec, kels] of SAMARINDA) for (const k of kels) if (normKey(k) === normKey(g.kelurahan.replace(/^(kel(urahan)?|desa)\.?\s*/i, ''))) {
      $('inKec').value = kec; isiKelurahan(); $('inKel').value = k; DOCS.kodeTunggu = d.info.kode; ingatKode(); pilihDariDaftar(); diisi.push('kelurahan');
    }
  }
  if (g.jalan.length && !$('inRoadName').value) { $('inRoadName').value = g.jalan[0]; diisi.push('nama jalan berikutnya'); }
  for (const id2 of ['inLuas', 'inSkala']) $(id2).classList.add('dari-ai');
  renderParcelInfo(); updateKop();
  LOG.info('Hasil AI diisikan ke formulir', diisi);
  toast(diisi.length ? `Terisi dari hasil baca: ${diisi.join(', ')}. Periksa kembali angkanya.` : 'Tidak ada isian yang bisa dipakai.', diisi.length ? 'ok' : 'warn');
}

/* ---------- telusuri gambar otomatis ---------- */
const SKEMA_GAMBAR = {
  type: 'object',
  properties: {
    bidang: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
    jalan: { type: 'array', items: { type: 'object', properties: { nama: { type: ['string', 'null'] }, titik: { type: 'array', items: { type: 'array', items: { type: 'number' } } } }, required: ['nama', 'titik'] } },
    panah_utara: { type: ['object', 'null'], properties: { pangkal: { type: 'array', items: { type: 'number' } }, ujung: { type: 'array', items: { type: 'number' } } } },
    skala: { type: ['number', 'null'] }
  },
  required: ['bidang', 'jalan', 'panah_utara', 'skala']
};
const PROMPT_GAMBAR = `Ini gambar situasi bidang tanah dari surat ukur lama. KOORDINAT_INFO
Berikan JSON:
- bidang: titik-titik SUDUT bidang tanah UTAMA, berurutan mengelilingi bidang, sebagai [x,y]. Bidang utama adalah poligon yang sudut-sudutnya diberi nomor kecil (1, 2, 3, 4 …), sering bergaris tebal atau diwarnai/diarsir tepinya. Letakkan titik TEPAT di perpotongan garis batas pada sudut itu. Rumah/bangunan di dalam bidang (kotak kecil berarsir) BUKAN batas bidang.
- jalan: untuk setiap jalan/gang yang tergambar sebagai dua garis sejajar, titik-titik GARIS TENGAH di antara kedua garis itu, dari ujung ke ujung (titik tambahan di tikungan), beserta namanya bila tertulis (selain itu null).
  Tulisan seperti "Tanah Hak", "Tanah Negara", "T.N.", "Hak Milik No …", nama orang, "Parit", atau "Sungai" menandai tanah/air di sebelahnya, BUKAN jalan; jangan dimasukkan sebagai jalan.
- panah_utara: pangkal dan ujung (mata panah, huruf U/N) panah utara, atau null bila tidak ada.
- skala: angka N dari "Skala 1 : N", atau null.
Jangan menambahkan bidang atau jalan yang tidak tergambar.`;
const telusuriOtomatis = safe('Telusuri otomatis', async () => {
  if (!S.img) throw new Error('Muat gambar situasi dulu.');
  if (AI.sibuk) { toast('AI masih bekerja. Tunggu sebentar.', 'warn'); return; }
  simpanSetAI(); AI.sibuk = true;
  $('btnTelusuriAI').disabled = true; $('btnTelusuriAI').textContent = 'AI sedang menelusuri gambar…';
  try {
    const mx = 1400, k = Math.min(1, mx / Math.max(S.img.w, S.img.h));
    const cv = document.createElement('canvas'); cv.width = Math.round(S.img.w * k); cv.height = Math.round(S.img.h * k);
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(imgEl, 0, 0, cv.width, cv.height);
    const piksel = AI.prov === 'claude', W = piksel ? cv.width : 1000, H = piksel ? cv.height : 1000;
    const info = piksel ? `Koordinat dalam PIKSEL gambar ini (lebar ${cv.width}, tinggi ${cv.height}; x dari kiri, y dari atas).` : 'Koordinat memakai skala 0–1000 terhadap gambar ini (x dari kiri ke kanan, y dari atas ke bawah).';
    const J = await panggilAI(cv.toDataURL('image/jpeg', 0.9).split(',')[1], PROMPT_GAMBAR.replace('KOORDINAT_INFO', info), SKEMA_GAMBAR, 2000);
    const ke = p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) ? [Math.max(0, Math.min(W, p[0])) * S.img.w / W, Math.max(0, Math.min(H, p[1])) * S.img.h / H] : null;
    const bukanJalan = n => n && !/\b(jalan|jl|jln|gang|gg|lorong|lr)\b/i.test(n);
    const dibuang = (J.jalan || []).filter(j => bukanJalan(j.nama)).map(j => j.nama);
    if (dibuang.length) LOG.info('Garis bernama bukan jalan diabaikan', dibuang);
    const roads = (J.jalan || []).filter(j => !bukanJalan(j.nama)).map(j => ({ name: j.nama || '', pts: (j.titik || []).map(ke).filter(Boolean) })).filter(r => r.pts.length >= 2);
    let parcel = (J.bidang || []).map(ke).filter(Boolean);
    if (parcel.length >= 3) parcel = rapatkanBidang(parcel);
    let n = 0;
    if (roads.length) { S.roads = roads; n++; }
    if (parcel.length >= 3) { S.parcel = parcel; n++; }
    if (J.skala && !$('inSkala').value) $('inSkala').value = J.skala;
    onSketchChanged();
    LOG.info('Hasil telusur AI', { jalan: roads.length, titikBidang: parcel.length, panah: !!J.panah_utara, skala: J.skala });
    const pu = J.panah_utara && ke(J.panah_utara.pangkal), uu = J.panah_utara && ke(J.panah_utara.ujung);
    if (pu && uu) await selesaiPanahUtara(pu, uu);
    toast(n ? `AI mengusulkan ${roads.length} jalan dan ${parcel.length >= 3 ? 'bidang ' + parcel.length + ' titik' : 'tanpa bidang'}${pu && uu ? ', dan memutar gambar sesuai panah utara' : ''}. Periksa dan perbaiki dengan "Ubah titik" (Ctrl+Z untuk membatalkan).` : 'AI tidak menemukan jalan atau bidang pada gambar.', n ? 'ok' : 'warn');
  } finally { AI.sibuk = false; $('btnTelusuriAI').disabled = false; $('btnTelusuriAI').textContent = 'Telusuri gambar otomatis (AI)'; }
});

/* ---------- digitasi otomatis satu tombol: baca → halaman gambar → telusuri → utara → cocokkan ---------- */
const digitasiOtomatis = safe('Digitasi otomatis', async id => {
  const d = DOCS.list.find(x => x.id === id); if (!d) return;
  const t0 = performance.now(), langkah = t => { const e = document.querySelector(`[data-hasil="${id}"]`); if (e) e.innerHTML = `<p class="hint"><b>Digitasi otomatis:</b> ${t}</p>`; LOG.info('Digitasi otomatis: ' + t); };
  LOG.info(`=== Digitasi otomatis ${d.info.label} ===`);
  // 1. baca isian
  if (!AI.hasil[id]) { langkah('membaca dokumen…'); await bacaBerkas(id); }
  if (!AI.hasil[id]) throw new Error('Pembacaan dokumen gagal (lihat log). Periksa kunci API / koneksi AI.');
  const g = AI.hasil[id].gabung;
  isiDariHasil(id);
  if (!getLuas()) { renderDocs(); go(2); setTimeout(() => $('inLuas').focus(), 100); throw new Error('Luas tidak terbaca dari dokumen. Isi luas dari BT/SU, lalu klik Digitasi otomatis lagi.'); }
  // 2. halaman gambar
  const hg = g.halamanGambar || Math.min(2, d.n);
  langkah(`menyiapkan halaman gambar (hal. ${hg})…`);
  VW.doc = d; VW.pg = hg; await pakaiHalaman();
  const nama = `${d.info.label} hal ${hg}`;
  for (let i = 0; i < 200 && !(S.img && S.img.name === nama && imgEl && imgEl.complete); i++) await sleep(50);
  if (!S.img || S.img.name !== nama) throw new Error('Halaman gambar gagal disiapkan.');
  // 3. telusuri + putar ke utara
  langkah('AI menelusuri jalan, bidang, dan panah utara…');
  await telusuriOtomatis();
  if (!S.parcel || !S.roads.length) { renderDocs(); go(2); throw new Error('AI tidak menemukan bidang atau jalan pada gambar. Telusuri manual dengan alat Jalan dan Bidang, lalu lanjut ke Cocokkan.'); }
  // 4. cocokkan
  if (!S.osm) { renderDocs(); go(1); throw new Error('Data jalan wilayah belum siap. Pilih kelurahan di langkah 1, lalu lanjutkan ke Cocokkan.'); }
  langkah('mencocokkan dengan peta…');
  await runMatch();
  renderDocs();
  if (!S.cands.length) throw new Error('Pencocokan tidak menghasilkan kandidat.');
  go(4);
  const dt = ((performance.now() - t0) / 1000).toFixed(0);
  LOG.info(`Digitasi otomatis selesai dalam ${dt} dtk`, { skor: +S.cands[0].r.score.toFixed(3), kandidat: S.cands.length });
  toast(`Digitasi otomatis selesai (${dt} dtk). Periksa hasil di peta & pemeriksaan data, lalu Salin bidang untuk AutoCAD.`, 'ok');
});

/* ---------- rapatkan bidang hasil AI ke garis tinta pada gambar ---------- */
// AI sering meleset beberapa milimeter; poligon digeser/diputar/diskalakan sedikit, lalu tiap sudut dicari di sekitarnya
// agar keempat sisinya menempel pada garis yang benar-benar tergambar.
function petaTinta(maks) {
  const k = Math.min(1, maks / Math.max(S.img.w, S.img.h)), w = Math.max(8, Math.round(S.img.w * k)), h = Math.max(8, Math.round(S.img.h * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.drawImage(imgEl, 0, 0, w, h);
  const px = c.getImageData(0, 0, w, h).data, n = w * h, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = (0.299 * px[4 * i] + 0.587 * px[4 * i + 1] + 0.114 * px[4 * i + 2]) / 255;
  // latar lokal (rata-rata kotak) lewat citra integral
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r += L[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + r; } }
  const rad = Math.max(6, Math.round(Math.max(w, h) / 80)), INF = 1e9, d = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1), y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1);
    const bg = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    d[y * w + x] = bg - L[y * w + x] > 0.1 ? 0 : INF;
  }
  // jarak ke tinta terdekat (chamfer 2 lintasan)
  const D = 1.4142;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + D); if (x < w - 1) v = Math.min(v, d[i - w + 1] + D); } d[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1); if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + D); if (x > 0) v = Math.min(v, d[i + w - 1] + D); } d[i] = v; }
  return { k, w, h, d };
}
function jarakSisi(P, M, tau) {
  let s = 0, n = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(2, Math.ceil(len / 2));
    for (let j = 0; j < m; j++) {
      const t = (j + 0.5) / m, x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t);
      s += x < 0 || y < 0 || x >= M.w || y >= M.h ? tau : Math.min(tau, M.d[y * M.w + x]); n++;
    }
  }
  return s / n;
}
function rapatkanBidang(poly) {
  try {
    const t0 = performance.now(), M = petaTinta(1000), tau = 6;
    const P0 = poly.map(p => [p[0] * M.k, p[1] * M.k]), c = CORE.centroid(P0), uk = Math.sqrt(Math.abs(CORE.polyArea(P0)));
    if (!(uk > 8)) return poly;
    const ubah = (P, dx, dy, th, sc) => { const co = Math.cos(th) * sc, si = Math.sin(th) * sc; return P.map(p => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + co * x - si * y + dx, c[1] + si * x + co * y + dy]; }); };
    const awal = jarakSisi(P0, M, tau);
    if (awal < 1) { LOG.info('Bidang hasil AI sudah menempel pada garis gambar', { jarak_px: +awal.toFixed(2) }); return poly; }
    let best = { e: awal, dx: 0, dy: 0, th: 0, sc: 1 };
    const R = 0.45 * uk, st = Math.max(1.5, uk / 30);
    for (let sc = 0.85; sc <= 1.151; sc += 0.05) for (let a = -6; a <= 6; a += 2) {
      const th = a * Math.PI / 180;
      for (let dx = -R; dx <= R; dx += st) for (let dy = -R; dy <= R; dy += st) {
        const e = jarakSisi(ubah(P0, dx, dy, th, sc), M, tau);
        if (e < best.e) best = { e, dx, dy, th, sc };
      }
    }
    // penghalusan bertahap
    for (const h of [st / 2, st / 4, 0.5]) {
      let maju = true;
      while (maju) { maju = false;
        for (const [ddx, ddy, dth, dsc] of [[h, 0, 0, 0], [-h, 0, 0, 0], [0, h, 0, 0], [0, -h, 0, 0], [0, 0, 0.005, 0], [0, 0, -0.005, 0], [0, 0, 0, 0.01], [0, 0, 0, -0.01]]) {
          const q = { dx: best.dx + ddx, dy: best.dy + ddy, th: best.th + dth, sc: best.sc + dsc };
          const e = jarakSisi(ubah(P0, q.dx, q.dy, q.th, q.sc), M, tau);
          if (e < best.e - 1e-6) { best = { e, ...q }; maju = true; }
        }
      }
    }
    let P = ubah(P0, best.dx, best.dy, best.th, best.sc);
    // tiap sudut digeser sedikit (±4 px) agar sisi-sisinya menempel
    for (let it = 0; it < 3; it++) for (let i = 0; i < P.length; i++) {
      let bi = P[i], be = jarakSisi(P, M, tau);
      for (let ox = -4; ox <= 4; ox++) for (let oy = -4; oy <= 4; oy++) { const Q = P.slice(); Q[i] = [P[i][0] + ox * 0.5, P[i][1] + oy * 0.5]; const e = jarakSisi(Q, M, tau); if (e < be) { be = e; bi = Q[i]; } }
      P[i] = bi;
    }
    const akhir = jarakSisi(P, M, tau);
    const terima = akhir < awal * 0.75 && akhir < 2.2;
    LOG.info('Rapatkan bidang ke garis gambar', { jarakAwal_px: +awal.toFixed(2), jarakAkhir_px: +akhir.toFixed(2), geser_px: +(Math.hypot(best.dx, best.dy) / M.k).toFixed(1), putar_deg: +(best.th * 180 / Math.PI).toFixed(1), skala: +best.sc.toFixed(3), dipakai: terima, ms: Math.round(performance.now() - t0) });
    return terima ? P.map(p => [p[0] / M.k, p[1] / M.k]) : poly;
  } catch (e) { LOG.warn('Rapatkan bidang gagal, dipakai hasil AI apa adanya', e.message); return poly; }
}
