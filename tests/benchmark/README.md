# Benchmark pencocokan pola jalan (offline)

Semua berjalan di Node tanpa jaringan, memakai `data/samarinda_*.json` dan `src/core.js` apa adanya.

| Perintah | Hasil |
|---|---|
| `node tests/benchmark/loader.js` | Bukti pemuat identik dengan app.js (proyeksi & area, 3 kelurahan) |
| `node tests/benchmark/gen.js` | `out/kasus.json` — 8 kategori × 60 kasus semi-sintetis, seed tetap |
| `node tests/benchmark/run.js [--kat K1,K2] [--tag x] [--core path] [--pola '{..}']` | `out/hasil_x.json/.csv` + ringkasan per kategori × split |
| `node tests/benchmark/run_nyata.js [--tag x]` | Kasus nyata di `real/*/kasus_nyata.json` (di-.gitignore) |
| `node tests/benchmark/ringkas.js out/hasil_x.json` | Cetak ulang ringkasan |

- **Kategori:** K1 bersih · K2 derau (sudut ±5–10°, geser ±1,5% diagonal, skala jalan ±10%, utara bebas/±15°) · K3 20–50% jalan hilang (jalan kecil dulu) · K4 0/1/2 simpang · K5 area grid (porsi simpang 4-siku ≥15% dalam 300 m) · K6 nama benar · K7 nama salah · **K8 gaya SU asli** (hanya jalan ≤12 m dari bidang, ±25–45 m).
- **Pemisahan** tuning/held-out 70/30 **per kelurahan** (berbenih). Held-out tidak boleh dipakai menyetel parameter.
- **Benar** = jarak centroid ≤ 15 m (`config.json`), dilaporkan juga ≤ 5 m dan IoU poligon. Kasus nyata: ≤ 15 m dan ≤ 25 m, karena lokasi benar hanya perkiraan tengah.
- Generator **tidak** memakai matcher. Simpang dihitung dari graf OSM sendiri.
- Semi-sintetis adalah **proxy** (geometri jalan persis OSM). Hakim akhir: kasus nyata.
- Baseline v2.11.0: `baseline/ringkasan_baseline.txt`, `baseline/hasil_baseline.json`. Salinan core lama: `baseline/core_baseline.js` (tag git `backup-sebelum-pola`).
