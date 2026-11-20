"""Uji v2.4: nama jalan sebagai petunjuk — nama benar vs nama keliru (jalan sudah berganti nama)."""
import asyncio, os, json, math
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.abspath(__file__)) + '/'
exec(open(H + 'run3.py').read().split('\nasync def main')[0])
async def main():
  sk = json.load(open(D + 'sketch.json'))
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
      u = r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK2, content_type='application/javascript')
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    await pg.select_option('#inKec', 'Sungai Pinang'); await pg.select_option('#inKel', 'Temindung Permai')
    await pg.wait_for_function("S.osm!==null", timeout=20000)
    await pg.click('[data-step="2"]'); await pg.set_input_files('#fileImg', D + 'sketch.png'); await pg.wait_for_function("S.img!==null"); await pg.wait_for_timeout(200)
    await pg.fill('#inLuas', str(sk['luas']))
    roads = sk['roads']
    benar = [r['name'] for r in roads]
    print('nama di sketsa (benar):', [n for n in benar if n])
    for kasus in ['benar', 'keliru']:
      rr = json.loads(json.dumps(roads))
      if kasus == 'keliru':  # nama lama/keliru: jalan yang bernama dipindah ke jalan lain yang tak bernama
        for r in rr: r['name'] = ''
        for r in rr[:3]: r['name'] = 'Jalan Pahlawan'
      await pg.evaluate(f"S.roads={json.dumps(rr)}; S.parcel={json.dumps(sk['parcel'])}; onSketchChanged();")
      await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
      await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
      await pg.wait_for_timeout(200)
      c = await pg.evaluate("CORE.centroid(finalLL())")
      tags = await pg.evaluate("S.cands.map(c=>[+c.r.score.toFixed(3), c.nama])")
      print(kasus, '-> galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2), '| kandidat [skor, nama cocok]:', tags[:4])
      await pg.click('[data-step="4"]'); await pg.wait_for_timeout(200)
      print('   qc:', [l for l in (await pg.inner_text('#qcInfo')).split('\n') if 'Nama' in l or 'nama' in l])
      await pg.click('[data-step="2"]')
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
