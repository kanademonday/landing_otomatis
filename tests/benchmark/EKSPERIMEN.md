# Catatan eksperimen pola jalan (2026-11-23)

Semua angka dari skrip yang benar-benar dijalankan. Penyetelan hanya memakai split **tuning**; kasus nyata hanya sebagai penilai.
Reproduksi: `node tests/benchmark/gen.js`, lalu `node tests/benchmark/run.js --split tuning --pola '<json>'` dan
`node tests/benchmark/run_nyata.js --pola '<json>' [--area '{"k":3,"r":150}']`. Kode varian yang dibatalkan tidak ada di core.js;
rinciannya tercatat di bawah agar bisa dibuat ulang.

## Tes identik
`src/core.js` = `baseline/core_baseline.js` (byte per byte). Run penuh 480 kasus (K1–K8) dengan kode sekarang vs baseline: **480/480 sama** (`node tests/benchmark/identik.js out/hasil_mati.json`).

## Tuning (top-1 / top-3 per kategori, ≤15 m; TOTAL top1/3/6; "keyakinan tinggi" benar/n)

| varian | K1 | K2 | K3 | K4 | K5 | K6 | K7 | K8 | TOTAL | tinggi |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline v2.11.0 | 93/95 | 69/74 | 71/76 | 74/79 | 96/96 | 95/100 | 100/100 | 26/33 | 78/82/83 | 203/203 |
| M5 trim 0,2 + rev lokal 20 m | 88/93 | 50/64 | 24/43 | 72/74 | 87/89 | 93/98 | 93/98 | 19/29 | 66/73/76 | 114/116 |
| M5 trim 0,1 + rev 20 m | 93/95 | 55/71 | 38/57 | 70/77 | 91/91 | 98/100 | 93/98 | 24/33 | 70/78/79 | 152/155 |
| M5 trim 0,3 + rev 20 m | 86/88 | 43/55 | 17/29 | 67/70 | 84/89 | 90/95 | 90/93 | 17/24 | 62/68/71 | 79/83 |
| M5 trim 0,2 + rev 10 m | 83/93 | 43/55 | 38/43 | 65/72 | 89/89 | 90/95 | 90/95 | 21/26 | 65/71/73 | 107/108 |
| M5 trim 0,2 + rev 40 m | 93/95 | 60/69 | 45/60 | 65/77 | 91/91 | 98/100 | 95/98 | 5/7 | 69/75/77 | 153/158 |
| M5 trim 0 + rev 20 m | 93/95 | 67/74 | 60/62 | 72/79 | 89/96 | 98/98 | 98/98 | 29/33 | 76/79/81 | 180/183 |
| M1 ragam 3 / sel 20 m | 95/95 | 71/76 | 71/76 | 74/77 | 96/96 | 95/100 | 98/98 | 26/31 | 78/81/82 | 206/206 |
| M1 ragam 1 / sel 20 m | 95/95 | 71/76 | 69/76 | 77/79 | 96/96 | 95/100 | 98/98 | 24/36 | 78/82/83 | 207/207 |

## Kasus nyata (15 SU Sidomulyo, benar ≤25 m; ditelusuri manual dari PDF)

| varian | tanpa area: top1/top6 | area SU tetangga (k=3, r≥150 m): top1/top3/top6 | "keyakinan tinggi" salah |
|---|---|---|---|
| baseline | 0/0 | 1/3/4 (label mode pola) | 0 |
| M5 trim 0 + rev 20 m | 0/0 | 0/1/2 | 1–2 |
| M5 trim 0,2 + rev 20 m | 0/0 | 0/2/2 | 0 |
| M1 ragam 1 atau 3 | 0/0 | 1/3/4 | 0 |
| 10 kandidat (bukan 6) | – | 4 dalam 10 | 0 |
| 15 kandidat | – | 5 dalam 15 | 0 |
| Batas atas: lingkaran 100 m di lokasi benar | – | 1/4/7 | 1 (label lama) |

## Keputusan
- **M5 (skor parsial + arah balik lokal): DIBATALKAN.** Turun di tuning (78 → 62–76 top-1) dan di kasus nyata (4 → 2 top-6), serta menimbulkan "keyakinan tinggi" yang salah.
- **M1 (kandidat beragam sebelum top-600): DIBATALKAN.** Netral (selisih ±1 kasus) di tuning dan kasus nyata.
- **Kandidat lebih banyak:** +1 kasus nyata pada 15 kandidat; tidak dipasang.
- Yang dipertahankan: area dari titik perkiraan / SU tetangga dan label jujur (tanpa perubahan core.js).

## Diagnosis 03753 / 03754 (kasus bersimpang)
- 03754: simpang OSM yang cocok (T, 3 cabang) ada 0 m dari tebakan; skor terbaik di sana 0,795 (fwd 0,25 karena lanjutan jalan ke timur laut pada gambar tidak ada di OSM) vs 0,916 di tempat salah.
- 03753: simpang 20 m dari titik; skor 0,933 (rev 0,22: jalan OSM di sekitar yang tidak digambar) vs 0,989 di tempat salah.
- Penyebab: OSM tidak sama dengan keadaan 1998 dan SU hanya menggambar sebagian jalan. Mengendurkan kedua penalti (M5) justru membuat tempat salah lebih mudah cocok.

# Data persil (2026-11-25)

`node tests/benchmark/persil.js --varian v0|v1|v2 --r 60 [--final 1] --kel <kelurahan> --n 40` (DXF di `real/persil/`, di-.gitignore).
Kasus = bidang persil ber-SU (tahun ≤2009) yang sudah berlokasi, diperlakukan seolah belum dilanding; sketsa = bidang itu + jalan OSM ≤12 m (gaya SU asli), tanpa nama.
Tuning: Pelita, Selili, Sidodamai, Sungai Dama (4 × 40). Uji akhir: Sidomulyo (60) + 15 SU nyata.

Temuan data: SU dengan nomor terdekat (kode & tahun sama) median 50–230 m jauhnya; dari 3 nomor terdekat, yang terdekat median 15–117 m (1990–1999: 32 m, 60% ≤50 m).
Jadi area = gabungan lingkaran di sekitar tiap tetangga, bukan rata-ratanya. Poligon persil besar tanpa label (blok/batas, mis. 33 ha) harus dibuang dari acuan tumpang tindih (sebelum dibuang: posisi benar 100% tumpang tindih).

| varian (tuning, n=160) | top1 | top3 | top6 | "keyakinan tinggi" benar |
|---|---|---|---|---|
| v0 seluruh kelurahan | 31% | 39% | 45% | 16/16 |
| v1 lingkaran 60 m | 40% | 48% | 48% | 47/82 (label lama) |
| v1 lingkaran 100 m | 36% | 46% | 48% | 28/56 |
| v2 + tak boleh menimpa persil, 60 m | 43% | 48% | 48% | 62/88 (label lama) |
| v2 + urut ulang skor+0,2×tempel | 47% | – | – | aturan tempel: 50/52 (96%) |

Sisi menempel (porsi keliling ≤1,5 m dari tepi persil lain): #1 benar median 0,69; #1 salah median 0,00.
Aturan terkunci: k=3, r=60 m, skor+0,2×tempel, "keyakinan tinggi" bila tempel#1≥0,5 & tempel#2<0,3 & skor≥0,8.

Uji akhir Sidomulyo (n=60, tidak dipakai menyetel): v0 top1 28% / top6 38%, "tinggi" 5/5 → **final top1 58% / top6 58%, "tinggi" 19/20 (cakupan 33%)**.
15 SU nyata (≤25 m): baseline 0/15 → final top1 2/15, top6 3/15; "keyakinan tinggi" 1 kasus, benar.
