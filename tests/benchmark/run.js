// Benchmark pencocokan (Node, offline).
//   node tests/benchmark/run.js [--core path] [--kat K1,K2] [--tag nama] [--pola '{"M1":true}']
// Menulis tests/benchmark/out/hasil_<tag>.json/.csv dan mencetak ringkasan (lihat ringkas.js).
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const corePath = path.resolve(arg('core', __dirname + '/../../src/core.js'));
// pemuat memakai CORE untuk proyeksi/geometri saja; matcher diambil dari --core
const LD = require('./loader.js'), CORE = require(corePath), DEG = Math.PI / 180;
const CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const tag = arg('tag', 'sekarang'), katSet = arg('kat') ? new Set(arg('kat').split(',')) : null, pola = arg('pola') ? JSON.parse(arg('pola')) : null;
const KS = JSON.parse(fs.readFileSync(__dirname + '/out/kasus.json'));

const { cocokkan, conf, iou } = require('./cocok.js')(CORE, CFG, pola);
(async () => {
  const WL = {}, rows = [];
  const split = arg('split'); const kasus = KS.kasus.filter(k => (!katSet || katSet.has(k.kat)) && (!split || k.split === split));
  for (const K of kasus) {
    const Wl = WL[K.kel] || (WL[K.kel] = LD.siapkanWilayah(LD.daftarKel().find(x => x.kel === K.kel)));
    const truth = CORE.centroid(K.parcelW), t0 = process.hrtime.bigint();
    let res, err = null;
    try { res = await cocokkan(Wl, K); } catch (e) { err = e.message; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (err) { rows.push({ id: K.id, kat: K.kat, kel: K.kel, split: K.split, error: err, ms }); continue; }
    const pm = res.CTX.parcelM, polyW = c => pm.map(p => CORE.fwdT(c.T, p[0], p[1]));
    const e = res.list.map(c => { const p = CORE.fwdT(c.T, res.CTX.parcelC[0], res.CTX.parcelC[1]); return Math.hypot(p[0] - truth[0], p[1] - truth[1]); });
    const rk = lim => { const i = e.findIndex(v => v <= lim); return i < 0 ? null : i + 1; };
    const P1 = polyW(res.list[0]);
    rows.push({ id: K.id, kat: K.kat, kel: K.kel, split: K.split, simpang: K.simpang, grid: K.grid, utara: K.utara, nJalan: K.nJalan,
      rank: rk(CFG.benar_m), rank5: rk(CFG.benar_ketat_m), err1: +e[0].toFixed(2), errs: e.map(v => +v.toFixed(1)),
      iou1: +iou(P1, K.parcelW).toFixed(3), luasBeda: +(CORE.polyArea(P1) / K.luas - 1).toFixed(4),
      skor: res.list.map(c => +c.r.score.toFixed(5)), T: res.list.map(c => [c.T.s, c.T.th, c.T.tx, c.T.ty].map(v => +v.toPrecision(10))),
      label: res.meta && res.meta.label ? res.meta.label : conf(res.list), alasan: res.meta && res.meta.alasan || null, ms: +ms.toFixed(1) });
    if (rows.length % 20 === 0) process.stderr.write(`${tag}: ${rows.length}/${kasus.length}\n`);
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + `/out/hasil_${tag}.json`, JSON.stringify({ tag, core: path.relative(LD.REPO, corePath), pola, rows }));
  const kol = ['id', 'kat', 'kel', 'split', 'simpang', 'grid', 'utara', 'rank', 'rank5', 'err1', 'iou1', 'luasBeda', 'label', 'ms', 'error'];
  fs.writeFileSync(__dirname + `/out/hasil_${tag}.csv`, kol.join(',') + '\n' + rows.map(r => kol.map(k => r[k] ?? '').map(v => /[,"]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n') + '\n');
  console.log(require('./ringkas.js').ringkas(rows, tag));
})();
