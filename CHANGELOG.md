# Catatan Perubahan

Versi terbaru di atas. Nomor versi juga tampil di samping judul aplikasi (klik untuk membuka halaman ini).

## v1.0.2 — 2026-11-20
- Nomor versi ditampilkan di judul aplikasi, terhubung ke catatan perubahan ini.
- README: tautan aplikasi online (GitHub Pages).

## v1.0.1 — 2026-11-20
- **Perbaikan:** data jalan gagal dimuat saat semua server Overpass sibuk (HTTP 502/504/timeout).
  - Sumber cadangan otomatis: API utama OpenStreetMap, dipecah per petak bila area padat.
  - Waktu tunggu per server 60 detik (sebelumnya 160), lalu coba ulang setelah 10 dan 30 detik.
  - Status server yang sedang dicoba tampil di layar.
  - Fitur baru **Impor file data jalan** (.osm dari openstreetmap.org → Ekspor, JSON Overpass, atau GeoJSON).

## v1.0.0 — 2026-11-20
- Rilis pertama: pencarian wilayah, pengambilan jalan OSM, penelusuran sketsa, pencocokan otomatis & titik ikat, luas (geodesik/UTM/TM-3), ekspor KML/KMZ/GeoJSON/CSV/PNG, log error, simpan/muat proyek, bantuan AI opsional.
