"""Uji data persil (DXF): baca label, area dari SU tetangga, ref & tempel, SU persis + salin koordinat persil, mati = identik, simpan di browser."""
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
    # DXF persil buatan: 4 tetangga (SU 100,102,103 tahun 2001; satu tanpa SU) + file kedua berisi SU 101/2001
    dxf = await pg.evaluate(r"""(T)=>{const [lat,lon]=T; const c=CORE.crsFwd('tm3-50.2',lat,lon); const sq=(dx,dy,w)=>[[c[0]+dx,c[1]+dy],[c[0]+dx+w,c[1]+dy],[c[0]+dx+w,c[1]+dy+w],[c[0]+dx,c[1]+dy+w],[c[0]+dx,c[1]+dy]];
      const ent=(pts,lab)=>{let s='0\nLWPOLYLINE\n8\n020100\n90\n'+pts.length+'\n70\n0\n'+pts.map(p=>'10\n'+p[0].toFixed(3)+'\n20\n'+p[1].toFixed(3)).join('\n')+'\n';
        const cx=(pts[0][0]+pts[2][0])/2, cy=(pts[0][1]+pts[2][1])/2; lab.forEach((t,i)=>{s+='0\nTEXT\n8\nL'+i+'\n10\n'+cx.toFixed(3)+'\n20\n'+(cy+2-1.25*i).toFixed(3)+'\n40\n1\n1\n'+t+'\n';}); return s;};
      const f=(ents)=>'0\nSECTION\n2\nENTITIES\n'+ents.join('')+'0\nENDSEC\n0\nEOF\n';
      return [f([ent(sq(-40,-10,15),['00011','M.16019999100001','SU.1601999900100/2001','Luas: 225 m²']),ent(sq(30,-10,15),['00012','M.16019999100002','SU.1601999900102/2001','Luas: 225 m²']),ent(sq(-10,35,15),['00013','Nomor Hak: N/A','SU.1601999900103/2001','Luas: 225 m²']),ent(sq(-60,-60,200),[])]),
              f([ent(sq(-8,-8,16),['00014','M.16019999100004','SU.1601999900101/2001','Luas: 256 m²'])])];}""", sk['truth'])
    await pg.click('[data-step="1"]')
    await pg.set_input_files('#filePersil', [{'name':'persil Uji.dxf','mimeType':'application/dxf','buffer':dxf[0].encode()}])
    await pg.wait_for_function("PERSIL.bidang.length>0", timeout=20000); await pg.wait_for_timeout(300)
    print('persil:', await pg.inner_text('#persilInfo'), '| mode pola otomatis aktif:', await pg.evaluate("POLA.on && $('inPola').checked"))
    print('label persil terbaca:', await pg.evaluate("JSON.stringify(PERSIL.bidang.map(b=>[b.nib,b.su&&b.su.nomor,b.luas,Math.round(b.luasPoligon)]))"))
    await pg.evaluate("setNomorSU(101,'16019999',2001)"); await pg.click('[data-step="3"]'); await pg.wait_for_timeout(200)
    print('lingkaran SU tetangga:', await pg.evaluate("JSON.stringify((lingkaranSU()||[]).map(c=>c.su))"), '| acuan persil di kelurahan:', await pg.evaluate("(polaRef()||[]).length"), '(bidang besar tanpa label dibuang)')
    print('tombol bantuan persil aktif:', await pg.evaluate("!$('btnMatchPersil').disabled"))
    await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000)
    n0=await pg.evaluate("S.cands.length")
    print('TANPA persil: kandidat', n0, '| tempel dihitung?', await pg.evaluate("S.cands.some(c=>c.tempel!=null)"))
    await pg.click('#btnMatchPersil')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000); await pg.wait_for_timeout(300)
    c=await pg.evaluate("CORE.centroid(finalLL())")
    print('DENGAN persil: kandidat', await pg.evaluate("S.cands.length"), '(tidak dibuang; tambahan dekat SU:', await pg.evaluate("S.cands.filter(k=>k.dekatSU).length"), ') | tempel', await pg.evaluate("JSON.stringify(S.cands.map(k=>+k.tempel.toFixed(2)))"),
          '| galat #1 m', round(math.hypot((c[0]-sk['truth'][0])*110540,(c[1]-sk['truth'][1])*111320),2), '| semua di kelurahan', await pg.evaluate("S.cands.every(k=>{const p=CORE.fwdT(k.T,CTX.parcelC[0],CTX.parcelC[1]);return inAreaFn(p[0],p[1])})"))
    # SU persis ada di file kedua
    await pg.click('[data-step="1"]')
    await pg.set_input_files('#filePersil', [{'name':'persil Dua.dxf','mimeType':'application/dxf','buffer':dxf[1].encode()}])
    await pg.wait_for_function("PERSIL.file.length===2", timeout=20000); await pg.click('[data-step="3"]'); await pg.wait_for_timeout(300)
    print('acuan persil saat bantuan persil aktif:', await pg.evaluate("(polaRef()||[]).length"), '| CTX.ref', await pg.evaluate("CTX.ref.length"))
    b0=await pg.evaluate(f"(()=>{{const b=bidangPersilDi({sk['truth'][0]},{sk['truth'][1]});return b?[b.nib,Math.round(b.luasPoligon)]:null}})()")
    print('klik peta di bidang SU 101 → popup bidang terkecil (bukan blok 200×200 m):', b0)
    print('pemeriksaan data: bidang persil di lokasi hasil →', [l for l in (await pg.inner_text('#qc')).split(chr(10)) if 'persil' in l][:1] if await pg.evaluate("!!document.getElementById('qc')") else '-')
    print('SU 101/2001 ditemukan di persil:', await pg.evaluate("!$('suPersil').hidden"), '|', (await pg.inner_text('#suPersil')).split(chr(10))[0][:90])
    await pg.context.grant_permissions(['clipboard-read','clipboard-write'])
    await pg.click('#btnPersilSalin'); await pg.wait_for_timeout(200)
    clip=await pg.evaluate("navigator.clipboard.readText()")
    exp=await pg.evaluate("(()=>{const b=cariSUPersil();return b.ll.map(p=>CORE.crsFwd(SET.crs,p[0],p[1]).map(v=>v.toFixed(4)))})()")
    print('salinan persil berisi koordinat persis:', all(f"({x} {y} 0.0)" in clip for x,y in exp), '|', clip[:90])
    # mati lagi → identik
    await pg.evaluate("document.querySelector('#inPola').closest('details').open=true"); await pg.uncheck('#inPola'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')",timeout=120000)
    print('mode pola MATI: identik dengan awal =', await pg.evaluate("JSON.stringify(S.cands.map(c=>[c.T,c.r.score]))")==T0)
    # muat ulang halaman → persil dari penyimpanan browser
    await pg.reload(); await pg.wait_for_function("PERSIL.bidang.length>0", timeout=20000)
    print('setelah muat ulang: persil tersimpan', await pg.evaluate("PERSIL.bidang.length"), 'bidang,', await pg.evaluate("PERSIL.file.length"), 'file')
    print('page errors:',[e for e in errs if '404' not in e][:10])
    await b.close()
asyncio.run(main())
