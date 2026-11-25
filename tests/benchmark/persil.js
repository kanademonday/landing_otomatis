// Benchmark berbasis DATA PERSIL (DXF AutoCAD, di-.gitignore: tests/benchmark/real/persil/*.dxf).
// Tiap kasus = bidang persil yang SUDAH berlokasi & ber-SU, diperlakukan seolah belum dilanding:
//   sketsa = bidang itu + jalan OSM yang menempel (≤12 m, gaya SU asli), tanpa nama;
//   petunjuk = lokasi SU lain di data persil dengan kode & tahun sama dan nomor terdekat (bidang itu sendiri dikeluarkan).
// node tests/benchmark/persil.js --varian v0|v1|v2 [--kel Selili] [--n 40] [--r 100] [--k 3]
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const LD = require('./loader.js'), CORE = LD.CORE, G = require('./gen.js');
const CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const { cocokkan, conf } = require('./cocok.js')(CORE, CFG, null);
function miripBentuk(skM, pW, thTol) {
  const cA = CORE.centroid(skM), cB = CORE.centroid(pW), k = Math.sqrt(CORE.polyArea(pW) / CORE.polyArea(skM));
  const A = skM.map(p => [(p[0] - cA[0]) * k, (p[1] - cA[1]) * k]), B = pW.map(p => [p[0] - cB[0], p[1] - cB[1]]);
  const bbOf = P => [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
  const sB = CORE.interiorSamples(B, 40), Bb = { pts: B, bb: bbOf(B) }; let best = { s: -1 };
  for (let a = -thTol; a <= thTol + 1e-9; a += 3 * Math.PI / 180) {
    const c = Math.cos(a), sn = Math.sin(a), Rr = A.map(p => [c * p[0] - sn * p[1], sn * p[0] + c * p[1]]);
    const v = Math.min(CORE.overlapFrac(CORE.interiorSamples(Rr, 40), [Bb]), CORE.overlapFrac(sB, [{ pts: Rr, bb: bbOf(Rr) }]));
    if (v > best.s) best = { s: v, a, k };
  }
  return best;
}
const DIR = __dirname + '/real/persil', varian = arg('varian', 'v1'), N = +arg('n', 40), R0 = +arg('r', 100), K = +arg('k', 3);
const KEL = { 'persil Pelita.dxf': 'Pelita', 'persil Sidodamai.dxf': 'Sidodamai', 'persil Sidomulyo.dxf': 'Sidomulyo', 'persil Sungai Dama.dxf': 'Sungai Dama', 'persil selili.dxf': 'Selili' };
const HELD = new Set(['Sidomulyo']);
(async () => {
  const semua = []; // semua bidang persil (untuk tetangga lintas file)
  const per = {};
  for (const f of Object.keys(KEL)) { const r = CORE.dxfPersil(fs.readFileSync(path.join(DIR, f), 'latin1')); per[KEL[f]] = r.bidang; for (const b of r.bidang) semua.push(b); }
  const rows = [];
  const kelSet = arg('kel') ? [arg('kel')] : Object.values(KEL);
  for (const kel of kelSet) {
    const Wl = LD.siapkanWilayah(LD.daftarKel().find(x => x.kel === kel)), P = G.siapkan(Wl), R = G.rng(CFG.seed + G.hash('persil' + kel));
    const keXY = q => { const ll = CORE.crsInv('tm3-50.2', q[0], q[1]); return Wl.PROJ.fwd(ll[0], ll[1]); };
    const pool = per[kel].filter(b => b.su && b.su.tahun <= +arg('tahunMaks', 2009) && b.pts.length >= 4 && b.luasPoligon > 40 && b.luasPoligon < 3000);
    let made = 0, coba = 0;
    while (made < N && coba < N * 30) {
      coba++;
      const B = pool[Math.floor(R() * pool.length)], PW = B.pts.map(keXY), c = CORE.centroid(PW);
      if (!Wl.inRing(c[0], c[1])) continue;
      // jalan OSM yang menempel bidang (≤12 m), dipotong ±25–45 m
      const roads = [];
      for (const pl of P.polys) {
        const dmin = Math.min(...PW.map(p => CORE.plNearest(pl.pts, p).d)); if (dmin > 12) continue;
        const L2 = CORE.plLen(pl.pts), n = CORE.plNearest(pl.pts, c), a0 = Math.max(0, n.t - 25 - 20 * R()), a1 = Math.min(L2, n.t + 25 + 20 * R());
        if (a1 - a0 < 10) continue; const m = Math.max(1, Math.round((a1 - a0) / 6)), q = []; for (let k = 0; k <= m; k++) q.push(CORE.plPointAt(pl.pts, a0 + (a1 - a0) * k / m));
        roads.push({ hw: pl.hw, nama: '', pts: q, len: a1 - a0 });
      }
      if (!roads.length) continue;
      // tetangga nomor SU (kode & tahun sama), bidang ini sendiri dikeluarkan
      const tet = semua.filter(b => b !== B && b.su && b.su.kode === B.su.kode && b.su.tahun === B.su.tahun && b.su.nomor !== B.su.nomor && Math.abs(b.su.nomor - B.su.nomor) <= 300)
        .sort((a, b) => Math.abs(a.su.nomor - B.su.nomor) - Math.abs(b.su.nomor - B.su.nomor)).slice(0, K);
      if ((varian === 'v1' || varian === 'v2') && !tet.length) continue;
      const refSemua = () => per[kel].filter(b => (b !== B || (+arg('nyata', 0) && +arg('ada', 1))) && b.luasPoligon < 5000 && (b.nib || b.su || b.hak)).map(b => b.pts.map(keXY));
      const s = CFG.skala_m_per_px[0] * Math.exp(R() * Math.log(CFG.skala_m_per_px[1] / CFG.skala_m_per_px[0]));
      const Gm = G.keGambar({ roads, parcelW: PW }, { s, th: 0 }, R);
      const Kc = { id: `${kel}-${B.su.nomor}/${B.su.tahun}`, kel, luas: CORE.polyArea(PW), utara: 'kira', ...Gm };
      let W2 = Wl, cs = null, rA = null;
      if ((varian === 'v7' || varian === 'v8')) { cs = tet.length ? tet.map(b => CORE.centroid(b.pts.map(keXY))) : null; }
      else if (varian === 'v5' || varian === 'v6') { W2 = { ...Wl, refXY: refSemua() }; cs = tet.length ? tet.map(b => CORE.centroid(b.pts.map(keXY))) : null; }
      else if (varian === 'v3' || varian === 'v4') {
        W2 = { ...Wl, refXY: per[kel].filter(b => b !== B && b.luasPoligon < 5000 && (b.nib || b.su || b.hak)).map(b => b.pts.map(keXY)) };
        if (varian === 'v4') W2._dekatSU = tet.map(b => CORE.centroid(b.pts.map(keXY)));
      } else if (varian !== 'v0') { // gabungan lingkaran radius R0 di sekitar tiap SU tetangga
        cs = tet.map(b => CORE.centroid(b.pts.map(keXY))); rA = R0;
        const dalam = (x, y, ex) => cs.some(q => Math.hypot(x - q[0], y - q[1]) < rA + ex);
        W2 = { ...Wl, inArea: (x, y) => dalam(x, y, 100), _dalam: dalam };
        if (varian === 'v2') W2.refXY = per[kel].filter(b => b !== B && b.luasPoligon < 5000 && (b.nib || b.su || b.hak)).map(b => b.pts.map(keXY)).filter(pp => { const q = CORE.centroid(pp); return dalam(q[0], q[1], 150); });
      }
      const t0 = Date.now(); let res;
      try { res = await cocokkan(W2, Kc); } catch (e) { rows.push({ id: Kc.id, kel, error: e.message }); made++; continue; }
      let list = res.list;
      if ((varian === 'v7' || varian === 'v8')) W2 = { ...W2, refXY: refSemua() }; // persil hanya untuk 'tempel' & bentuk, TANPA penalti tumpang tindih
      if ((varian === 'v5' || varian === 'v6' || (varian === 'v7' || varian === 'v8')) && cs) { // tambah kandidat dari area sekitar SU bernomor dekat (tanpa membuang kandidat seluruh kelurahan)
        const dalam = (x, y, ex) => cs.some(q => Math.hypot(x - q[0], y - q[1]) < 60 + ex);
        try { const r2 = await cocokkan({ ...W2, refXY: (varian === 'v7' || varian === 'v8') ? undefined : W2.refXY, inArea: (x, y) => Wl.inArea(x, y) && dalam(x, y, 100) }, Kc); const pc = r2.CTX.parcelC;
          for (const k of r2.list) { const p = CORE.fwdT(k.T, pc[0], pc[1]); if (!dalam(p[0], p[1], 0)) continue; if (list.some(u => { const q = CORE.fwdT(u.T, pc[0], pc[1]); return Math.hypot(p[0] - q[0], p[1] - q[1]) < 20; })) continue; list = list.concat([k]); } } catch (e) { /* tidak ada hipotesis di area */ }
      }
      if (cs && varian !== 'v5' && varian !== 'v6' && varian !== 'v7' && varian !== 'v8') { const pc = res.CTX.parcelC, f = list.filter(k => { const p = CORE.fwdT(k.T, pc[0], pc[1]); return W2._dalam(p[0], p[1], 0); }); if (f.length) list = f; }
      if (varian === 'v6' || (varian === 'v7' || varian === 'v8')) { // kandidat bentuk: poligon persil yang luas (±15%) & bentuknya mirip, diselaraskan dengan sketsa
        const ada = +arg('ada', 1), pool = per[kel].filter(b => (ada || b !== B) && b.luasPoligon < 5000 && Math.abs(b.luasPoligon / Kc.luas - 1) <= 0.15);
        const s0 = Math.sqrt(Kc.luas / CORE.polyArea(Kc.parcel)), skM = res.CTX.parcelM.map(p => [p[0] * s0, p[1] * s0]), cA = CORE.centroid(res.CTX.parcelM);
        for (const b of pool) {
          const pw = b.pts.map(keXY), cq = CORE.centroid(pw); if (!Wl.inArea(cq[0], cq[1])) continue;
          const m = miripBentuk(skM, pw, 45 * Math.PI / 180); if (m.s < 0.8) continue;
          const T = { s: s0 * m.k, th: m.a, tx: 0, ty: 0 }, p0 = CORE.fwdT(T, cA[0], cA[1]); T.tx = cq[0] - p0[0]; T.ty = cq[1] - p0[1];
          if (list.some(u => { const q = CORE.fwdT(u.T, cA[0], cA[1]); return Math.hypot(cq[0] - q[0], cq[1] - q[1]) < 5; })) continue;
          list.push({ T, r: CORE.score(res.CTX, T, true), bentuk: m.s });
        }
      }
      if ((varian === 'v7' || varian === 'v8') && +arg('ketat', 1)) { const pc = res.CTX.parcelC, f = list.filter(k => { const p = CORE.fwdT(k.T, pc[0], pc[1]); return Wl.inRing(p[0], p[1]); }); if (f.length) list = f; }
      // sisi menempel: porsi keliling bidang (posisi kandidat) yang ≤1,5 m dari tepi bidang persil lain
      const tempel = T => { if (!W2.refXY) return 0; const pm = res.CTX.parcelM.map(p => CORE.fwdT(T, p[0], p[1])), pc0 = CORE.centroid(pm);
        const refDekat = W2.refXY.filter(pp => { const q = pp[0]; return Math.hypot(q[0] - pc0[0], q[1] - pc0[1]) < 80; }); let n = 0, ok = 0;
        for (let i = 0; i < pm.length; i++) { const a = pm[i], b = pm[(i + 1) % pm.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(2, Math.ceil(L)); for (let j = 0; j < m; j++) { const q = [a[0] + (b[0] - a[0]) * (j + .5) / m, a[1] + (b[1] - a[1]) * (j + .5) / m]; n++;
          if (refDekat.some(pp => CORE.plNearest(pp.concat([pp[0]]), q).d <= 1.5)) ok++; } } return ok / n; };
      const e = list.map(k => { const p = CORE.fwdT(k.T, res.CTX.parcelC[0], res.CTX.parcelC[1]); return Math.hypot(p[0] - c[0], p[1] - c[1]); });
      // ATURAN TERKUNCI (dari tuning): urut ulang skor + 0,2×tempel; "keyakinan tinggi" bila tempel#1≥0,5, tempel#2<0,3, skor≥0,8
      let labelP = null;
      if (W2.refXY && arg('final')) {
        const bonus = k => { if (!W2._dekatSU) return 0; const p = CORE.fwdT(k.T, res.CTX.parcelC[0], res.CTX.parcelC[1]); return W2._dekatSU.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 60) ? +arg('bonus', 0.05) : 0; };
        const bbOf = P => [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
        const refB = W2.refXY.map(pts => ({ pts, bb: bbOf(pts) }));
        // tumpang tindih dengan persil, KECUALI satu bidang persil yang bertumpuk pas (≥70% dua arah) → bidang yang sudah tergambar tidak dihukum
        const ovlX = T => { if (varian !== 'v8') return 0; const pm = res.CTX.parcelM.map(p => CORE.fwdT(T, p[0], p[1])), sm = CORE.interiorSamples(pm, 30), c0 = CORE.centroid(pm);
          const dk = refB.filter(r => Math.hypot(r.pts[0][0] - c0[0], r.pts[0][1] - c0[1]) < 120); const Pb = { pts: pm, bb: bbOf(pm) };
          const pas = dk.find(r => CORE.overlapFrac(sm, [r]) >= 0.7 && CORE.overlapFrac(CORE.interiorSamples(r.pts, 30), [Pb]) >= 0.7);
          return CORE.overlapFrac(sm, dk.filter(r => r !== pas)); };
        const wO = +arg('wOvl', 0.6);
        const wB = +arg('wBentuk', 0); const o = list.map((k, i) => ({ k, e: e[i], t: tempel(k.T), b: bonus(k) + wB * (k.bentuk || 0) - wO * ovlX(k.T) })).sort((a, b) => (b.k.r.score + 0.2 * b.t + b.b) - (a.k.r.score + 0.2 * a.t + a.b));
        list = o.map(x => x.k); e.splice(0, e.length, ...o.map(x => x.e));
        labelP = o[0].t >= 0.5 && (!o[1] || o[1].t < 0.3) && o[0].k.r.score >= 0.8 ? 'keyakinan tinggi' : 'perlu verifikasi';
      }
      const rk = lim => { const i = e.findIndex(v => v <= lim); return i < 0 ? null : i + 1; };
      rows.push({ id: Kc.id, kel, split: HELD.has(kel) ? 'heldout' : 'tuning', nJalan: roads.length, simpang: res.CTX.skJ.length, prior_m: cs ? Math.round(Math.min(...cs.map(q => Math.hypot(q[0] - c[0], q[1] - c[1])))) : null,
        rank: rk(15), rank5: rk(5), kand: list.map((k, i) => ({ s: +k.r.score.toFixed(3), b: k.bentuk ? +k.bentuk.toFixed(2) : 0, e: +e[i].toFixed(1) })), tempel: list.map(k => +tempel(k.T).toFixed(2)), errs: e.map(v => +v.toFixed(1)), err1: +e[0].toFixed(1), skor: list.map(k => +k.r.score.toFixed(3)), label: labelP || conf(list), nRef: W2.refXY ? W2.refXY.length : 0, ms: Date.now() - t0 });
      made++;
      if (made % 10 === 0) process.stderr.write(`${varian} ${kel} ${made}/${N}\n`);
    }
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  const tag = arg('tag', 'persil_' + varian);
  fs.writeFileSync(__dirname + `/out/${tag}.json`, JSON.stringify({ varian, R0, K, rows }));
  for (const sp of ['tuning', 'heldout']) {
    const X = rows.filter(r => r.split === sp && !r.error), n = X.length; if (!n) continue;
    const t = k => (100 * X.filter(r => r.rank && r.rank <= k).length / n).toFixed(0);
    const pr = X.map(r => r.prior_m).filter(v => v != null).sort((a, b) => a - b);
    const hi = X.filter(r => r.label === 'keyakinan tinggi');
    console.log(`${tag} ${sp}: "keyakinan tinggi" ${hi.filter(r => r.rank === 1).length}/${hi.length} benar (cakupan ${(100 * hi.length / n).toFixed(0)}%)`);
    console.log(`${tag} ${sp}: n=${n} top1 ${t(1)}% top3 ${t(3)}% top6 ${t(6)}% | top1 ≤5 m ${(100 * X.filter(r => r.rank5 === 1).length / n).toFixed(0)}% | jarak petunjuk median ${pr[pr.length >> 1] ?? '-'} m | ms median ${X.map(r => r.ms).sort((a, b) => a - b)[n >> 1]} | error ${rows.filter(r => r.split === sp && r.error).length}`);
  }
})();
