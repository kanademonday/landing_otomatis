# Plot Bidang dari Gambar Situasi (Samarinda)

Aplikasi web satu-file untuk membuat **poligon bidang tanah berkoordinat** (DXF untuk AutoCAD, TM-3) dari:

- nama **kota, kecamatan, kelurahan**,
- **gambar situasi** (sketsa bidang + jalan di sekitarnya, dengan atau tanpa nama jalan),
- **luas tanah**.

Program mencari tempat di kelurahan tersebut yang **pola jalan dan simpangnya paling mirip** dengan gambar situasi (memakai data jalan OpenStreetMap), lalu menempatkan bidang tanah di sana.

## Buka aplikasi

- **Online (selalu versi terbaru):** https://kanademonday.github.io/landing_otomatis/ (aktif setelah GitHub Pages dinyalakan: Settings → Pages → Branch `main` / root → Save)
- **Offline:** unduh `index.html` dan buka di Chrome/Edge.
- **Apa yang berubah:** lihat [CHANGELOG.md](CHANGELOG.md). Nomor versi tampil di samping judul aplikasi.

## Cara pakai

1. **Wilayah**: pilih kecamatan dan kelurahan. Batas dan jalan langsung terpasang.
2. **Gambar**: buka PDF BT/SU (kelurahan terisi dari nama file), pilih halaman gambar SU lalu *Pakai sebagai gambar situasi*; isi **luas tanah (m²)** sesuai BT/SU dan skala (mis. 1:500), telusuri jalan (alat *Jalan*) dan bidang (alat *Bidang*). Putar gambar agar utara menghadap ke atas (alat *Panah utara*) dan pilih seberapa yakin arah utaranya. Bidang lain pada peta analog digambar dengan alat *Bidang lain*. Ctrl+Z untuk mengurungkan.
3. **Cocokkan**: lihat pratinjau tiap kandidat, pilih yang jalannya paling menempel. Bila meleset, pakai titik ikat.
4. **Hasil**: nyalakan *Gambar situasi di peta* untuk membandingkan dengan citra satelit, lalu **Salin bidang untuk AutoCAD** dan tempel (Ctrl+V) di *command line* AutoCAD Map 3D. Polyline langsung tergambar di koordinat TM-3. Alternatifnya: **Unduh file DXF**. Penyesuaian kecil dilakukan di AutoCAD.

Gambar dan data yang dimuat hanya diproses di browser, tidak dikirim ke repo ini.

### Baca otomatis dengan AI (opsional, gratis)
Langkah 2 → *Pengaturan baca otomatis (AI)*:
- **Groq (online, bawaan)**: buat kunci API gratis di https://console.groq.com/keys, tempel di kotak *Kunci API Groq*, klik *Tes koneksi*. Tiap anggota tim memakai kunci sendiri (batas gratis dihitung per akun).
- **Ollama (lokal)**: pasang Ollama, `ollama pull qwen2.5vl:7b`, set `OLLAMA_ORIGINS=https://kanademonday.github.io`, jalankan ulang Ollama.

Lalu klik *Baca otomatis* pada berkas, periksa hasilnya, *Isi ke formulir*, buka halaman gambar, dan *Telusuri gambar otomatis*. Semua hasil AI harus diperiksa, terutama tulisan tangan.

### Data persil (DXF)
Langkah 1 → *Muat file persil (.dxf)*. Dari AutoCAD: **Save As → AutoCAD DXF** (DWG tidak bisa dibaca di browser). Setelah dimuat: SU yang sudah ada di persil langsung ketemu (salin koordinat persisnya ke AutoCAD), dan SU lain dicari di sekitar SU bernomor berdekatan, tanpa menimpa bidang persil, dengan mengutamakan posisi yang menempel bidang tetangga. Data hanya tersimpan di browser masing-masing.

### Mode pola jalan (eksperimen)
Untuk gambar SU lama yang hanya berisi satu garis jalan tanpa nama/simpang. Langkah 3 → *Pengaturan lanjutan* → centang **Mode pola jalan (eksperimen)**. Lalu persempit pencarian dengan **titik perkiraan** (geser peta ke perkiraan lokasi dari peta analog → *Pakai tengah peta*) atau dengan **SU yang sudah ketemu** (tempel daftar `X = … Y = … su.02743` dari AutoCAD, atau klik *Tandai SU ini sudah ketemu* di langkah 4). SU bernomor berdekatan dicari di sekitar SU tetangganya. Gambar minim tidak pernah diberi label "keyakinan tinggi": selalu periksa beberapa kandidat dengan citra satelit dan peta analog.

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
| `src/fitur.js` | Ekspor DXF, bidang lain (peta analog), gambar di atas peta, pratinjau kandidat, urungkan |
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
python3 tests/e2e/run3.py        # uji gambar di peta, pratinjau, urungkan, ekspor DXF
python3 tests/e2e/run4.py        # uji putar gambar, arah utara, salin ke AutoCAD vs DXF
python3 tests/e2e/run5.py        # uji nama jalan benar vs keliru (nama sebagai petunjuk)
python3 tests/e2e/run7.py        # uji baca otomatis AI (Groq & Ollama tiruan), terbilang, batas pemakaian
python3 tests/e2e/run6.py        # uji buka PDF SU, kode wilayah, penampil, cek skala (SAMPEL=folder untuk PDF asli, tidak disimpan)
python3 tests/e2e/run9.py        # uji mode pola jalan (mati = identik, impor SU ketemu, area, label)
python3 tests/e2e/run10.py       # uji data persil DXF (SU persis, area, tempel, salin koordinat persil)
node tests/benchmark/run.js      # benchmark akurasi offline (lihat tests/benchmark/README.md)
```

## Cara kerja singkat

1. Skala awal dari luas: `skala = √(luas / luas_piksel_bidang)`.
2. Simpang di sketsa dicocokkan dengan simpang OSM (sudut cabang) → ribuan hipotesis (posisi, rotasi, skala).
3. Tiap hipotesis dinilai dengan *distance field* jalan OSM (jalan sketsa harus menempel jalan OSM) dan arah balik (jalan OSM di area sketsa yang tak tergambar).
4. Kandidat terbaik dihaluskan (coordinate descent) dan disaring.

## Batasan

Hasil sangat bergantung pada ketelitian sketsa dan kelengkapan data jalan OpenStreetMap. Poligon adalah **perkiraan posisi, bukan hasil ukur resmi** — verifikasi dengan citra satelit, lapangan, atau BPN.
