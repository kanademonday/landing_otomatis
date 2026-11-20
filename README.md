# Pencocok Situasi Bidang → Poligon KML

Aplikasi web satu-file untuk membuat **poligon bidang tanah berkoordinat** (KML/KMZ untuk Google Earth Pro) dari:

- nama **kota, kecamatan, kelurahan**,
- **gambar situasi** (sketsa bidang + jalan di sekitarnya, dengan atau tanpa nama jalan),
- **luas tanah**.

Program mencari tempat di kelurahan tersebut yang **pola jalan dan simpangnya paling mirip** dengan gambar situasi (memakai data jalan OpenStreetMap), lalu menempatkan bidang tanah di sana.

## Buka aplikasi

- **Online (selalu versi terbaru):** https://kanademonday.github.io/landing_otomatis/ (aktif setelah GitHub Pages dinyalakan: Settings → Pages → Branch `main` / root → Save)
- **Offline:** unduh `index.html` dan buka di Chrome/Edge.
- **Apa yang berubah:** lihat [CHANGELOG.md](CHANGELOG.md). Nomor versi tampil di samping judul aplikasi.

## Cara pakai (plotting KW 4–6)

1. **Daftar bidang** → *Impor daftar* (Excel/CSV berisi NIB, nomor hak, luas, kelurahan, KW). Klik bidang yang akan dikerjakan.
2. **Wilayah**: kecamatan/kelurahan terisi dari daftar (atau pilih di bilah atas). Bila ada bidang yang sudah didigitasi di AutoCAD, impor DXF-nya sebagai acuan agar hasil tidak menumpuk.
3. **Gambar**: muat surat ukur / gambar situasi / peta analog, telusuri jalan (alat *Jalan*) dan bidang (alat *Bidang*). Pada peta analog, gambar bidang lain dengan alat *Bidang lain* dan beri label NIB.
4. **Cocokkan**: pilih kandidat terbaik (atau pakai titik ikat bila meleset).
5. **Hasil**: periksa tanda pada *Pemeriksaan data*, geser halus bila perlu, **Simpan hasil** dengan status, lalu ekspor **DXF** (TM-3) untuk AutoCAD atau KML untuk Google Earth. Rekap seluruh daftar diekspor dari laci *Daftar bidang*.

**Data dinas** (daftar bidang, DXF acuan, gambar surat ukur) hanya diproses di browser dan tidak pernah dikirim ke repo ini. Fitur bantuan AI mengirim gambar ke server Anthropic — jangan dipakai untuk dokumen dinas tanpa izin.

### Data Samarinda tersimpan
`data/samarinda_wilayah.json` (batas 10 kecamatan & 59 kelurahan) dan `data/samarinda_jalan.json` (seluruh jalan) dibuat oleh GitHub Actions (`.github/workflows/data-samarinda.yml` → `tools/fetch_samarinda.py`) dari OpenStreetMap, diperbarui tiap bulan. Untuk memperbarui sekarang: tab **Actions** → *Perbarui data Samarinda (OSM)* → **Run workflow**. Kelengkapan batas kelurahan dicatat di `data/LAPORAN.txt`.

Untuk banyak bidang: setelah selesai satu bidang, klik **🆕 Bidang baru** — wilayah dan data jalan tetap terpasang.

### Bila data jalan gagal dimuat
Aplikasi otomatis mencoba beberapa server Overpass, lalu API utama OpenStreetMap, lalu mengulang. Bila tetap gagal, impor file sendiri: openstreetmap.org → **Ekspor** → unduh `map.osm` → pilih di *Impor file data jalan*.

### Log error
Tombol **🧾 Log** → **Unduh log (.txt)**. Berisi versi, browser, ringkasan isian, setiap permintaan ke server, dan detail error (API key tidak dicatat). Untuk reproduksi masalah, sertakan juga file dari **💾 Simpan proyek**.

## Struktur

| Path | Isi |
|---|---|
| `index.html` | Aplikasi siap pakai (hasil build) |
| `src/core.js` | Algoritma: proyeksi, distance field (EDT), deteksi simpang, hipotesis, skor, penghalusan, UTM/TM-3 |
| `src/app.js` | Antarmuka, peta (Leaflet), kanvas sketsa, ekspor, log |
| `src/fitur.js` | Daftar bidang, bidang tambahan, referensi tumpang tindih, pemeriksaan data, DXF & world file |
| `src/shell.html` | Kerangka HTML + CSS |
| `tools/fetch_samarinda.py` | Pengunduh data Samarinda (dijalankan GitHub Actions) |
| `data/` | Data batas & jalan Samarinda (dibuat otomatis) |
| `build.py` | Menggabungkan `src/` → `index.html` |
| `tests/` | Uji algoritma & uji end-to-end (Playwright) dengan data sintetis |

## Pengembangan

```bash
python3 build.py                 # build index.html
node tests/test_core.js          # uji algoritma
node tests/e2e/gen.js && python3 tests/e2e/prepare.py && python3 tests/test_fetch.py
python3 tests/e2e/run.py         # uji alur penuh (butuh playwright + chrome)
python3 tests/e2e/run2.py        # uji sumber cadangan data jalan
python3 tests/e2e/run3.py        # uji alur kerja KW (daftar, DXF, referensi, rekap)
```

## Cara kerja singkat

1. Skala awal dari luas: `skala = √(luas / luas_piksel_bidang)`.
2. Simpang di sketsa dicocokkan dengan simpang OSM (sudut cabang) → ribuan hipotesis (posisi, rotasi, skala).
3. Tiap hipotesis dinilai dengan *distance field* jalan OSM (jalan sketsa harus menempel jalan OSM) dan arah balik (jalan OSM di area sketsa yang tak tergambar).
4. Kandidat terbaik dihaluskan (coordinate descent) dan disaring.

## Batasan

Hasil sangat bergantung pada ketelitian sketsa dan kelengkapan data jalan OpenStreetMap. Poligon adalah **perkiraan posisi, bukan hasil ukur resmi** — verifikasi dengan citra satelit, lapangan, atau BPN.
