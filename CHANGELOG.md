# Catatan Perubahan

Versi terbaru di atas. Nomor versi juga tampil di samping judul aplikasi (klik untuk membuka halaman ini).

## v2.14.1 — 2026-11-25
- Perbaikan: bilah proses di kiri bawah tidak hilang setelah *Baca saja* / *Digitasi otomatis* selesai (gaya tampilan menimpa atribut tersembunyi). Semua elemen bertanda tersembunyi kini pasti tidak tampil; tombol di bilah juga bisa menutupnya bila tidak ada proses.

## v2.14.0 — 2026-11-25 — Tombol Batal dan Baca saja
- **Batal**: selama *Digitasi otomatis* berjalan muncul bilah proses di kiri bawah dan tombol *Batal* di kartu berkas. Permintaan ke AI langsung dihentikan; isian yang sudah terbaca tetap disimpan; tidak dicatat sebagai error.
- **Baca saja** (kartu berkas SU): AI hanya membaca isian (luas, skala, kelurahan), lalu halaman gambar dibuka di langkah 2 dengan alat *Jalan* aktif. Jalan dan bidang digambar sendiri, lalu *Cocokkan*. Lebih cepat (tanpa penelusuran AI dan tanpa pencocokan otomatis); bila berkas sudah pernah dibaca, langsung tanpa memanggil AI.

## v2.13.0 — 2026-11-25 — Data persil (DXF) untuk mencari bidang
- **Muat file persil (.dxf)** di langkah 1 (boleh beberapa file, mis. satu per kelurahan). Poligon bidang dan label NIB, nomor hak, SU, dan luas dibaca otomatis; sistem koordinat dikenali (TM-3 50.2/50.1, UTM 50S). Data hanya diproses dan disimpan di browser (IndexedDB), tidak dikirim ke mana pun. Bidang persil tampil di peta; klik untuk melihat NIB/hak/SU/luas.
- **SU yang sudah ada di persil langsung ketemu**: muncul kotak "SU ini sudah ada di data persil" dengan *Lihat di peta* dan *Salin bidang persil ke AutoCAD* (koordinat persis dari persil).
- **Area pencarian dari SU bernomor berdekatan** (kode & tahun sama, 3 nomor terdekat): lingkaran 60 m di sekitar masing-masing.
- **Bidang tidak boleh menimpa bidang persil**, dan kandidat yang **sisinya menempel** bidang tetangga diutamakan (skor + 0,2 × porsi sisi menempel). Label: "keyakinan tinggi" hanya bila ≥50% sisi menempel, kandidat kedua <30%, dan skor ≥0,8.
- Memuat data persil otomatis menyalakan *Mode pola jalan*. Mode pola mati = hasil identik v2.11.0 (diuji 480/480).
- Kode wilayah Samarinda Ilir lengkap: 16010401 Selili, 02 Sungai Dama, 03 Sidomulyo, 04 Sidodamai, 05 Pelita.
- Hasil uji (bidang persil yang sudah berlokasi diperlakukan seolah belum dilanding, gaya SU asli satu jalan): kelurahan uji akhir Sidomulyo (tidak dipakai menyetel) — ketemu #1 **28% → 58%**, label "keyakinan tinggi" **19/20 benar**. 15 SU nyata Sidomulyo 1998: #1 benar (≤25 m) 0 → 2, satu-satunya "keyakinan tinggi" benar.

## v2.12.1 — 2026-11-23
- Bila kunci API Groq belum diisi di browser yang dipakai, *Digitasi otomatis* tidak lagi berakhir dengan error: pengaturan AI langsung dibuka dan kotak kunci disorot, dengan petunjuk untuk menempel kunci lalu mengulang.

## v2.12.0 — 2026-11-23 — Mode pola jalan (eksperimen, bawaan mati)
- Kotak centang baru **"Mode pola jalan (eksperimen)"** di Pengaturan lanjutan langkah 3. Bila tidak dicentang, aplikasi bekerja persis seperti v2.11.0 (core.js tidak diubah; diuji identik).
- **Perkiraan lokasi:** pencarian dipersempit ke lingkaran di sekitar *titik perkiraan* (tengah peta, mis. dari peta analog) atau ke sekitar **SU bernomor berdekatan yang sudah ketemu** (3 nomor terdekat, radius ≥150 m). Kandidat yang pusat bidangnya di luar lingkaran dibuang.
- **Daftar SU yang sudah ketemu:** tempel daftar dari AutoCAD (`X = … Y = … su.02743` atau `nomor,X,Y`), tombol *Tandai SU ini sudah ketemu* di langkah 4, unduh CSV. Disimpan di browser per kelurahan. Nomor SU terisi otomatis dari nama file.
- **Label jujur:** gambar tanpa simpang dengan ≤2 jalan tidak pernah berlabel "keyakinan tinggi" ("perlu verifikasi: gambar minim"); beberapa lokasi berskor serupa → "ambigu: N lokasi serupa".
- Kode 16010403 dikenali sebagai Kel. Sidomulyo.
- Benchmark offline baru di `tests/benchmark/` (lihat README di sana). Hasil pada 15 SU nyata Sidomulyo: tanpa mode pola 0/15 kandidat benar (≤25 m) di 6 besar, kandidat 500–1.300 m dari lokasi; dengan mode pola + SU tetangga 4/15 di 6 besar, kandidat 20–290 m; label "keyakinan tinggi" yang salah: 0.

## v2.11.0 — 2026-11-20 — Jalan sketsa lebih utuh, posisi tak mungkin ditolak
- Tulisan nama jalan tidak lagi dianggap garis tepi jalan (garis tepi harus menerus panjang; huruf hanya potongan pendek). Bila AI memberi posisi tulisan nama, dipilih pasangan tepi bersebelahan yang mengapit tulisan itu.
- Garis jalan AI yang hampir lurus disederhanakan (belokan kecil = derau), lalu **ujungnya diperpanjang** selama kedua tepi jalan masih tergambar; di simpang, satu tepi boleh terbuka sebentar.
- Pemotongan jalan yang kebablasan kini memeriksa gambar: di simpang, yang dipotong hanya jalan yang lanjutannya tidak tergambar (mis. Jl. Syafi'i dipotong di Jl. Sultan Alimuddin, bukan sebaliknya).
- Pencocokan menolak posisi di mana jalan nyata menembus bagian tengah bidang (pengurangan skor per titik jalan di dalam bidang).

## v2.10.0 — 2026-11-20 — Jalan hasil AI dirapatkan ke gambar, nama jalan disesuaikan ke peta
- **Garis jalan dirapatkan ke gambar**: tiap ruas jalan dari AI digeser ke garis tengah di antara dua garis tepi jalan yang benar-benar tergambar (garis ganda yang rapat digabung, bagian dalam bidang tanah tidak dianggap jalan). AI kini juga memberi posisi tulisan nama jalan, yang dipakai untuk memilih pasangan tepi yang benar.
- **Ujung jalan yang kebablasan melewati simpang dipotong** (mis. Jl. Syafi'i yang diteruskan AI melewati Jl. Sultan Alimuddin), sehingga bentuk simpang (pertigaan/perempatan) sesuai gambar.
- **Nama jalan hasil baca disesuaikan ke nama di peta wilayah itu** bila ejaannya mirip (mis. "Sultan A. Limakulein" → "Jalan Sultan Alimuddin"); nama yang tidak ada di peta hanya dipakai bentuknya.
- Kandidat yang nama jalannya cocok dengan peta diberi bobot lebih besar.
- Bila luas cocok dengan skala gambar (selisih ≤10%), rentang skala pencocokan dipersempit ke ±10%.

## v2.9.0 — 2026-11-20 — Bidang hasil AI lebih tepat, peta hasil tidak lagi menampilkan seluruh dunia
- Telusur bidang dua tahap: setelah AI menunjuk bidang pada gambar utuh, gambar dipotong dan diperbesar di sekitar bidang, lalu AI diminta menunjuk sudutnya lagi (satu panggilan Groq tambahan, tetap gratis).
- Perapatan ke garis kini menolak garis yang terus melewati sudut (ciri garis jalan), dan jangkauan geser diperkecil, agar bidang tidak "menempel" ke garis jalan.
- Perbaikan: setelah Digitasi otomatis, peta hasil kadang tampil seluruh dunia (peta disesuaikan saat masih tersembunyi). Penyesuaian kini ditunda sampai peta tampil.

## v2.8.1 — 2026-11-20
- Pilihan Claude dihapus dari pengaturan AI (API Claude berbayar terpisah dari langganan claude.ai). Layanan AI kembali ke Groq (gratis) atau Ollama.
- Perbaikan v2.8.0 tetap berlaku untuk Groq/Ollama: bidang dirapatkan ke garis gambar, "Tanah Hak" dsb. tidak dianggap jalan, hasil baca disimpan agar tidak membaca ulang.

## v2.8.0 — 2026-11-20 — Claude, bidang dirapatkan ke garis, hemat token
- Layanan AI baru **Claude** (berbayar, lebih teliti). Model bawaan `claude-haiku-5-5`; `claude-sonnet-5-5` untuk tulisan tangan sulit. Kunci API disimpan terpisah per layanan, hanya di browser.
- Hemat token: semua halaman satu berkas dibaca dalam **satu permintaan**, gambar dibatasi 1568 px, jawaban terstruktur dengan batas panjang, dan **hasil baca disimpan** sehingga membuka berkas yang sama tidak memanggil AI lagi ("Baca ulang" untuk memaksa). Pemakaian token dan perkiraan biaya tampil di pengaturan AI.
- **Bidang hasil AI dirapatkan ke garis gambar**: poligon digeser/diputar/diskalakan sedikit lalu tiap sudut disetel agar sisi-sisinya menempel pada garis yang benar-benar tergambar (memperbaiki bidang yang meleset dari batas sebenarnya).
- Garis bertuliskan "Tanah Hak", "Tanah Negara", dsb. tidak lagi dianggap jalan; petunjuk ke AI dipertegas (sudut bernomor = batas bidang, rumah di dalam bidang bukan batas).
- Untuk Claude, koordinat diminta dalam piksel gambar (lebih tepat daripada skala 0–1000).
- Selisih skala gambar vs luas kini berupa keterangan, bukan peringatan: hasil scan PDF sering tidak seukuran kertas asli, dan luas tetap menjadi acuan.

## v2.7.0 — 2026-11-20 — Digitasi otomatis satu tombol
- Tombol **Digitasi otomatis** pada tiap berkas SU: membaca dokumen dengan AI → mengisi luas & skala → menyiapkan halaman gambar → menelusuri jalan, bidang, dan panah utara → memutar gambar ke utara → mencocokkan dengan peta → membuka langkah Hasil. Tinggal diperiksa lalu *Salin bidang untuk AutoCAD*.
- Bila satu tahap gagal (luas tak terbaca, bidang/jalan tak ditemukan, kelurahan belum dikenal), proses berhenti di tahap itu dengan petunjuk apa yang perlu dilengkapi manual.

## v2.6.1 — 2026-11-20
- Model bawaan Groq kini `qwen/qwen3.8-27b` (`qwen3.6-27b` tidak tersedia di akun baru).
- **Pilih model otomatis**: bila model yang diisi tidak tersedia, *Tes koneksi* (dan saat membaca) otomatis memilih model pembaca gambar yang ada di akun Groq.

## v2.6.0 — 2026-11-20 — Baca otomatis dengan AI (gratis)
- **Baca otomatis** tiap berkas BT/SU (atau *Baca otomatis semua berkas*): AI membaca tiap halaman lalu menampilkan kelurahan, kecamatan, luas (angka & terbilang), skala, jalan, ukuran sisi, nomor SU, tahun, NIB, nomor hak, dan halaman gambar. Hasil **selalu ditampilkan untuk diperiksa**; tombol *Isi ke formulir* mengisi luas/skala/nama jalan (ditandai kuning sebagai hasil AI). Nama orang tidak dibaca.
- **Cek silang otomatis**: luas angka vs luas terbilang, kelurahan terbaca vs kode di nama file.
- **Telusuri gambar otomatis (AI)**: AI mengusulkan garis tengah jalan, sudut bidang, dan panah utara (gambar langsung diputar). Usulan diperbaiki dengan *Ubah titik*; Ctrl+Z membatalkan.
- **Layanan AI gratis**, dua pilihan:
  - **Online: Groq** (bawaan, model `qwen/qwen3.6-27b`; diganti `qwen/qwen3.8-27b` di v2.6.1). Tanpa pemasangan; tiap anggota tim membuat kunci API gratis di console.groq.com. Batas pemakaian gratis per akun; bila penuh, aplikasi menunggu lalu mencoba lagi. Menurut ketentuan Groq, data tidak dipakai untuk melatih AI dan tidak disimpan secara bawaan.
  - **Lokal: Ollama** (model `qwen2.5vl:7b`), berkas tidak keluar dari komputer.
- Kunci API hanya disimpan di browser pengguna dan tidak pernah dicatat di log.

## v2.5.0 — 2026-11-20 — Buka berkas BT / SU (PDF)
- **Buka PDF buku tanah dan surat ukur** (hasil scan) langsung di langkah 2, beberapa sekaligus. Berkas hanya dibaca di browser (pdf.js), tidak diunggah ke mana pun.
- **Nama file dibaca otomatis**: `SU_<kode>_<nomor>_<tahun>.pdf` dan `BT_<kode><jenis><nomor>.pdf`. Kode wilayah (mis. 16010401 = Selili, Samarinda Ilir) langsung memilih kecamatan & kelurahan; nama bidang terisi (mis. "SU 00001/1982"). Kode yang belum dikenal: kecamatan diperkirakan dari kode, kelurahan dipilih sekali lalu **diingat** untuk berkas berikutnya.
- **Pratinjau semua halaman** tiap berkas dan **penampil** (perbesar, halaman berikut/sebelumnya) untuk membaca luas, jalan, dan skala.
- **Pakai halaman sebagai gambar situasi**: halaman gambar SU langsung menjadi gambar kerja (200 dpi), tanpa screenshot.
- **Skala gambar 1:N** (bawaan 500 untuk SU): dengan resolusi scan, aplikasi menghitung ukuran 1 piksel di lapangan dan **membandingkannya dengan skala dari luas**. Selisih > 10% diberi tanda (luas, skala, atau gambar bidang mungkin keliru).

## v2.4.2 — 2026-11-20
- Pilihan arah utara bawaan kini **"Utara di atas, kira-kira (±45°)"** (juga setelah *Bidang baru*). Teks pilihan dipendekkan.

## v2.4.1 — 2026-11-20 — Luas di AutoCAD tepat
- **Perbaikan:** luas di AutoCAD sedikit lebih besar dari luas BT/SU (mis. 444,14 untuk 444 m²) karena faktor skala proyeksi TM-3 (±1,00018 di Samarinda). Penyamaan luas kini dilakukan langsung di koordinat TM-3/UTM yang diekspor, sehingga *Area* di AutoCAD = luas yang diisi (selisih < 0,001 m²).
- Koordinat salinan dan DXF ditulis dengan 4 desimal (0,1 mm).
- Tabel luas di langkah Hasil dan kop gambar menampilkan luas di bidang TM-3 (sama dengan AutoCAD); luas di permukaan bumi tetap ditampilkan sebagai pembanding.

## v2.4.0 — 2026-11-20 — Nama jalan hanya sebagai petunjuk
- Nama jalan pada gambar lama bisa sudah berganti, dan tidak ada catatan kapan. Kini bila nama jalan diisi, aplikasi mencari **dua kali** (bentuk jalan saja, dan dengan nama), menggabungkan kandidatnya, dan **mengurutkan berdasarkan bentuk jalan**. Nama hanya memberi sedikit bobot tambahan.
- Tiap kandidat diberi tanda **nama jalan cocok** / **nama jalan tidak cocok**. Pemeriksaan hasil menjelaskan bila nama tidak cocok (kemungkinan nama sudah berubah) atau bila nama cocok di kandidat lain.
- Uji: nama sengaja dipasang ke jalan yang salah tetap menghasilkan posisi yang benar.

## v2.3.2 — 2026-11-20
- Format AutoCAD LT: tanpa spasi di akhir, sehingga Enter dari pengguna menutup polyline dan tidak mengulang PLINE.
- Petunjuk: Enter cukup satu kali; Enter kedua mengulang perintah terakhir (tekan Esc).

## v2.3.1 — 2026-11-20 — Perbaikan salin ke AutoCAD
- **Perbaikan:** di AutoCAD Map 3D 2021, teks perintah yang ditempel hanya diproses baris pertamanya (`.PLINE`), lalu berhenti di *Specify start point*. Isi salinan kini **satu baris AutoLISP** yang diproses utuh: `(progn (foreach pl '(...) (command "_.PLINE") ...))`. Koordinat WCS dikonversi ke UCS aktif dengan `trans`, dan OSNAP dimatikan per titik dengan `_non`.
- Pilihan **Jenis AutoCAD**: AutoCAD/Map 3D/Civil 3D (AutoLISP, disarankan) atau AutoCAD LT (satu baris perintah biasa).
- Petunjuk diperbarui: Esc dulu, klik *command line*, Ctrl+V, lalu Enter.

## v2.3.0 — 2026-11-20 — Salin langsung ke AutoCAD
- **Salin bidang untuk AutoCAD**: tombol utama di langkah Hasil. Menyalin perintah `PLINE` berkoordinat (TM-3 / UTM) untuk bidang dan bidang lain. Di AutoCAD Map 3D, klik *command line* lalu Ctrl+V dan polyline langsung tergambar di koordinatnya, tanpa file.
- Unduh DXF tetap tersedia sebagai alternatif (buka/INSERT di AutoCAD, lalu *Save As* DWG).
- **Dihapus**: bagian *Geser halus* (geser/putar/skala, geser bidang saja, sejajarkan dengan jalan). Penyesuaian kecil dilakukan langsung di AutoCAD.

## v2.2.0 — 2026-11-20 — Arah utara & gambar tulisan tangan
- **Kecamatan dan kelurahan** dipilih di halaman langkah 1 (tidak lagi di bilah atas).
- **Putar gambar agar utara menghadap ke atas**: alat *Panah utara* (klik pangkal lalu ujung panah, gambar diputar otomatis) dan tombol putar ±90°, ±5°, ±1°. Garis yang sudah ditelusuri ikut berputar, tanpa pergeseran.
- **Keyakinan arah utara**: *tidak dipakai* (cari ke segala arah), *kira-kira* (±45°), atau *yakin* (±15°). Bila hasil cocok harus memutar gambar lebih dari 8° dari utaranya, muncul peringatan bahwa panah utara di gambar mungkin keliru. Tiap kandidat menampilkan putarannya dari arah atas gambar.
- *(Dihapus di v2.3.0)* **Bidang lebih miring dari aslinya**: di langkah Hasil, pilih *Geser bidang saja* untuk menggeser/memutar bidang tanpa ikut menggeser jalan, atau tombol **Sejajarkan bidang dengan jalan** (memutar bidang agar sisi terdekat sejajar jalan, bila selisihnya ≤ 25°). *Kembalikan bidang* membatalkannya.

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
