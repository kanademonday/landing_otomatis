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

## Cara pakai

1. Unduh `index.html`, lalu buka dengan Chrome atau Edge (perlu internet).
2. **Lokasi**: pilih kecamatan → kelurahan (Kota Samarinda). Batas & jalan langsung terpasang dari data tersimpan.
3. **Sketsa**: muat gambar → telusuri jalan (alat 🛣️ Jalan) → gambar bidang (alat ⬛ Bidang) → isi luas. Arah utara & nama jalan (opsional) sangat membantu.
4. **Pencocokan**: jalankan otomatis, pilih kandidat terbaik. Bila meleset, pakai **titik ikat** (≥2 titik di sketsa + klik titik yang sama di peta).
5. **Hasil**: lihat perbandingan sketsa vs jalan sebenarnya, luas (geodesik/UTM/TM-3), koordinat titik sudut, penyesuaian halus, lalu ekspor **KML/KMZ**, GeoJSON, CSV, PNG.

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
```

## Cara kerja singkat

1. Skala awal dari luas: `skala = √(luas / luas_piksel_bidang)`.
2. Simpang di sketsa dicocokkan dengan simpang OSM (sudut cabang) → ribuan hipotesis (posisi, rotasi, skala).
3. Tiap hipotesis dinilai dengan *distance field* jalan OSM (jalan sketsa harus menempel jalan OSM) dan arah balik (jalan OSM di area sketsa yang tak tergambar).
4. Kandidat terbaik dihaluskan (coordinate descent) dan disaring.

## Batasan

Hasil sangat bergantung pada ketelitian sketsa dan kelengkapan data jalan OpenStreetMap. Poligon adalah **perkiraan posisi, bukan hasil ukur resmi** — verifikasi dengan citra satelit, lapangan, atau BPN.
