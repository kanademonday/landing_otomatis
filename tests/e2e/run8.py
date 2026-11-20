"""Uji v2.8 Claude (tiruan): satu permintaan per berkas, koordinat piksel, rapatkan bidang, simpanan hasil baca.
Turunan dari run7. Uji v2.6: baca otomatis dengan AI (Groq tiruan): baca berkas, isi formulir, telusuri gambar, batas pemakaian (429), terbilang."""
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
  calls = {'n': 0, 'gambar': [], 'tool': set(), 'hdr': set()}
  geser = 0.3 * math.sqrt(abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(sk['parcel'], sk['parcel'][1:]+sk['parcel'][:1]))/2))
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
      u = r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK2, content_type='application/javascript')
      elif 'pdfjs-dist' in u: await r.fulfill(path=PDFJS + u.split('/build/')[1], content_type='text/javascript')
      elif 'api.anthropic.com' in u:
        hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
        if r.request.method == 'OPTIONS': await r.fulfill(status=204, headers=hdr); return
        h = r.request.headers; calls['hdr'].add((h.get('x-api-key'), h.get('anthropic-dangerous-direct-browser-access'), h.get('anthropic-version')))
        if '/v1/models' in u: await r.fulfill(body=json.dumps({'data': [{'id': 'claude-haiku-5-5'}, {'id': 'claude-sonnet-5-5'}]}), content_type='application/json', headers=hdr); return
        calls['n'] += 1
        body = json.loads(r.request.post_data); cont = body['messages'][0]['content']
        calls['tool'].add(body['tool_choice']['name'])
        imgs = [c for c in cont if c['type'] == 'image']
        import base64, io
        dims = [Image.open(io.BytesIO(base64.b64decode(c['source']['data']))).size for c in imgs]; calls['gambar'].append(dims)
        txt = [c for c in cont if c['type'] == 'text'][0]['text']
        if 'gambar situasi bidang tanah' in txt:
          w, hh = dims[0]; kx, ky = w / W, hh / Hh
          assert 'PIKSEL' in txt
          ans = {'bidang': [[(x + geser) * kx, (y - geser * 0.6) * ky] for x, y in sk['parcel']], 'jalan': [{'nama': r2['name'] or None, 'titik': [[x * kx, y * ky] for x, y in r2['pts']]} for r2 in sk['roads']] + [{'nama': 'Tanah Hak', 'titik': [[10, 10], [200, 10]]}],
                 'panah_utara': {'pangkal': [0.9 * w, 0.6 * hh], 'ujung': [0.9 * w, 0.3 * hh]}, 'skala': None}
        else: ans = {'halaman': [jawab_baca] * len(imgs)}
        await r.fulfill(body=json.dumps({'content': [{'type': 'tool_use', 'name': 'kirim_hasil', 'input': ans}], 'stop_reason': 'tool_use', 'usage': {'input_tokens': 2400 * len(imgs) + 900, 'output_tokens': 400}}), content_type='application/json', headers=hdr)
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    await pg.evaluate("localStorage.removeItem('plotkw.kode'); localStorage.removeItem('plotkw.baca'); KODE_KEL['16010801']=['Sungai Pinang','Temindung Permai']")
    await pg.click('[data-step="2"]'); await pg.evaluate("document.getElementById('aiSet').open=true")
    await pg.fill('#inAiKey', 'gsk_groqlama'); await pg.dispatch_event('#inAiKey', 'change')
    await pg.select_option('#inAiProv', 'claude'); await pg.wait_for_timeout(100)
    print('ganti ke Claude: model', await pg.evaluate("$('inAiModel').value"), '| kunci kosong', await pg.evaluate("$('inAiKey').value===''"))
    await pg.fill('#inAiKey', 'sk-ant-uji'); await pg.dispatch_event('#inAiKey', 'change')
    await pg.click('#btnAiTes'); await pg.wait_for_timeout(300); print('tes Claude:', await pg.inner_text('#aiStatus'))
    await pg.select_option('#inAiProv', 'groq'); print('kembali ke Groq, kunci groq dipulihkan:', await pg.evaluate("$('inAiKey').value"))
    await pg.select_option('#inAiProv', 'claude')
    await pg.set_input_files('#fileImg', pdfdir + 'SU_16010801_00009_2001.pdf')
    await pg.wait_for_function("DOCS.list.length===1 && S.osm!==null", timeout=30000)
    await pg.click('[data-digit]')
    await pg.wait_for_function("STEP===4 && S.cands.length>0", timeout=90000); await pg.wait_for_timeout(300)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('digitasi Claude: galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2), '| jalan', await pg.evaluate("S.roads.length"), '(Tanah Hak dibuang)')
    lg = (await pg.evaluate("LOG.text()")).split(chr(10)); i = max(k for k, l in enumerate(lg) if "Rapatkan" in l); print("rapatkan:", lg[i][-60:], lg[i+1][:300])
    print("sudut (gambar asli, px sketsa):", await pg.evaluate("JSON.stringify(S.parcel.map(p=>keAsli(p,ROT.deg,ROT.orig.w,ROT.orig.h,S.img.w,S.img.h)).map(p=>p.map(v=>Math.round(v*0.75))))"), [[round(x),round(y)] for x,y in sk['parcel']])
    print('permintaan:', calls['n'], '| ukuran gambar', calls['gambar'], '| alat', calls['tool'], '| header', calls['hdr'])
    print('pemakaian:', await pg.inner_text('#aiPakai'))
    # buka ulang berkas yang sama: tidak memanggil AI lagi
    n0 = calls['n']
    await pg.evaluate("DOCS.list=[]; AI.hasil={}; renderDocs()")
    await pg.set_input_files('#fileImg', pdfdir + 'SU_16010801_00009_2001.pdf')
    await pg.wait_for_function("DOCS.list.length===1", timeout=30000); await pg.wait_for_timeout(500)
    print('buka ulang: hasil dari simpanan', await pg.evaluate("!!Object.values(AI.hasil)[0]"), '| panggilan baru', calls['n'] - n0)
    await pg.screenshot(path=D + 'v28_claude.png')
    print('kunci tidak ada di log:', 'sk-ant-uji' not in await pg.evaluate("LOG.text()"))
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
