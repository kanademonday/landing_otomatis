"""Uji tools/fetch_samarinda.py dengan respons Overpass tiruan (tanpa internet).
Jalankan setelah `node tests/e2e/gen.js`. Hasil ditulis ke tests/e2e/data/ (dipakai uji e2e)."""
import json, os, subprocess, sys
H = os.path.dirname(os.path.abspath(__file__))
E = H + '/e2e/'
# kotak-kotak tiruan di sekitar data jalan sintetis (pusat -0.49, 117.15)
def box(s, w, n, e): return [(s, w), (s, e), (n, e), (n, w), (s, w)]
def geom(pts): return [{'lat': a, 'lon': b} for a, b in pts]
def rel(i, lvl, name, ring, split=False):
    if split:  # pecah jadi 2 way, salah satunya terbalik -> uji penyambungan ring
        a, b = ring[:3], ring[2:]
        mem = [{'type': 'way', 'role': 'outer', 'geometry': geom(a)}, {'type': 'way', 'role': 'outer', 'geometry': geom(b[::-1])}]
    else:
        mem = [{'type': 'way', 'role': 'outer', 'geometry': geom(ring)}]
    return {'type': 'relation', 'id': i, 'tags': {'boundary': 'administrative', 'admin_level': str(lvl), 'name': name}, 'members': mem}
els = [rel(1, 5, 'Kota Samarinda', box(-0.505, 117.135, -0.475, 117.165)),
       rel(2, 6, 'Kecamatan Sungai Pinang', box(-0.505, 117.135, -0.475, 117.165), split=True),
       rel(3, 7, 'Temindung Permai', box(-0.495, 117.140, -0.480, 117.155), split=True),
       rel(4, 7, 'Kelurahan Gunung Lingai', box(-0.505, 117.135, -0.495, 117.150)),
       rel(5, 7, 'Sempaja Selatan', box(-0.48, 117.15, -0.475, 117.16))]
json.dump({'elements': els}, open(E + 'admin.json', 'w'))
out = E + 'data'
os.makedirs(out, exist_ok=True)
r = subprocess.run([sys.executable, H + '/../tools/fetch_samarinda.py', '--dari-file', E + 'admin.json', E + 'overpass.json'],
                   env={**os.environ, 'DATA_OUT': out}, capture_output=True, text=True)
print(r.stdout); assert r.returncode == 0, r.stderr
W = json.load(open(out + '/samarinda_wilayah.json')); J = json.load(open(out + '/samarinda_jalan.json'))
sp = next(k for k in W['kecamatan'] if k['nama'] == 'Sungai Pinang')
assert sp['rings'] and sp['rings'][0][0] == sp['rings'][0][-1] and len(sp['rings'][0]) == 5, sp['rings']
tp = next(l for l in sp['kelurahan'] if l['nama'] == 'Temindung Permai')
assert tp['rings'] and len(tp['rings'][0]) == 5
assert next(l for l in sp['kelurahan'] if l['nama'] == 'Gunung Lingai')['rings']
assert next(l for l in sp['kelurahan'] if l['nama'] == 'Bandara')['rings'] is None
src = json.load(open(E + 'overpass.json'))
assert len(J['w']) == sum(1 for e in src['elements'] if e['type'] == 'way')
# cek decode koordinat
lat = lon = 0; first = None
for i in range(0, len(J['n']), 2):
    lat += J['n'][i]; lon += J['n'][i + 1]
    if first is None: first = (lat / 1e6, lon / 1e6)
used = {n for e in src['elements'] if e['type'] == 'way' for n in e['nodes']}
n0 = min((e for e in src['elements'] if e['type'] == 'node' and e['id'] in used), key=lambda e: e['id'])
assert abs(first[0] - n0['lat']) < 1e-6 and abs(first[1] - n0['lon']) < 1e-6
print('test_fetch OK')
