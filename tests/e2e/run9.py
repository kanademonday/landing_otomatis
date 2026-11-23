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
    lab0=await pg.evaluate("conf(0)[0]")
    print('mode pola MATI: label #1 =',lab0,'| kandidat',await pg.evaluate("S.cands.length"))
    # aktifkan mode pola; catat SU tetangga (no. 100) tepat di lokasi benar, cari SU no. 101
    await pg.evaluate("document.querySelector('#inPola').closest('details').open=true")
    await pg.check('#inPola'); await pg.wait_for_timeout(100)
    print('kotak pola tampil:', await pg.evaluate("!$('polaBox').hidden"))
    xy=await pg.evaluate(f"CORE.crsFwd(SET.crs,{sk['truth'][0]+0.0003},{sk['truth'][1]+0.0002})")
    await pg.evaluate("document.querySelector('#polaBox details').open=true")
    await pg.fill('#inSuketTeks', f"X = {xy[0]:.3f}     Y = {xy[1]:.3f} su.00100\nbaris rusak\n00099,{xy[0]+30:.3f},{xy[1]-20:.3f}")
    await pg.click('#btnSuketImpor'); await pg.fill('#inNoSU','101'); await pg.dispatch_event('#inNoSU','input')
    print('suket:', await pg.inner_text('#suketInfo'), '|', await pg.inner_text('#polaArea'))
    print('ready:', [l for l in (await pg.inner_text('#readyInfo')).split(chr(10)) if 'pola' in l.lower()])
    await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000)
    d=await pg.evaluate("""(()=>{const a=areaPola(),c=PROJ.fwd(a.lat,a.lon);return S.cands.map(k=>{const p=CORE.fwdT(k.T,CTX.parcelC[0],CTX.parcelC[1]);return Math.round(Math.hypot(p[0]-c[0],p[1]-c[1]))})})()""")
    r=await pg.evaluate("Math.round(areaPola().r)")
    print('mode pola: jarak kandidat ke pusat area (m)',d,'radius',r,'| semua di dalam:',all(x<=r+60 for x in d))
    c=await pg.evaluate("CORE.centroid(finalLL())") if await pg.evaluate("!!S.T") else None
    print('mode pola: galat #1 m', round(math.hypot((c[0]-sk['truth'][0])*110540,(c[1]-sk['truth'][1])*111320),2), '| label', await pg.evaluate("conf(0)[0]"))
    print('label gambar minim:', await pg.evaluate("(()=>{const r=S.roads,j=SK.junc;S.roads=[r[0]];SK.junc=[];const l=conf(0)[0];S.roads=r;SK.junc=j;return l})()"))
    await pg.click('[data-step="4"]'); await pg.wait_for_timeout(200)
    print('tombol tandai tampil:', await pg.evaluate("!$('btnTandaKetemu').hidden"))
    await pg.click('#btnTandaKetemu'); print('tercatat:', await pg.evaluate("Object.keys(SUKET).sort()"))
    # titik perkiraan
    await pg.click('[data-step="3"]'); await pg.click('#btnTitikPeta'); print('titik:', await pg.inner_text('#polaArea'))
    await pg.click('#btnTitikHapus')
    # simpan proyek dengan pola
    await pg.click('#btnMenu')
    async with pg.expect_download() as dl: await pg.click('#btnSave')
    dd=await dl.value; await dd.save_as(D+'out_pola_proyek.json'); print('proyek menyimpan pola:', json.load(open(D+'out_pola_proyek.json'))['input'].get('pola'))
    # MATIKAN lagi → hasil identik dengan sebelum mode pola
    await pg.click('[data-step="3"]'); await pg.uncheck('#inPola'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000)
    T1=await pg.evaluate("JSON.stringify(S.cands.map(c=>[c.T,c.r.score]))")
    print('mode pola MATI lagi: identik dengan awal =', T1==T0, '| label', await pg.evaluate("conf(0)[0]"), '| kotak tersembunyi', await pg.evaluate("$('polaBox').hidden"))
    # proyek lama (tanpa kunci pola) tetap bisa dimuat
    import glob
    lama=[f for f in glob.glob(D+'out_*proyek.json') if 'pola' not in f]
    if lama:
      await pg.set_input_files('#fileProj', lama[0]); await pg.wait_for_timeout(800); print('proyek lama dimuat:', await pg.evaluate("S.roads.length>0"), '| pola tetap mati', await pg.evaluate("!POLA.on"))
    print('page errors:',[e for e in errs if '404' not in e][:10])
    await b.close()
asyncio.run(main())
