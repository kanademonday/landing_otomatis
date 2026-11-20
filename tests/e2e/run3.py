"""Uji v2.1: gambar di peta (overlay), pratinjau kandidat, urungkan (Ctrl+Z), sisip titik, bidang lain, ekspor DXF/world file, screenshot."""
import asyncio, os, json, math
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.abspath(__file__)) + '/'
exec(open(H + 'run.py').read().split('async def main')[0].replace("D=os.path.dirname(os.path.abspath(__file__))+'/'", "D=H"))
# Leaflet tiruan yang cukup untuk overlay: latLngToLayerPoint linier
MOCK2 = MOCK.replace("getContainer(){return document.getElementById('map')}", "getContainer(){return document.getElementById('map')},getPanes(){return {overlayPane:document.getElementById('map')}},latLngToLayerPoint(ll){return {x:(ll[1]-117.14)*200000,y:-(ll[0]+0.48)*200000}},hasLayer(l){return !!l._on},removeLayer(l){l._on=false;l.onRemove&&l.onRemove(this)},off(){}") \
  .replace("return {version:'mock',", "const Base=function(){};Base.prototype.addTo=function(m){this._map=m;this._on=true;this.onAdd&&this.onAdd(m);return this};Base.extend=function(p){const K=function(){};K.prototype=Object.assign(Object.create(Base.prototype),p);return K};return {version:'mock',Layer:Base,DomUtil:{create:(t,c)=>{const e=document.createElement(t);e.className=c;return e}},")
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
    await pg.screenshot(path=D + 'v21_langkah1.png')
    await pg.select_option('#inKec', 'Sungai Pinang'); await pg.select_option('#inKel', 'Temindung Permai')
    await pg.wait_for_function("S.osm!==null", timeout=20000)
    await pg.click('[data-step="2"]'); await pg.set_input_files('#fileImg', D + 'sketch.png'); await pg.wait_for_function("S.img!==null"); await pg.wait_for_timeout(200)
    await pg.fill('#inLuas', str(sk['luas']))
    await pg.evaluate(f"S.roads={json.dumps(sk['roads'])}; S.parcel={json.dumps(sk['parcel'])}; onSketchChanged();")
    # urungkan & sisip titik
    await pg.evaluate("S.roads.pop(); onSketchChanged();")
    n1 = await pg.evaluate("S.roads.length"); await pg.evaluate("document.activeElement.blur()")
    await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(100)
    print('urungkan: jalan', n1, '->', await pg.evaluate("S.roads.length"))
    await pg.click('[data-tool="edit"]')
    box = await pg.locator('#sk').bounding_box()
    mid = await pg.evaluate("(()=>{const a=S.parcel[0],b=S.parcel[1];return toScr([(a[0]+b[0])/2,(a[1]+b[1])/2])})()")
    before = await pg.evaluate("S.parcel.length")
    await pg.mouse.click(box['x'] + mid[0], box['y'] + mid[1]); await pg.wait_for_timeout(100)
    print('sisip titik bidang:', before, '->', await pg.evaluate("S.parcel.length"))
    await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(100)
    print('urungkan sisip:', await pg.evaluate("S.parcel.length"))
    await pg.evaluate(f"S.extra=[{{pts:{json.dumps([[p[0]+60,p[1]] for p in sk['parcel']])},label:'Bidang 7'}}]; onSketchChanged();")
    await pg.screenshot(path=D + 'v21_langkah2.png')
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    await pg.wait_for_timeout(300)
    print('pratinjau kandidat:', await pg.evaluate("[...document.querySelectorAll('#candList canvas')].filter(c=>c.width>0).length"), 'dari', await pg.evaluate("S.cands.length"))
    await pg.screenshot(path=D + 'v21_langkah3.png')
    ov = await pg.evaluate("(()=>{const i=document.querySelector('img.sk-ov');return i?{t:i.style.transform,op:i.style.opacity,disp:i.style.display}:null})()")
    print('overlay peta:', ov)
    await pg.uncheck('#inOv'); print('overlay mati:', await pg.evaluate("!document.querySelector('img.sk-ov')"))
    await pg.check('#inOv')
    await pg.click('[data-step="4"]'); await pg.wait_for_timeout(300)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2))
    print('qc:', (await pg.inner_text('#qcInfo')).replace('\n', ' | '))
    print('kop:', (await pg.inner_text('#kop')).replace('\n', ' | '))
    await pg.screenshot(path=D + 'v21_langkah4.png')
    async with pg.expect_download() as dl: await pg.click('#btnDXF')
    d = await dl.value; fn = D + 'out_' + d.suggested_filename; await d.save_as(fn)
    lays = await pg.evaluate("(t)=>CORE.dxfPolylines(t).map(p=>p.layer)", open(fn).read())
    print('DXF layer:', sorted(set(lays)))
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
