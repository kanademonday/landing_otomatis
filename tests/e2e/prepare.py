"""Membuat data uji: jalankan `node tests/e2e/gen.js` dulu, lalu skrip ini."""
import json, os
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__)) + '/'
d = json.load(open(D + 'sketch.json'))
im = Image.new('RGB', (d['W'], d['H']), 'white'); g = ImageDraw.Draw(im)
for r in d['roads']: g.line([tuple(p) for p in r['pts']], fill=(80, 80, 80), width=18)
g.polygon([tuple(p) for p in d['parcel']], fill=(255, 200, 200), outline='black')
im.save(D + 'sketch.png')
o = json.load(open(D + 'overpass.json'))
x = ['<?xml version="1.0"?><osm version="0.6">']
for e in o['elements']:
    if e['type'] == 'node': x.append(f'<node id="{e["id"]}" lat="{e["lat"]}" lon="{e["lon"]}"/>')
for e in o['elements']:
    if e['type'] == 'way':
        x.append(f'<way id="{e["id"]}">' + ''.join(f'<nd ref="{n}"/>' for n in e['nodes']) + ''.join(f'<tag k="{k}" v="{v}"/>' for k, v in e['tags'].items() if v) + '</way>')
x.append('<way id="999999"><nd ref="1000"/><nd ref="1001"/><tag k="building" v="yes"/></way></osm>')
open(D + 'map.osm', 'w').write(''.join(x))
print('data uji siap')
