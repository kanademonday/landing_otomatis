"""Uji petunjuk lokasi basi (titik / kode SU dari kelurahan lain) tidak menarik pencarian keluar kelurahan."""
"""Uji mode pola jalan (eksperimen): flag mati = identik, impor SU sudah ketemu, area pencarian, label jujur, proyek lama."""
import json, asyncio, os
from playwright.async_api import async_playwright
D=os.path.dirname(os.path.abspath(__file__))+'/'
MOCK="""window.L=(function(){const chain=()=>{const o={addTo(){return o},on(){return o},bindTooltip(){return o},getBounds(){return {}},clearLayers(){},pad(){return o}};return o};
return {version:'mock',map(){const m={setView(){return m},on(){},invalidateSize(){},fitBounds(){},getCenter(){return {lat:-0.49,lng:117.15}},getContainer(){return document.getElementById('map')}};return m},
tileLayer:()=>chain(),layerGroup:()=>chain(),polyline:()=>chain(),polygon:()=>chain(),marker:()=>chain(),divIcon:()=>({}),latLngBounds:()=>chain(),control:{layers:()=>chain(),scale:()=>chain()}};})();"""
async def main():
  sk=json.load(open(D+'sketch.json'))
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=await b.new_page(viewport={'width':1500,'height':900},accept_downloads=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    async def route(r):
      u=r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK,content_type='application/javascript')
      elif '/data/samarinda_' in u:
        f=D+'data/'+u.split('/data/')[1]
        if os.path.exists(f) and not os.environ.get('NODATA'): await r.fulfill(body=open(f).read(),content_type='application/json')
        else: await r.fulfill(status=404,body='')
      elif 'nominatim' in u: await r.fulfill(body=open(D+'nominatim.json').read(),content_type='application/json')
      elif 'overpass' in u: await r.fulfill(body=open(D+'overpass.json').read(),content_type='application/json')
      else: await r.fulfill(status=404,body='')
    await pg.route('**/*',lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://'+os.path.abspath(os.path.dirname(os.path.abspath(__file__))+'/../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'",timeout=20000)
    print('data:',await pg.inner_text('#dataInfo'))
    await pg.select_option('#inKec','Sungai Pinang');await pg.select_option('#inKel','Temindung Permai')
    await pg.wait_for_function("S.osm!==null",timeout=20000)
    print('wil:',await pg.evaluate("S.wil.name"))
    print('jalan:',await pg.inner_text('#jalanInfo'))
    await pg.click('[data-step="2"]');await pg.set_input_files('#fileImg',D+'sketch.png');await pg.wait_for_function("S.img!==null")
    await pg.wait_for_timeout(300)
    box=await pg.locator('#sk').bounding_box()
    async def clk(pt):
      s=await pg.evaluate(f"toScr([{pt[0]},{pt[1]}])");await pg.mouse.click(box['x']+s[0],box['y']+s[1])
    for r in sk['roads']:
      if r['name']: await pg.fill('#inRoadName',r['name'])
      for pt in r['pts']: await clk(pt)
      await pg.click('#skFinish')
    await pg.click('[data-tool="parcel"]')
    for pt in sk['parcel']: await clk(pt)
    await pg.click('#skFinish')
    await pg.fill('#inLuas',str(sk['luas']))
    print('roads',await pg.evaluate("S.roads.length"),'junc',await pg.evaluate("SK.junc.length"),'parcel',await pg.evaluate("S.parcel&&S.parcel.length"))
    await pg.screenshot(path=D+'s2.png')
    await pg.click('[data-step="3"]');await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000)
    import math
    T0=await pg.evaluate("JSON.stringify(S.cands.map(c=>[c.T,c.r.score]))")
    await pg.evaluate("document.querySelector('#inPola').closest('details').open=true"); await pg.check('#inPola')
    # petunjuk BASI: titik perkiraan 3 km di luar kelurahan + kode SU kelurahan lain
    await pg.evaluate(f"POLA.titik={{lat:{sk['truth'][0]}+0.03,lon:{sk['truth'][1]}+0.02,r:150}}; renderPola()")
    print('ready:', [l for l in (await pg.inner_text('#readyInfo')).split(chr(10)) if 'pola' in l.lower()])
    await pg.click('#btnMatch'); await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000)
    inside=await pg.evaluate("S.cands.map(k=>{const p=CORE.fwdT(k.T,CTX.parcelC[0],CTX.parcelC[1]);return inAreaFn(p[0],p[1])})")
    c=await pg.evaluate("CORE.centroid(finalLL())")
    print('titik basi di luar kelurahan: kandidat', len(inside), '| semua di dalam kelurahan', all(inside), '| galat #1 m', round(math.hypot((c[0]-sk['truth'][0])*110540,(c[1]-sk['truth'][1])*111320),2), '| sama dengan tanpa mode pola (T):', await pg.evaluate("JSON.stringify(S.cands.map(c=>[c.T]))")==json.dumps([[x[0]] for x in json.loads(T0)],separators=(',',':')))
    # SU baru tanpa kode di nama file → kode lama terhapus
    await pg.evaluate("POLA.su={kode:'16010403',tahun:1998}; setNomorSU(55)"); print('setNomorSU tanpa kode → kode lama dibuang:', await pg.evaluate("POLA.su.kode===null && POLA.su.tahun===null"))
    # kode SU milik kelurahan lain → tidak dipakai
    await pg.evaluate("POLA.titik=null; KODE_KEL['16010403']=['Samarinda Ilir','Sidomulyo']; setNomorSU(55,'16010403',1998)"); print('kode kelurahan lain diabaikan:', await pg.evaluate("kodeKelAktif()===null"))
    # bidang baru → petunjuk dikosongkan
    await pg.evaluate("POLA.titik={lat:0,lon:0,r:100}; bidangBaru(true)"); print('bidang baru → titik & nomor kosong:', await pg.evaluate("POLA.titik===null && $('inNoSU').value===''"))
    print('page errors:',[e for e in errs if '404' not in e][:5])
    await b.close()
asyncio.run(main())
