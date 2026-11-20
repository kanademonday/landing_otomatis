#!/usr/bin/env python3
"""Mengunduh batas wilayah (kecamatan & kelurahan) dan seluruh jalan Kota Samarinda
dari OpenStreetMap (Overpass API), lalu menyimpannya ringkas di folder data/.

Dijalankan otomatis oleh GitHub Actions (.github/workflows/data-samarinda.yml).
Uji lokal tanpa internet:  python tools/fetch_samarinda.py --dari-file admin.json jalan.json
"""
import datetime
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('DATA_OUT') or os.path.join(ROOT, 'data')

# Daftar resmi (Kemendagri): 10 kecamatan, 59 kelurahan
SAMARINDA = [
    ('Loa Janan Ilir', '64.72.10', ['Simpang Tiga', 'Tani Aman', 'Sengkotek', 'Harapan Baru', 'Rapak Dalam']),
    ('Palaran', '64.72.01', ['Rawa Makmur', 'Handil Bakti', 'Bukuan', 'Simpang Pasir', 'Bantuas']),
    ('Samarinda Ilir', '64.72.04', ['Selili', 'Sidodamai', 'Sidomulyo', 'Sungai Dama', 'Pelita']),
    ('Samarinda Kota', '64.72.09', ['Karang Mumus', 'Pelabuhan', 'Pasar Pagi', 'Bugis', 'Sungai Pinang Luar']),
    ('Samarinda Seberang', '64.72.02', ['Sungai Keledang', 'Baqa', 'Mesjid', 'Mangkupalas', 'Tenun Samarinda', 'Gunung Panjang']),
    ('Samarinda Ulu', '64.72.03', ['Teluk Lerong Ilir', 'Jawa', 'Air Putih', 'Sidodadi', 'Air Hitam', 'Dadi Mulya', 'Gunung Kelua', 'Bukit Pinang']),
    ('Samarinda Utara', '64.72.05', ['Sempaja Selatan', 'Lempake', 'Sungai Siring', 'Sempaja Utara', 'Tanah Merah', 'Sempaja Barat', 'Sempaja Timur', 'Budaya Pampang']),
    ('Sambutan', '64.72.07', ['Sungai Kapih', 'Sambutan', 'Makroman', 'Sindang Sari', 'Pulau Atas']),
    ('Sungai Kunjang', '64.72.06', ['Loa Bakung', 'Loa Buah', 'Karang Asam Ulu', 'Lok Bahu', 'Teluk Lerong Ulu', 'Karang Asam Ilir', 'Karang Anyar']),
    ('Sungai Pinang', '64.72.08', ['Temindung Permai', 'Sungai Pinang Dalam', 'Gunung Lingai', 'Mugirejo', 'Bandara']),
]

MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
KOTA = 'rel["boundary"="administrative"]["admin_level"="5"]["name"~"Samarinda",i]->.k;'
Q_ADMIN = f'[out:json][timeout:600];{KOTA}.k out geom;.k map_to_area->.a;rel(area.a)["boundary"="administrative"]["admin_level"~"^(6|7)$"];out geom;'
EXCL = 'proposed|construction|abandoned|platform|raceway|bus_stop|elevator|corridor|razed|disused'


def q_jalan(s, w, n, e):
    return (f'[out:json][timeout:240];way["highway"]["highway"!~"^({EXCL})$"]'
            f'({s:.6f},{w:.6f},{n:.6f},{e:.6f})->.w;.w out body;node(w.w);out skel qt;')

LAPORAN = []


def lapor(msg):
    print(msg, flush=True)
    LAPORAN.append(msg)


def overpass(q, label, putaran=6, boleh_kosong=False):
    for attempt in range(putaran):
        for m in MIRRORS:
            t0 = time.time()
            try:
                req = urllib.request.Request(m, data=urllib.parse.urlencode({'data': q}).encode(),
                                             headers={'User-Agent': 'landing_otomatis-data (github.com/kanademonday/landing_otomatis)'})
                with urllib.request.urlopen(req, timeout=300) as r:
                    txt = r.read()
                j = json.loads(txt)
                if 'elements' not in j or (not j['elements'] and (not boleh_kosong or j.get('remark'))):
                    raise RuntimeError('respons kosong: ' + str(j.get('remark', ''))[:300])
                lapor(f'{label}: OK dari {m} ({len(txt)/1e6:.1f} MB, {time.time()-t0:.0f} dtk, {len(j["elements"])} elemen)')
                return j
            except Exception as e:  # noqa: BLE001
                print(f'{label}: gagal {m}: {e}', file=sys.stderr, flush=True)
        tunggu = min(300, 20 * 2 ** attempt)
        print(f'{label}: semua server gagal, tunggu {tunggu} dtk', file=sys.stderr, flush=True)
        time.sleep(tunggu)
    raise SystemExit(f'{label}: gagal dari semua server Overpass')


def norm(s):
    s = (s or '').lower()
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    s = re.sub(r'\b(kelurahan|kecamatan|desa|kel|kec)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def rakit_ring(rel):
    """Menyambung member way (outer) relasi menjadi ring tertutup [[lat,lon],...]."""
    segs = []
    for m in rel.get('members', []):
        if m.get('type') != 'way' or m.get('role') not in ('outer', '') or not m.get('geometry'):
            continue
        segs.append([(round(g['lat'], 7), round(g['lon'], 7)) for g in m['geometry']])
    rings = []
    while segs:
        ring = segs.pop(0)
        guard = 0
        while ring[0] != ring[-1] and guard < 10000:
            guard += 1
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                break
            else:
                break
        if len(ring) >= 4:
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            rings.append([[round(a, 6), round(b, 6)] for a, b in ring])
    return rings


def luas_kira(rings):
    """Luas kira-kira (km²) untuk laporan."""
    tot = 0
    for r in rings:
        lat0 = sum(p[0] for p in r) / len(r)
        k = math.cos(math.radians(lat0))
        a = 0
        for i in range(len(r) - 1):
            a += (r[i][1] * k * 111.32) * (r[i + 1][0] * 110.57) - (r[i + 1][1] * k * 111.32) * (r[i][0] * 110.57)
        tot += abs(a) / 2
    return tot


def jalan_per_petak(ja, nx=3, ny=3):
    """Ambil jalan per petak (bbox kota dibagi nx*ny) supaya tiap permintaan kecil & cepat."""
    lats, lons = [], []
    for e in ja['elements']:
        if e['type'] == 'relation' and e['tags'].get('admin_level') == '5':
            for m in e.get('members', []):
                for g in m.get('geometry') or []:
                    lats.append(g['lat']); lons.append(g['lon'])
    if not lats:
        raise SystemExit('Batas kota Samarinda tidak ditemukan di respons Overpass')
    s, n, w, e = min(lats) - 0.003, max(lats) + 0.003, min(lons) - 0.003, max(lons) + 0.003
    lapor(f'BBox Samarinda: {s:.4f},{w:.4f},{n:.4f},{e:.4f} → {nx}x{ny} petak')
    els, seen = [], set()
    for i in range(ny):
        for k in range(nx):
            ps, pn = s + (n - s) * i / ny, s + (n - s) * (i + 1) / ny
            pw, pe = w + (e - w) * k / nx, w + (e - w) * (k + 1) / nx
            time.sleep(5)
            j = overpass(q_jalan(ps, pw, pn, pe), f'Jalan petak {i * nx + k + 1}/{nx * ny}', putaran=8, boleh_kosong=True)
            for el in j['elements']:
                key = (el['type'], el['id'])
                if key not in seen:
                    seen.add(key); els.append(el)
    return {'elements': els}


def proses_admin(j):
    rels = [e for e in j['elements'] if e['type'] == 'relation']
    kota = next((r for r in rels if r['tags'].get('admin_level') == '5'), None)
    lv6 = [r for r in rels if r['tags'].get('admin_level') == '6']
    lv7 = [r for r in rels if r['tags'].get('admin_level') == '7']
    lapor(f'Relasi OSM: kota={bool(kota)}, level6={len(lv6)}, level7={len(lv7)}')

    def cari(nama, kandidat):
        n = norm(nama)
        exact = [r for r in kandidat if norm(r['tags'].get('name')) == n or norm(r['tags'].get('alt_name')) == n]
        if exact:
            return exact[0]
        part = [r for r in kandidat if len(n) >= 4 and (n in norm(r['tags'].get('name')) or norm(r['tags'].get('name')) in n) and len(norm(r['tags'].get('name'))) >= 4]
        return part[0] if len(part) == 1 else None

    out = {'kota': {'nama': 'Samarinda', 'rings': rakit_ring(kota) if kota else None}, 'kecamatan': []}
    hilang = []
    for kec, kode, kels in SAMARINDA:
        rk = cari(kec, lv6)
        ent = {'nama': kec, 'kode': kode, 'rings': rakit_ring(rk) if rk else None, 'osm': rk['tags'].get('name') if rk else None, 'kelurahan': []}
        if not rk:
            hilang.append('Kecamatan ' + kec)
        for kel in kels:
            r = cari(kel, lv7)
            rings = rakit_ring(r) if r else None
            if not rings:
                hilang.append(f'Kelurahan {kel} (Kec. {kec})')
            ent['kelurahan'].append({'nama': kel, 'rings': rings or None, 'osm': r['tags'].get('name') if r else None,
                                     'km2': round(luas_kira(rings), 2) if rings else None})
        out['kecamatan'].append(ent)
    n_ok = sum(1 for k in out['kecamatan'] for l in k['kelurahan'] if l['rings'])
    lapor(f'Batas kelurahan ditemukan: {n_ok}/59')
    for h in hilang:
        lapor('  TIDAK ADA batas di OSM: ' + h)
    return out


def proses_jalan(j):
    nodes = {e['id']: (e['lat'], e['lon']) for e in j['elements'] if e['type'] == 'node'}
    ways = [e for e in j['elements'] if e['type'] == 'way']
    used = sorted({n for w in ways for n in w.get('nodes', []) if n in nodes})
    idx = {nid: i for i, nid in enumerate(used)}
    flat, pa, pb = [], 0, 0
    for nid in used:
        a, b = round(nodes[nid][0] * 1e6), round(nodes[nid][1] * 1e6)
        flat += [a - pa, b - pb]
        pa, pb = a, b
    hw, names, wout = [], [], []
    hwi, nmi = {}, {}
    for w in ways:
        t = w.get('tags', {})
        h = t.get('highway', 'road')
        if h not in hwi:
            hwi[h] = len(hw); hw.append(h)
        nm = ' ; '.join(x for x in [t.get('name'), t.get('alt_name'), t.get('old_name'), t.get('short_name')] if x)
        ni = -1
        if nm:
            if nm not in nmi:
                nmi[nm] = len(names); names.append(nm)
            ni = nmi[nm]
        ns = [idx[n] for n in w.get('nodes', []) if n in idx]
        if len(ns) >= 2:
            wout.append([hwi[h], ni] + ns)
    lapor(f'Jalan: {len(wout)} ruas, {len(used)} simpul, {len(names)} nama jalan unik')
    return {'v': 1, 'hw': hw, 'names': names, 'n': flat, 'w': wout}


def main():
    os.makedirs(OUT, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    if len(sys.argv) >= 4 and sys.argv[1] == '--dari-file':
        ja, jj = json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))
    else:
        ja = overpass(Q_ADMIN, 'Batas wilayah')
        jj = jalan_per_petak(ja)
    wil = proses_admin(ja)
    jal = proses_jalan(jj)
    meta = {'dibuat': now, 'sumber': '© OpenStreetMap contributors (ODbL)'}
    wil.update(meta)
    jal.update(meta)
    with open(os.path.join(OUT, 'samarinda_wilayah.json'), 'w', encoding='utf-8') as f:
        json.dump(wil, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'samarinda_jalan.json'), 'w', encoding='utf-8') as f:
        json.dump(jal, f, ensure_ascii=False, separators=(',', ':'))
    for fn in ('samarinda_wilayah.json', 'samarinda_jalan.json'):
        lapor(f'{fn}: {os.path.getsize(os.path.join(OUT, fn))/1e6:.2f} MB')
    with open(os.path.join(OUT, 'LAPORAN.txt'), 'w', encoding='utf-8') as f:
        f.write(f'Data dibuat: {now}\n' + '\n'.join(LAPORAN) + '\n')


if __name__ == '__main__':
    main()
