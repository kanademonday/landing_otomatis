// Ringkasan per kategori × split. node tests/benchmark/ringkas.js out/hasil_x.json [out/hasil_baseline.json]
const fs = require('fs');
const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const pc = (a, b) => b ? (100 * a / b).toFixed(1) : '-';
function stat(R) {
  const n = R.length, ok = R.filter(r => !r.error), t = k => ok.filter(r => r.rank && r.rank <= k).length;
  const hi = ok.filter(r => r.label === 'keyakinan tinggi'), amb = ok.filter(r => /ambigu|verifikasi/.test(r.label));
  return { n, top1: pc(t(1), n), top3: pc(t(3), n), top6: pc(t(6), n), top1_5m: pc(ok.filter(r => r.rank5 === 1).length, n),
    medErr: q(ok.map(r => r.err1), 0.5)?.toFixed(1), p90Err: q(ok.map(r => r.err1), 0.9)?.toFixed(0), medIoU: q(ok.map(r => r.iou1), 0.5)?.toFixed(2),
    tinggi: `${pc(hi.filter(r => r.rank === 1).length, hi.length)}% benar, cakupan ${pc(hi.length, n)}%`,
    ambigu: `${pc(amb.length, n)}% (salah ${amb.filter(r => r.rank !== 1).length}/${amb.length})`,
    msMed: q(R.map(r => r.ms), 0.5)?.toFixed(0), msP95: q(R.map(r => r.ms), 0.95)?.toFixed(0), error: n - ok.length };
}
function ringkas(rows, tag) {
  const kats = [...new Set(rows.map(r => r.kat))].sort(), lines = [`== ${tag} (${rows.length} kasus)`];
  const head = 'kategori split    n  top1  top3  top6 top1≤5m medErr p90Err IoU | keyakinan tinggi            | ambigu/verifikasi        | ms med/p95';
  lines.push(head);
  for (const sp of ['tuning', 'heldout']) for (const k of [...kats, 'TOTAL']) {
    const R = rows.filter(r => r.split === sp && (k === 'TOTAL' || r.kat === k)); if (!R.length) continue; const s = stat(R);
    lines.push(`${k.padEnd(8)} ${sp.padEnd(7)} ${String(s.n).padStart(3)} ${s.top1.padStart(5)} ${s.top3.padStart(5)} ${s.top6.padStart(5)} ${s.top1_5m.padStart(6)} ${String(s.medErr).padStart(6)} ${String(s.p90Err).padStart(6)} ${s.medIoU} | ${s.tinggi.padEnd(27)} | ${s.ambigu.padEnd(24)} | ${s.msMed}/${s.msP95}${s.error ? ' ERR ' + s.error : ''}`);
  }
  // tabel keandalan per rentang skor #1 (semua)
  lines.push('keandalan per skor #1 (tuning): rentang → n, top1 benar');
  for (const [a, b] of [[0, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 0.95], [0.95, 1.01]]) { const R = rows.filter(r => r.split === 'tuning' && !r.error && r.skor[0] >= a && r.skor[0] < b); lines.push(`  [${a.toFixed(2)}, ${Math.min(1, b).toFixed(2)}): n=${R.length} benar ${pc(R.filter(r => r.rank === 1).length, R.length)}%`); }
  return lines.join('\n');
}
module.exports = { ringkas, stat };
if (require.main === module) { const J = JSON.parse(fs.readFileSync(process.argv[2])); console.log(ringkas(J.rows, J.tag)); }
