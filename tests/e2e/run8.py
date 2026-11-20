"""Uji v2.9: AI meleset jauh pada tahap 1 → tahap 2 (potongan) + rapatkan; peta tidak memperkecil ke seluruh dunia.
Uji v2.6: baca otomatis dengan AI (Groq tiruan): baca berkas, isi formulir, telusuri gambar, batas pemakaian (429), terbilang."""
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
  calls = {'n': 0}
  sisi = math.sqrt(abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(sk['parcel'], sk['parcel'][1:]+sk['parcel'][:1]))/2))
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
        txt = json.loads(r.request.post_data)['messages'][0]['content'][0]['text']
        if 'gambar situasi bidang tanah dari surat ukur' in txt:
          g = 0.6 * sisi  # tahap 1 meleset jauh (60% ukuran bidang)
          ans = dict(jawab_gambar, bidang=[norm([x - g, y - 0.5 * g]) for x, y in sk['parcel']])
        elif 'potongan gambar situasi' in txt:
          ans = {'bidang': '__POTONG__'}
        else: ans = jawab_baca
        await r.fulfill(body=json.dumps({'choices': [{'message': {'content': json.dumps(ans)}}]}), content_type='application/json', headers=hdr)
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    await pg.evaluate("localStorage.removeItem('plotkw.kode'); localStorage.removeItem('plotkw.baca'); KODE_KEL['16010801']=['Sungai Pinang','Temindung Permai']")
    # jawaban tahap 2 dibuat di halaman: sudut sebenarnya (+ galat 1,5% potongan) relatif terhadap potongan yang dikirim
    await pg.evaluate("""(T) => { const asli = panggilGroq; window.panggilGroq = async (b, pr, sk) => { const J = await asli(b, pr, sk);
      if (J.bidang === '__POTONG__') { const c = AI._potong, kx = S.img.w / T.W, ky = S.img.h / T.H;
        J.bidang = T.p.map(([x, y], i) => [((x * kx - c.x0) / (c.x1 - c.x0)) * 1000 + (i % 2 ? 15 : -15), ((y * ky - c.y0) / (c.y1 - c.y0)) * 1000 + 15]); } return J; }; }""", {'W': W, 'H': Hh, 'p': sk['parcel']})
    await pg.click('[data-step="2"]'); await pg.evaluate("document.getElementById('aiSet').open=true")
    await pg.fill('#inAiKey', 'gsk_uji'); await pg.dispatch_event('#inAiKey', 'change')
    print('pilihan layanan:', await pg.evaluate("[...$('inAiProv').options].map(o=>o.value)"))
    await pg.set_input_files('#fileImg', pdfdir + 'SU_16010801_00009_2001.pdf')
    await pg.wait_for_function("DOCS.list.length===1 && S.osm!==null", timeout=30000)
    await pg.click('[data-digit]')
    await pg.wait_for_function("STEP===4 && S.cands.length>0", timeout=90000); await pg.wait_for_timeout(500)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('tahap1 meleset 60% → galat akhir m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2), '| panggilan AI', calls['n'])
    lg = (await pg.evaluate("LOG.text()")).split(chr(10))
    for k, l in enumerate(lg):
      if 'diperjelas' in l or 'Rapatkan' in l or 'menempel' in l: print('  ', l[-50:].strip(), lg[k+1].strip()[:200])
    print('peta: penyesuaian tertunda sudah dijalankan', await pg.evaluate("!S.tundaFit"))
    await pg.screenshot(path=D + 'v29.png')
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
