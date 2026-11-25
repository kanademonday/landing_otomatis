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
function perintahAcad() { return perintahDariXY(poligonAcad()); }
function perintahDariXY(polys) {
  const f = v => v.toFixed(4);
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
const KODE_KEL = { '16010401': ['Samarinda Ilir', 'Selili'], '16010402': ['Samarinda Ilir', 'Sungai Dama'], '16010403': ['Samarinda Ilir', 'Sidomulyo'], '16010404': ['Samarinda Ilir', 'Sidodamai'], '16010405': ['Samarinda Ilir', 'Pelita'] }; // dari data persil   // diketahui pasti
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
    if (d.info.jenis === 'SU' && d.info.nomor) setNomorSU(d.info.nomor, d.info.kode, d.info.tahun);
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
  if (AI.prov === 'claude') AI.prov = 'groq'; // pilihan Claude (berbayar) ditiadakan
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
  if (!AI.key) { bukaSetAI(); throw new Error('Kunci API Groq belum diisi di browser ini. Tempel kunci (gsk_…) di kotak yang sudah dibuka, lalu ulangi.'); }
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
    jalan: { type: 'array', items: { type: 'object', properties: { nama: { type: ['string', 'null'] }, titik: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, posisi_nama: { type: ['array', 'null'], items: { type: 'number' } } }, required: ['nama', 'titik', 'posisi_nama'] } },
    panah_utara: { type: ['object', 'null'], properties: { pangkal: { type: 'array', items: { type: 'number' } }, ujung: { type: 'array', items: { type: 'number' } } } },
    skala: { type: ['number', 'null'] }
  },
  required: ['bidang', 'jalan', 'panah_utara', 'skala']
};
const PROMPT_GAMBAR = `Ini gambar situasi bidang tanah dari surat ukur lama. KOORDINAT_INFO
Berikan JSON:
- bidang: titik-titik SUDUT bidang tanah UTAMA, berurutan mengelilingi bidang, sebagai [x,y]. Bidang utama adalah poligon yang sudut-sudutnya diberi nomor kecil (1, 2, 3, 4 …), sering bergaris tebal atau diwarnai/diarsir tepinya. Letakkan titik TEPAT di perpotongan garis batas pada sudut itu. Rumah/bangunan di dalam bidang (kotak kecil berarsir) BUKAN batas bidang.
- jalan: untuk setiap jalan/gang yang tergambar sebagai dua garis sejajar, titik-titik GARIS TENGAH di antara kedua garis itu, dari ujung ke ujung (titik tambahan di tikungan), beserta namanya bila tertulis (selain itu null) dan posisi_nama: titik tengah tulisan nama jalan itu [x,y] (null bila tidak ada tulisan).
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
    const roads = (J.jalan || []).filter(j => !bukanJalan(j.nama)).map(j => ({ name: j.nama || '', pts: (j.titik || []).map(ke).filter(Boolean), lbl: ke(j.posisi_nama) })).filter(r => r.pts.length >= 2);
    let parcel = (J.bidang || []).map(ke).filter(Boolean);
    if (parcel.length >= 3) parcel = await perjelasBidang(parcel);
    if (parcel.length >= 3) parcel = rapatkanBidang(parcel);
    if (roads.length) { rapatkanJalan(roads, parcel.length >= 3 ? parcel : null); koreksiNamaJalan(roads); }
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
  simpanSetAI();
  if (AI.prov === 'groq' && !AI.key && !AI.hasil[id]) { bukaSetAI(); LOG.warn('Digitasi otomatis dibatalkan: kunci API Groq belum diisi di browser ini'); toast('Kunci API Groq belum diisi di browser ini. Tempel kunci (gsk_…) di kotak yang sudah dibuka, lalu klik Digitasi otomatis lagi.', 'warn'); return; }
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
    const terus = P => { // garis yang terus melewati sudut = kemungkinan garis jalan, bukan batas bidang
      let n = 0, a = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length], L1 = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L1 < 4) continue;
        const ux = (q[0] - p[0]) / L1, uy = (q[1] - p[1]) / L1, panj = Math.max(6, 0.15 * L1);
        for (let t = 3; t <= panj; t += 2) for (const [bx, by, sg] of [[q[0], q[1], 1], [p[0], p[1], -1]]) {
          const x = Math.round(bx + sg * ux * t), y = Math.round(by + sg * uy * t); n++;
          if (x >= 0 && y >= 0 && x < M.w && y < M.h && M.d[y * M.w + x] < 1.5) a++;
        }
      }
      return n ? a / n : 0;
    };
    const nilai = P => jarakSisi(P, M, tau) + 0.35 * tau * terus(P);
    const awal = jarakSisi(P0, M, tau);
    if (awal < 1) { LOG.info('Bidang hasil AI sudah menempel pada garis gambar', { jarak_px: +awal.toFixed(2) }); return poly; }
    let best = { e: nilai(P0), dx: 0, dy: 0, th: 0, sc: 1 };
    const R = 0.3 * uk, st = Math.max(1.5, uk / 30);
    for (let sc = 0.85; sc <= 1.151; sc += 0.05) for (let a = -6; a <= 6; a += 2) {
      const th = a * Math.PI / 180;
      for (let dx = -R; dx <= R; dx += st) for (let dy = -R; dy <= R; dy += st) {
        const e = nilai(ubah(P0, dx, dy, th, sc));
        if (e < best.e) best = { e, dx, dy, th, sc };
      }
    }
    // penghalusan bertahap
    for (const h of [st / 2, st / 4, 0.5]) {
      let maju = true;
      while (maju) { maju = false;
        for (const [ddx, ddy, dth, dsc] of [[h, 0, 0, 0], [-h, 0, 0, 0], [0, h, 0, 0], [0, -h, 0, 0], [0, 0, 0.005, 0], [0, 0, -0.005, 0], [0, 0, 0, 0.01], [0, 0, 0, -0.01]]) {
          const q = { dx: best.dx + ddx, dy: best.dy + ddy, th: best.th + dth, sc: best.sc + dsc };
          const e = nilai(ubah(P0, q.dx, q.dy, q.th, q.sc));
          if (e < best.e - 1e-6) { best = { e, ...q }; maju = true; }
        }
      }
    }
    let P = ubah(P0, best.dx, best.dy, best.th, best.sc);
    // tiap sudut digeser sedikit (±4 px) agar sisi-sisinya menempel
    for (let it = 0; it < 3; it++) for (let i = 0; i < P.length; i++) {
      let bi = P[i], be = nilai(P);
      for (let ox = -4; ox <= 4; ox++) for (let oy = -4; oy <= 4; oy++) { const Q = P.slice(); Q[i] = [P[i][0] + ox * 0.5, P[i][1] + oy * 0.5]; const e = nilai(Q); if (e < be) { be = e; bi = Q[i]; } }
      P[i] = bi;
    }
    const akhir = jarakSisi(P, M, tau);
    const terima = akhir < awal * 0.75 && akhir < 2.2;
    LOG.info('Rapatkan bidang ke garis gambar', { jarakAwal_px: +awal.toFixed(2), jarakAkhir_px: +akhir.toFixed(2), geser_px: +(Math.hypot(best.dx, best.dy) / M.k).toFixed(1), putar_deg: +(best.th * 180 / Math.PI).toFixed(1), skala: +best.sc.toFixed(3), dipakai: terima, ms: Math.round(performance.now() - t0) });
    return terima ? P.map(p => [p[0] / M.k, p[1] / M.k]) : poly;
  } catch (e) { LOG.warn('Rapatkan bidang gagal, dipakai hasil AI apa adanya', e.message); return poly; }
}

/* ---------- tahap 2: potong gambar di sekitar bidang dan minta AI menunjuk sudutnya lagi (lebih teliti) ---------- */
const PROMPT_BIDANG = `Ini potongan gambar situasi surat ukur lama, diperbesar di sekitar bidang tanah utama. Koordinat memakai skala 0–1000 terhadap potongan ini (x dari kiri, y dari atas).
Tunjukkan titik-titik SUDUT bidang tanah utama, berurutan mengelilinginya, sebagai [x,y]. Bidang utama adalah poligon yang sudutnya diberi nomor kecil (1, 2, 3, 4 …), batasnya garis tegas dan sering diwarnai/distabilo. Letakkan titik TEPAT di perpotongan garis batas.
Yang BUKAN batas bidang: garis-garis jalan (dua garis sejajar panjang, biasanya bertulisan "Jalan …"), rumah/bangunan di dalam bidang (kotak kecil berarsir), dan tulisan.`;
async function perjelasBidang(parcel) {
  try {
    const xs = parcel.map(p => p[0]), ys = parcel.map(p => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys), m = 0.7 * Math.max(bw, bh, 40);
    const x0 = Math.max(0, Math.min(...xs) - m), y0 = Math.max(0, Math.min(...ys) - m), x1 = Math.min(S.img.w, Math.max(...xs) + m), y1 = Math.min(S.img.h, Math.max(...ys) + m);
    AI._potong = { x0, y0, x1, y1 };
    const k = Math.min(3, 1000 / Math.max(x1 - x0, y1 - y0)), cv = document.createElement('canvas');
    cv.width = Math.round((x1 - x0) * k); cv.height = Math.round((y1 - y0) * k);
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(imgEl, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
    const J = await panggilAI(cv.toDataURL('image/jpeg', 0.92).split(',')[1], PROMPT_BIDANG,
      { type: 'object', properties: { bidang: { type: 'array', items: { type: 'array', items: { type: 'number' } } } }, required: ['bidang'] }, 600);
    const P = (J.bidang || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).map(p => [x0 + Math.max(0, Math.min(1000, p[0])) / 1000 * (x1 - x0), y0 + Math.max(0, Math.min(1000, p[1])) / 1000 * (y1 - y0)]);
    if (P.length < 3) { LOG.warn('Tahap 2 (potongan) tidak memberi bidang; dipakai hasil tahap 1'); return parcel; }
    const a1 = Math.abs(CORE.polyArea(parcel)), a2 = Math.abs(CORE.polyArea(P)), d = Math.hypot(CORE.centroid(P)[0] - CORE.centroid(parcel)[0], CORE.centroid(P)[1] - CORE.centroid(parcel)[1]);
    LOG.info('Bidang diperjelas dari potongan gambar', { titik: P.length, rasioLuas: +(a2 / a1).toFixed(2), geser_px: Math.round(d) });
    return P;
  } catch (e) { LOG.warn('Tahap 2 (potongan) gagal, dipakai hasil tahap 1', e.message); return parcel; }
}

/* ---------- jalan hasil AI: geser ke garis tengah di antara dua garis tepi jalan, potong ujung yang kebablasan ---------- */
// Per ruas: cari garis-garis tinta yang sejajar dan menerus (histogram jarak tegak lurus, dengan sedikit kemiringan),
// gabungkan garis ganda yang rapat, lalu ambil dua tepi bersebelahan selebar jalan (3–25 m) yang paling dekat dengan garis AI
// dan bagian dalamnya bukan bidang tanah.
function rapatkanJalan(roads, parcel) {
  try {
    const t0 = performance.now(), M = petaTinta(1000), L0 = getLuas();
    const Pm = parcel ? parcel.map(p => [p[0] * M.k, p[1] * M.k]) : null;
    let mpp = null;
    if (Pm && L0) { const a = Math.abs(CORE.polyArea(Pm)); if (a > 50) mpp = Math.sqrt(L0 / a); }
    const gmin = mpp ? 3 / mpp : 4, gmax = mpp ? 25 / mpp : 0.06 * Math.max(M.w, M.h), D = Math.max(gmax * 1.2, 0.03 * Math.max(M.w, M.h));
    const tinta = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < M.w && y < M.h && M.d[y * M.w + x] < 1.01; };
    const dalam = (x, y) => { if (!Pm) return false; let c = false; for (let i = 0, j = Pm.length - 1; i < Pm.length; j = i++) { const a = Pm[i], b = Pm[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const ringkas = [];
    for (const r of roads) {
      // garis AI yang hampir lurus disederhanakan dulu (belokan kecil = derau)
      const P = sederhanakan(r.pts.map(p => [p[0] * M.k, p[1] * M.k]), 0.012 * Math.hypot(M.w, M.h)), segBaru = [], info = [], lebar = [];
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / (len || 1), uy = (b[1] - a[1]) / (len || 1), nx = -uy, ny = ux;
        const smp = [];
        for (let t = 2; t < len - 1; t += 3) {
          const x = a[0] + ux * t, y = a[1] + uy * t, gr = []; let m0 = null;
          for (let o = -D; o <= D + 1; o++) { const ada = o <= D && tinta(x + nx * o, y + ny * o); if (ada && m0 === null) m0 = o; if (!ada && m0 !== null) { gr.push((m0 + o - 1) / 2); m0 = null; } }
          smp.push({ t, gr });
        }
        if (len < 15 || smp.length < 5) { segBaru.push([a, b]); info.push(null); lebar.push(null); continue; }
        // Hough sederhana: tiap garis tinta lurus = puncak pada (kemiringan, jarak) — garis tepi jalan boleh sedikit tidak sejajar
        const tm = len / 2, nb = Math.ceil(D) + 2, SL = [];
        for (let sl = -0.25; sl <= 0.2501; sl += 0.01) SL.push(+sl.toFixed(2));
        const Hh = SL.map(sl => { const h = new Float32Array(nb); for (const q of smp) { const seen = new Set(); for (const o of q.gr) { const k = Math.round((o - sl * (q.t - tm) + D) / 2); if (k >= 0 && k < nb && !seen.has(k)) { seen.add(k); h[k]++; } } } return h; });
        const val = (a2, k) => a2 < 0 || a2 >= SL.length || k < 0 || k >= nb ? 0 : Hh[a2][k];
        const nil = (a2, k) => val(a2, k) + 0.5 * (val(a2, k - 1) + val(a2, k + 1));
        const ambang = 0.4 * smp.length, garis = [];
        for (let a2 = 0; a2 < SL.length; a2++) for (let k = 0; k < nb; k++) {
          const v = nil(a2, k); if (v < ambang) continue;
          let maks = true;
          for (let da = -2; da <= 2 && maks; da++) for (let dk = -2; dk <= 2; dk++) { if (!da && !dk) continue; const w = nil(a2 + da, k + dk); if (w > v || (w === v && (da < 0 || (!da && dk < 0)))) { maks = false; break; } }
          if (maks) garis.push({ o: k * 2 - D, sl: SL[a2], v });
        }
        // garis tepi jalan menerus panjang; tulisan (nama jalan) hanya potongan-potongan pendek → dibuang
        const runPanjang = g => { let run = 0, maks = 0; for (const q of smp) { const e = g.o + g.sl * (q.t - tm); if (q.gr.some(o => Math.abs(o - e) <= 2)) { run++; if (run > maks) maks = run; } else run = 0; } return maks; };
        for (let gi = garis.length - 1; gi >= 0; gi--) if (runPanjang(garis[gi]) < Math.max(8, 0.2 * smp.length)) garis.splice(gi, 1);
        // buang puncak kembar (garis sama, kemiringan sedikit beda)
        garis.sort((p1, p2) => p2.v - p1.v);
        const unik = [];
        for (const g of garis) if (!unik.some(u => Math.abs(u.o - g.o) < 4 && Math.abs(u.sl - g.sl) < 0.04)) unik.push(g);
        unik.sort((p1, p2) => p1.o - p2.o);
        const gab = [];
        for (const g of unik) { const z = gab.at(-1); if (z && g.o - z.kanan.o < gmin) z.kanan = g; else gab.push({ kiri: g, kanan: g }); }
        // posisi tulisan nama jalan (bila AI memberikannya) menandai bagian dalam jalan
        let olab = null;
        if (r.lbl) { const lx = r.lbl[0] * M.k - a[0], ly = r.lbl[1] * M.k - a[1], tl = lx * ux + ly * uy; if (tl > -0.2 * len && tl < 1.2 * len) olab = lx * nx + ly * ny; }
        const calon = [];
        for (let k = 0; k < gab.length; k++) for (let k2 = k + 1; k2 < gab.length; k2++) {
          const A = gab[k].kanan, B = gab[k2].kiri, g = B.o - A.o, mid = (A.o + B.o) / 2;
          if (g < gmin || g > gmax) continue;
          if (dalam(a[0] + ux * tm + nx * mid, a[1] + uy * tm + ny * mid)) continue; // bagian dalam bidang bukan jalan
          calon.push({ mid, g, sl: (A.sl + B.sl) / 2, bersebelahan: k2 === k + 1, berisiNama: olab !== null && olab > A.o + 0.1 * g && olab < B.o - 0.1 * g });
        }
        const adaNama = calon.filter(c => c.berisiNama);
        let pilih = null;
        const adaNamaSebelah = adaNama.filter(c => c.bersebelahan), kumpulan = adaNamaSebelah.length ? adaNamaSebelah : adaNama;
        if (kumpulan.length) pilih = kumpulan.reduce((m, c) => Math.abs(c.mid - olab) < Math.abs(m.mid - olab) ? c : m);
        else for (const c of calon.filter(c2 => c2.bersebelahan)) if (!pilih || Math.abs(c.mid) < Math.abs(pilih.mid)) pilih = c;
        if (!pilih) { segBaru.push([a, b]); info.push(null); lebar.push(null); continue; }
        lebar.push(pilih.g);
        const off = t => pilih.mid + pilih.sl * (t - tm);
        segBaru.push([[a[0] + nx * off(0), a[1] + ny * off(0)], [b[0] + nx * off(len), b[1] + ny * off(len)]]);
        info.push({ lebar_m: mpp ? +(pilih.g * mpp).toFixed(1) : null, geser_px: Math.round(Math.abs(pilih.mid) / M.k) });
      }
      const Q = P.map((p, i) => { const c = [segBaru[i - 1] && segBaru[i - 1][1], segBaru[i] && segBaru[i][0]].filter(Boolean); return [c.reduce((s2, q) => s2 + q[0], 0) / c.length, c.reduce((s2, q) => s2 + q[1], 0) / c.length]; });
      // perpanjang ujung selama kedua tepi jalan masih tergambar (AI sering hanya menelusuri sebagian jalan)
      const panjangkan = (ujung, dari, g) => {
        if (!g) return 0;
        const ux = ujung[0] - dari[0], uy = ujung[1] - dari[1], l = Math.hypot(ux, uy); if (l < 1) return 0;
        const dx = ux / l, dy = uy / l, nx = -dy, ny = dx, h = g / 2;
        const tepi = (x, y, sg) => { for (let e = -3; e <= 3; e++) if (tinta(x + nx * (sg * h + e), y + ny * (sg * h + e))) return true; return false; };
        let celah = 0, satu = 0, ok = 0;
        for (let st = 3; st < 0.8 * Math.max(M.w, M.h); st += 3) {
          const x = ujung[0] + dx * st, y = ujung[1] + dy * st;
          if (x < 0 || y < 0 || x >= M.w || y >= M.h) break;
          const a1 = tepi(x, y, 1), a2 = tepi(x, y, -1);
          if (a1 && a2) { ok = st; celah = 0; satu = 0; }
          else if (a1 || a2) { satu += 3; if (satu > 8 * g) break; } // simpang: satu tepi terbuka sebentar
          else if (++celah > 6) break;
        }
        if (ok > 0) { ujung[0] += dx * ok; ujung[1] += dy * ok; }
        return ok;
      };
      const tambah = [];
      if (Q.length >= 2) { tambah.push(Math.round(panjangkan(Q[0], Q[1], lebar[0]) / M.k)); tambah.push(Math.round(panjangkan(Q[Q.length - 1], Q[Q.length - 2], lebar[lebar.length - 1]) / M.k)); }
      r.pts = Q.map(p => [p[0] / M.k, p[1] / M.k]);
      const gl = lebar.filter(Boolean); r._lebar = gl.length ? gl.reduce((a, b) => a + b, 0) / gl.length / M.k : null;
      ringkas.push({ nama: r.name, ruas: info, diperpanjang_px: tambah });
    }
    // dukungan tepi jalan pada potongan (dipakai untuk memutuskan ujung mana yang kebablasan)
    const dukung = (r, p0, p1) => {
      if (!r._lebar) return 0;
      const a = [p0[0] * M.k, p0[1] * M.k], b = [p1[0] * M.k, p1[1] * M.k], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 3) return 1;
      const dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l, nx = -dy, ny = dx, h = r._lebar * M.k / 2;
      const tepi = (x, y, sg) => { for (let e = -3; e <= 3; e++) if (tinta(x + nx * (sg * h + e), y + ny * (sg * h + e))) return true; return false; };
      let n = 0, ya = 0;
      for (let t = 2; t < l; t += 3) { const x = a[0] + dx * t, y = a[1] + dy * t; n++; if (tepi(x, y, 1) && tepi(x, y, -1)) ya++; }
      return n ? ya / n : 1;
    };
    for (let u = 0; u < 4; u++) { const sblm = JSON.stringify(roads.map(r => r.pts)); potongKebablasan(roads, dukung); if (JSON.stringify(roads.map(r => r.pts)) === sblm) break; }
    LOG.info('Jalan dirapatkan ke garis tengah gambar', { jalan: ringkas, ms: Math.round(performance.now() - t0) });
  } catch (e) { LOG.warn('Rapatkan jalan gagal, dipakai hasil AI apa adanya', e.message); }
}
// Ujung jalan yang sedikit melewati jalan lain (AI sering meneruskan garis melewati simpang) dipotong di simpang itu.
// Bila dua jalan sama-sama "kebablasan" di simpang yang sama, yang dipotong hanya yang bagian lanjutannya tidak tergambar.
function potongKebablasan(roads, dukung) {
  const potong = (p1, p2, p3, p4) => { const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]); if (Math.abs(d) < 1e-9) return null; const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d, u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d; return t >= 0 && t <= 1 && u > 1e-3 && u < 1 - 1e-3 ? t : null; };
  const calon = [];
  for (const r of roads) for (const ujung of ['awal', 'akhir']) {
    const pts = ujung === 'awal' ? r.pts.slice().reverse() : r.pts, total = CORE.plLen(pts);
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      for (const o of roads) { if (o === r) continue;
        for (let j = 0; j < o.pts.length - 1; j++) {
          const t = potong(pts[i], pts[i + 1], o.pts[j], o.pts[j + 1]); if (t === null) continue;
          const sisa = total - (acc + t * l);
          if (sisa > 0.02 * total && sisa < 0.3 * total) {
            const c = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
            calon.push({ r, o, ujung, i, c, sisa: sisa / total, dk: dukung ? dukung(r, c, pts.at(-1)) : 0 });
          }
        }
      }
      acc += l;
    }
  }
  for (const k of calon) {
    if (k.dk > 0.35) continue; // bagian setelah simpang memang tergambar sebagai jalan
    const lawan = calon.find(x => x.r === k.o && x.o === k.r && Math.hypot(x.c[0] - k.c[0], x.c[1] - k.c[1]) < 5);
    if (lawan && lawan.dk < k.dk) continue; // jalan satunya yang kebablasan
    const pts = k.ujung === 'awal' ? k.r.pts.slice().reverse() : k.r.pts, baru = [...pts.slice(0, k.i + 1), k.c];
    k.r.pts = k.ujung === 'awal' ? baru.reverse() : baru;
    LOG.info('Ujung jalan yang melewati simpang dipotong', { jalan: k.r.name || '(tanpa nama)', dipotong_persen: Math.round(k.sisa * 100), dukunganTepi: +k.dk.toFixed(2) });
    break; // satu potongan per panggilan cukup; titik berubah
  }
}
/* ---------- nama jalan hasil baca disesuaikan ke nama di peta (ejaan tulisan tangan sering meleset) ---------- */
function miripNama(a, b) {
  const A = CORE.normName(a).replace(/ /g, ''), B = CORE.normName(b).replace(/ /g, '');
  if (!A || !B) return 0;
  const m = A.length, n = B.length; let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return 1 - prev[n] / Math.max(m, n);
}
function koreksiNamaJalan(roads) {
  if (!S.osm || !S.osm.ways) return;
  const daftar = [...new Set(S.osm.ways.flatMap(w => (w.name || '').split(' ; ')).filter(Boolean))];
  for (const r of roads) {
    if (!r.name || daftar.some(n => CORE.nameMatch(n, r.name))) continue;
    const urut = daftar.map(n => [n, miripNama(r.name, n)]).sort((a, b) => b[1] - a[1]);
    if (urut[0] && urut[0][1] >= 0.6 && (!urut[1] || urut[0][1] - urut[1][1] >= 0.08)) {
      LOG.info('Nama jalan disesuaikan ke nama di peta', { terbaca: r.name, menjadi: urut[0][0], kemiripan: +urut[0][1].toFixed(2) });
      r.nameAsli = r.name; r.name = urut[0][0];
    } else LOG.info('Nama jalan tidak ada di peta wilayah ini (hanya bentuk yang dipakai)', { terbaca: r.name, terdekat: urut[0] && urut[0][0] });
  }
}

// Douglas–Peucker
function sederhanakan(P, tol) {
  if (P.length <= 2) return P;
  const a = P[0], b = P[P.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let im = -1, dm = 0;
  for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / L; if (d > dm) { dm = d; im = i; } }
  return dm <= tol ? [a, b] : [...sederhanakan(P.slice(0, im + 1), tol).slice(0, -1), ...sederhanakan(P.slice(im), tol)];
}

/* ---------- MODE POLA JALAN (eksperimen; bawaan MATI) ----------
   Gambar SU lama sering hanya berisi satu garis jalan lurus → cocok di banyak tempat. Mode ini:
   1) mempersempit pencarian ke titik perkiraan (dari peta analog) atau ke sekitar SU bernomor berdekatan yang sudah ketemu;
   2) memberi label jujur: gambar minim tidak pernah "keyakinan tinggi"; beberapa lokasi serupa = "ambigu".
   Saat mati: tidak ada yang berubah (polaInArea() = null, conf() lama). */
const POLA = { on: false, rBawaan: 150, kTetangga: 3, maksSelisihNomor: 300, epsSerupa: 0.03, titik: null, su: { kode: null, tahun: null } };
const SUKET = (() => { try { return JSON.parse(localStorage.getItem('plotkw.suket') || '{}'); } catch (e) { return {}; } })();
const kunciSU = (kel, no) => kel + '#' + (+no);
function simpanSuket() { try { localStorage.setItem('plotkw.suket', JSON.stringify(SUKET)); } catch (e) { /* abaikan */ } }
function setNomorSU(no, kode, tahun) {
  if (kode) POLA.su.kode = kode; if (tahun) POLA.su.tahun = +tahun;
  if ($('inNoSU')) { $('inNoSU').value = +no; if ($('inThSU') && tahun) $('inThSU').value = +tahun; renderPola(); }
}
function kodeKelAktif() { if (POLA.su.kode) return POLA.su.kode; const kel = $('inKel').value; for (const k in KODE_KEL) if (KODE_KEL[k][1] === kel) return k; return null; }
// Area pencarian = satu atau beberapa lingkaran. Urutan: titik perkiraan → SU tetangga di data persil → SU yang sudah ditandai ketemu.
function areaPola() {
  if (!POLA.on) return null;
  if (POLA.titik) return { lingkaran: [{ lat: POLA.titik.lat, lon: POLA.titik.lon, r: POLA.titik.r }], sumber: 'titik perkiraan dari peta' };
  const no = +($('inNoSU') && $('inNoSU').value), kel = $('inKel').value, th = +($('inThSU') && $('inThSU').value) || POLA.su.tahun;
  if (!no || !kel) return null;
  const kode = kodeKelAktif();
  if (PERSIL.bidang.length && kode && th) {
    const tet = PERSIL.bidang.filter(b => b.su && b.su.kode === kode && b.su.tahun === th && b.su.nomor !== no && Math.abs(b.su.nomor - no) <= POLA.maksSelisihNomor)
      .sort((a, b) => Math.abs(a.su.nomor - no) - Math.abs(b.su.nomor - no)).slice(0, PERSIL_ATUR.k);
    if (tet.length) return { lingkaran: tet.map(b => ({ lat: b.c[0], lon: b.c[1], r: PERSIL_ATUR.r })), persil: true, sumber: `data persil: sekitar SU ${tet.map(b => b.su.nomor + '/' + b.su.tahun).join(', ')}` };
  }
  const tet = Object.values(SUKET).filter(x => x.kel === kel && x.nomor !== no && Math.abs(x.nomor - no) <= POLA.maksSelisihNomor)
    .sort((a, b) => Math.abs(a.nomor - no) - Math.abs(b.nomor - no)).slice(0, POLA.kTetangga);
  if (!tet.length) return null;
  const lat = tet.reduce((a, x) => a + x.lat, 0) / tet.length, lon = tet.reduce((a, x) => a + x.lon, 0) / tet.length;
  const m = 111320, sebar = Math.max(0, ...tet.map(x => Math.hypot((x.lat - lat) * m, (x.lon - lon) * m * Math.cos(lat * DEG))));
  return { lingkaran: [{ lat, lon, r: Math.max(POLA.rBawaan, 1.5 * sebar) }], sumber: `${tet.length} SU tetangga yang sudah ketemu (no. ${tet.map(x => x.nomor).join(', ')})` };
}
function lingkaranXY(a) { return a.lingkaran.map(L0 => { const c = PROJ.fwd(L0.lat, L0.lon); return { x: c[0], y: c[1], r: L0.r }; }); }
function dalamArea(cs, x, y, ex) { return cs.some(c => Math.hypot(x - c.x, y - c.y) < c.r + ex); }
// Simpang/ruas jangkar boleh sampai 100 m di luar lingkaran (simpang sketsa bisa jauh dari bidang);
// kandidat akhir disaring: pusat bidang harus di dalam salah satu lingkaran (saringPola).
const POLA_JANGKAR_EKSTRA = 100;
function polaInArea() {
  const a = areaPola(); if (!a || !PROJ) return null;
  const cs = lingkaranXY(a);
  return (x, y) => dalamArea(cs, x, y, POLA_JANGKAR_EKSTRA);
}
function saringPola(cands, ctx) {
  const a = areaPola(); if (!a || !PROJ || !ctx) return cands;
  const cs = lingkaranXY(a), pc = ctx.parcelC;
  const out = cands.filter(k => { const p = CORE.fwdT(k.T, pc[0], pc[1]); return dalamArea(cs, p[0], p[1], 0); });
  if (out.length < cands.length) LOG.info(`Mode pola: ${cands.length - out.length} kandidat di luar area perkiraan dibuang`);
  if (!out.length) { LOG.warn('Mode pola: tidak ada kandidat di dalam area perkiraan; ditampilkan kandidat terdekat apa adanya'); toast('Tidak ada kandidat di dalam area perkiraan. Periksa titik/radius, atau gambar jalannya.', 'warn'); return cands; }
  return out.map((k, i) => ({ ...k, label: '#' + (i + 1) }));
}
function infoPola() {
  if (!POLA.on) return '';
  const a = areaPola();
  return a ? `<li class="qc-ok">Mode pola: pencarian dipersempit ke ${a.lingkaran.length > 1 ? a.lingkaran.length + ' lingkaran' : 'lingkaran'} radius ${Math.round(a.lingkaran[0].r)} m (${esc(a.sumber)})</li>`
    : '<li class="qc-info">Mode pola aktif, tetapi belum ada titik perkiraan, data persil yang cocok, atau SU tetangga yang sudah ketemu: dicari di seluruh kelurahan.</li>';
}
function confPola(i) {
  const c = S.cands, sc = c[i].r.score, gap = c[i + 1] && c[i + 1].r ? sc - c[i + 1].r.score : 1;
  if (c[i].tempel != null) { // dengan data persil (aturan dikalibrasi pada tuning persil; uji akhir Sidomulyo 19/20 benar)
    const t2 = c[i + 1] && c[i + 1].tempel != null ? c[i + 1].tempel : 0;
    if (i === 0 && c[0].tempel >= 0.5 && t2 < 0.3 && sc >= 0.8) return [`keyakinan tinggi: ${Math.round(c[0].tempel * 100)}% sisi menempel bidang persil`, 'b-ok'];
    return [`perlu verifikasi: ${Math.round(c[i].tempel * 100)}% sisi menempel bidang persil`, sc >= 0.65 ? 'b-mid' : 'b-low'];
  }
  if (i === 0) {
    if (!SK.junc.length && S.roads.length <= 2) return ['perlu verifikasi: gambar minim (tanpa simpang)', 'b-mid'];
    if (sc >= 0.8 && gap > 0.06) return ['keyakinan tinggi', 'b-ok'];
    const serupa = c.filter(x => x.r && x.r.score >= sc - POLA.epsSerupa).length;
    if (sc >= 0.65) return [serupa >= 2 ? `ambigu: ${serupa} lokasi serupa` : 'sedang', 'b-mid'];
    return ['rendah', 'b-low'];
  }
  return sc >= 0.65 ? ['sedang', 'b-mid'] : ['rendah', 'b-low'];
}
function gambarAreaPola() {
  if (!map) return;
  if (!G.pola) G.pola = L.layerGroup().addTo(map);
  G.pola.clearLayers();
  const a = areaPola();
  if (a) for (const L0 of a.lingkaran) L.circle([L0.lat, L0.lon], { radius: L0.r, color: '#1F5E5B', weight: 2, dashArray: '4 6', fill: false, interactive: false }).addTo(G.pola);
}
function renderPola() {
  if (!$('polaBox')) return;
  $('polaBox').hidden = !POLA.on; if ($('btnTandaKetemu')) $('btnTandaKetemu').hidden = !POLA.on;
  const kel = $('inKel').value, n = Object.values(SUKET).filter(x => x.kel === kel).length, a = areaPola();
  $('suketInfo').textContent = kel ? `${n} SU di ${kel} sudah tercatat ketemu (tersimpan di browser ini).` : 'Pilih kelurahan dulu di langkah 1.';
  $('polaArea').innerHTML = !POLA.on ? '' : a ? `Area pencarian: ${a.lingkaran.length > 1 ? a.lingkaran.length + ' lingkaran ' : ''}radius <b>${Math.round(a.lingkaran[0].r)} m</b>, dari ${esc(a.sumber)}.` : 'Belum ada area: dicari di seluruh kelurahan.';
  renderSUPersil();
  try { renderReady(); } catch (e) { /* abaikan */ }
  try { gambarAreaPola(); } catch (e) { LOG.warn('Lingkaran area tidak bisa digambar di peta', e.message); }
}
// impor daftar SU yang sudah ketemu: baris "X = 51583.170 Y = 1444797.927 su.02743" atau "02743,51583.170,1444797.927"
function imporSuket(teks) {
  const kel = $('inKel').value; if (!kel || kel === '*') throw new Error('Pilih kelurahan dulu (langkah 1); daftar disimpan per kelurahan.');
  let n = 0; const gagal = [];
  for (const baris of teks.split(/\r?\n/)) {
    const b = baris.trim(); if (!b) continue;
    let m = b.match(/X\s*=\s*([\d.]+)\s*[,;]?\s*Y\s*=\s*([\d.]+)\s*[,;]?\s*(?:su|gs)?[\s.:_-]*0*(\d+)/i), no, X, Y;
    if (m) { X = +m[1]; Y = +m[2]; no = +m[3]; }
    else if ((m = b.match(/^(?:su|gs)?[\s.:_-]*0*(\d+)\s*[,;\t ]\s*([\d.]+)\s*[,;\t ]\s*([\d.]+)$/i))) { no = +m[1]; X = +m[2]; Y = +m[3]; }
    else { gagal.push(b); continue; }
    const ll = CORE.crsInv(SET.crs, X, Y);
    SUKET[kunciSU(kel, no)] = { kel, nomor: no, lat: ll[0], lon: ll[1], sumber: 'impor', t: Date.now() }; n++;
  }
  simpanSuket(); renderPola();
  LOG.info(`Impor SU yang sudah ketemu: ${n} baris (${SET.crs})`, gagal.length ? { tidakTerbaca: gagal.slice(0, 5) } : undefined);
  toast(`${n} SU tercatat di ${kel}` + (gagal.length ? `; ${gagal.length} baris tidak terbaca (lihat log).` : '.'), n ? 'ok' : 'warn');
}
function eksporSuket() {
  const kel = $('inKel').value, L1 = Object.values(SUKET).filter(x => x.kel === kel).sort((a, b) => a.nomor - b.nomor);
  if (!L1.length) throw new Error('Belum ada SU yang tercatat di kelurahan ini.');
  const t = 'nomor_su,X,Y,kelurahan,crs\n' + L1.map(x => { const q = CORE.crsFwd(SET.crs, x.lat, x.lon); return `${x.nomor},${q[0].toFixed(3)},${q[1].toFixed(3)},${x.kel},${SET.crs}`; }).join('\n') + '\n';
  download(new Blob([t], { type: 'text/csv' }), `SU_sudah_ketemu_${kel.replace(/\W+/g, '_')}.csv`);
}
function simpanPola() { return { on: POLA.on, titik: POLA.titik, nomor: $('inNoSU') ? $('inNoSU').value : '', tahun: $('inThSU') ? $('inThSU').value : '', kode: POLA.su.kode }; }
function muatPola(o) { POLA.on = !!o.on; POLA.titik = o.titik || null; POLA.su.kode = o.kode || null; POLA.su.tahun = +o.tahun || null; if ($('inPola')) $('inPola').checked = POLA.on; if ($('inNoSU')) $('inNoSU').value = o.nomor || ''; if ($('inThSU')) $('inThSU').value = o.tahun || ''; renderPola(); }
function initPola() {
  if (!$('inPola')) return;
  try { POLA.on = localStorage.getItem('plotkw.pola') === '1'; } catch (e) { /* abaikan */ }
  $('inPola').checked = POLA.on;
  $('inPola').onchange = () => { POLA.on = $('inPola').checked; try { localStorage.setItem('plotkw.pola', POLA.on ? '1' : '0'); } catch (e) { /* abaikan */ } LOG.info('Mode pola jalan ' + (POLA.on ? 'aktif' : 'mati')); if (S.cands.length) renderCands(); renderPola(); };
  $('inNoSU').oninput = renderPola; $('inThSU').oninput = () => { POLA.su.tahun = +$('inThSU').value || null; renderPola(); };
  $('btnTitikPeta').onclick = safe('Titik perkiraan', async () => {
    if (!map) throw new Error('Peta tidak tersedia.');
    const c = map.getCenter(); POLA.titik = { lat: c.lat, lon: c.lng, r: Math.max(30, +$('inPolaR').value || POLA.rBawaan) };
    LOG.info('Titik perkiraan dipasang', { r: POLA.titik.r }); renderPola(); toast('Titik perkiraan dipasang di tengah peta.', 'ok');
  });
  $('btnTitikHapus').onclick = () => { POLA.titik = null; renderPola(); };
  $('inPolaR').onchange = () => { if (POLA.titik) { POLA.titik.r = Math.max(30, +$('inPolaR').value || POLA.rBawaan); renderPola(); } };
  $('btnSuketImpor').onclick = safe('Impor SU sudah ketemu', async () => imporSuket($('inSuketTeks').value));
  $('btnSuketEkspor').onclick = safe('Ekspor SU sudah ketemu', async () => eksporSuket());
  $('btnTandaKetemu').onclick = safe('Tandai SU ketemu', async () => {
    needResult();
    const no = +$('inNoSU').value, kel = $('inKel').value;
    if (!no) { go(3); throw new Error('Isi nomor SU di langkah 3 (Mode pola jalan) dulu.'); }
    const c = CORE.centroid(finalLL());
    SUKET[kunciSU(kel, no)] = { kel, nomor: no, lat: c[0], lon: c[1], sumber: 'aplikasi', t: Date.now() }; simpanSuket(); renderPola();
    LOG.info(`SU ${no} di ${kel} ditandai sudah ketemu`); toast(`SU ${no} dicatat sudah ketemu. SU bernomor berdekatan akan dicari di sekitarnya.`, 'ok');
  });
  renderPola();
}

// buka pengaturan AI dan arahkan ke kotak kunci
function bukaSetAI() {
  try { go(2); const d = $('aiSet'); d.open = true; setTimeout(() => { $('inAiKey').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('inAiKey').focus(); }, 150); } catch (e) { /* abaikan */ }
}

/* ---------- DATA PERSIL (DXF dari AutoCAD; diproses & disimpan hanya di browser ini) ----------
   Dipakai untuk: (1) SU yang sudah ada di persil → langsung ketemu, koordinat persis dari persil;
   (2) area pencarian di sekitar SU bernomor berdekatan (kode & tahun sama);
   (3) bidang tidak boleh menimpa bidang persil; kandidat yang sisinya menempel bidang tetangga diutamakan.
   Setelan dikunci dari benchmark tuning (tests/benchmark/persil.js): k=3, r=60 m, bobot tempel 0,2. */
const PERSIL = { bidang: [], file: [] };
const PERSIL_ATUR = { k: 3, r: 60, wTempel: 0.2, tempelM: 1.5, refMaksLuas: 5000 };
function idb() { return new Promise((ok, no) => { const r = indexedDB.open('plotkw', 1); r.onupgradeneeded = () => r.result.createObjectStore('data'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function idbSet(k, v) { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('data', 'readwrite'); t.objectStore('data').put(v, k); t.oncomplete = ok; t.onerror = () => no(t.error); }); }
async function idbGet(k) { const d = await idb(); return new Promise((ok, no) => { const r = d.transaction('data').objectStore('data').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
function siapkanBidangPersil(b, crs, file) {
  const ll = b.pts.map(p => CORE.crsInv(crs, p[0], p[1])), c = CORE.centroid(ll);
  return { ll, c, bb: [Math.min(...ll.map(p => p[0])), Math.min(...ll.map(p => p[1])), Math.max(...ll.map(p => p[0])), Math.max(...ll.map(p => p[1]))], nib: b.nib, hak: b.hak, su: b.su, luas: b.luas, luasPoligon: b.luasPoligon, file };
}
function tebakCrsPersil(bidang) { // koordinat harus jatuh di sekitar Samarinda
  const c = bidang.slice(0, 50).map(b => CORE.centroid(b.pts));
  for (const crs of ['tm3-50.2', 'tm3-50.1', 'utm-50s']) { const ok = c.filter(p => { const q = CORE.crsInv(crs, p[0], p[1]); return q[0] > -0.9 && q[0] < -0.2 && q[1] > 116.9 && q[1] < 117.5; }).length; if (ok > 0.8 * c.length) return crs; }
  return null;
}
const muatPersil = safe('Muat data persil', async files => {
  files = [...files].filter(f => /\.dxf$/i.test(f.name)); if (!files.length) throw new Error('Pilih file .dxf (dari AutoCAD: Save As → AutoCAD DXF). File .dwg tidak bisa dibaca di browser.');
  for (const f of files) {
    toast(`Membaca ${f.name}…`, 'ok'); await sleep(30);
    const t0 = performance.now(), r = CORE.dxfPersil(await f.text());
    if (!r.bidang.length) { LOG.warn(`${f.name}: tidak ada poligon (LWPOLYLINE)`); continue; }
    const crs = tebakCrsPersil(r.bidang);
    if (!crs) throw new Error(`${f.name}: koordinat tidak berada di Samarinda pada TM-3 50.2/50.1 maupun UTM 50S.`);
    PERSIL.file = PERSIL.file.filter(x => x.nama !== f.name); PERSIL.bidang = PERSIL.bidang.filter(b => b.file !== f.name);
    const bid = r.bidang.map(b => siapkanBidangPersil(b, crs, f.name));
    PERSIL.bidang.push(...bid);
    PERSIL.file.push({ nama: f.name, crs, n: bid.length, su: bid.filter(b => b.su).length });
    // kenali kode kelurahan dari nama file (mis. "persil Sidomulyo.dxf")
    const kodeHit = {}; for (const b of bid) if (b.su) kodeHit[b.su.kode] = (kodeHit[b.su.kode] || 0) + 1;
    const kode = Object.keys(kodeHit).sort((a, b) => kodeHit[b] - kodeHit[a])[0];
    if (kode && !KODE_KEL[kode] && SMD.wil) for (const kc of SMD.wil.kecamatan) for (const kl of kc.kelurahan) if (f.name.toLowerCase().includes(kl.nama.toLowerCase())) KODE_KEL[kode] = [kc.nama, kl.nama];
    LOG.info(`Data persil ${f.name}: ${bid.length} bidang, ${bid.filter(b => b.su).length} ber-SU, ${bid.filter(b => b.nib).length} ber-NIB (${crs}, ${Math.round(performance.now() - t0)} ms)`, { teksTakMasuk: r.teksLepas });
  }
  try { await idbSet('persil', { file: PERSIL.file, bidang: PERSIL.bidang }); } catch (e) { LOG.warn('Data persil tidak bisa disimpan di browser; perlu dimuat ulang lain kali', e.message); }
  if (!POLA.on) { POLA.on = true; $('inPola').checked = true; try { localStorage.setItem('plotkw.pola', '1'); } catch (e) { /* abaikan */ } toast('Mode pola jalan diaktifkan agar data persil dipakai saat mencari.', 'ok'); }
  renderPersilInfo(); gambarPersil(); renderPola();
});
function renderPersilInfo() {
  const el = $('persilInfo'); if (!el) return;
  el.innerHTML = PERSIL.file.length ? `${PERSIL.bidang.length.toLocaleString('id-ID')} bidang dari ${PERSIL.file.length} file (${PERSIL.file.map(f => esc(f.nama.replace(/\.dxf$/i, ''))).join(', ')}). Tersimpan di browser ini.` : 'Belum ada data persil.';
  $('btnPersilHapus').hidden = !PERSIL.file.length;
}
function gambarPersil() {
  if (!map || !S.wil) return;
  try {
    if (!G.persil) { G.persil = L.layerGroup().addTo(map); PERSIL.rend = L.canvas ? L.canvas({ padding: 0.3 }) : undefined; }
    G.persil.clearLayers(); if (!PERSIL.bidang.length) return;
    const B = wilBBox(), m = 0.003;
    let n = 0;
    for (const b of PERSIL.bidang) {
      if (b.bb[2] < B.s - m || b.bb[0] > B.n + m || b.bb[3] < B.w - m || b.bb[1] > B.e + m || b.luasPoligon > PERSIL_ATUR.refMaksLuas * 20) continue;
      const pl = L.polygon(b.ll, { renderer: PERSIL.rend, color: '#8A6D3B', weight: 1, fill: true, fillOpacity: 0.03, opacity: 0.8 });
      pl.bindPopup(() => `<b>${b.nib ? 'NIB ' + esc(b.nib) : 'Tanpa NIB'}</b><br>${esc(b.hak || 'Nomor hak: –')}<br>${esc(b.su ? b.su.teks : 'SU: –')}<br>Luas ${b.luas ? b.luas + ' m² (label)' : '–'} · poligon ${Math.round(b.luasPoligon)} m²`);
      pl.addTo(G.persil); n++;
    }
    LOG.info(`Persil digambar di peta: ${n} bidang`);
  } catch (e) { LOG.warn('Persil tidak bisa digambar di peta', e.message); }
}
// bidang persil di dalam area (koordinat lokal), untuk penalti tumpang tindih & hitung "sisi menempel"
function polaRef() {
  const a = areaPola(); if (!a || !a.persil || !PROJ) return undefined;
  const cs = lingkaranXY(a);
  const ref = PERSIL.bidang.filter(b => b.luasPoligon < PERSIL_ATUR.refMaksLuas && (b.nib || b.su || b.hak)).map(b => b.ll.map(p => PROJ.fwd(p[0], p[1])))
    .filter(pp => { const q = CORE.centroid(pp); return dalamArea(cs, q[0], q[1], 150); });
  return ref;
}
function tempelPersil(T, ctx, ref) {
  const pm = ctx.parcelM.map(p => CORE.fwdT(T, p[0], p[1])), tutup = ref.map(pp => pp.concat([pp[0]]));
  let n = 0, ok = 0;
  for (let i = 0; i < pm.length; i++) {
    const a = pm[i], b = pm[(i + 1) % pm.length], m = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let j = 0; j < m; j++) { const q = [a[0] + (b[0] - a[0]) * (j + 0.5) / m, a[1] + (b[1] - a[1]) * (j + 0.5) / m]; n++; if (tutup.some(pp => CORE.plNearest(pp, q).d <= PERSIL_ATUR.tempelM)) ok++; }
  }
  return n ? ok / n : 0;
}
function urutPersil(cands, ctx) {
  const ref = polaRef(); if (!ref || !ref.length || !ctx) return cands;
  const o = cands.map(k => ({ ...k, tempel: tempelPersil(k.T, ctx, ref) })).sort((a, b) => (b.r.score + PERSIL_ATUR.wTempel * b.tempel) - (a.r.score + PERSIL_ATUR.wTempel * a.tempel));
  LOG.info('Kandidat diurutkan ulang dengan data persil (sisi menempel)', o.map(k => ({ skor: +k.r.score.toFixed(3), tempel: +k.tempel.toFixed(2) })));
  return o.map((k, i) => ({ ...k, label: '#' + (i + 1) }));
}
// SU yang sedang dicari sudah ada di data persil?
function cariSUPersil() {
  const no = +($('inNoSU') && $('inNoSU').value), th = +($('inThSU') && $('inThSU').value) || POLA.su.tahun, kode = kodeKelAktif();
  if (!no || !th || !kode || !PERSIL.bidang.length) return null;
  return PERSIL.bidang.find(b => b.su && b.su.kode === kode && b.su.nomor === no && b.su.tahun === th) || null;
}
function renderSUPersil() {
  const el = $('suPersil'); if (!el) return;
  const b = POLA.on ? cariSUPersil() : null;
  el.hidden = !b; if (!b) return;
  el.innerHTML = `<b>SU ini sudah ada di data persil.</b> ${b.nib ? 'NIB ' + esc(b.nib) + ', ' : ''}${esc(b.hak || 'nomor hak –')}, luas ${b.luas ?? Math.round(b.luasPoligon)} m².
    <div class="row" style="margin-top:6px"><button class="btn" id="btnPersilLihat">Lihat di peta</button><button class="btn pri" id="btnPersilSalin">Salin bidang persil ke AutoCAD</button></div>`;
  $('btnPersilLihat').onclick = () => { if (!map) return; map.fitBounds(L.latLngBounds(b.ll).pad(2), { maxZoom: 20 }); L.popup().setLatLng(b.c).setContent(`SU ${b.su.nomor}/${b.su.tahun}${b.nib ? ' · NIB ' + esc(b.nib) : ''}`).openOn(map); };
  $('btnPersilSalin').onclick = safe('Salin bidang persil', async () => {
    const xy = b.ll.map(p => CORE.crsFwd(SET.crs, p[0], p[1])), txt = perintahDariXY([xy]);
    await navigator.clipboard.writeText(txt).catch(() => { throw new Error('Clipboard ditolak browser. Coba lagi.'); });
    LOG.info(`Bidang persil SU ${b.su.nomor}/${b.su.tahun} disalin untuk AutoCAD (${SET.crs})`);
    toast('Bidang persil tersalin dengan koordinat persis dari data persil. Tempel di command line AutoCAD, tekan Enter sekali.', 'ok');
  });
}
async function initPersil() {
  if (!$('filePersil')) return;
  $('filePersil').onchange = e => { muatPersil(e.target.files); e.target.value = ''; };
  $('btnPersilHapus').onclick = safe('Hapus data persil', async () => { PERSIL.bidang = []; PERSIL.file = []; await idbSet('persil', null).catch(() => {}); renderPersilInfo(); gambarPersil(); renderPola(); toast('Data persil dihapus dari browser ini.', 'ok'); });
  try {
    const v = await idbGet('persil');
    if (v && v.bidang && v.bidang.length) { PERSIL.bidang = v.bidang; PERSIL.file = v.file || []; LOG.info(`Data persil dimuat dari browser: ${PERSIL.bidang.length} bidang`); gambarPersil(); }
  } catch (e) { LOG.warn('Data persil tersimpan tidak bisa dibaca', e.message); }
  renderPersilInfo(); renderPola();
}
