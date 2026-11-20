# Catatan Perubahan

Versi terbaru di atas. Nomor versi juga tampil di samping judul aplikasi (klik untuk membuka halaman ini).

## v1.1.0 — 2026-11-20
- **Khusus Kota Samarinda:** kota terkunci; pilih **kecamatan** lalu **kelurahan** dari dropdown (10 kecamatan, 59 kelurahan sesuai daftar Kemendagri). Ada pilihan "(seluruh kecamatan)" bila kelurahan tidak diketahui.
- **Data jalan & batas wilayah seluruh Samarinda sudah tersimpan** di repo (`data/`). Begitu kelurahan dipilih, jalan langsung tersedia — tidak perlu menunggu unduhan 10–60 detik per bidang.
  - Data diunduh otomatis oleh GitHub Actions dari OpenStreetMap dan diperbarui tiap bulan (atau manual: tab Actions → *Perbarui data Samarinda* → *Run workflow*).
  - Laporan kelengkapan batas kelurahan: `data/LAPORAN.txt`. Kelurahan tanpa batas di OSM memakai batas kecamatannya.
- Tombol **🆕 Bidang baru**: mengosongkan gambar & isian untuk bidang berikutnya, wilayah dan data jalan tetap (cocok untuk mencari banyak bidang).
- Pencarian via internet (Nominatim) dan pengambilan jalan online tetap ada sebagai cadangan.

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
