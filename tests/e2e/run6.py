"""Uji v2.5: buka PDF surat ukur, baca kode wilayah dari nama file, penampil halaman, pakai halaman sebagai gambar, cek skala 1:N.
Opsional: SAMPEL=/folder/berisi/pdf asli -> hanya dibuka & dipratinjau (tidak disimpan)."""
import asyncio, os, json, math, glob
from playwright.async_api import async_playwright
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)) + '/'
exec(open(H + 'run3.py').read().split('\nasync def main')[0])
PDFJS = '/opt/npm-tools/node_modules/pdfjs-dist/build/'
async def main():
  sk = json.load(open(D + 'sketch.json'))
  pdfdir = D + 'pdf/'; os.makedirs(pdfdir, exist_ok=True)
  Image.open(D + 'sketch.png').convert('RGB').save(pdfdir + 'SU_16010801_00001_1982.pdf', resolution=150)
  Image.open(D + 'sketch.png').convert('RGB').save(pdfdir + 'SU_16010405_00007_1990.pdf', resolution=150)
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
      u = r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK2, content_type='application/javascript')
      elif 'pdfjs-dist' in u: await r.fulfill(path=PDFJS + u.split('/build/')[1], content_type='text/javascript')
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    await pg.evaluate("localStorage.removeItem('plotkw.kode'); KODE_KEL['16010801']=['Sungai Pinang','Temindung Permai']")  # data uji hanya punya batas Sungai Pinang
    await pg.click('[data-step="2"]')
    await pg.set_input_files('#fileImg', pdfdir + 'SU_16010801_00001_1982.pdf')
    await pg.wait_for_function("DOCS.list.length===1 && DOCS.list[0].thumbs.length===DOCS.list[0].n", timeout=30000)
    print('kode 16010801 ->', await pg.evaluate("[$('inKec').value,$('inKel').value]"), '| nama:', await pg.evaluate("$('inNama').value"))
    await pg.wait_for_function("S.osm!==null", timeout=20000)
    await pg.click('.thumb'); await pg.wait_for_timeout(500)
    print('penampil:', await pg.inner_text('#vwJudul'), '| tampil', await pg.evaluate("!$('viewer').hidden"))
    await pg.click('#vwPakai'); await pg.wait_for_function("S.img && S.img.dpi", timeout=20000)
    print('gambar dari PDF:', await pg.evaluate("[S.img.w,S.img.h,+S.img.dpi.toFixed(2),$('inSkala').value]"))
    k = await pg.evaluate("S.img.w/1000")
    sc = lambda pts: [[x[0]*k, x[1]*k] for x in pts]
    await pg.evaluate(f"S.roads={json.dumps([{'name':r['name'],'pts':sc(r['pts'])} for r in sk['roads']])}; S.parcel={json.dumps(sc(sk['parcel']))}; onSketchChanged();")
    await pg.fill('#inLuas', str(sk['luas']))
    N = 0.3 / k * (await pg.evaluate("S.img.dpi")) / 0.0254
    await pg.fill('#inSkala', str(round(N)))
    print('cek skala (benar):', (await pg.inner_text('#parcelInfo')).split('\n')[-1][:120])
    await pg.fill('#inSkala', '500')
    print('cek skala (keliru 1:500):', (await pg.inner_text('#parcelInfo')).split('\n')[-1][:140])
    await pg.fill('#inSkala', str(round(N)))
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2))
    # kode belum dikenal -> pilih kelurahan -> diingat
    await pg.click('[data-step="2"]'); await pg.set_input_files('#fileImg', pdfdir + 'SU_16010405_00007_1990.pdf')
    await pg.wait_for_function("DOCS.list.length===2", timeout=30000); await pg.wait_for_timeout(300)
    print('kode 16010405 -> kec perkiraan', await pg.evaluate("$('inKec').value"), '| menunggu', await pg.evaluate("DOCS.kodeTunggu"))
    await pg.click('[data-step="1"]'); await pg.select_option('#inKel', 'Pelita'); await pg.wait_for_timeout(200)
    print('diingat:', await pg.evaluate("JSON.parse(localStorage.getItem('plotkw.kode'))"))
    await pg.screenshot(path=D + 'v25_berkas.png')
    smp = os.environ.get('SAMPEL')
    if smp:
      fs = sorted(glob.glob(smp + '/*.pdf'))
      await pg.click('[data-step="2"]'); await pg.set_input_files('#fileImg', fs)
      await pg.wait_for_function(f"DOCS.list.length==={2+len(fs)} && DOCS.list.every(d=>d.thumbs.length===d.n)", timeout=180000)
      print('sampel asli:', await pg.evaluate("DOCS.list.slice(2).map(d=>[d.info.jenis,d.info.kode,d.info.nomor,d.info.tahun||'',d.n])"))
      i = await pg.evaluate("DOCS.list.findIndex(d=>d.nama.includes('00001_2001'))")
      await pg.click(f'.doc:nth-child({i+1}) .thumb[data-pg="2"]'); await pg.wait_for_timeout(1500)
      await pg.screenshot(path=D + 'v25_sampel_penampil.png')
      await pg.click('#vwPakai'); await pg.wait_for_function("S.img && S.img.name.includes('00001/2001')", timeout=30000)
      print('sampel dipakai:', await pg.evaluate("[S.img.w,S.img.h,+S.img.dpi.toFixed(1)]"))
      await pg.screenshot(path=D + 'v25_sampel_gambar.png')
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
