// Tes identik: hasil run (mode pola mati) harus sama persis dengan baseline (T dan skor seluruh kandidat).
//   node tests/benchmark/identik.js out/hasil_x.json [baseline/hasil_baseline.json]
const fs = require('fs');
const A = JSON.parse(fs.readFileSync(process.argv[2])).rows, B = JSON.parse(fs.readFileSync(process.argv[3] || __dirname + '/baseline/hasil_baseline.json')).rows;
const mB = new Map(B.map(r => [r.id, r])); let beda = 0, n = 0;
for (const r of A) { const b = mB.get(r.id); if (!b) continue; n++; if (JSON.stringify([r.T, r.skor, r.label, r.error]) !== JSON.stringify([b.T, b.skor, b.label, b.error])) { beda++; if (beda <= 5) console.log('BEDA', r.id); } }
console.log(`Tes identik: ${n - beda}/${n} sama${beda ? ' — GAGAL' : ' — LULUS'}`); process.exit(beda ? 1 : 0);
