/* ===== FITUR KERJA KW4–6: daftar bidang, bidang tambahan, referensi, cek kewajaran, ekspor AutoCAD ===== */
const SET = { crs: 'tm3-50.2' };
try { const v = localStorage.getItem('plotkw.crs'); if (v && CORE.CRS[v]) SET.crs = v; } catch (e) { /* abaikan */ }
const Q = { items: [], aktif: -1 };          // daftar bidang
const REF = { polys: [] };                    // bidang referensi impor: {ll:[[lat,lon]], label, src}
const STATUS = {
  belum: { t: 'Belum dikerjakan', c: 'st-belum' },
  ditemukan: { t: 'Ditemukan', c: 'st-ok' },
  ragu: { t: 'Ragu-ragu', c: 'st-ragu' },
  lapangan: { t: 'Perlu cek lapangan', c: 'st-lap' },
  tidak: { t: 'Tidak ditemukan', c: 'st-no' }
};
const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- penyimpanan lokal (hanya di browser ini) ---------- */
function simpanQ() {
  try { localStorage.setItem('plotkw.daftar', JSON.stringify(Q)); }
  catch (e) { LOG.warn('Daftar bidang tidak bisa disimpan di browser (penuh/diblokir). Gunakan "Ekspor rekap" secara berkala.', e.message); }
}
function muatQ() {
  try { const v = JSON.parse(localStorage.getItem('plotkw.daftar') || 'null'); if (v && Array.isArray(v.items)) { Q.items = v.items; Q.aktif = v.aktif ?? -1; } }
  catch (e) { LOG.warn('Daftar bidang tersimpan rusak, diabaikan', e.message); }
}

/* ---------- impor daftar bidang (Excel/CSV) ---------- */
function parseCSV(txt) {
  const sep = (txt.split('\n')[0].match(/;/g) || []).length > (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}
function deteksiKolom(header) {
  const h = header.map(x => String(x).toLowerCase().trim());
  const find = (...res) => { for (const re of res) { const i = h.findIndex(x => re.test(x)); if (i >= 0) return i; } return -1; };
  return {
    nib: find(/\bnib\b/, /^nib/),
    hak: find(/(no|nomor)[\s._]*hak/, /^hak$/, /nomor sertip|no[\s._]*sert/),
    su: find(/(no|nomor)[\s._]*(su|gs|surat ukur|gambar situasi)/, /^su$|^gs$/),
    luas: find(/luas.*(bt|buku)/, /^luas$/, /luas/),
    kel: find(/kel(urahan)?|desa/),
    kec: find(/kec(amatan)?/),
    kw: find(/^kw|kualitas/)
  };
}
async function bacaFileTabel(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') return parseCSV(await file.text());
  if (!window.XLSX) throw new Error('Pembaca Excel belum termuat (butuh internet). Simpan daftar sebagai .csv lalu impor lagi.');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}
const imporDaftar = safe('Impor daftar bidang', async file => {
  const rows = await bacaFileTabel(file);
  if (rows.length < 2) throw new Error('File tidak berisi baris data.');
  // cari baris judul: baris pertama yang memuat kata luas/nib/hak
  let hi = rows.findIndex(r => r.some(c => /luas|nib|hak/i.test(String(c))));
  if (hi < 0) hi = 0;
  const header = rows[hi].map(c => String(c).trim()), K = deteksiKolom(header);
  const items = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r.some(c => String(c).trim())) continue;
    const g = i => i >= 0 ? String(r[i] ?? '').trim() : '';
    const info = {}; header.forEach((k, i) => { if (k) info[k] = String(r[i] ?? '').trim(); });
    const luas = parseFloat(g(K.luas).replace(/\./g, '').replace(',', '.'));
    items.push({ id: 'b' + Date.now().toString(36) + items.length, nib: g(K.nib), hak: g(K.hak), su: g(K.su), luas: isFinite(luas) && luas > 0 ? luas : null,
      kel: g(K.kel), kec: g(K.kec), kw: g(K.kw), info, status: 'belum', hasil: null });
  }
  const terdeteksi = Object.entries(K).filter(([, v]) => v >= 0).map(([k]) => k);
  LOG.info(`Daftar bidang diimpor: ${items.length} baris dari "${file.name}"`, { kolom_terdeteksi: terdeteksi, jumlah_kolom: header.length });
  if (K.luas < 0) toast('Kolom luas tidak terdeteksi — isi luas manual saat mengerjakan tiap bidang.', 'warn');
  const lama = Q.items.length;
  // gabung: lewati duplikat berdasarkan NIB/no hak
  const ada = new Set(Q.items.map(x => normKey(x.nib) + '|' + normKey(x.hak)));
  let tambah = 0;
  for (const it of items) { const k = normKey(it.nib) + '|' + normKey(it.hak); if (k !== '|' && ada.has(k)) continue; Q.items.push(it); ada.add(k); tambah++; }
  simpanQ(); renderDaftar();
  toast(`${tambah} bidang ditambahkan ke daftar${lama ? ` (sebelumnya ${lama})` : ''}. Kolom terbaca: ${terdeteksi.join(', ') || '-'}.`, 'ok');
});
function labelItem(it) { return it.nib ? 'NIB ' + it.nib : it.hak ? 'Hak ' + it.hak : it.su ? 'SU ' + it.su : 'Bidang ' + it.id; }
function renderDaftar() {
  const tb = $('listBody'); if (!tb) return;
  const f = $('listFilter').value, qy = normKey($('listSearch').value);
  const cnt = {}; for (const k in STATUS) cnt[k] = 0; for (const it of Q.items) cnt[it.status] = (cnt[it.status] || 0) + 1;
  $('listCount').textContent = Q.items.length ? `${Q.items.length} bidang · ${cnt.ditemukan} ditemukan · ${cnt.ragu + cnt.lapangan} perlu tindak lanjut · ${cnt.belum} belum` : '';
  $('btnDaftarN').textContent = Q.items.length ? `${Q.items.length - cnt.belum}/${Q.items.length}` : '0';
  const rows = Q.items.map((it, i) => ({ it, i })).filter(({ it }) => (f === 'semua' || it.status === f) &&
    (!qy || normKey([it.nib, it.hak, it.su, it.kel, it.kw].join(' ')).includes(qy)));
  tb.innerHTML = rows.length ? rows.map(({ it, i }) => `<tr data-i="${i}" class="${i === Q.aktif ? 'aktif' : ''}">
      <td>${esc(it.nib || '–')}</td><td>${esc(it.hak || '–')}</td><td class="num">${it.luas ? fmt(it.luas, 0) : '–'}</td>
      <td>${esc(it.kel || '–')}</td><td>${esc(it.kw || '–')}</td><td><span class="st ${STATUS[it.status].c}">${STATUS[it.status].t}</span></td></tr>`).join('')
    : `<tr><td colspan="6" class="kosong">${Q.items.length ? 'Tidak ada bidang yang cocok dengan saringan.' : 'Belum ada daftar. Impor file Excel/CSV berisi daftar bidang (kolom NIB, nomor hak, luas, kelurahan, KW).'}</td></tr>`;
  tb.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => pilihItem(+tr.dataset.i));
  updateKop();
}
function cocokkanKelurahan(nama) {
  const n = normKey(String(nama).replace(/^(kel(urahan)?|desa)\.?\s*/i, ''));
  if (!n) return null;
  for (const [kec, kels] of SAMARINDA) for (const k of kels) if (normKey(k) === n) return [kec, k];
  return null;
}
function pilihItem(i) {
  const it = Q.items[i]; if (!it) return;
  bidangBaru(true);
  Q.aktif = i; simpanQ();
  $('inNama').value = labelItem(it);
  if (it.luas) { $('inLuas').value = it.luas; $('inLuasBT').value = it.luas; }
  const kk = cocokkanKelurahan(it.kel);
  if (kk && (kk[0] !== $('inKec').value || kk[1] !== $('inKel').value)) { $('inKec').value = kk[0]; isiKelurahan(); $('inKel').value = kk[1]; pilihDariDaftar(); }
  else if (!kk && it.kel) toast(`Kelurahan "${it.kel}" tidak dikenali — pilih kelurahan secara manual.`, 'warn');
  tutupLaci(); renderDaftar(); renderParcelInfo();
  LOG.info('Mengerjakan bidang dari daftar #' + (i + 1), { kw: it.kw, ada_luas: !!it.luas, kel: it.kel });
  go(S.osm || kk ? 2 : 1);
  toast(`Mengerjakan ${labelItem(it)}. Muat gambar situasi / surat ukur / peta analognya.`, 'ok');
}
function bukaLaci() { $('laci').classList.add('buka'); renderDaftar(); $('listSearch').focus(); }
function tutupLaci() { $('laci').classList.remove('buka'); }
const simpanKeDaftar = safe('Simpan ke daftar', async () => {
  needResult();
  const status = $('inStatus').value, catatan = $('inCatatan').value.trim();
  const ll = finalLL(), cand = S.sel >= 0 ? S.cands[S.sel] : null, r = cand && (cand.rNow || cand.r);
  const hasil = { ll, luas: +geoArea(ll).toFixed(2), skor: r ? +r.score.toFixed(3) : null, ovl: r && r.ovl ? +r.ovl.toFixed(3) : 0,
    metode: cand ? cand.label : '-', catatan, waktu: new Date().toISOString(), kel: kelLabel(), kec: $('inKec').value, luasInput: getLuas() };
  let it = Q.items[Q.aktif];
  if (!it) { // bidang di luar daftar: tambahkan
    it = { id: 'b' + Date.now().toString(36), nib: '', hak: '', su: '', luas: getLuas(), kel: kelLabel(), kec: $('inKec').value, kw: '', info: { nama: $('inNama').value.trim() }, status: 'belum', hasil: null };
    if ($('inNama').value.trim()) it.nib = $('inNama').value.trim().replace(/^NIB\s*/i, '');
    Q.items.push(it); Q.aktif = Q.items.length - 1;
  }
  it.status = status; it.hasil = hasil;
  // bidang tambahan (peta analog) yang labelnya cocok dengan NIB / no hak di daftar
  let ikut = 0;
  for (const ex of S.extra) {
    const k = normKey(ex.label); if (!k) continue;
    const tgt = Q.items.find(x => x !== it && (normKey(x.nib) === k || normKey(x.hak) === k || normKey(labelItem(x)) === k));
    if (!tgt) continue;
    const exLL = toLL(ex.pts.map(p => CORE.fwdT(S.T, p[0], -p[1])));
    tgt.status = status === 'ditemukan' ? 'ditemukan' : status; tgt.hasil = { ...hasil, ll: exLL, luas: +geoArea(exLL).toFixed(2), metode: 'peta analog bersama ' + labelItem(it), catatan: 'Dari bidang tambahan pada gambar yang sama' };
    ikut++;
  }
  simpanQ(); renderDaftar();
  LOG.info(`Hasil disimpan ke daftar (#${Q.aktif + 1}, status ${status})` + (ikut ? `, ${ikut} bidang tambahan ikut tersimpan` : ''));
  toast(`Tersimpan sebagai "${STATUS[status].t}"${ikut ? ` (+${ikut} bidang dari peta yang sama)` : ''}.`, 'ok');
  const next = Q.items.findIndex((x, j) => j > Q.aktif && x.status === 'belum');
  $('btnLanjut').hidden = next < 0; $('btnLanjut').dataset.i = next;
});
function hapusDaftar() {
  if ($('btnListClear').dataset.arm !== '1') { $('btnListClear').dataset.arm = '1'; $('btnListClear').textContent = 'Klik lagi untuk menghapus semua'; setTimeout(() => { $('btnListClear').dataset.arm = ''; $('btnListClear').textContent = 'Kosongkan daftar'; }, 3000); return; }
  Q.items = []; Q.aktif = -1; simpanQ(); renderDaftar(); $('btnListClear').dataset.arm = ''; $('btnListClear').textContent = 'Kosongkan daftar';
  LOG.info('Daftar bidang dikosongkan');
}

/* ---------- rekap & gabungan ---------- */
function rekapBaris() {
  return Q.items.map((it, i) => {
    const h = it.hasil, c = h && h.ll.length ? CORE.centroid(h.ll) : null;
    const xy = c ? CORE.crsFwd(SET.crs, c[0], c[1]) : null;
    const selisih = h && it.luas ? ((h.luas / it.luas - 1) * 100) : null;
    return {
      No: i + 1, NIB: it.nib, 'No Hak': it.hak, 'No SU': it.su, KW: it.kw, Kelurahan: it.kel || (h && h.kel) || '', 'Luas data (m2)': it.luas ?? '',
      Status: STATUS[it.status].t, 'Luas poligon (m2)': h ? h.luas : '', 'Selisih luas (%)': selisih == null ? '' : +selisih.toFixed(1),
      'Skor kecocokan': h && h.skor != null ? h.skor : '', 'Tumpang tindih (%)': h && h.ovl ? +(h.ovl * 100).toFixed(0) : '',
      'Lintang pusat': c ? +c[0].toFixed(7) : '', 'Bujur pusat': c ? +c[1].toFixed(7) : '',
      [`X pusat (${SET.crs})`]: xy ? +xy[0].toFixed(2) : '', [`Y pusat (${SET.crs})`]: xy ? +xy[1].toFixed(2) : '',
      Metode: h ? h.metode : '', Catatan: h ? h.catatan : '', Waktu: h ? h.waktu : '',
      'Poligon WKT (lon lat)': h ? 'POLYGON((' + h.ll.concat([h.ll[0]]).map(p => p[1].toFixed(8) + ' ' + p[0].toFixed(8)).join(', ') + '))' : ''
    };
  });
}
const ekspRekap = safe('Ekspor rekap', async (format) => {
  if (!Q.items.length) throw new Error('Daftar bidang masih kosong.');
  const rows = rekapBaris(), nm = 'rekap_plotting_' + new Date().toISOString().slice(0, 10);
  if (format === 'xlsx' && window.XLSX) {
    const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nm + '.xlsx');
  } else {
    const keys = Object.keys(rows[0]), q = v => /[",;\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    download(new Blob(['﻿' + [keys.join(';')].concat(rows.map(r => keys.map(k => q(r[k])).join(';'))).join('\r\n')], { type: 'text/csv' }), nm + '.csv');
  }
});
function itemSelesai() { return Q.items.filter(it => it.hasil && it.hasil.ll && it.hasil.ll.length >= 3); }
const ekspGabunganKML = safe('Ekspor gabungan KML', async () => {
  const L0 = itemSelesai(); if (!L0.length) throw new Error('Belum ada bidang di daftar yang punya hasil.');
  const warna = { ditemukan: 'ff00c000', ragu: 'ff00a5ff', lapangan: 'ff0000ff', tidak: 'ff808080', belum: 'ffffffff' };
  const pm = L0.map(it => {
    const ring = it.hasil.ll.concat([it.hasil.ll[0]]).map(p => `${p[1].toFixed(8)},${p[0].toFixed(8)},0`).join(' ');
    return `<Placemark><name>${xmlEsc(labelItem(it))}</name><description><![CDATA[Status: ${STATUS[it.status].t}\nKW: ${it.kw || '-'}\nLuas data: ${it.luas ?? '-'} m²\nLuas poligon: ${it.hasil.luas} m²\nCatatan: ${it.hasil.catatan || '-'}]]></description>
<Style><LineStyle><color>${warna[it.status] || 'ffffffff'}</color><width>2.5</width></LineStyle><PolyStyle><color>33ffffff</color></PolyStyle></Style>
<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
  }).join('\n');
  const k = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Rekap plotting ${new Date().toLocaleDateString('id-ID')}</name>\n${pm}\n</Document></kml>`;
  download(new Blob([k], { type: 'application/vnd.google-earth.kml+xml' }), 'gabungan_bidang_' + new Date().toISOString().slice(0, 10) + '.kml');
});
const ekspGabunganDXF = safe('Ekspor gabungan DXF', async () => {
  const L0 = itemSelesai(); if (!L0.length) throw new Error('Belum ada bidang di daftar yang punya hasil.');
  const items = [], texts = [];
  for (const it of L0) {
    const xy = it.hasil.ll.map(p => CORE.crsFwd(SET.crs, p[0], p[1]));
    const lay = 'BIDANG_' + it.status.toUpperCase();
    items.push({ layer: lay, pts: xy, closed: true });
    texts.push({ layer: 'LABEL', at: CORE.centroid(xy), h: 1.5, text: labelItem(it) + ' L=' + it.hasil.luas });
  }
  const layers = [{ name: 'BIDANG_DITEMUKAN', color: 3 }, { name: 'BIDANG_RAGU', color: 30 }, { name: 'BIDANG_LAPANGAN', color: 1 }, { name: 'BIDANG_TIDAK', color: 8 }, { name: 'BIDANG_BELUM', color: 7 }, { name: 'LABEL', color: 7 }];
  download(new Blob([CORE.dxfR12(layers, items, texts)], { type: 'application/dxf' }), `gabungan_bidang_${SET.crs}_${new Date().toISOString().slice(0, 10)}.dxf`);
  toast(`DXF ${CORE.CRS[SET.crs].nama} diunduh — buka di AutoCAD.`, 'ok');
});

/* ---------- ekspor AutoCAD bidang aktif ---------- */
function cornersCRS() { // sudut gambar → koordinat CRS
  return [[0, 0], [S.img.w, 0], [S.img.w, S.img.h], [0, S.img.h]].map(p => { const w = CORE.fwdT(S.T, p[0], -p[1]); const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
}
const ekspDXF = safe('Ekspor DXF', async () => {
  needResult();
  const toXY = pts => pts.map(w => { const ll = PROJ.inv(w[0], w[1]); return CORE.crsFwd(SET.crs, ll[0], ll[1]); });
  const fin = toXY(parcelWorld(S.T, $('inForce').checked));
  const items = [{ layer: 'BIDANG', pts: fin, closed: true }], texts = [];
  const nama = $('inNama').value.trim() || 'Bidang';
  texts.push({ layer: 'LABEL', at: CORE.centroid(fin), h: 1.5, text: nama + ' L=' + geoArea(finalLL()).toFixed(1) });
  fin.forEach((p, i) => texts.push({ layer: 'NOMOR_TITIK', at: p, h: 0.8, text: String(i + 1) }));
  for (const ex of S.extra) {
    const xy = toXY(ex.pts.map(p => CORE.fwdT(S.T, p[0], -p[1])));
    items.push({ layer: 'BIDANG_TAMBAHAN', pts: xy, closed: true });
    if (ex.label) texts.push({ layer: 'LABEL', at: CORE.centroid(xy), h: 1.2, text: ex.label });
  }
  for (const rd of S.roads) items.push({ layer: 'JALAN_SKETSA', pts: toXY(rd.pts.map(p => CORE.fwdT(S.T, p[0], -p[1]))), closed: false });
  items.push({ layer: 'BINGKAI_GAMBAR', pts: cornersCRS(), closed: true });
  const layers = [{ name: 'BIDANG', color: 1 }, { name: 'BIDANG_TAMBAHAN', color: 30 }, { name: 'JALAN_SKETSA', color: 5 }, { name: 'BINGKAI_GAMBAR', color: 8 }, { name: 'LABEL', color: 7 }, { name: 'NOMOR_TITIK', color: 2 }];
  download(new Blob([CORE.dxfR12(layers, items, texts)], { type: 'application/dxf' }), `${baseName()}_${SET.crs}.dxf`);
  toast(`DXF (${CORE.CRS[SET.crs].nama}) diunduh. Layer BINGKAI_GAMBAR = posisi gambar sketsa untuk ALIGN.`, 'ok');
});
const ekspWorld = safe('Ekspor gambar ber-koordinat', async () => {
  needResult();
  const m = S.img.dataURL.match(/^data:image\/(\w+);base64,(.*)$/); if (!m) throw new Error('Format gambar tidak dikenali.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1], wext = { jpg: 'jgw', png: 'pgw', gif: 'gfw', bmp: 'bpw', webp: 'wld' }[ext] || 'wld';
  const c = cornersCRS(); // UL, UR, LR, LL dalam CRS
  const A = (c[1][0] - c[0][0]) / S.img.w, D = (c[1][1] - c[0][1]) / S.img.w, B = (c[3][0] - c[0][0]) / S.img.h, E = (c[3][1] - c[0][1]) / S.img.h;
  const C = c[0][0] + A * 0.5 + B * 0.5, F = c[0][1] + D * 0.5 + E * 0.5;
  const wld = [A, D, B, E, C, F].map(v => v.toFixed(10)).join('\r\n') + '\r\n';
  const info = `Gambar ber-koordinat\r\nSistem koordinat: ${CORE.CRS[SET.crs].nama}\r\nFile world: ${baseName()}.${wext}\r\n\r\n` +
    `AutoCAD Map 3D / Civil 3D: MAPIINSERT -> pilih gambar (world file terbaca otomatis).\r\n` +
    `AutoCAD biasa: IMAGEATTACH gambar, lalu ALIGN 2 sudut gambar ke sudut layer BINGKAI_GAMBAR dari file DXF (pilih Yes untuk skala).\r\n` +
    `Sudut gambar (X;Y):\r\nkiri-atas ${c[0][0].toFixed(3)};${c[0][1].toFixed(3)}\r\nkanan-atas ${c[1][0].toFixed(3)};${c[1][1].toFixed(3)}\r\nkanan-bawah ${c[2][0].toFixed(3)};${c[2][1].toFixed(3)}\r\nkiri-bawah ${c[3][0].toFixed(3)};${c[3][1].toFixed(3)}\r\n`;
  if (window.JSZip) {
    const z = new JSZip(); z.file(baseName() + '.' + ext, m[2], { base64: true }); z.file(baseName() + '.' + wext, wld); z.file('BACA_SAYA.txt', info);
    download(await z.generateAsync({ type: 'blob' }), baseName() + '_georef.zip');
  } else { download(new Blob([wld], { type: 'text/plain' }), baseName() + '.' + wext); download(new Blob([info], { type: 'text/plain' }), baseName() + '_BACA_SAYA.txt'); }
  toast('Gambar + world file diunduh (zip). Lihat BACA_SAYA.txt untuk cara memasang di AutoCAD.', 'ok');
});

/* ---------- bidang referensi (sudah diplot) ---------- */
const imporReferensi = safe('Impor bidang referensi', async file => {
  const ext = file.name.toLowerCase().split('.').pop(), txt = await file.text();
  let polys = [];
  if (ext === 'dxf') {
    const crs = $('inRefCrs').value;
    polys = CORE.dxfPolylines(txt).filter(p => p.closed || (p.pts.length >= 4 && Math.hypot(p.pts[0][0] - p.pts.at(-1)[0], p.pts[0][1] - p.pts.at(-1)[1]) < 0.01))
      .map(p => ({ ll: p.pts.map(q => CORE.crsInv(crs, q[0], q[1])), label: p.layer, src: file.name }));
    const c = polys[0] && CORE.centroid(polys[0].ll);
    if (c && (c[0] < -2 || c[0] > 1 || c[1] < 115 || c[1] > 119)) throw new Error(`Koordinat DXF tidak jatuh di Samarinda dengan ${CORE.CRS[crs].nama}. Coba pilih sistem koordinat lain.`);
  } else if (ext === 'kml') {
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    for (const pm of doc.getElementsByTagName('Placemark')) {
      const nm = pm.getElementsByTagName('name')[0]?.textContent || '';
      for (const ob of pm.getElementsByTagName('outerBoundaryIs')) {
        const co = ob.getElementsByTagName('coordinates')[0]; if (!co) continue;
        const ll = co.textContent.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && isFinite(a[0])).map(a => [a[1], a[0]]);
        if (ll.length >= 3) polys.push({ ll, label: nm, src: file.name });
      }
    }
  } else {
    const J = JSON.parse(txt);
    for (const f of J.features || [J]) {
      const g = f.geometry || f, nm = (f.properties && (f.properties.NIB || f.properties.nib || f.properties.name || f.properties.nama)) || '';
      const ps = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const p of ps) polys.push({ ll: p[0].map(c => [c[1], c[0]]), label: String(nm), src: file.name });
    }
  }
  polys = polys.map(p => { if (p.ll.length > 3 && p.ll[0][0] === p.ll.at(-1)[0] && p.ll[0][1] === p.ll.at(-1)[1]) p.ll.pop(); return p; }).filter(p => p.ll.length >= 3);
  if (!polys.length) throw new Error('Tidak ada poligon tertutup di file. Untuk DXF, pastikan batas bidang berupa polyline tertutup (closed).');
  REF.polys.push(...polys); CTX = null;
  drawReferensi(); renderRefInfo();
  LOG.info(`Bidang referensi diimpor: ${polys.length} poligon dari ${ext.toUpperCase()}`);
  toast(`${polys.length} bidang referensi dimuat (hanya di browser ini).`, 'ok');
});
function renderRefInfo() {
  const n = REF.polys.length, s = itemSelesai().length;
  $('refInfo').textContent = (n ? `${n} bidang referensi dari file` : 'Belum ada file referensi') + (s ? ` · ${s} bidang hasil dari daftar` : '') + '.';
}
function drawReferensi() {
  if (!map) return; G.ref.clearLayers();
  for (const p of REF.polys) L.polygon(p.ll, { color: '#7a4c9e', weight: 1.5, fillOpacity: 0.08, dashArray: '4 3', interactive: !!p.label }).bindTooltip(p.label || 'referensi').addTo(G.ref);
  Q.items.forEach((it, i) => { if (i !== Q.aktif && it.hasil && it.hasil.ll) L.polygon(it.hasil.ll, { color: '#2f7d4f', weight: 1.5, fillOpacity: 0.12 }).bindTooltip(labelItem(it) + ' — ' + STATUS[it.status].t).addTo(G.ref); });
}
function refXY() {
  if (!PROJ) return [];
  const L0 = REF.polys.map(p => p.ll);
  Q.items.forEach((it, i) => { if (i !== Q.aktif && it.hasil && it.hasil.ll) L0.push(it.hasil.ll); });
  const b = S.wil ? wilBBox() : null;
  return L0.filter(ll => !b || ll.some(p => p[0] > b.s - 0.01 && p[0] < b.n + 0.01 && p[1] > b.w - 0.01 && p[1] < b.e + 0.01)).map(ll => ll.map(p => PROJ.fwd(p[0], p[1])));
}

/* ---------- cek kewajaran data ---------- */
function cekKewajaran(r) {
  const out = [], lin = getLuas(), lbt = parseFloat($('inLuasBT').value) || null, ll = finalLL(), lpg = geoArea(ll);
  const raw = CORE.polyArea(parcelWorld(S.T, false));
  const tanda = (lvl, t) => out.push(`<li class="qc-${lvl}">${t}</li>`);
  if (lbt && lin) { const d = (lin / lbt - 1) * 100; Math.abs(d) > 5 ? tanda('warn', `Luas surat ukur/input (${fmt(lin, 0)} m²) berbeda ${fmt(d, 1)}% dari luas daftar/buku tanah (${fmt(lbt, 0)} m²). Periksa dokumen mana yang benar.`) : tanda('ok', `Luas input sesuai luas daftar/buku tanah (selisih ${fmt(d, 1)}%).`); }
  if (lin) { const d = (raw / lin - 1) * 100; Math.abs(d) > 10 ? tanda('warn', `Bentuk sketsa × skala hasil cocok memberi luas ${fmt(raw, 0)} m² (selisih ${fmt(d, 1)}%). Sketsa mungkin tidak berskala atau luas tidak sesuai.`) : tanda('ok', `Luas dari skala hasil cocok konsisten (selisih ${fmt(d, 1)}%).`); }
  if (r) {
    if (r.ovl > 0.05) tanda('bad', `Poligon menumpuk ${fmt(r.ovl * 100, 0)}% dengan bidang yang sudah diplot. Geser atau tinjau ulang.`);
    else if (CTX && CTX.ref && CTX.ref.length) tanda('ok', 'Tidak menumpuk dengan bidang referensi/yang sudah diplot.');
    if (r.score < 0.65) tanda('bad', 'Skor kecocokan jalan rendah — posisi belum meyakinkan.');
    else if (r.score < 0.8) tanda('warn', 'Skor kecocokan sedang — bandingkan dengan citra satelit sebelum disimpan.');
    const c = S.cands; if (c.length > 1 && c[0].r && c[1].r && c[0].r.score - c[1].r.score < 0.06) tanda('warn', 'Ada kandidat lain dengan skor hampir sama — posisi bisa tertukar.');
  }
  if (!out.length) tanda('info', 'Isi luas daftar/buku tanah untuk pemeriksaan tambahan.');
  return `<ul class="qc">${out.join('')}</ul>`;
}

/* ---------- kop gambar (title block) ---------- */
function updateKop() {
  const k = $('kop'); if (!k) return;
  const it = Q.items[Q.aktif];
  const cand = S.sel >= 0 ? S.cands[S.sel] : null, r = cand && (cand.rNow || cand.r);
  const luasHasil = S.T && S.parcel && PROJ ? geoArea(finalLL()) : null;
  const st = it ? STATUS[it.status] : null;
  k.querySelector('[data-k=bidang]').textContent = $('inNama').value.trim() || (it ? labelItem(it) : 'Bidang belum dipilih');
  k.querySelector('[data-k=wil]').textContent = $('inKel').value ? kelLabel() + (S.wil ? '' : ' (belum dimuat)') : 'Pilih kelurahan';
  k.querySelector('[data-k=kw]').textContent = it && it.kw ? 'KW ' + String(it.kw).replace(/^kw\s*/i, '') : '–';
  k.querySelector('[data-k=luas]').textContent = getLuas() ? fmt(getLuas(), 0) + ' m²' : '–';
  k.querySelector('[data-k=hasil]').textContent = luasHasil ? fmt(luasHasil, 1) + ' m²' : '–';
  k.querySelector('[data-k=skor]').textContent = r ? (r.score * 100).toFixed(0) + '%' : '–';
  const se = k.querySelector('[data-k=status]'); se.textContent = st ? st.t : 'Di luar daftar'; se.className = 'st ' + (st ? st.c : 'st-belum');
  k.querySelector('[data-k=crs]').textContent = CORE.CRS[SET.crs].nama.split(' (')[0];
}

/* ---------- daftar bidang tambahan pada gambar (peta analog) ---------- */
function renderExtraList() {
  const el = $('extraList'); if (!el) return;
  if (!S.extra.length) { el.innerHTML = '<p class="hint">Untuk peta analog berisi banyak bidang: gambar bidang lain dengan alat <b>Bidang lain</b> dan beri label NIB / nomor hak. Setelah dicocokkan, semuanya ikut mendapat koordinat.</p>'; return; }
  el.innerHTML = '';
  S.extra.forEach((ex, i) => {
    const d = document.createElement('div'); d.className = 'item row';
    d.innerHTML = `<span class="nf swatch-or"></span><input type="text" placeholder="label (NIB / no hak)" value="${esc(ex.label || '')}"><span class="nf hint">${ex.pts.length} titik</span><button class="nf dan" title="Hapus bidang ini" aria-label="Hapus">✕</button>`;
    d.querySelector('input').oninput = e => { ex.label = e.target.value; skDraw(); };
    d.querySelector('button').onclick = () => { S.extra.splice(i, 1); onSketchChanged(); };
    el.appendChild(d);
  });
}
