// Kasus NYATA (offline). Data di tests/benchmark/real/<folder>/kasus_nyata.json — folder ini di-.gitignore.
//   node tests/benchmark/run_nyata.js [--core path] [--tag nama] [--pola '{...}']
// Format kasus: {id, kel, imgW, imgH, roads:[{name, pts:[[x,y]]}], parcel:[[x,y]], luas, utara, X, Y (TM-3 zona 50.2)}
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const corePath = path.resolve(arg('core', __dirname + '/../../src/core.js'));
const LD = require('./loader.js'), CORE = require(corePath), CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const tag = arg('tag', 'sekarang'), pola = arg('pola') ? JSON.parse(arg('pola')) : null;
// --area '{"k":3,"r":150}' : leave-one-out — pusat = rata-rata lokasi k SU lain dengan nomor terdekat; radius = max(r, 1,5 × sebaran)
// --area '{"oracle":100}'  : batas atas — lingkaran di sekitar lokasi benar (hanya diagnosis, bukan fitur)
const AREA = arg('area') ? JSON.parse(arg('area')) : null;
const { cocokkan, conf } = require('./cocok.js')(CORE, CFG, pola);
const dir = __dirname + '/real';
// = confPola(0) di src/fitur.js
function confPola(c, nJunc, nJalan) {
  const sc = c[0].r.score, gap = c[1] ? sc - c[1].r.score : 1;
  if (!nJunc && nJalan <= 2) return 'perlu verifikasi: gambar minim (tanpa simpang)';
  if (sc >= 0.8 && gap > 0.06) return 'keyakinan tinggi';
  const serupa = c.filter(x => x.r.score >= sc - 0.03).length;
  return sc >= 0.65 ? (serupa >= 2 ? `ambigu: ${serupa} lokasi serupa` : 'sedang') : 'rendah';
}
(async () => {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).map(d => path.join(dir, d, 'kasus_nyata.json')).filter(f => fs.existsSync(f)) : [];
  if (!files.length) { console.log('Tidak ada kasus nyata di tests/benchmark/real/*/kasus_nyata.json'); return; }
  const rows = [], WL = {};
  for (const f of files) for (const K of JSON.parse(fs.readFileSync(f)).kasus) {
    const Wl = WL[K.kel] || (WL[K.kel] = LD.siapkanWilayah(LD.daftarKel().find(x => x.kel === K.kel)));
    const ll = LD.CORE.crsInv('tm3-50.2', K.X, K.Y), truth = Wl.PROJ.fwd(ll[0], ll[1]);
    let W2 = Wl, info = '';
    if (AREA) {
      let c, r;
      if (AREA.oracle) { c = truth; r = AREA.oracle; }
      else {
        const no = +K.id.split('_').pop(), semua = JSON.parse(fs.readFileSync(f)).kasus.filter(x => x.id !== K.id && x.kel === K.kel);
        const tet = semua.sort((a, b) => Math.abs(+a.id.split('_').pop() - no) - Math.abs(+b.id.split('_').pop() - no)).slice(0, AREA.k)
          .map(x => { const q = LD.CORE.crsInv('tm3-50.2', x.X, x.Y); return Wl.PROJ.fwd(q[0], q[1]); });
        c = [tet.reduce((a, p) => a + p[0], 0) / tet.length, tet.reduce((a, p) => a + p[1], 0) / tet.length];
        r = Math.max(AREA.r, 1.5 * Math.max(...tet.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]))));
      }
      W2 = { ...Wl, inArea: (x, y) => Math.hypot(x - c[0], y - c[1]) < r + 100, _c: c, _r: r }; // = polaInArea/saringPola di fitur.js
      info = ` area r=${Math.round(r)} m, benar ${Math.round(Math.hypot(truth[0] - c[0], truth[1] - c[1]))} m dari pusat`;
    }
    const t0 = Date.now(); let res; try { res = await cocokkan(W2, K); } catch (e) { rows.push({ id: K.id, error: e.message }); continue; }
    if (W2._c) { const pc = res.CTX.parcelC, f = res.list.filter(k => { const p = CORE.fwdT(k.T, pc[0], pc[1]); return Math.hypot(p[0] - W2._c[0], p[1] - W2._c[1]) <= W2._r; }); if (f.length) res.list = f; }
    const e = res.list.map(c => { const p = CORE.fwdT(c.T, res.CTX.parcelC[0], res.CTX.parcelC[1]); return Math.hypot(p[0] - truth[0], p[1] - truth[1]); });
    const rk = lim => { const i = e.findIndex(v => v <= lim); return i < 0 ? null : i + 1; };
    rows.push({ id: K.id, jalan: K.roads.length, simpang: res.CTX.skJ.length, rank15: rk(15), rank25: rk(25), err1: +e[0].toFixed(1), errMin: +Math.min(...e).toFixed(1),
      skor: res.list.map(c => +c.r.score.toFixed(3)), info, label: AREA ? confPola(res.list, res.CTX.skJ.length, K.roads.length) : conf(res.list), alasan: res.meta && res.meta.alasan || null, ms: Date.now() - t0 });
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + `/out/nyata_${tag}.json`, JSON.stringify({ tag, pola, rows }));
  console.log(`== kasus nyata ${tag} (${rows.length})`);
  for (const r of rows) console.log(r.error ? `${r.id} ERROR ${r.error}` : `${r.id} jalan=${r.jalan} simpang=${r.simpang} peringkat≤15m=${r.rank15 ?? '-'} ≤25m=${r.rank25 ?? '-'} galat#1=${r.err1} m galatTerdekat=${r.errMin} m skor#1=${r.skor[0]} label="${r.label}"${r.info || ''}${r.alasan ? ' (' + r.alasan + ')' : ''} ${r.ms} ms`);
  const ok = rows.filter(r => !r.error), t = (k, lim) => ok.filter(r => r['rank' + lim] && r['rank' + lim] <= k).length;
  console.log(`TOTAL ≤25 m: top1 ${t(1, 25)}/${rows.length}, top3 ${t(3, 25)}, top6 ${t(6, 25)} | ≤15 m: top1 ${t(1, 15)}, top6 ${t(6, 15)}`);
  const hi = ok.filter(r => r.label === 'keyakinan tinggi'); console.log(`"keyakinan tinggi": ${hi.length} kasus, benar (≤25 m) ${hi.filter(r => r.rank25 === 1).length}`);
})();
