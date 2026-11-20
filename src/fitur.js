/* ===== FITUR: ekspor AutoCAD, bidang lain (peta analog), gambar di atas peta, pratinjau kandidat, riwayat ===== */
const SET = { crs: 'tm3-50.2' };
try { const v = localStorage.getItem('plotkw.crs'); if (v && CORE.CRS[v]) SET.crs = v; } catch (e) { /* abaikan */ }
/* ---------- ekspor AutoCAD ---------- */
function cornersCRS() { // sudut gambar → koordinat CRS
  return [[0, 0], [S.img.w, 0], [S.img.w, S.img.h], [0, S.img.h]].map(p => { const w = CORE.fwdT(S.T, p[0], -p[1]); const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
}
const ekspDXF = safe('Ekspor DXF', async () => {
  needResult();
  const toXY = pts => pts.map(w => { const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
  const fin = toXY(parcelWorld(S.T, $('inForce').checked));
  const items = [{ layer: 'BIDANG', pts: fin, closed: true }], texts = [];
  const nama = $('inNama').value.trim() || 'Bidang';
  texts.push({ layer: 'LABEL', at: CORE.centroid(fin), h: 1.5, text: nama + ' L=' + geoArea(finalLL()).toFixed(1) });
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
  if (lin) { const d = (raw / lin - 1) * 100; Math.abs(d) > 10 ? tanda('warn', `Bidang pada gambar × skala hasil cocok = ${fmt(raw, 0)} m² (selisih ${fmt(d, 1)}% dari luas yang diisi). Gambar mungkin tidak berskala, atau luasnya keliru.`) : tanda('ok', `Skala hasil cocok konsisten dengan luas (selisih ${fmt(d, 1)}%).`); }
  if (r) {
    if (r.score < 0.65) tanda('bad', 'Skor kecocokan jalan rendah. Posisi belum meyakinkan.');
    else if (r.score < 0.8) tanda('warn', 'Skor kecocokan sedang. Bandingkan gambar dengan citra satelit sebelum dipakai.');
    else tanda('ok', 'Jalan pada gambar menempel baik pada jalan nyata.');
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
  const luasHasil = S.T && S.parcel && PROJ ? geoArea(finalLL()) : null;
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
  putarGambar(-phi);
  toast(`Gambar diputar ${fmt(-phi, 1)}° agar utara menghadap ke atas.`, 'ok');
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
  const polys = [toXY(parcelWorld(S.T, $('inForce').checked))];
  for (const ex of S.extra) polys.push(toXY(ex.pts.map(p => CORE.fwdT(S.T, p[0], -p[1]))));
  return polys;
}
function perintahAcad() {
  const polys = poligonAcad(), f = v => v.toFixed(3);
  if ($('inAcadFmt').value === 'teks') // AutoCAD LT: satu baris, spasi = Enter
    return polys.map(P => '_.PLINE ' + P.map(q => `_non ${f(q[0])},${f(q[1])}`).join(' ') + ' _C').join(' ') + ' ';
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
