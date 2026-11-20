"""Uji alur kerja KW4–6: impor daftar, kerjakan bidang, simpan, referensi DXF (tumpang tindih), ekspor DXF & rekap, screenshot."""
import asyncio, os, json, math, sys
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.abspath(__file__)) + '/'
exec(open(H + 'run.py').read().split('async def main')[0].replace("D=os.path.dirname(os.path.abspath(__file__))+'/'", "D=H"))
sys.path.insert(0, H)
async def main():
  sk = json.load(open(D + 'sketch.json'))
  open(D + 'daftar.csv', 'w').write('No;NIB;No Hak;Luas (m2);Kelurahan;KW\n1;16010203000123;HM 1234;500;Temindung Permai;KW4\n2;16010203000124;HM 1235;320;Kel. Selili;KW5\n3;;HGB 77;1.250;Bugis;KW6\n')
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
      u = r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK, content_type='application/javascript')
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    await pg.evaluate("localStorage.clear()")
    await pg.screenshot(path=D + 'v2_langkah1.png')
    # impor daftar
    await pg.click('#btnDaftar'); await pg.set_input_files('#fileList', D + 'daftar.csv'); await pg.wait_for_timeout(300)
    print('daftar:', await pg.evaluate("Q.items.map(x=>[x.nib,x.hak,x.luas,x.kel,x.kw])"))
    await pg.screenshot(path=D + 'v2_laci.png')
    await pg.click('#listBody tr[data-i="0"]'); await pg.wait_for_function("S.osm!==null", timeout=20000)
    print('pilih item -> kel', await pg.evaluate("$('inKel').value"), 'luas', await pg.evaluate("$('inLuas').value"), 'nama', await pg.evaluate("$('inNama').value"), 'step', await pg.evaluate("STEP"))
    await pg.set_input_files('#fileImg', D + 'sketch.png'); await pg.wait_for_function("S.img!==null"); await pg.wait_for_timeout(200)
    await pg.evaluate(f"S.roads={json.dumps(sk['roads'])}; S.parcel={json.dumps(sk['parcel'])}; S.extra=[{{pts:{json.dumps([[p[0]+60,p[1]] for p in sk['parcel']])},label:'HM 1235'}}]; onSketchChanged();")
    await pg.screenshot(path=D + 'v2_langkah2.png')
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    await pg.click('[data-step="4"]'); await pg.wait_for_timeout(300)
    c = await pg.evaluate("(()=>{const ll=finalLL();return CORE.centroid(ll)})()")
    print('galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2))
    print('qc:', (await pg.inner_text('#qcInfo')).replace('\n', ' | '))
    await pg.screenshot(path=D + 'v2_langkah4.png')
    # DXF ekspor & cek koordinat balik
    async with pg.expect_download() as dl: await pg.click('#btnDXF')
    d = await dl.value; fn = D + 'out_' + d.suggested_filename; await d.save_as(fn)
    back = await pg.evaluate("(t)=>{const P=CORE.dxfPolylines(t).filter(p=>p.layer==='BIDANG')[0];return CORE.centroid(P.pts.map(q=>CORE.crsInv('tm3-50.2',q[0],q[1])))}", open(fn).read())
    print('DXF', d.suggested_filename, 'pusat kembali vs hasil (m):', round(math.hypot((back[0]-c[0])*110540, (back[1]-c[1])*111320), 3))
    # simpan ke daftar
    await pg.click('#btnSimpanDaftar'); await pg.wait_for_timeout(200)
    print('status:', await pg.evaluate("Q.items.map(x=>x.status)"), 'lanjut tampil:', await pg.evaluate("!$('btnLanjut').hidden"))
    # referensi DXF menumpuk di lokasi hasil -> pencocokan ulang harus kena penalti / pindah
    ll = await pg.evaluate("finalLL()")
    xy = await pg.evaluate("(ll)=>ll.map(p=>CORE.crsFwd('tm3-50.2',p[0],p[1]))", ll)
    open(D + 'ref.dxf', 'w').write(await pg.evaluate("(xy)=>CORE.dxfR12([{name:'KW1',color:3}],[{layer:'KW1',pts:xy,closed:true}],[])", xy))
    await pg.click('[data-step="1"]'); await pg.set_input_files('#fileRef', D + 'ref.dxf'); await pg.wait_for_timeout(200)
    print('ref:', await pg.inner_text('#refInfo'))
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    print('setelah referensi: skor1/ovl', await pg.evaluate("[S.cands[0].r.score.toFixed(3), S.cands[0].r.ovl.toFixed(2)]"))
    await pg.click('[data-step="4"]'); await pg.wait_for_timeout(200)
    print('qc2:', (await pg.inner_text('#qcInfo')).replace('\n', ' | ')[:300])
    # rekap
    await pg.click('#btnDaftar')
    async with pg.expect_download() as dl: await pg.click('#btnRekapCsv')
    d = await dl.value; await d.save_as(D + 'out_rekap.csv')
    print('rekap:', open(D + 'out_rekap.csv', encoding='utf-8-sig').read().splitlines()[1][:200])
    async with pg.expect_download() as dl: await pg.click('#btnAllDxf')
    d = await dl.value; print('gabungan:', d.suggested_filename)
    await pg.click('#laciClose')
    # bidang baru mempertahankan daftar
    await pg.click('#btnNew'); await pg.wait_for_timeout(200)
    print('bidang baru: daftar', await pg.evaluate("Q.items.length"), 'extra', await pg.evaluate("S.extra.length"))
    await pg.reload(); await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    print('setelah muat ulang, daftar tersimpan:', await pg.evaluate("Q.items.map(x=>x.status)"))
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
