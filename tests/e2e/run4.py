"""Uji v2.2: putar gambar (bolak-balik, panah utara), pencocokan setelah diputar dengan mode utara, geser bidang saja & sejajarkan."""
import asyncio, os, json, math
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.abspath(__file__)) + '/'
exec(open(H + 'run3.py').read().split('\nasync def main')[0])
async def main():
  sk = json.load(open(D + 'sketch.json'))
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
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
    await pg.screenshot(path=D + 'v22_langkah1.png')
    await pg.click('[data-step="2"]'); await pg.set_input_files('#fileImg', D + 'sketch.png'); await pg.wait_for_function("S.img!==null"); await pg.wait_for_timeout(200)
    await pg.fill('#inLuas', str(sk['luas']))
    await pg.evaluate(f"S.roads={json.dumps(sk['roads'])}; S.parcel={json.dumps(sk['parcel'])}; onSketchChanged();")
    p0 = await pg.evaluate("S.parcel.map(p=>p.slice())")
    for d in [90, -90, 17, -17]:
      await pg.evaluate(f"putarGambar({d})"); await pg.wait_for_function("ROT.deg===%s" % ({90:'90',-90:'0',17:'17',-17:'0'}[d]), timeout=10000); await pg.wait_for_timeout(150)
    p1 = await pg.evaluate("S.parcel"); 
    print('putar bolak-balik: geser titik maks (px)', round(max(math.hypot(a[0]-b2[0], a[1]-b2[1]) for a, b2 in zip(p0, p1)), 4), 'ukuran', await pg.evaluate("[S.img.w,S.img.h]"))
    # tanda panah utara: panah condong 35° searah jarum jam -> gambar diputar -35
    box = await pg.locator('#sk').bounding_box()
    await pg.click('#btnNorthTool')
    a = await pg.evaluate("toScr([500,500])"); bb = await pg.evaluate("toScr([500+200*Math.sin(35*Math.PI/180),500-200*Math.cos(35*Math.PI/180)])")
    await pg.mouse.click(box['x']+a[0], box['y']+a[1]); await pg.mouse.click(box['x']+bb[0], box['y']+bb[1])
    await pg.wait_for_function("Math.abs(ROT.deg+35)<0.5", timeout=10000)
    print('panah utara -> ROT.deg', await pg.evaluate("ROT.deg"), 'mode', await pg.evaluate("$('inNorthMode').value"), 'alat', await pg.evaluate("SK.tool"))
    await pg.screenshot(path=D + 'v22_langkah2.png')
    # putar agar utara benar-benar ke atas (gambar sintetis: th=-35 -> perlu +35 dari asli)
    await pg.evaluate("putarGambar(35+35)"); await pg.wait_for_function("Math.abs(ROT.deg-35)<0.01", timeout=10000); await pg.wait_for_timeout(200)
    await pg.select_option('#inNorthMode', 'yakin')
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    await pg.click('[data-step="4"]'); await pg.wait_for_timeout(300)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('setelah diputar 35°, mode yakin: galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2), 'putaran hasil', round(await pg.evaluate("CORE.normAng(S.T.th)/CORE.DEG"), 2))
    # utara di gambar salah 20°
    await pg.click('[data-step="2"]'); await pg.evaluate("putarGambar(20)"); await pg.wait_for_function("Math.abs(ROT.deg-55)<0.01", timeout=10000); await pg.wait_for_timeout(200)
    await pg.select_option('#inNorthMode', 'kira')
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    await pg.click('[data-step="4"]'); await pg.wait_for_timeout(300)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('utara meleset 20°, mode kira: galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2))
    print('qc:', (await pg.inner_text('#qcInfo')).replace('\n', ' | ')[:260])
    # salin ke AutoCAD: isi clipboard harus sama dengan polyline BIDANG di DXF
    await pg.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    await pg.click('#btnCopyAcad'); await pg.wait_for_timeout(200)
    clip = await pg.evaluate("navigator.clipboard.readText()")
    lines = clip.strip().split('\n')
    print('salin AutoCAD: baris', len(lines), '| awal', lines[:4], '| akhir', lines[-1])
    pl = [l for l in lines[lines.index('_.PLINE')+1:] ]; pl = pl[:pl.index('_C')]
    xy_clip = [tuple(map(float, l.split()[1].split(','))) for l in pl]
    async with pg.expect_download() as dl: await pg.click('#btnDXF')
    d = await dl.value; fn = D + 'out_' + d.suggested_filename; await d.save_as(fn)
    xy_dxf = await pg.evaluate("(t)=>CORE.dxfPolylines(t).filter(p=>p.layer==='BIDANG')[0].pts", open(fn).read())
    print('selisih maks clipboard vs DXF (m):', round(max(math.hypot(a[0]-b2[0], a[1]-b2[1]) for a, b2 in zip(xy_clip, xy_dxf)), 4), '| titik', len(xy_clip), len(xy_dxf))
    print('geser halus hilang:', await pg.evaluate("!document.querySelector('[data-mv]') && !document.getElementById('btnSejajar')"))
    await pg.screenshot(path=D + 'v22_langkah4.png')
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
