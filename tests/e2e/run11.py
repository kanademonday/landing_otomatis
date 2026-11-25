"""Uji tombol Baca saja dan Batal pada Digitasi otomatis (Groq tiruan dengan jeda)."""
"""Uji v2.6: baca otomatis dengan AI (Groq tiruan): baca berkas, isi formulir, telusuri gambar, batas pemakaian (429), terbilang."""
import asyncio, os, json, math
from playwright.async_api import async_playwright
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)) + '/'
exec(open(H + 'run3.py').read().split('\nasync def main')[0])
PDFJS = '/opt/npm-tools/node_modules/pdfjs-dist/build/'
async def main():
  sk = json.load(open(D + 'sketch.json'))
  pdfdir = D + 'pdf/'; os.makedirs(pdfdir, exist_ok=True)
  Image.open(D + 'sketch.png').convert('RGB').save(pdfdir + 'SU_16010801_00009_2001.pdf', resolution=150)
  W, Hh = sk['W'], sk['H']
  norm = lambda p: [round(p[0] / W * 1000, 1), round(p[1] / Hh * 1000, 1)]
  jawab_gambar = {'bidang': [norm(p) for p in sk['parcel']], 'jalan': [{'nama': r['name'] or None, 'titik': [norm(p) for p in r['pts']]} for r in sk['roads']],
                  'panah_utara': {'pangkal': [900, 600], 'ujung': [900, 300]}, 'skala': None}
  jawab_baca = {'jenis_halaman': 'gambar_bidang', 'desa_kelurahan': 'Temindung Permai', 'kecamatan': 'Sungai Pinang', 'jalan': ['Jalan Pahlawan'], 'luas_angka': 500,
                'luas_terbilang': 'lima ratus meter persegi', 'skala': None, 'nomor_surat_ukur': '00009/2001', 'tahun': '2001', 'nib': None, 'nomor_hak': None, 'ukuran_sisi_m': [25, 20, 25, 20], 'keterbacaan': 'baik'}
  calls = {'n': 0, 'tunda': 0}
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
      u = r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK2, content_type='application/javascript')
      elif 'pdfjs-dist' in u: await r.fulfill(path=PDFJS + u.split('/build/')[1], content_type='text/javascript')
      elif 'api.groq.com' in u:
        hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
        if r.request.method == 'OPTIONS': await r.fulfill(status=204, headers=hdr); return
        calls['n'] += 1
        if calls['tunda']: await asyncio.sleep(calls['tunda'])
        txt = json.loads(r.request.post_data)['messages'][0]['content'][0]['text']
        ans = jawab_gambar if 'gambar situasi bidang tanah dari surat ukur' in txt else ({'bidang': []} if 'potongan gambar' in txt else jawab_baca)
        try: await r.fulfill(body=json.dumps({'choices': [{'message': {'content': json.dumps(ans)}}]}), content_type='application/json', headers=hdr)
        except Exception: pass
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    await pg.evaluate("localStorage.removeItem('plotkw.kode'); localStorage.removeItem('plotkw.baca'); KODE_KEL['16010801']=['Sungai Pinang','Temindung Permai']")
    await pg.click('[data-step="2"]'); await pg.evaluate("document.getElementById('aiSet').open=true")
    await pg.fill('#inAiKey', 'gsk_uji'); await pg.dispatch_event('#inAiKey', 'change')
    await pg.set_input_files('#fileImg', pdfdir + 'SU_16010801_00009_2001.pdf')
    await pg.wait_for_function("DOCS.list.length===1 && S.osm!==null", timeout=30000)
    print('tombol di kartu SU:', await pg.evaluate("[...document.querySelectorAll('#docList .doc-h button')].map(b=>b.textContent)"))
    # 1) Baca saja
    n0 = calls['n']
    await pg.click('[data-bacasaja]')
    await pg.wait_for_function("!PROSES.jalan && S.img && /hal/.test(S.img.name)", timeout=60000); await pg.wait_for_timeout(300)
    print('Baca saja selesai: bilah proses TIDAK terlihat di layar', await pg.evaluate("getComputedStyle($('prosesBar')).display==='none'"))
    print('Baca saja: luas', await pg.evaluate("$('inLuas').value"), '| skala', await pg.evaluate("$('inSkala').value"), '| gambar', await pg.evaluate("S.img.name"), '| langkah', await pg.evaluate("STEP"),
          '| jalan/bidang ditelusuri AI:', await pg.evaluate("S.roads.length+'/'+(S.parcel?1:0)"), '| panggilan AI', calls['n'] - n0, '| alat', await pg.evaluate("SK.tool"))
    # 2) Digitasi otomatis lalu Batal saat AI sedang bekerja
    await pg.evaluate("bidangBaru(true); AI.hasil={}; for (const k in CACHE_BACA) delete CACHE_BACA[k]; renderDocs()")
    calls['tunda'] = 4; e0 = await pg.evaluate("LOG.errors")
    await pg.click('[data-digit]'); await pg.wait_for_timeout(800)
    print('saat berjalan: bilah proses tampil', await pg.evaluate("!$('prosesBar').hidden"), '|', await pg.inner_text('#prosesTx'), '| tombol kartu', await pg.evaluate("[...document.querySelectorAll('#docList .doc-h button')].map(b=>b.textContent)"))
    await pg.click('#btnBatal')
    await pg.wait_for_function("!PROSES.jalan", timeout=10000); await pg.wait_for_timeout(500)
    print('setelah Batal: proses berhenti', await pg.evaluate("!PROSES.jalan"), '| bilah TIDAK terlihat di layar', await pg.evaluate("getComputedStyle($('prosesBar')).display==='none'"), '| error baru', await pg.evaluate("LOG.errors") - e0,
          '| tombol kembali', await pg.evaluate("[...document.querySelectorAll('#docList .doc-h button')].map(b=>b.textContent)"), '| langkah', await pg.evaluate("STEP"))
    print('log:', [l for l in (await pg.evaluate("LOG.text()")).split(chr(10)) if 'dibatalkan' in l.lower() or 'Batal' in l][-3:])
    # 3) setelah batal, digitasi bisa dijalankan lagi sampai selesai
    calls['tunda'] = 0
    await pg.click('[data-digit]')
    await pg.wait_for_function("STEP===4 && S.cands.length>0 && !PROSES.jalan", timeout=90000)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('digitasi ulang selesai: galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2))
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
