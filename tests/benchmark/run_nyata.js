// Kasus NYATA (offline). Data di tests/benchmark/real/<folder>/kasus_nyata.json — folder ini di-.gitignore.
//   node tests/benchmark/run_nyata.js [--core path] [--tag nama] [--pola '{...}']
// Format kasus: {id, kel, imgW, imgH, roads:[{name, pts:[[x,y]]}], parcel:[[x,y]], luas, utara, X, Y (TM-3 zona 50.2)}
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const corePath = path.resolve(arg('core', __dirname + '/../../src/core.js'));
const LD = require('./loader.js'), CORE = require(corePath), CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const tag = arg('tag', 'sekarang'), pola = arg('pola') ? JSON.parse(arg('pola')) : null;
const { cocokkan, conf } = require('./cocok.js')(CORE, CFG, pola);
const dir = __dirname + '/real';
(async () => {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).map(d => path.join(dir, d, 'kasus_nyata.json')).filter(f => fs.existsSync(f)) : [];
  if (!files.length) { console.log('Tidak ada kasus nyata di tests/benchmark/real/*/kasus_nyata.json'); return; }
  const rows = [], WL = {};
  for (const f of files) for (const K of JSON.parse(fs.readFileSync(f)).kasus) {
    const Wl = WL[K.kel] || (WL[K.kel] = LD.siapkanWilayah(LD.daftarKel().find(x => x.kel === K.kel)));
    const ll = LD.CORE.crsInv('tm3-50.2', K.X, K.Y), truth = Wl.PROJ.fwd(ll[0], ll[1]);
    const t0 = Date.now(); let res; try { res = await cocokkan(Wl, K); } catch (e) { rows.push({ id: K.id, error: e.message }); continue; }
    const e = res.list.map(c => { const p = CORE.fwdT(c.T, res.CTX.parcelC[0], res.CTX.parcelC[1]); return Math.hypot(p[0] - truth[0], p[1] - truth[1]); });
    const rk = lim => { const i = e.findIndex(v => v <= lim); return i < 0 ? null : i + 1; };
    rows.push({ id: K.id, jalan: K.roads.length, simpang: res.CTX.skJ.length, rank15: rk(15), rank25: rk(25), err1: +e[0].toFixed(1), errMin: +Math.min(...e).toFixed(1),
      skor: res.list.map(c => +c.r.score.toFixed(3)), label: res.meta && res.meta.label ? res.meta.label : conf(res.list), alasan: res.meta && res.meta.alasan || null, ms: Date.now() - t0 });
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + `/out/nyata_${tag}.json`, JSON.stringify({ tag, pola, rows }));
  console.log(`== kasus nyata ${tag} (${rows.length})`);
  for (const r of rows) console.log(r.error ? `${r.id} ERROR ${r.error}` : `${r.id} jalan=${r.jalan} simpang=${r.simpang} peringkat≤15m=${r.rank15 ?? '-'} ≤25m=${r.rank25 ?? '-'} galat#1=${r.err1} m galatTerdekat=${r.errMin} m skor#1=${r.skor[0]} label="${r.label}"${r.alasan ? ' (' + r.alasan + ')' : ''} ${r.ms} ms`);
  const ok = rows.filter(r => !r.error), t = (k, lim) => ok.filter(r => r['rank' + lim] && r['rank' + lim] <= k).length;
  console.log(`TOTAL ≤25 m: top1 ${t(1, 25)}/${rows.length}, top3 ${t(3, 25)}, top6 ${t(6, 25)} | ≤15 m: top1 ${t(1, 15)}, top6 ${t(6, 15)}`);
  const hi = ok.filter(r => r.label === 'keyakinan tinggi'); console.log(`"keyakinan tinggi": ${hi.length} kasus, benar (≤25 m) ${hi.filter(r => r.rank25 === 1).length}`);
})();
