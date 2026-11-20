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
    # geser bidang saja
    c0 = await pg.evaluate("CORE.centroid(parcelWorld(S.T,false))"); r0 = await pg.evaluate("S.roads[0].pts[0]")
    await pg.select_option('#inAdjMode', 'bidang'); await pg.click('[data-mv="e"]'); await pg.click('[data-mv="rl"]')
    c1 = await pg.evaluate("CORE.centroid(parcelWorld(S.T,false))")
    print('geser bidang saja: pindah', round(c1[0]-c0[0], 2), round(c1[1]-c0[1], 2), 'm | adj', await pg.evaluate("[S.adj.dx, +(S.adj.dth/CORE.DEG).toFixed(2)]"))
    # dekatkan bidang ke jalan terdekat (sisi ±3 m dari jalan), miringkan 7°, lalu sejajarkan
    info = await pg.evaluate('''(()=>{S.adj={dx:0,dy:0,dth:0};const P=parcelWorld(S.T,false),c0=CORE.centroid(P);let best=null;
      for(const w of S.osm.ways){const pts=w.nodes.map(id=>S.osm.nodes[id]).filter(Boolean).map(p=>PROJ.fwd(p[0],p[1]));
        for(let i=1;i<pts.length;i++){const n=CORE.plNearest([pts[i-1],pts[i]],c0);if(!best||n.d<best.d)best={...n,a:pts[i-1],b:pts[i]};}}
      const ux=(c0[0]-best.pt[0])/best.d, uy=(c0[1]-best.pt[1])/best.d; const half=13;
      S.adj.dx=best.pt[0]+ux*half-c0[0]; S.adj.dy=best.pt[1]+uy*half-c0[1]; S.adj.dth=7*CORE.DEG; S._jalan=[best.a,best.b]; return best.d;})()''')
    await pg.click('#btnSejajar'); await pg.wait_for_timeout(100)
    sisa = await pg.evaluate('''(()=>{const P=parcelWorld(S.T,false),[a,b]=S._jalan,ra=Math.atan2(b[1]-a[1],b[0]-a[0]);let m=99;
      P.forEach((p,i)=>{const q=P[(i+1)%P.length];let d=CORE.normAng(Math.atan2(q[1]-p[1],q[0]-p[0])-ra);if(d>Math.PI/2)d-=Math.PI;if(d<-Math.PI/2)d+=Math.PI;m=Math.min(m,Math.abs(d));});return m/CORE.DEG;})()''')
    print('sejajarkan: sisa selisih sudut sisi vs jalan (°)', round(sisa, 3))
    print('sejajarkan -> adj dth', await pg.evaluate("+(S.adj.dth/CORE.DEG).toFixed(2)"), [t for t in (await pg.inner_text('#toast')).split('\n') if t][-1:])
    await pg.screenshot(path=D + 'v22_langkah4.png')
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
