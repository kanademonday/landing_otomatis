// Pemuat data untuk benchmark (Node, offline). Fungsi decodeJalan & subsetJalan DIAMBIL LANGSUNG dari teks src/app.js
// (bukan disalin) sehingga identik dengan aplikasi; setProj/inArea direplikasi dan dibandingkan di cekLoader().
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '../..');
const CORE = require(REPO + '/src/core.js');
const DEG = Math.PI / 180;
function ambilFungsi(src, nama) {
  const i = src.indexOf('function ' + nama + '('); if (i < 0) throw new Error('fungsi tidak ditemukan di app.js: ' + nama);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('kurung tidak seimbang: ' + nama);
}
const APP = fs.readFileSync(REPO + '/src/app.js', 'utf8');
// konteks minimal: SMD + hwExcl dengan kotak "Ikutkan gang dan jalan setapak" tercentang (bawaan shell.html)
const sandbox = { SMD: { jalan: null }, $: id => ({ checked: true }), Float64Array, Math, RegExp };
vm.createContext(sandbox);
vm.runInContext(APP.match(/const EXCL_BASE = .*\n/)[0].replace('const', 'var') + APP.match(/const EXCL_FOOT = .*\n/)[0].replace('const', 'var'), sandbox);
for (const f of ['hwExcl', 'decodeJalan', 'subsetJalan']) vm.runInContext(ambilFungsi(APP, f), sandbox);
let _W = null;
function data() {
  if (!sandbox.SMD.jalan) sandbox.SMD.jalan = sandbox.decodeJalan(JSON.parse(fs.readFileSync(REPO + '/data/samarinda_jalan.json')));
  if (!_W) _W = JSON.parse(fs.readFileSync(REPO + '/data/samarinda_wilayah.json'));
  return { D: sandbox.SMD.jalan, W: _W };
}
function daftarKel() { const { W } = data(); const out = []; for (const k of W.kecamatan) for (const l of k.kelurahan) if (l.rings) out.push({ kec: k.nama, kel: l.nama, rings: l.rings }); return out; }
function wilBBox(rings) { let s = 90, n = -90, w = 180, e = -180; for (const r of rings) for (const p of r) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); } return { s, n, w, e }; }
// = pilihDariDaftar → setWilayah → terapkanJalanOffline (subset + 300 m) → terimaJalan → setProj → buildCtx(nodeXY)
function siapkanWilayah(k) {
  data();
  const b = wilBBox(k.rings), lat = (b.s + b.n) / 2, dLa = 300 / 111000, dLo = 300 / (111000 * Math.cos(lat * DEG));
  const osm = sandbox.subsetJalan({ s: b.s - dLa, n: b.n + dLa, w: b.w - dLo, e: b.e + dLo });
  const PROJ = CORE.makeProj((b.s + b.n) / 2, (b.w + b.e) / 2);
  const ringsXY = k.rings.map(r => r.map(p => PROJ.fwd(p[0], p[1])));
  const inArea = (x, y) => { for (const r of ringsXY) if (CORE.pointInRing(x, y, r)) return true; for (const r of ringsXY) if (CORE.plNearest(r.concat([r[0]]), [x, y]).d < 150) return true; return false; };
  const nodeXY = new Map(); for (const id in osm.nodes) { const p = osm.nodes[id]; nodeXY.set(+id, PROJ.fwd(p[0], p[1])); }
  const inRing = (x, y) => ringsXY.some(r => CORE.pointInRing(x, y, r));
  return { ...k, osm, PROJ, inArea, inRing, nodeXY, ringsXY };
}
// bukti setProj/inArea identik: jalankan teks setProj dari app.js di sandbox dan bandingkan inArea pada kisi titik
function cekLoader(namaKel) {
  const k = daftarKel().find(x => x.kel === namaKel), Wl = siapkanWilayah(k);
  const sb = { S: { wil: { rings: k.rings } }, CORE, PROJ: null, inAreaFn: null, Math };
  vm.createContext(sb);
  vm.runInContext(ambilFungsi(APP, 'wilBBox') + ambilFungsi(APP, 'setProj').replace('function setProj() {', 'function setProj() { var DEG = Math.PI/180;'), sb);
  vm.runInContext('setProj(); this.P = PROJ; this.F = inAreaFn;', sb);
  let n = 0, beda = 0;
  for (const [id, xy] of [...Wl.nodeXY].slice(0, 2000)) { const ll = Wl.osm.nodes[id], q = sb.P.fwd(ll[0], ll[1]); if (Math.hypot(q[0] - xy[0], q[1] - xy[1]) > 1e-9) beda++; n++; }
  let m = 0, bedaA = 0;
  for (let x = -1500; x <= 1500; x += 75) for (let y = -1500; y <= 1500; y += 75) { m++; if (sb.F(x, y) !== Wl.inArea(x, y)) bedaA++; }
  return { kel: namaKel, ruas: Wl.osm.ways.length, node: Wl.nodeXY.size, proyeksiBeda: beda + '/' + n, inAreaBeda: bedaA + '/' + m };
}
module.exports = { CORE, DEG, REPO, data, daftarKel, siapkanWilayah, cekLoader };
if (require.main === module) for (const k of ['Selili', 'Sidomulyo', 'Bantuas']) console.log(cekLoader(k));
