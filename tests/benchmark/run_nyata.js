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
// --persil 1 : petunjuk dari data persil (tests/benchmark/real/persil/*.dxf) — aturan terkunci dari tuning persil.js
const PERSIL = arg('persil') ? fs.readdirSync(__dirname + '/real/persil').flatMap(f => LD.CORE.dxfPersil(fs.readFileSync(__dirname + '/real/persil/' + f, 'latin1')).bidang) : null;
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
    if (PERSIL) {
      const [, kode, no, th] = K.id.match(/SU_(\d{8})_(\d{5})(?:_(\d{4}))?/) || [];
      const tahun = +(th || (K.tahun || 1998)), n = +no, keXY = q => { const ll = LD.CORE.crsInv('tm3-50.2', q[0], q[1]); return Wl.PROJ.fwd(ll[0], ll[1]); };
      const tet = PERSIL.filter(b => b.su && b.su.kode === kode && b.su.tahun === tahun && b.su.nomor !== n && Math.abs(b.su.nomor - n) <= 300).sort((a, b) => Math.abs(a.su.nomor - n) - Math.abs(b.su.nomor - n)).slice(0, 3);
      const cs = tet.map(b => LD.CORE.centroid(b.pts.map(keXY))), dalam = (x, y, ex) => cs.some(q => Math.hypot(x - q[0], y - q[1]) < 60 + ex);
      // = aplikasi v2.17: seluruh kelurahan + kandidat tambahan di sekitar SU bernomor dekat (tidak membuang)
      W2 = { ...Wl, _dalam: dalam, _persil: true, _cs: cs };
      W2.refXY = PERSIL.filter(b => b.luasPoligon < 5000 && (b.nib || b.su || b.hak)).map(b => b.pts.map(keXY)).filter(pp => { const q = LD.CORE.centroid(pp); return Wl.inArea(q[0], q[1]); });
      info = ` petunjuk SU ${tet.map(b => b.su.nomor).join(',')} (terdekat ${Math.round(Math.min(...cs.map(q => Math.hypot(q[0] - truth[0], q[1] - truth[1]))))} m), ref ${W2.refXY.length}`;
    }
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
    let labelP = null;
    if (W2._persil) {
      const pc = res.CTX.parcelC;
      if (W2._cs.length) { try { const r2 = await cocokkan({ ...W2, inArea: (x, y) => Wl.inArea(x, y) && W2._dalam(x, y, 100) }, K);
        for (const k of r2.list) { const p = CORE.fwdT(k.T, pc[0], pc[1]); if (!W2._dalam(p[0], p[1], 0)) continue; if (res.list.some(u => { const q = CORE.fwdT(u.T, pc[0], pc[1]); return Math.hypot(p[0] - q[0], p[1] - q[1]) < 20; })) continue; res.list.push({ T: k.T, r: CORE.score(res.CTX, k.T, true) }); } } catch (e) { /* abaikan */ } }
      const tempel = T => { const pm = res.CTX.parcelM.map(p => CORE.fwdT(T, p[0], p[1])); let n = 0, ok = 0;
        for (let i = 0; i < pm.length; i++) { const a = pm[i], b = pm[(i + 1) % pm.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(2, Math.ceil(L)); for (let j = 0; j < m; j++) { const q = [a[0] + (b[0] - a[0]) * (j + .5) / m, a[1] + (b[1] - a[1]) * (j + .5) / m]; n++; if (W2.refXY.some(pp => Math.hypot(pp[0][0] - q[0], pp[0][1] - q[1]) < 80 && CORE.plNearest(pp.concat([pp[0]]), q).d <= 1.5)) ok++; } } return ok / n; };
      const o = res.list.map(k => ({ k, t: tempel(k.T) })).sort((a, b) => (b.k.r.score + 0.2 * b.t) - (a.k.r.score + 0.2 * a.t));
      res.list = o.map(x => x.k); labelP = (o[0].t >= 0.5 && (!o[1] || o[1].t < 0.3) && o[0].k.r.score >= 0.8 ? 'keyakinan tinggi' : 'perlu verifikasi') + ` (tempel ${o.map(x => x.t.toFixed(2)).slice(0, 3).join('/')})`;
    }
    const e = res.list.map(c => { const p = CORE.fwdT(c.T, res.CTX.parcelC[0], res.CTX.parcelC[1]); return Math.hypot(p[0] - truth[0], p[1] - truth[1]); });
    const rk = lim => { const i = e.findIndex(v => v <= lim); return i < 0 ? null : i + 1; };
    rows.push({ id: K.id, jalan: K.roads.length, simpang: res.CTX.skJ.length, rank15: rk(15), rank25: rk(25), err1: +e[0].toFixed(1), errMin: +Math.min(...e).toFixed(1),
      skor: res.list.map(c => +c.r.score.toFixed(3)), info, label: labelP ? labelP : AREA ? confPola(res.list, res.CTX.skJ.length, K.roads.length) : conf(res.list), alasan: res.meta && res.meta.alasan || null, ms: Date.now() - t0 });
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + `/out/nyata_${tag}.json`, JSON.stringify({ tag, pola, rows }));
  console.log(`== kasus nyata ${tag} (${rows.length})`);
  for (const r of rows) console.log(r.error ? `${r.id} ERROR ${r.error}` : `${r.id} jalan=${r.jalan} simpang=${r.simpang} peringkat≤15m=${r.rank15 ?? '-'} ≤25m=${r.rank25 ?? '-'} galat#1=${r.err1} m galatTerdekat=${r.errMin} m skor#1=${r.skor[0]} label="${r.label}"${r.info || ''}${r.alasan ? ' (' + r.alasan + ')' : ''} ${r.ms} ms`);
  const ok = rows.filter(r => !r.error), t = (k, lim) => ok.filter(r => r['rank' + lim] && r['rank' + lim] <= k).length;
  console.log(`TOTAL ≤25 m: top1 ${t(1, 25)}/${rows.length}, top3 ${t(3, 25)}, top6 ${t(6, 25)} | ≤15 m: top1 ${t(1, 15)}, top6 ${t(6, 15)}`);
  const hi = ok.filter(r => /^keyakinan tinggi/.test(r.label)); console.log(`"keyakinan tinggi": ${hi.length} kasus, benar (≤25 m) ${hi.filter(r => r.rank25 === 1).length}`); console.log('catatan: kasus nyata hanya penilai; tidak dipakai menyetel');
})();
