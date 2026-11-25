// Generator kasus semi-sintetis dari DATA NYATA Samarinda. TIDAK memakai matcher (prepareCtx/matchAll/score/refine/
// sketchJunctions). Hanya geometri dasar CORE (plNearest, plLen, plPointAt, invT, pointInRing, polyArea).
// node tests/benchmark/gen.js  → tests/benchmark/out/kasus.json
const fs = require('fs'), path = require('path');
const LD = require('./loader.js'), { CORE, DEG } = LD;
const CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const KECIL = new RegExp(CFG.jalan_kecil);
function rng(seed) { let s = Math.abs(Math.floor(seed)) % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const U = (R, a, b) => a + (b - a) * R();
const nama1 = n => (n || '').split(' ; ')[0];

// ---- per wilayah: poliline jalan + graf node (sendiri, bukan buildGraph) + porsi simpang siku-4 lokal
function siapkan(Wl) {
  const polys = [];
  for (const w of Wl.osm.ways) { const ids = w.nodes.filter(id => Wl.nodeXY.has(id)); if (ids.length >= 2) polys.push({ hw: w.hw, nama: nama1(w.name), ids, pts: ids.map(id => Wl.nodeXY.get(id)) }); }
  const adj = new Map();
  for (const p of polys) for (let i = 1; i < p.ids.length; i++) { const a = p.ids[i - 1], b = p.ids[i]; if (a === b) continue; (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); }
  const simpang = [];
  for (const [id, s] of adj) if (s.size >= 3) {
    const P = Wl.nodeXY.get(id), br = [...s].map(k => { const Q = Wl.nodeXY.get(k); return Math.atan2(Q[1] - P[1], Q[0] - P[0]); }).sort((a, b) => a - b);
    let siku = br.length === 4; if (siku) for (let i = 0; i < 4; i++) { const d = CORE.normAng(br[(i + 1) % 4] - br[i]); if (Math.abs(Math.abs(d) - Math.PI / 2) > 15 * DEG) siku = false; }
    simpang.push({ x: P[0], y: P[1], siku });
  }
  const segs = [];
  for (const p of polys) for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], b = p.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 15 && Wl.inRing((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) segs.push([a, b, L]); }
  const names = [...new Set(polys.map(p => p.nama).filter(Boolean))];
  return { polys, adj, simpang, segs, names };
}
function porsiSiku(P, x, y, r) { const s = P.simpang.filter(j => Math.hypot(j.x - x, j.y - y) < r); return s.length >= 6 ? s.filter(j => j.siku).length / s.length : 0; }
function jarakJalan(P, x, y) { let d = Infinity; for (const p of P.polys) { const n = CORE.plNearest(p.pts, [x, y]); if (n.d < d) d = n.d; } return d; }

// ---- satu kasus dunia
function kasusDunia(Wl, P, R, o = {}) {
  for (let tr = 0; tr < 60; tr++) {
    const [a, b, L] = P.segs[Math.floor(R() * P.segs.length)];
    const t = U(R, 0.2, 0.8), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, sg = R() < 0.5 ? 1 : -1, nx = -uy * sg, ny = ux * sg;
    const w = U(R, 12, 25), d = U(R, 15, 30), off = 3.5 + d / 2;
    const cx = a[0] + ux * L * t + nx * off, cy = a[1] + uy * L * t + ny * off;
    if (o.grid && porsiSiku(P, cx, cy, CFG.k5.radius_m) < CFG.k5.porsi_siku4_min) continue;
    const parcelW = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([p, q]) => [cx + ux * p + nx * q, cy + uy * p + ny * q]);
    if (parcelW.concat([[cx, cy]]).some(p => jarakJalan(P, p[0], p[1]) < 2.5)) continue;
    const rad = o.rad ? U(R, o.rad[0], o.rad[1]) : U(R, CFG.radius_sketsa_m[0], CFG.radius_sketsa_m[1]);
    const pieces = [];
    for (const p of P.polys) {
      let cur = [], curIds = new Set();
      for (let i = 1; i < p.pts.length; i++) {
        const A = p.pts[i - 1], B = p.pts[i], n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 2));
        for (let k = (i === 1 ? 0 : 1); k <= n; k++) {
          const x = A[0] + (B[0] - A[0]) * k / n, y = A[1] + (B[1] - A[1]) * k / n;
          if (Math.hypot(x - cx, y - cy) < rad) { cur.push([x, y]); if (k === 0) curIds.add(p.ids[i - 1]); if (k === n) curIds.add(p.ids[i]); }
          else { if (cur.length >= 2) pieces.push({ hw: p.hw, nama: p.nama, pts: cur, ids: curIds }); cur = []; curIds = new Set(); }
        }
      }
      if (cur.length >= 2) pieces.push({ hw: p.hw, nama: p.nama, pts: cur, ids: curIds });
    }
    const kept = pieces.filter(p => CORE.plLen(p.pts) > 8);
    if (!kept.length) continue;
    const simp = kept.map(p => { const L2 = CORE.plLen(p.pts), n = Math.max(1, Math.round(L2 / 6)), q = []; for (let k = 0; k <= n; k++) q.push(CORE.plPointAt(p.pts, L2 * k / n)); return { hw: p.hw, nama: p.nama, pts: q, ids: [...p.ids], len: L2 }; });
    return { cx, cy, rad, parcelW, roads: simp, grid: +porsiSiku(P, cx, cy, CFG.k5.radius_m).toFixed(3) };
  }
  return null;
}
// simpang pada sketsa (versi generator, dari graf OSM): node berderajat ≥3 di dalam radius-5 m dengan ≥3 tetangga pada jalan yang tergambar
function hitungSimpang(Wl, P, C) {
  const ada = new Set(C.roads.flatMap(r => r.ids));
  let n = 0;
  for (const id of ada) { const s = P.adj.get(id); if (!s || s.size < 3) continue; const Q = Wl.nodeXY.get(id); if (Math.hypot(Q[0] - C.cx, Q[1] - C.cy) > C.rad - 5) continue; if ([...s].filter(k => ada.has(k)).length >= 3) n++; }
  return n;
}
// dunia → piksel gambar
function keGambar(C, o, R) {
  const th = o.th || 0, s = o.s, T = { s, th, tx: 0, ty: 0 };
  const toImg = p => { const m = CORE.invT(T, p[0], p[1]); return [m[0], -m[1]]; };
  let roads = C.roads.map(r => ({ name: o.nama ? (o.namaGanti ? o.namaGanti(r) : r.nama) : '', hw: r.hw, pts: r.pts.map(toImg) }));
  const parcel = C.parcelW.map(toImg);
  if (o.derau) { // K2: tiap jalan diputar ±5–10°, digeser ±1,5% diagonal, sedikit goyang, skala jalan ±10%
    const all0 = roads.flatMap(r => r.pts).concat(parcel), mx = all0.map(p => p[0]), my = all0.map(p => p[1]);
    const diag = Math.hypot(Math.max(...mx) - Math.min(...mx), Math.max(...my) - Math.min(...my)), pc = CORE.centroid(parcel);
    const fr = 1 + U(R, -CFG.k2.skala_jalan, CFG.k2.skala_jalan);
    roads = roads.map(r => {
      const c = CORE.centroid(r.pts), a = (R() < 0.5 ? -1 : 1) * U(R, CFG.k2.sudut_deg[0], CFG.k2.sudut_deg[1]) * DEG, ca = Math.cos(a), sa = Math.sin(a);
      const gx = U(R, -1, 1) * CFG.k2.geser_diag * diag, gy = U(R, -1, 1) * CFG.k2.geser_diag * diag;
      return { ...r, pts: r.pts.map(p => { const x = p[0] - c[0], y = p[1] - c[1], q = [c[0] + ca * x - sa * y + gx + U(R, -1, 1) * 0.003 * diag, c[1] + sa * x + ca * y + gy + U(R, -1, 1) * 0.003 * diag]; return [pc[0] + (q[0] - pc[0]) * fr, pc[1] + (q[1] - pc[1]) * fr]; }) };
    });
  }
  const all = roads.flatMap(r => r.pts).concat(parcel), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const mnx = Math.min(...xs), mny = Math.min(...ys), mg = 0.08 * Math.max(Math.max(...xs) - mnx, Math.max(...ys) - mny);
  const sh = p => [+(p[0] - mnx + mg).toFixed(2), +(p[1] - mny + mg).toFixed(2)];
  return { roads: roads.map(r => ({ name: r.name, pts: r.pts.map(sh) })), parcel: parcel.map(sh), imgW: +(Math.max(...xs) - mnx + 2 * mg).toFixed(1), imgH: +(Math.max(...ys) - mny + 2 * mg).toFixed(1) };
}
const KAT = {
  K1: 'tanpa nama, sketsa bersih', K2: 'tanpa nama + derau (sudut, posisi, skala, utara)', K3: 'tanpa nama + 20–50% jalan hilang / jalan baru di OSM',
  K4: 'sketsa dengan 0, 1, 2 simpang', K5: 'area pola generik (grid)', K6: 'nama ada dan benar (kontrol)', K7: 'nama salah/berubah',
  K8: 'gaya SU asli: hanya jalan yang menempel bidang (≤12 m), tanpa nama'
};
function buat() {
  const kels = LD.daftarKel().sort((a, b) => a.kel.localeCompare(b.kel));
  // pemisahan tuning/held-out PER KELURAHAN (berbenih)
  const urut = kels.map(k => k.kel).sort((a, b) => hash(CFG.seed + a) - hash(CFG.seed + b));
  const nTun = Math.round(CFG.porsi_tuning * urut.length), split = {}; urut.forEach((k, i) => split[k] = i < nTun ? 'tuning' : 'heldout');
  const WL = {}, PP = {}, get = k => { if (!WL[k.kel]) { WL[k.kel] = LD.siapkanWilayah(k); PP[k.kel] = siapkan(WL[k.kel]); } return [WL[k.kel], PP[k.kel]]; };
  const kasus = [], N = CFG.kasus_per_kategori, logS = Math.log(CFG.skala_m_per_px[1] / CFG.skala_m_per_px[0]);
  for (const kat of Object.keys(KAT)) {
    let made = 0, i = 0, gagal = 0;
    while (made < N && i < N * 40) {
      const k = kels[i % kels.length], R = rng(CFG.seed + hash(kat) + 7919 * i); i++;
      const [Wl, P] = get(k); if (!P.segs.length) continue;
      if (kat === 'K5' && !P.simpang.some(j => j.siku)) continue;
      const C = kasusDunia(Wl, P, R, { grid: kat === 'K5', rad: kat === 'K4' ? [35, 90] : null }); if (!C) { gagal++; continue; }
      const s = CFG.skala_m_per_px[0] * Math.exp(R() * logS);
      const o = { s, th: 0, utara: CFG.utara_bawaan };
      if (kat === 'K2') { o.derau = true; if (R() < 0.5) { o.utara = 'bebas'; o.th = U(R, -Math.PI, Math.PI); } else o.th = U(R, -CFG.k2.utara_deg, CFG.k2.utara_deg) * DEG; }
      if (kat === 'K8') { // hanya potongan jalan yang dekat bidang; dipotong ±25–45 m dari titik terdekat
        const keep = [];
        for (const r of C.roads) {
          const dmin = Math.min(...C.parcelW.map(p => CORE.plNearest(r.pts, p).d)); if (dmin > 12) continue;
          const n = CORE.plNearest(r.pts, [C.cx, C.cy]), L2 = r.len, a0 = Math.max(0, n.t - U(R, 25, 45)), a1 = Math.min(L2, n.t + U(R, 25, 45));
          const q = []; const m = Math.max(1, Math.round((a1 - a0) / 6)); for (let k = 0; k <= m; k++) q.push(CORE.plPointAt(r.pts, a0 + (a1 - a0) * k / m));
          if (a1 - a0 > 10) keep.push({ ...r, pts: q, len: a1 - a0, ids: r.ids.filter(id => { const Q = Wl.nodeXY.get(id); return CORE.plNearest(q, Q).d < 1; }) });
        }
        if (!keep.length) continue;
        C.roads = keep;
      }
      if (kat === 'K3') { // jalan kecil dihapus lebih dulu sampai porsi panjang hilang tercapai (≥1 jalan tersisa)
        const tgt = U(R, CFG.k3.hilang[0], CFG.k3.hilang[1]), tot = C.roads.reduce((a, r) => a + r.len, 0);
        const ord = C.roads.map(r => ({ r, k: (KECIL.test(r.hw) ? 0 : 1) + R() * 0.9 })).sort((a, b) => a.k - b.k);
        let hil = 0; const buang = new Set();
        for (const { r } of ord) { if (hil / tot >= tgt || buang.size >= C.roads.length - 1) break; buang.add(r); hil += r.len; }
        if (!buang.size) continue;
        C.roads = C.roads.filter(r => !buang.has(r)); C.hilang = +(hil / tot).toFixed(3);
      }
      const nSimp = hitungSimpang(Wl, P, C);
      if (kat === 'K4' && nSimp !== made % 3) continue;
      if (kat === 'K6' || kat === 'K7') {
        if (!C.roads.some(r => r.nama)) continue;
        o.nama = true;
        if (kat === 'K7') { const lain = P.names.filter(n => !C.roads.some(r => r.nama === n)); if (!lain.length) continue; const map = {}; o.namaGanti = r => r.nama ? (map[r.nama] = map[r.nama] || lain[Math.floor(R() * lain.length)]) : ''; }
      }
      const G = keGambar(C, o, R);
      kasus.push({ id: `${kat}-${String(made + 1).padStart(3, '0')}`, kat, kec: k.kec, kel: k.kel, split: split[k.kel], utara: o.utara, s_benar: +s.toFixed(5), th_benar: +o.th.toFixed(4),
        rad: +C.rad.toFixed(1), simpang: nSimp, grid: C.grid, hilang: C.hilang ?? null, nJalan: G.roads.length,
        luas: +CORE.polyArea(C.parcelW).toFixed(2), parcelW: C.parcelW.map(p => p.map(v => +v.toFixed(3))), ...G });
      made++;
    }
    console.log(kat, KAT[kat], '→', made, 'kasus', gagal ? `(${gagal} percobaan gagal)` : '');
  }
  return { dibuat: 'deterministik seed ' + CFG.seed, kategori: KAT, split, kasus };
}
module.exports = { buat, KAT, rng, hash, siapkan, keGambar };
if (require.main === module) {
  const out = buat(); fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + '/out/kasus.json', JSON.stringify(out));
  const s = {}; for (const k of out.kasus) { const t = s[k.kat] = s[k.kat] || { tuning: 0, heldout: 0 }; t[k.split]++; }
  console.log('tuning/held-out per kategori', s, '| kelurahan held-out:', Object.values(out.split).filter(v => v === 'heldout').length);
}
