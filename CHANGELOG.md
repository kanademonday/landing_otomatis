# Catatan Perubahan

Versi terbaru di atas. Nomor versi juga tampil di samping judul aplikasi (klik untuk membuka halaman ini).

## v2.1.0 — 2026-11-20 — Fokus pencarian lewat gambar situasi
**Dihapus** (belum bisa dipakai untuk bidang KW 4–6 yang belum ada di peta pendaftaran): daftar bidang beserta status dan rekap, impor bidang acuan, isian luas buku tanah terpisah, KW dan status di kop gambar, bantuan AI, serta semua ekspor selain DXF (KML, KMZ, CSV, GeoJSON, PNG, world file). Isian "perkiraan lebar gambar" juga dihapus: **luas tanah (m²) kini wajib**, sesuai BT/SU/spreadsheet.

**Baru**
- **Gambar situasi di atas citra satelit**: setelah dicocokkan, gambar ditumpangkan transparan di peta (kepekatan bisa diatur) untuk dibandingkan dengan atap, pagar, dan batas kebun.
- **Pratinjau tiap kandidat**: gambar kecil jalan pada gambar (merah) di atas jalan nyata (biru), sehingga kandidat yang tertukar mudah dikenali.
- **Urungkan (Ctrl+Z)** untuk semua perubahan gambar, dan **sisipkan titik** dengan alat *Ubah titik* (klik di garis).

**Ekspor**: hanya **DXF** (TM-3 50.2/50.1 atau UTM 50S) untuk AutoCAD. Buka di AutoCAD lalu *Save As* DWG bila perlu.

## v2.0.0 — 2026-11-20 — Alat kerja plotting KW 4–6
**Tampilan baru** bergaya lembar gambar kadaster: bilah atas berisi pilihan kecamatan/kelurahan dan 4 langkah bernomor, panel kiri yang lebih lega, dan **kop gambar** di pojok kanan bawah (bidang, kelurahan, KW, luas surat ukur vs luas poligon, skor, status, sistem koordinat).

**Daftar bidang (antrian kerja)**
- Impor daftar dari Excel/CSV. Kolom NIB, nomor hak, nomor SU, luas, kelurahan, kecamatan, KW dikenali otomatis.
- Klik satu bidang: kelurahan, luas, dan nama langsung terisi.
- Simpan hasil dengan status *Ditemukan / Ragu-ragu / Perlu cek lapangan / Tidak ditemukan* dan catatan, lalu lanjut ke bidang berikutnya.
- Ekspor rekap (Excel/CSV, termasuk koordinat pusat dan poligon WKT) serta semua hasil ke DXF/KML.
- Daftar tersimpan di browser ini saja (tidak dikirim ke mana pun).

**Peta analog:** alat *Bidang lain* untuk menggambar banyak bidang pada satu lembar gambar. Setelah dicocokkan, semuanya ikut mendapat koordinat. Label yang cocok dengan NIB/nomor hak di daftar langsung tersimpan ke bidang tersebut.

**AutoCAD**
- Ekspor **DXF** (R12, dibuka semua versi AutoCAD) dalam **TM-3 zona 50.2 / 50.1** atau **UTM 50S**: layer BIDANG, BIDANG_TAMBAHAN, JALAN_SKETSA, BINGKAI_GAMBAR, LABEL, NOMOR_TITIK.
- Ekspor **gambar + world file** (.jgw/.pgw) dalam zip, dengan petunjuk pemasangan di AutoCAD (Map 3D: MAPIINSERT, AutoCAD biasa: IMAGEATTACH + ALIGN ke BINGKAI_GAMBAR).

**Bidang yang sudah diplot sebagai acuan:** impor DXF (hasil digitasi AutoCAD), KML, atau GeoJSON. Pencocokan memberi penalti bila poligon menumpuk, dan hasil yang sudah disimpan di daftar otomatis ikut jadi acuan.

**Pemeriksaan data:** luas surat ukur vs luas daftar/buku tanah, luas dari skala hasil cocok, tumpang tindih, skor rendah, dan kandidat ganda diberi tanda.

Tabel koordinat dan CSV kini memakai sistem koordinat yang dipilih.

## Data Samarinda — 2026-11-20 (dibuat GitHub Action, ±19 menit)
- Batas wilayah: **59/59 kelurahan** dan 10 kecamatan tersedia di OpenStreetMap.
- Jalan: **29.523 ruas**, 220.115 titik, 3.058 nama jalan. Ukuran `samarinda_jalan.json` 3,84 MB, `samarinda_wilayah.json` 0,46 MB.
- Uji dengan data asli: data dibaca dalam ±0,04 dtk, jalan satu kelurahan terpasang dalam <0,02 dtk, pencocokan sketsa sintetis di Selili ±0,5 dtk dengan galat 0,2–0,4 m.

## v1.1.1 — 2026-11-20
- Log lebih rapi: file data Samarinda yang belum dibuat (404) dicatat sebagai satu peringatan, bukan 6 ERROR berisi halaman HTML.
- Keterangan di langkah 1 menjelaskan apa yang dilakukan selama data tersimpan belum siap.

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
