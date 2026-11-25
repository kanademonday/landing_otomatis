// Cocokkan bidang sketsa dengan POLIGON persil berdasarkan luas + bentuk + jalan (label NIB/hak/SU TIDAK dipakai).
// node tests/benchmark/bentuk.js [--toleransi 0.15] [--wJalan 0.5]
const fs = require('fs'), path = require('path'), DEG = Math.PI / 180;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const LD = require('./loader.js'), CORE = LD.CORE, CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const TOL = +arg('toleransi', 0.15), WJ = +arg('wJalan', 0.5), AREA = arg('area', 'kelurahan'); // kelurahan | su (lingkaran 60 m di 3 SU bernomor dekat) | titik100 (lingkaran 100 m, meniru titik perkiraan dari peta analog)
// kemiripan bentuk: sketsa (dalam meter, utara di atas) vs poligon persil; putaran dicari dalam ±thTol dari utara
function miripBentuk(skM, pW, thTol) {
  const cA = CORE.centroid(skM), cB = CORE.centroid(pW), k = Math.sqrt(CORE.polyArea(pW) / CORE.polyArea(skM));
  const A = skM.map(p => [(p[0] - cA[0]) * k, (p[1] - cA[1]) * k]), B = pW.map(p => [p[0] - cB[0], p[1] - cB[1]]);
  const sB = CORE.interiorSamples(B, 60), Bb = { pts: B, bb: [Math.min(...B.map(p => p[0])), Math.min(...B.map(p => p[1])), Math.max(...B.map(p => p[0])), Math.max(...B.map(p => p[1]))] };
  let best = { s: -1 };
  for (let a = -thTol; a <= thTol + 1e-9; a += 2 * DEG) {
    const c = Math.cos(a), s = Math.sin(a), R = A.map(p => [c * p[0] - s * p[1], s * p[0] + c * p[1]]);
    const Rb = { pts: R, bb: [Math.min(...R.map(p => p[0])), Math.min(...R.map(p => p[1])), Math.max(...R.map(p => p[0])), Math.max(...R.map(p => p[1]))] };
    const sR = CORE.interiorSamples(R, 60), f1 = CORE.overlapFrac(sR, [Bb]), f2 = CORE.overlapFrac(sB, [Rb]), v = Math.min(f1, f2);
    if (v > best.s) best = { s: v, a, k };
  }
  return best;
}
(async () => {
  const persil = CORE.dxfPersil(fs.readFileSync(__dirname + '/real/persil/persil Sidomulyo.dxf', 'latin1')).bidang.filter(b => b.luasPoligon < 5000 && b.pts.length >= 3);
  const KS = JSON.parse(fs.readFileSync(__dirname + '/real/sidomulyo/kasus_nyata.json')).kasus;
  const Wl = LD.siapkanWilayah(LD.daftarKel().find(x => x.kel === 'Sidomulyo'));
  const keXY = q => { const ll = CORE.crsInv('tm3-50.2', q[0], q[1]); return Wl.PROJ.fwd(ll[0], ll[1]); };
  const PW = persil.map(b => b.pts.map(keXY));
  let t1 = 0, t3 = 0, t6 = 0;
  for (const K of KS) {
    const ll = CORE.crsInv('tm3-50.2', K.X, K.Y), truth = Wl.PROJ.fwd(ll[0], ll[1]);
    const s0 = Math.sqrt(K.luas / CORE.polyArea(K.parcel));
    const ctx = CORE.prepareCtx({ ways: Wl.osm.ways, nodeXY: Wl.nodeXY, roadsImg: K.roads, parcelImg: K.parcel, imgW: K.imgW, imgH: K.imgH, s0, tau: CFG.tau, inArea: Wl.inArea, wRev: CFG.wRev, log: () => {} });
    const skM = ctx.parcelM.map(p => [p[0] * s0, p[1] * s0]); // sketsa dalam meter, y ke atas
    let dalam = (x, y) => Wl.inArea(x, y);
    if (AREA === 'titik100') dalam = (x, y) => Math.hypot(x - truth[0], y - truth[1]) <= 100;
    if (AREA === 'su') { const no = +K.id.slice(-5), tet = persil.filter(b => b.su && b.su.kode === '16010403' && b.su.tahun === 1998 && b.su.nomor !== no).sort((a, b) => Math.abs(a.su.nomor - no) - Math.abs(b.su.nomor - no)).slice(0, 3).map(b => CORE.centroid(b.pts.map(keXY))); dalam = (x, y) => tet.some(q => Math.hypot(x - q[0], y - q[1]) <= 60); }
    const t0 = Date.now(), cands = [];
    PW.forEach((pw, i) => {
      const r = CORE.polyArea(pw) / K.luas; if (r < 1 - TOL || r > 1 + TOL) return;
      const c = CORE.centroid(pw); if (!dalam(c[0], c[1])) return;
      const m = miripBentuk(skM, pw, 45 * DEG); if (m.s < 0.7) return;
      // transformasi sketsa→dunia dari penyelarasan bentuk, lalu nilai jalan
      const cA = CORE.centroid(ctx.parcelM), T = { s: s0 * m.k, th: m.a, tx: 0, ty: 0 };
      const p = CORE.fwdT(T, cA[0], cA[1]); T.tx = c[0] - p[0]; T.ty = c[1] - p[1];
      const rj = CORE.score(ctx, T, true);
      cands.push({ i, c, bentuk: m.s, jalan: rj.score, luasR: r, nilai: (1 - WJ) * m.s + WJ * rj.score - 0.5 * Math.abs(r - 1) });
    });
    cands.sort((a, b) => b.nilai - a.nilai);
    const e = cands.map(k => Math.hypot(k.c[0] - truth[0], k.c[1] - truth[1])), rk = e.findIndex(v => v <= 25) + 1;
    if (rk === 1) t1++; if (rk && rk <= 3) t3++; if (rk && rk <= 6) t6++;
    console.log(K.id.slice(-5), 'calon', cands.length, '| peringkat bidang benar (≤25 m):', rk || '-', '| #1:', cands[0] ? `${Math.round(e[0])} m, bentuk ${cands[0].bentuk.toFixed(2)}, jalan ${cands[0].jalan.toFixed(2)}, luas×${cands[0].luasR.toFixed(2)}` : '-', '|', Date.now() - t0, 'ms');
  }
  console.log(`TOTAL (≤25 m): top1 ${t1}/15, top3 ${t3}/15, top6 ${t6}/15  [area ${AREA}, toleransi luas ±${TOL * 100}%, bobot jalan ${WJ}]`);
})();
