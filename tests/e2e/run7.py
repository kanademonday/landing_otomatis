"""Uji v2.6: baca otomatis dengan AI (Groq tiruan): baca berkas, isi formulir, telusuri gambar, batas pemakaian (429), terbilang."""
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
  calls = {'n': 0, 'auth': set(), 'img': 0}
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
      u = r.request.url
      if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK2, content_type='application/javascript')
      elif 'pdfjs-dist' in u: await r.fulfill(path=PDFJS + u.split('/build/')[1], content_type='text/javascript')
      elif 'api.groq.com' in u:
        hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
        if r.request.method == 'OPTIONS': await r.fulfill(status=204, headers=hdr); return
        if u.endswith('/models'): await r.fulfill(body=json.dumps({'data': [{'id': 'qwen/qwen3.6-27b'}]}), content_type='application/json', headers=hdr); return
        calls['n'] += 1; calls['auth'].add(r.request.headers.get('authorization'))
        body = json.loads(r.request.post_data); cont = body['messages'][0]['content']
        calls['img'] += sum(1 for c in cont if c['type'] == 'image_url' and c['image_url']['url'].startswith('data:image/jpeg;base64,'))
        if calls['n'] == 1: await r.fulfill(status=429, body='{"error":"rate limit"}', headers={**hdr, 'retry-after': '1'}); return
        txt = cont[0]['text']
        ans = jawab_gambar if 'gambar situasi bidang tanah dari surat ukur' in txt else jawab_baca
        await r.fulfill(body=json.dumps({'choices': [{'message': {'content': json.dumps(ans)}}]}), content_type='application/json', headers=hdr)
      elif 'localhost:11434' in u:
        hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
        if r.request.method == 'OPTIONS': await r.fulfill(status=204, headers=hdr); return
        if u.endswith('/api/tags'): await r.fulfill(body=json.dumps({'models': [{'name': 'qwen2.5vl:7b'}]}), content_type='application/json', headers=hdr); return
        body = json.loads(r.request.post_data); calls['ollama'] = calls.get('ollama', 0) + 1
        assert body['format']['type'] == 'object' and len(body['messages'][0]['images']) == 1
        await r.fulfill(body=json.dumps({'message': {'content': json.dumps(jawab_baca)}}), content_type='application/json', headers=hdr)
      elif '/data/samarinda_' in u:
        f = D + 'data/' + u.split('/data/')[1]
        if os.path.exists(f): await r.fulfill(body=open(f).read(), content_type='application/json')
        else: await r.fulfill(status=404, body='')
      else: await r.fulfill(status=404, body='')
    await pg.route('**/*', lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
    await pg.goto('file://' + os.path.abspath(H + '../../index.html'))
    await pg.wait_for_function("SMD.status.jalan!=='memuat'", timeout=20000)
    print('terbilang:', await pg.evaluate("['dua ratus empat puluh','seribu dua ratus lima puluh','tiga ratus lima puluh lima','sebelas','dua belas','seratus dua puluh tiga','empat ratus empat puluh empat meter persegi'].map(terbilang)"))
    await pg.evaluate("localStorage.removeItem('plotkw.kode'); KODE_KEL['16010801']=['Sungai Pinang','Temindung Permai']")
    await pg.click('[data-step="2"]')
    await pg.evaluate("document.getElementById('aiSet').open=true")
    print('layanan bawaan:', await pg.evaluate("[$('inAiProv').value,$('inAiModel').value]"))
    await pg.fill('#inAiKey', 'gsk_uji'); await pg.click('#btnAiTes'); await pg.wait_for_timeout(300)
    print('tes koneksi:', await pg.inner_text('#aiStatus'))
    await pg.set_input_files('#fileImg', pdfdir + 'SU_16010801_00009_2001.pdf')
    await pg.wait_for_function("DOCS.list.length===1 && S.osm!==null", timeout=30000)
    await pg.click('[data-baca]')
    await pg.wait_for_function("Object.keys(AI.hasil).length===1", timeout=30000); await pg.wait_for_timeout(200)
    print('hasil baca:', (await pg.inner_text('.hasil-ai')).replace('\n', ' | ')[:300])
    await pg.click('[data-isi]'); await pg.wait_for_timeout(200)
    print('terisi: luas', await pg.evaluate("$('inLuas').value"), '| jalan berikut', await pg.evaluate("$('inRoadName').value"), '| sorot', await pg.evaluate("$('inLuas').classList.contains('dari-ai')"))
    await pg.click('[data-gbr]'); await pg.wait_for_timeout(400); await pg.click('#vwPakai'); await pg.wait_for_function("S.img && S.img.dpi", timeout=20000)
    await pg.click('#btnTelusuriAI'); await pg.wait_for_function("S.roads.length>0 && S.parcel", timeout=30000); await pg.wait_for_timeout(300)
    print('telusur AI: jalan', await pg.evaluate("S.roads.length"), '| titik bidang', await pg.evaluate("S.parcel.length"), '| putar', await pg.evaluate("ROT.deg"))
    await pg.screenshot(path=D + 'v26_ai.png')
    await pg.click('[data-step="3"]'); await pg.click('#btnMatch')
    await pg.wait_for_function("document.getElementById('progTx').textContent.startsWith('Selesai')", timeout=120000)
    c = await pg.evaluate("CORE.centroid(finalLL())")
    print('galat m', round(math.hypot((c[0]-sk['truth'][0])*110540, (c[1]-sk['truth'][1])*111320), 2))
    print('panggilan AI:', calls['n'], '(termasuk 1x 429) | kunci terkirim', calls['auth'], '| gambar terkirim', calls['img'])
    await pg.click('[data-step="2"]'); await pg.evaluate("document.getElementById('aiSet').open=true")
    await pg.select_option('#inAiProv', 'ollama'); await pg.wait_for_timeout(100)
    print('ganti ke Ollama: model', await pg.evaluate("$('inAiModel').value"), '| alamat', await pg.evaluate("$('inAiUrl').value"))
    await pg.click('#btnAiTes'); await pg.wait_for_timeout(300); print('tes Ollama:', await pg.inner_text('#aiStatus'))
    await pg.evaluate("AI.hasil={}; renderDocs()"); await pg.click('[data-baca]')
    await pg.wait_for_function("Object.keys(AI.hasil).length===1", timeout=30000)
    print('baca via Ollama: panggilan', calls.get('ollama'), '| luas', await pg.evaluate("Object.values(AI.hasil)[0].gabung.luas"))
    print('kunci tidak ada di log:', 'gsk_uji' not in await pg.evaluate("LOG.text()"))
    print('page errors:', errs, '| LOG.errors', await pg.evaluate("LOG.errors"))
    await b.close()
asyncio.run(main())
