import asyncio, os
from playwright.async_api import async_playwright
exec(open(''+__import__('os').path.dirname(__import__('os').path.abspath(__file__))+'/run.py').read().split('async def main')[0])
calls={'api':0}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for mode in ['api','file']:
      pg=await b.new_page(viewport={'width':1400,'height':900})
      async def route(r):
        u=r.request.url
        if 'leaflet' in u and u.endswith('.js'): await r.fulfill(body=MOCK,content_type='application/javascript')
        elif 'nominatim' in u: await r.fulfill(body=open(D+'nominatim.json').read(),content_type='application/json')
        elif 'overpass' in u or 'maps.mail.ru' in u: await r.fulfill(status=502,body='busy')
        elif 'api.openstreetmap.org' in u:
          calls['api']+=1
          if calls['api']==1: await r.fulfill(status=400,body='You requested too many nodes')
          elif mode=='file': await r.fulfill(status=509,body='bandwidth')
          else: await r.fulfill(body=open(D+'map.osm').read(),content_type='text/xml')
        else: await r.fulfill(status=404,body='')
      await pg.route('**/*',lambda r: route(r) if not r.request.url.startswith('file:') else r.continue_())
      await pg.goto('file://'+os.path.abspath(os.path.dirname(os.path.abspath(__file__))+'/../../index.html'))
      await pg.wait_for_function("SMD.status.jalan!=='memuat'",timeout=20000)
      await pg.select_option('#inKec','Samarinda Ilir');await pg.select_option('#inKel','Selili')
      await pg.wait_for_function("!document.getElementById('btnJalan').disabled",timeout=20000)
      print('tanpa data tersimpan -> wilayah via Nominatim:',await pg.evaluate("S.wil.name"))
      if mode=='api':
        await pg.click('#btnJalan');await pg.wait_for_function("S.osm!==null",timeout=60000)
        print('API:',await pg.inner_text('#jalanInfo'),'| calls',calls['api'])
      else:
        await pg.set_input_files('#fileOsm',D+'map.osm');await pg.wait_for_function("S.osm!==null",timeout=20000)
        print('FILE:',await pg.inner_text('#jalanInfo'))
      print(await pg.evaluate("LOG.entries.filter(e=>/Overpass|OSM API|Sumber|dipecah|Impor/.test(e.msg)).map(e=>e.level+' '+e.msg).slice(-8).join('\\n')"))
      await pg.close()
    await b.close()
asyncio.run(main())
