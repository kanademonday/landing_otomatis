/* ===== CORE: algoritma pencocokan (tanpa DOM) ===== */
const CORE = (() => {
  const DEG = Math.PI / 180;
  const BIG = 1e9;

  function makeProj(lat0, lon0) {
    const p = lat0 * DEG;
    const mLat = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p);
    const mLon = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
    return {
      lat0, lon0,
      fwd: (lat, lon) => [(lon - lon0) * mLon, (lat - lat0) * mLat],
      inv: (x, y) => [lat0 + y / mLat, lon0 + x / mLon]
    };
  }

  // Transverse Mercator generik (UTM / TM-3 BPN)
  function toTM(lat, lon, lonC, k0, FE, FN) {
    const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f);
    const e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);
    const ph = lat * DEG, l = lon * DEG, l0 = lonC * DEG;
    const sp = Math.sin(ph), cp = Math.cos(ph), tp = Math.tan(ph);
    const N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * (l - l0);
    const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * ph
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * ph)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * ph)
      - (35 * e6 / 3072) * Math.sin(6 * ph));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + FE;
    const Nn = k0 * (M + N * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720)) + FN;
    return [E, Nn];
  }
  function toUTM(lat, lon) {
    const zone = Math.floor((lon + 180) / 6) + 1;
    const cm = zone * 6 - 183;
    const [E, N] = toTM(lat, lon, cm, 0.9996, 500000, lat < 0 ? 10000000 : 0);
    return { zone: zone + (lat < 0 ? 'S' : 'N'), E, N };
  }
  function toTM3(lat, lon) {
    const zone = Math.floor((lon + 180) / 6) + 1;
    const cm = zone * 6 - 183;
    const sub = lon < cm ? 1 : 2;
    const cm3 = sub === 1 ? cm - 1.5 : cm + 1.5;
    const [E, N] = toTM(lat, lon, cm3, 0.9999, 200000, 1500000);
    return { zone: zone + '.' + sub, E, N };
  }

  // Invers Transverse Mercator → [lat, lon]
  function fromTM(E, N, lonC, k0, FE, FN) {
    const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const e4 = e2 * e2, e6 = e4 * e2, e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const x = (E - FE) / k0, M = (N - FN) / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s1 = Math.sin(p1), c1 = Math.cos(p1), t1 = Math.tan(p1);
    const C1 = ep2 * c1 * c1, T1 = t1 * t1, N1 = a / Math.sqrt(1 - e2 * s1 * s1), R1 = a * (1 - e2) / Math.pow(1 - e2 * s1 * s1, 1.5), D = x / N1;
    const lat = p1 - (N1 * t1 / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = lonC * DEG + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c1;
    return [lat / DEG, lon / DEG];
  }
  // Sistem koordinat proyek (ekspor/impor DXF)
  const CRS = {
    'tm3-50.2': { nama: 'TM-3 zona 50.2 (Samarinda, bujur ≥ 117°)', lonC: 118.5, k0: 0.9999, FE: 200000, FN: 1500000 },
    'tm3-50.1': { nama: 'TM-3 zona 50.1 (bujur < 117°)', lonC: 115.5, k0: 0.9999, FE: 200000, FN: 1500000 },
    'utm-50s': { nama: 'UTM zona 50S (WGS84)', lonC: 117, k0: 0.9996, FE: 500000, FN: 10000000 }
  };
  const crsFwd = (id, lat, lon) => { const c = CRS[id]; return toTM(lat, lon, c.lonC, c.k0, c.FE, c.FN); };
  const crsInv = (id, E, N) => { const c = CRS[id]; return fromTM(E, N, c.lonC, c.k0, c.FE, c.FN); };

  // DXF R12 sederhana (dibuka AutoCAD semua versi). items: [{layer, pts:[[E,N]], closed}] , texts: [{layer, at:[E,N], h, text}]
  function dxfR12(layers, items, texts) {
    const L = [];
    const p = (c, v) => L.push(String(c), String(v));
    p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, 6); p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'TABLES'); p(0, 'TABLE'); p(2, 'LAYER'); p(70, layers.length);
    for (const l of layers) { p(0, 'LAYER'); p(2, l.name); p(70, 0); p(62, l.color); p(6, 'CONTINUOUS'); }
    p(0, 'ENDTAB'); p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'ENTITIES');
    for (const it of items) {
      p(0, 'POLYLINE'); p(8, it.layer); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, it.closed ? 1 : 0);
      for (const q of it.pts) { p(0, 'VERTEX'); p(8, it.layer); p(10, q[0].toFixed(4)); p(20, q[1].toFixed(4)); p(30, 0); }
      p(0, 'SEQEND'); p(8, it.layer);
    }
    for (const t of texts || []) { p(0, 'TEXT'); p(8, t.layer); p(10, t.at[0].toFixed(4)); p(20, t.at[1].toFixed(4)); p(30, 0); p(40, t.h || 1); p(1, String(t.text).replace(/[\r\n]+/g, ' ')); }
    p(0, 'ENDSEC'); p(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }
  // Baca polyline tertutup dari DXF (LWPOLYLINE & POLYLINE). Hasil: [{layer, pts:[[x,y]], closed}]
  function dxfPolylines(txt) {
    const lines = txt.split(/\r?\n/); const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1].trim()]);
    const out = []; let cur = null, mode = null, vx = null;
    const flush = () => { if (cur && cur.pts.length >= 3) out.push(cur); cur = null; };
    for (const [c, v] of pairs) {
      if (c === '0') {
        if (mode === 'vertex' && vx && cur) { cur.pts.push(vx); vx = null; }
        if (v === 'LWPOLYLINE') { flush(); cur = { layer: '', pts: [], closed: false }; mode = 'lw'; }
        else if (v === 'POLYLINE') { flush(); cur = { layer: '', pts: [], closed: false }; mode = 'pl'; }
        else if (v === 'VERTEX' && cur) { mode = 'vertex'; vx = [0, 0]; }
        else if (v === 'SEQEND') { flush(); mode = null; }
        else { if (mode === 'lw') flush(); mode = null; }
        continue;
      }
      if (!cur) continue;
      if (c === '8' && (mode === 'lw' || mode === 'pl')) cur.layer = v;
      else if (c === '70' && (mode === 'lw' || mode === 'pl')) cur.closed = (parseInt(v) & 1) === 1;
      else if (mode === 'lw' && c === '10') cur.pts.push([parseFloat(v), 0]);
      else if (mode === 'lw' && c === '20' && cur.pts.length) cur.pts[cur.pts.length - 1][1] = parseFloat(v);
      else if (mode === 'vertex' && c === '10') vx[0] = parseFloat(v);
      else if (mode === 'vertex' && c === '20') vx[1] = parseFloat(v);
    }
    if (mode === 'vertex' && vx && cur) cur.pts.push(vx);
    flush();
    return out;
  }
  // Data persil (DXF dari AutoCAD): poligon bidang + teks label (NIB 5 angka, nomor hak, SU.<kode8><nomor5>/<tahun>, "Luas: N m²").
  // Teks dikelompokkan ke poligon terkecil yang memuatnya. Koordinat dibiarkan dalam sistem file (mis. TM-3 zona 50.2).
  function dxfPersil(txt) {
    const lines = txt.split(/\r?\n/), polys = [], texts = [];
    let cur = null, typ = null;
    const tutup = () => {
      if (typ === 'LW' && cur && cur.pts.length >= 3) polys.push(cur.pts);
      if (typ === 'TX' && cur && cur.t) texts.push(cur.has11 ? { t: cur.t, x: cur.x1, y: cur.y1 } : { t: cur.t, x: cur.x, y: cur.y });
      cur = null; typ = null;
    };
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const c = lines[i].trim(), v = lines[i + 1].replace(/\r$/, '');
      if (c === '0') { tutup(); if (v === 'LWPOLYLINE') { typ = 'LW'; cur = { pts: [] }; } else if (v === 'TEXT' || v === 'MTEXT') { typ = 'TX'; cur = { t: '', x: 0, y: 0 }; } continue; }
      if (!cur) continue;
      if (typ === 'LW') { if (c === '10') cur.pts.push([parseFloat(v), 0]); else if (c === '20' && cur.pts.length) cur.pts[cur.pts.length - 1][1] = parseFloat(v); }
      else if (typ === 'TX') {
        if (c === '1' || c === '3') cur.t += v; else if (c === '10') cur.x = parseFloat(v); else if (c === '20') cur.y = parseFloat(v);
        else if (c === '11') { cur.x1 = parseFloat(v); cur.has11 = true; } else if (c === '21') cur.y1 = parseFloat(v);
      }
    }
    tutup();
    const bid = polys.map(pts => {
      if (pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts = pts.slice(0, -1);
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
      return { pts, bb: [a, b, c, d], luasPoligon: polyArea(pts), nib: null, hak: null, su: null, luas: null };
    });
    // indeks kisi agar cepat
    const cell = 50, grid = new Map(), key = (i, j) => i + ',' + j;
    bid.forEach((p, k) => { for (let i = Math.floor(p.bb[0] / cell); i <= Math.floor(p.bb[2] / cell); i++) for (let j = Math.floor(p.bb[1] / cell); j <= Math.floor(p.bb[3] / cell); j++) { const q = key(i, j); (grid.get(q) || grid.set(q, []).get(q)).push(k); } });
    // label bertumpuk (NIB, hak, SU, luas) berbagi x yang sama → satukan dulu, lalu letakkan di poligon yang memuat titik tengahnya
    const tumpuk = new Map();
    for (const t of texts) {
      const s0 = t.t.replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim(); if (!s0) continue;
      const kx = Math.round(t.x * 1000); let g = tumpuk.get(kx);
      if (!g) tumpuk.set(kx, g = []);
      let grp = g.find(q => Math.abs(q.y0 - t.y) < 8);
      if (!grp) g.push(grp = { y0: t.y, x: t.x, isi: [] });
      grp.isi.push({ s: s0, y: t.y });
    }
    const cari = (x, y) => { const c = (grid.get(key(Math.floor(x / cell), Math.floor(y / cell))) || []).filter(k => { const p = bid[k]; return x >= p.bb[0] && x <= p.bb[2] && y >= p.bb[1] && y <= p.bb[3] && pointInRing(x, y, p.pts); }); return c.length ? c.reduce((m, k) => bid[k].luasPoligon < bid[m].luasPoligon ? k : m) : -1; };
    let lepas = 0;
    for (const g of tumpuk.values()) for (const grp of g) {
      const ym = grp.isi.reduce((a, q) => a + q.y, 0) / grp.isi.length;
      let k = cari(grp.x, ym); if (k < 0) for (const q of grp.isi) { k = cari(grp.x, q.y); if (k >= 0) break; }
      if (k < 0) { lepas += grp.isi.length; continue; }
      const p = bid[k];
      for (const { s: s0 } of grp.isi) {
        let m;
        if ((m = s0.match(/^SU\.?\s*(\d{8})(\d{5})\s*\/\s*(\d{4})/i))) p.su = { kode: m[1], nomor: +m[2], tahun: +m[3], teks: s0 };
        else if (/^\d{5}$/.test(s0)) p.nib = s0;
        else if ((m = s0.match(/^Luas\s*:?\s*([\d.,]+)/i))) p.luas = +m[1].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
        else if (/^(M|HGB|HP|HPL|HW|W|HGU)\.\s*\d+/i.test(s0)) p.hak = s0.replace(/\s+/g, '');
      }
    }
    return { bidang: bid, teks: texts.length, teksLepas: lepas };
  }
  // Titik sampel di dalam poligon (untuk hitung tumpang tindih)
  function interiorSamples(poly, n) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const out = []; const k = Math.ceil(Math.sqrt(n * 2));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / k, y = y0 + (y1 - y0) * (j + 0.5) / k;
      if (pointInRing(x, y, poly)) out.push([x, y]);
    }
    return out;
  }
  // Fraksi luas poligon A (titik sampel dunia) yang jatuh di poligon referensi
  function overlapFrac(samplesW, ref) {
    if (!ref || !ref.length || !samplesW.length) return 0;
    let n = 0;
    for (const s of samplesW) for (const r of ref) {
      if (s[0] < r.bb[0] || s[0] > r.bb[2] || s[1] < r.bb[1] || s[1] > r.bb[3]) continue;
      if (pointInRing(s[0], s[1], r.pts)) { n++; break; }
    }
    return n / samplesW.length;
  }

  function normAng(a) { while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return a; }

  function normName(s) {
    if (!s) return '';
    s = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^a-z0-9 ]+/g, ' ');
    s = s.replace(/\b(jalan|jln|jl|gang|gg|lorong|lrg|lr|jalur|poros)\b/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  function nameMatch(a, b) {
    a = normName(a); b = normName(b);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
    return 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.8;
  }

  // ---------- polyline utils ----------
  function plLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function plPointAt(p, t) {
    if (t <= 0) return p[0].slice();
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (acc + l >= t && l > 0) { const f = (t - acc) / l; return [p[i - 1][0] + f * (p[i][0] - p[i - 1][0]), p[i - 1][1] + f * (p[i][1] - p[i - 1][1])]; }
      acc += l;
    }
    return p[p.length - 1].slice();
  }
  function plNearest(p, q) {
    let best = { d: Infinity, t: 0, pt: p[0] }, acc = 0;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], ay = p[i - 1][1], dx = p[i][0] - ax, dy = p[i][1] - ay;
      const l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      let u = l2 > 0 ? ((q[0] - ax) * dx + (q[1] - ay) * dy) / l2 : 0;
      u = Math.max(0, Math.min(1, u));
      const x = ax + u * dx, y = ay + u * dy, d = Math.hypot(q[0] - x, q[1] - y);
      if (d < best.d) best = { d, t: acc + u * l, pt: [x, y] };
      acc += l;
    }
    return best;
  }
  function segInter(a, b, c, d) {
    const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1];
    const den = r0 * s1 - r1 * s0; if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
    const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [a[0] + t * r0, a[1] + t * r1];
  }
  function polyArea(p) { let A = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; A += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(A) / 2; }
  function centroid(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // ---------- simpang pada sketsa (koordinat matematika: y ke atas) ----------
  function sketchJunctions(roads, tol, delta) {
    const cand = [];
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
      const A = roads[i], B = roads[j];
      for (let a = 1; a < A.length; a++) for (let b = 1; b < B.length; b++) {
        const p = segInter(A[a - 1], A[a], B[b - 1], B[b]); if (p) cand.push(p);
      }
      for (const [P, Q] of [[A, B], [B, A]]) for (const e of [P[0], P[P.length - 1]]) {
        const n = plNearest(Q, e); if (n.d < tol) cand.push([(e[0] + n.pt[0]) / 2, (e[1] + n.pt[1]) / 2]);
      }
    }
    const cl = [];
    for (const p of cand) {
      const c = cl.find(c => Math.hypot(c.x - p[0], c.y - p[1]) < tol);
      if (c) { c.x = (c.x * c.n + p[0]) / (c.n + 1); c.y = (c.y * c.n + p[1]) / (c.n + 1); c.n++; }
      else cl.push({ x: p[0], y: p[1], n: 1 });
    }
    const out = [];
    for (const c of cl) {
      const P = [c.x, c.y], br = [];
      for (const R of roads) {
        const n = plNearest(R, P); if (n.d >= tol) continue;
        const L = plLen(R);
        if (L - n.t > 0.3 * delta) { const q = plPointAt(R, Math.min(n.t + delta, L)); br.push(Math.atan2(q[1] - P[1], q[0] - P[0])); }
        if (n.t > 0.3 * delta) { const q = plPointAt(R, Math.max(n.t - delta, 0)); br.push(Math.atan2(q[1] - P[1], q[0] - P[0])); }
      }
      const ub = [];
      for (const b of br) if (!ub.some(u => Math.abs(normAng(u - b)) < 15 * DEG)) ub.push(b);
      if (ub.length >= 3) out.push({ x: c.x, y: c.y, br: ub });
    }
    return out;
  }

  // ---------- graf OSM ----------
  // ways: [{nodes:[id], name, hw}], nodeXY: Map id->[x,y]
  function buildGraph(ways, nodeXY) {
    const nb = new Map();
    for (const w of ways) for (let i = 1; i < w.nodes.length; i++) {
      const a = w.nodes[i - 1], b = w.nodes[i]; if (a === b || !nodeXY.has(a) || !nodeXY.has(b)) continue;
      if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set());
      nb.get(a).add(b); nb.get(b).add(a);
    }
    return nb;
  }
  function osmJunctions(nb, nodeXY, delta, inArea) {
    const out = [];
    for (const [id, set] of nb) {
      if (set.size < 3) continue;
      const P = nodeXY.get(id); if (inArea && !inArea(P[0], P[1])) continue;
      const br = [];
      for (const k of set) {
        let prev = id, cur = k, acc = Math.hypot(nodeXY.get(k)[0] - P[0], nodeXY.get(k)[1] - P[1]);
        let guard = 0;
        while (acc < delta && guard++ < 200) {
          const s = nb.get(cur); if (!s || s.size !== 2) break;
          let nx = null; for (const q of s) if (q !== prev) nx = q;
          if (nx === null) break;
          acc += Math.hypot(nodeXY.get(nx)[0] - nodeXY.get(cur)[0], nodeXY.get(nx)[1] - nodeXY.get(cur)[1]);
          prev = cur; cur = nx;
        }
        const Q = nodeXY.get(cur);
        br.push(Math.atan2(Q[1] - P[1], Q[0] - P[0]));
      }
      out.push({ id, x: P[0], y: P[1], br });
    }
    return out;
  }

  // ---------- distance transform ----------
  function edt1d(f, d, v, z, n) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
  }
  function edt2d(f, nx, ny) {
    const n = Math.max(nx, ny);
    const fb = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) fb[y] = f[y * nx + x];
      edt1d(fb, d, v, z, ny);
      for (let y = 0; y < ny; y++) f[y * nx + x] = d[y];
    }
    for (let y = 0; y < ny; y++) {
      const o = y * nx;
      for (let x = 0; x < nx; x++) fb[x] = f[o + x];
      edt1d(fb, d, v, z, nx);
      for (let x = 0; x < nx; x++) f[o + x] = d[x];
    }
  }
  // polys: array of [[x,y],...]; bb {minx,miny,maxx,maxy}
  function buildField(polys, bb, res) {
    const nx = Math.ceil((bb.maxx - bb.minx) / res) + 1, ny = Math.ceil((bb.maxy - bb.miny) / res) + 1;
    const f = new Float64Array(nx * ny).fill(1e20);
    let hits = 0;
    for (const p of polys) for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], ay = p[i - 1][1], dx = p[i][0] - ax, dy = p[i][1] - ay;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (res * 0.5)));
      for (let k = 0; k <= n; k++) {
        const x = ax + dx * k / n, y = ay + dy * k / n;
        const ix = Math.floor((x - bb.minx) / res), iy = Math.floor((y - bb.miny) / res);
        if (ix >= 0 && iy >= 0 && ix < nx && iy < ny) { f[iy * nx + ix] = 0; hits++; }
      }
    }
    if (hits) edt2d(f, nx, ny);
    const d = new Float32Array(nx * ny);
    for (let i = 0; i < d.length; i++) d[i] = (!hits || f[i] >= 1e19) ? BIG : Math.sqrt(f[i]) * res;
    return { x0: bb.minx, y0: bb.miny, res, nx, ny, d };
  }
  function look(F, x, y) {
    const ix = Math.floor((x - F.x0) / F.res), iy = Math.floor((y - F.y0) / F.res);
    if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny) return BIG;
    return F.d[iy * F.nx + ix];
  }

  function samplePolys(polys, spacing) {
    const xs = [], ys = [], dirs = [], src = [];
    polys.forEach((p, pi) => {
      for (let i = 1; i < p.length; i++) {
        const ax = p[i - 1][0], ay = p[i - 1][1], dx = p[i][0] - ax, dy = p[i][1] - ay, L = Math.hypot(dx, dy);
        const n = Math.max(1, Math.round(L / spacing)), a = Math.atan2(dy, dx);
        for (let k = (i === 1 ? 0 : 1); k <= n; k++) { xs.push(ax + dx * k / n); ys.push(ay + dy * k / n); dirs.push(a); src.push(pi); }
      }
    });
    return { xs, ys, dirs, src };
  }
  function buildBuckets(xs, ys, bb, cell) {
    const nx = Math.ceil((bb.maxx - bb.minx) / cell) + 1, ny = Math.ceil((bb.maxy - bb.miny) / cell) + 1;
    const cnt = new Int32Array(nx * ny + 1);
    const idx = new Int32Array(xs.length);
    for (let i = 0; i < xs.length; i++) {
      const ix = Math.min(nx - 1, Math.max(0, Math.floor((xs[i] - bb.minx) / cell)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor((ys[i] - bb.miny) / cell)));
      idx[i] = iy * nx + ix; cnt[idx[i] + 1]++;
    }
    for (let i = 1; i < cnt.length; i++) cnt[i] += cnt[i - 1];
    const fill = cnt.slice(0, -1), items = new Int32Array(xs.length);
    for (let i = 0; i < xs.length; i++) items[fill[idx[i]]++] = i;
    return { bb, cell, nx, ny, start: cnt, items, xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
  }

  // ---------- transformasi ----------
  // T = {s, th, tx, ty}: world = s R(th) p + t   (p koordinat matematika sketsa)
  function fwdT(T, x, y) { const c = Math.cos(T.th) * T.s, s = Math.sin(T.th) * T.s; return [c * x - s * y + T.tx, s * x + c * y + T.ty]; }
  function invT(T, X, Y) { const c = Math.cos(T.th), s = Math.sin(T.th), dx = X - T.tx, dy = Y - T.ty; return [(c * dx + s * dy) / T.s, (-s * dx + c * dy) / T.s]; }
  function similarity2D(src, dst) {
    const n = src.length; let msx = 0, msy = 0, mdx = 0, mdy = 0;
    for (let i = 0; i < n; i++) { msx += src[i][0]; msy += src[i][1]; mdx += dst[i][0]; mdy += dst[i][1]; }
    msx /= n; msy /= n; mdx /= n; mdy /= n;
    let a = 0, b = 0, v = 0;
    for (let i = 0; i < n; i++) {
      const sx = src[i][0] - msx, sy = src[i][1] - msy, dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
      a += sx * dx + sy * dy; b += sx * dy - sy * dx; v += sx * sx + sy * sy;
    }
    const s = Math.hypot(a, b) / v, th = Math.atan2(b, a);
    const c = Math.cos(th) * s, sn = Math.sin(th) * s;
    const T = { s, th, tx: mdx - (c * msx - sn * msy), ty: mdy - (sn * msx + c * msy) };
    let r = 0; for (let i = 0; i < n; i++) { const p = fwdT(T, src[i][0], src[i][1]); r += (p[0] - dst[i][0]) ** 2 + (p[1] - dst[i][1]) ** 2; }
    T.rms = Math.sqrt(r / n);
    return T;
  }

  // ---------- skor ----------
  // ctx: { fields:[F...], sk:{x,y,f}, sub:{x,y,f}, osm: buckets, skF (field sketsa, px gambar), cov:{minx,maxx,miny,maxy} (math), tau, wRev }
  function score(ctx, T, full) {
    const tau = ctx.tau, P = full ? ctx.sk : ctx.sub;
    const c = Math.cos(T.th) * T.s, sn = Math.sin(T.th) * T.s;
    let cost = 0, within = 0, dev = 0;
    const n = P.x.length;
    for (let i = 0; i < n; i++) {
      const px = P.x[i], py = P.y[i];
      const d = look(ctx.fields[P.f[i]], c * px - sn * py + T.tx, sn * px + c * py + T.ty);
      if (d < tau) { cost += d / tau; within++; } else cost += 1;
      dev += d < 50 ? d : 50;
    }
    const fwd = cost / n;
    if (!full) return 1 - fwd;
    // arah balik: jalan OSM di area sketsa yang tidak tergambar
    const B = ctx.osm, cv = ctx.cov;
    let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
    for (const [x, y] of [[cv.minx, cv.miny], [cv.maxx, cv.miny], [cv.maxx, cv.maxy], [cv.minx, cv.maxy]]) {
      const w = fwdT(T, x, y); wx0 = Math.min(wx0, w[0]); wx1 = Math.max(wx1, w[0]); wy0 = Math.min(wy0, w[1]); wy1 = Math.max(wy1, w[1]);
    }
    const i0 = Math.max(0, Math.floor((wx0 - B.bb.minx) / B.cell)), i1 = Math.min(B.nx - 1, Math.floor((wx1 - B.bb.minx) / B.cell));
    const j0 = Math.max(0, Math.floor((wy0 - B.bb.miny) / B.cell)), j1 = Math.min(B.ny - 1, Math.floor((wy1 - B.bb.miny) / B.cell));
    const cs = Math.cos(T.th), ss = Math.sin(T.th);
    let rc = 0, rn = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = j * B.nx + i;
      for (let k = B.start[cell]; k < B.start[cell + 1]; k++) {
        const it = B.items[k], dx = B.xs[it] - T.tx, dy = B.ys[it] - T.ty;
        const mx = (cs * dx + ss * dy) / T.s, my = (-ss * dx + cs * dy) / T.s;
        if (mx < cv.minx || mx > cv.maxx || my < cv.miny || my > cv.maxy) continue;
        const dpx = look(ctx.skF, mx, -my);
        const dm = dpx >= BIG ? BIG : dpx * T.s;
        rc += dm < tau ? dm / tau : 1; rn++;
      }
    }
    const rev = rn ? rc / rn : 1;
    // jalan nyata yang menembus bidang (bagian tengahnya) = posisi tidak mungkin
    let tembus = 0;
    if (ctx.parcelIn) {
      const q = ctx.parcelIn, bb2 = q.bb;
      let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
      for (const [x, y] of [[bb2[0], bb2[1]], [bb2[2], bb2[1]], [bb2[2], bb2[3]], [bb2[0], bb2[3]]]) { const w = fwdT(T, x, y); ax0 = Math.min(ax0, w[0]); ax1 = Math.max(ax1, w[0]); ay0 = Math.min(ay0, w[1]); ay1 = Math.max(ay1, w[1]); }
      const k0 = Math.max(0, Math.floor((ax0 - B.bb.minx) / B.cell)), k1 = Math.min(B.nx - 1, Math.floor((ax1 - B.bb.minx) / B.cell));
      const l0 = Math.max(0, Math.floor((ay0 - B.bb.miny) / B.cell)), l1 = Math.min(B.ny - 1, Math.floor((ay1 - B.bb.miny) / B.cell));
      for (let j = l0; j <= l1; j++) for (let i = k0; i <= k1; i++) {
        const cell = j * B.nx + i;
        for (let k = B.start[cell]; k < B.start[cell + 1]; k++) {
          const it = B.items[k], dx = B.xs[it] - T.tx, dy = B.ys[it] - T.ty;
          const mx = (cs * dx + ss * dy) / T.s, my = (-ss * dx + cs * dy) / T.s;
          if (mx < bb2[0] || mx > bb2[2] || my < bb2[1] || my > bb2[3]) continue;
          let c = false; const P2 = q.pts;
          for (let a = 0, b = P2.length - 1; a < P2.length; b = a++) { const u = P2[a], v = P2[b]; if ((u[1] > my) !== (v[1] > my) && mx < (v[0] - u[0]) * (my - u[1]) / (v[1] - u[1]) + u[0]) c = !c; }
          if (c) tembus++;
        }
      }
    }
    const wr = ctx.wRev;
    let ovl = 0;
    if (ctx.ref && ctx.ref.length && ctx.parcelSamples) ovl = overlapFrac(ctx.parcelSamples.map(p => fwdT(T, p[0], p[1])), ctx.ref);
    return { score: 1 - ((1 - wr) * fwd + wr * rev) - 0.6 * ovl - 0.1 * Math.min(3, tembus), fwd, rev, ovl, tembus, within: within / n, dev: dev / n, nRev: rn };
  }

  function refine(ctx, T0, bounds, iters = 80) {
    let T = { ...T0 }, best = score(ctx, T, true).score;
    let st = { tx: 4, ty: 4, th: 2 * DEG, s: 0.03 * T.s };
    for (let it = 0; it < iters; it++) {
      let imp = false;
      for (const k of ['tx', 'ty', 'th', 's']) for (const sg of [1, -1]) {
        const C = { ...T }; C[k] += sg * st[k];
        if (k === 's' && (C.s < bounds.smin || C.s > bounds.smax)) continue;
        if (k === 'th' && bounds.th0 != null && Math.abs(normAng(C.th - bounds.th0)) > bounds.thTol) continue;
        const v = score(ctx, C, true).score;
        if (v > best + 1e-6) { best = v; T = C; imp = true; }
      }
      if (!imp) { st.tx /= 2; st.ty /= 2; st.th /= 2; st.s /= 2; if (st.tx < 0.2) break; }
    }
    return T;
  }

  // ---------- pencocokan utama ----------
  async function matchAll(ctx, opt, onProgress, log) {
    const tick = () => new Promise(r => setTimeout(r, 0));
    const { scales, th0, thTol } = opt;
    const angOK = th => th0 == null || Math.abs(normAng(th - th0)) <= thTol;
    // hipotesis
    const H = []; // [s, th, tx, ty]
    const skJ = ctx.skJ, osJ = ctx.osJ;
    if (skJ.length) {
      for (const sj of skJ) for (const oj of osJ) {
        if (oj.br.length < sj.br.length - 1) continue;
        for (const ob of oj.br) for (const sb of sj.br) {
          const th = normAng(ob - sb);
          if (!angOK(th)) continue;
          // cek tanda-tangan sudut cabang lain
          let m = 0;
          for (const b2 of sj.br) { const r = normAng(b2 + th); if (oj.br.some(o => Math.abs(normAng(o - r)) < 25 * DEG)) m++; }
          if (m < Math.min(sj.br.length, 3) - 1) continue;
          for (const s of scales) {
            const c = Math.cos(th) * s, sn = Math.sin(th) * s;
            H.push(s, th, oj.x - (c * sj.x - sn * sj.y), oj.y - (sn * sj.x + c * sj.y));
          }
        }
      }
      log && log('info', `Hipotesis dari simpang: ${H.length / 4} (simpang sketsa ${skJ.length}, simpang OSM ${osJ.length})`);
    }
    if (H.length / 4 < 50) {
      // fallback: sejajarkan jalan terpanjang sketsa ke setiap ruas OSM
      const R = ctx.longest; const L = plLen(R); const mid = plPointAt(R, L / 2);
      const q = plPointAt(R, Math.min(L, L / 2 + L * 0.1)), a = Math.atan2(q[1] - mid[1], q[0] - mid[0]);
      const S = ctx.osmSamples;
      for (let i = 0; i < S.xs.length; i += 2) {
        if (ctx.inArea && !ctx.inArea(S.xs[i], S.ys[i])) continue;
        for (const flip of [0, Math.PI]) {
          const th = normAng(S.dirs[i] + flip - a);
          if (!angOK(th)) continue;
          for (const s of scales) {
            const c = Math.cos(th) * s, sn = Math.sin(th) * s;
            H.push(s, th, S.xs[i] - (c * mid[0] - sn * mid[1]), S.ys[i] - (sn * mid[0] + c * mid[1]));
          }
        }
      }
      log && log('info', `Hipotesis total (dengan fallback ruas jalan): ${H.length / 4}`);
    }
    const nH = H.length / 4;
    if (!nH) throw new Error('Tidak ada hipotesis posisi. Periksa data jalan OSM / gambar jalan pada sketsa / arah utara.');
    const sc = new Float32Array(nH);
    const CH = 20000;
    for (let i = 0; i < nH; i++) {
      sc[i] = score(ctx, { s: H[4 * i], th: H[4 * i + 1], tx: H[4 * i + 2], ty: H[4 * i + 3] }, false);
      if (i % CH === 0) { onProgress && onProgress(0.6 * i / nH, `Menilai hipotesis ${i.toLocaleString('id')}/${nH.toLocaleString('id')}`); await tick(); }
    }
    let order = Array.from({ length: nH }, (_, i) => i).sort((a, b) => sc[b] - sc[a]).slice(0, 600);
    // tahap B: skor penuh
    let B = [];
    for (let k = 0; k < order.length; k++) {
      const i = order[k], T = { s: H[4 * i], th: H[4 * i + 1], tx: H[4 * i + 2], ty: H[4 * i + 3] };
      B.push({ T, r: score(ctx, T, true) });
      if (k % 100 === 0) { onProgress && onProgress(0.6 + 0.15 * k / order.length, 'Skor penuh kandidat'); await tick(); }
    }
    B.sort((a, b) => b.r.score - a.r.score);
    const anchor = ctx.parcelC;
    const nms = (arr, n) => {
      const out = [];
      for (const c of arr) {
        const p = fwdT(c.T, anchor[0], anchor[1]);
        if (out.some(o => { const q = fwdT(o.T, anchor[0], anchor[1]); return Math.hypot(p[0] - q[0], p[1] - q[1]) < 20; })) continue;
        out.push(c); if (out.length >= n) break;
      }
      return out;
    };
    const top = nms(B, 25);
    const res = [];
    for (let k = 0; k < top.length; k++) {
      const T = refine(ctx, top[k].T, opt.bounds);
      res.push({ T, r: score(ctx, T, true) });
      onProgress && onProgress(0.75 + 0.25 * (k + 1) / top.length, `Penghalusan kandidat ${k + 1}/${top.length}`); await tick();
    }
    res.sort((a, b) => b.r.score - a.r.score);
    return nms(res, 6);
  }

  // ---------- persiapan konteks ----------
  // input: { ways:[{id,name,hw,nodes}], nodeXY: Map, roadsImg:[{name,pts}], parcelImg:[[x,y]], imgW, imgH, s0, tau, inArea, wRev, log }
  function prepareCtx(I) {
    const log = I.log || (() => {});
    const roadsM = I.roadsImg.map(r => r.pts.map(p => [p[0], -p[1]]));
    const parcelM = I.parcelImg.map(p => [p[0], -p[1]]);
    const diag = Math.hypot(I.imgW, I.imgH);
    // polylines OSM dalam meter
    const wayPolys = I.ways.map(w => w.nodes.filter(id => I.nodeXY.has(id)).map(id => I.nodeXY.get(id))).filter(p => p.length >= 2);
    let bb = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
    for (const p of wayPolys) for (const q of p) { bb.minx = Math.min(bb.minx, q[0]); bb.maxx = Math.max(bb.maxx, q[0]); bb.miny = Math.min(bb.miny, q[1]); bb.maxy = Math.max(bb.maxy, q[1]); }
    if (!isFinite(bb.minx)) throw new Error('Data jalan OSM kosong.');
    // perluas dengan ukuran sketsa supaya titik di tepi tetap terbaca
    const pad = 100; bb = { minx: bb.minx - pad, miny: bb.miny - pad, maxx: bb.maxx + pad, maxy: bb.maxy + pad };
    const area = (bb.maxx - bb.minx) * (bb.maxy - bb.miny);
    const res = Math.max(1.5, Math.sqrt(area / 5e6));
    const fields = [buildField(wayPolys, bb, res)];
    log('info', `Distance field: ${fields[0].nx}x${fields[0].ny} sel, resolusi ${res.toFixed(2)} m`);
    // field per nama jalan
    const fieldIdxOfRoad = roadsM.map(() => 0);
    const cache = {};
    I.roadsImg.forEach((r, i) => {
      const nm = CORE_normName(r.name); if (!nm) return;
      if (cache[nm] === undefined) {
        const mw = I.ways.filter(w => w.name && nameMatch(w.name, r.name));
        if (mw.length) {
          const polys = mw.map(w => w.nodes.filter(id => I.nodeXY.has(id)).map(id => I.nodeXY.get(id))).filter(p => p.length >= 2);
          fields.push(buildField(polys, bb, res)); cache[nm] = fields.length - 1;
          log('info', `Nama jalan "${r.name}" cocok dengan ${mw.length} ruas OSM: ${[...new Set(mw.map(w => w.name))].slice(0, 5).join(', ')}`);
        } else { cache[nm] = 0; log('warn', `Nama jalan "${r.name}" tidak ditemukan di data OSM kelurahan ini — diabaikan (pakai bentuk saja).`); }
      }
      fieldIdxOfRoad[i] = cache[nm];
    });
    // sampel titik sketsa
    const totLen = roadsM.reduce((a, p) => a + plLen(p), 0);
    const spacing = Math.max(3 / I.s0, totLen / 500);
    const S = samplePolys(roadsM, spacing);
    const sk = { x: Float64Array.from(S.xs), y: Float64Array.from(S.ys), f: Uint8Array.from(S.src.map(i => fieldIdxOfRoad[i])) };
    const nSub = Math.min(48, sk.x.length), sub = { x: new Float64Array(nSub), y: new Float64Array(nSub), f: new Uint8Array(nSub) };
    for (let k = 0; k < nSub; k++) { const i = Math.floor(k * sk.x.length / nSub); sub.x[k] = sk.x[i]; sub.y[k] = sk.y[i]; sub.f[k] = sk.f[i]; }
    // field sketsa (px gambar)
    const kx = Math.max(1, Math.max(I.imgW, I.imgH) / 700);
    const skF = buildField(I.roadsImg.map(r => r.pts), { minx: 0, miny: 0, maxx: I.imgW, maxy: I.imgH }, kx);
    // cakupan
    let cov = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity };
    for (const p of roadsM.flat().concat(parcelM)) { cov.minx = Math.min(cov.minx, p[0]); cov.maxx = Math.max(cov.maxx, p[0]); cov.miny = Math.min(cov.miny, p[1]); cov.maxy = Math.max(cov.maxy, p[1]); }
    // sampel OSM
    const OS = samplePolys(wayPolys, 5);
    const osm = buildBuckets(OS.xs, OS.ys, bb, 40);
    const osmSamples = samplePolys(wayPolys, 12);
    // simpang
    const tol = 0.015 * diag, delta = 0.06 * diag;
    const skJ = sketchJunctions(roadsM, tol, delta);
    const nb = buildGraph(I.ways, I.nodeXY);
    const osJ = osmJunctions(nb, I.nodeXY, Math.min(40, Math.max(10, delta * I.s0)), I.inArea);
    let longest = roadsM[0]; for (const p of roadsM) if (plLen(p) > plLen(longest)) longest = p;
    log('info', `Titik sampel sketsa ${sk.x.length}, simpang sketsa ${skJ.length}, simpang OSM di wilayah ${osJ.length}, titik OSM ${OS.xs.length}`);
    const ref = (I.refXY || []).map(pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } return { pts, bb: [a, b, c, d] }; });
    if (ref.length) log('info', `Bidang referensi untuk cek tumpang tindih: ${ref.length}`);
    return { fields, sk, sub, skF, cov, osm, osmSamples, skJ, osJ, longest, tau: I.tau, wRev: I.wRev ?? 0.3, inArea: I.inArea, parcelC: centroid(parcelM), roadsM, parcelM, bb,
      ref, parcelSamples: ref.length ? interiorSamples(parcelM, 40) : null,
      parcelIn: (() => { const c = centroid(parcelM), pts = parcelM.map(p => [c[0] + (p[0] - c[0]) * 0.75, c[1] + (p[1] - c[1]) * 0.75]); return { pts, bb: [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))] }; })() };
  }
  const CORE_normName = normName;

  return { prepareCtx, fromTM, CRS, crsFwd, crsInv, dxfR12, dxfPolylines, interiorSamples, overlapFrac, DEG, BIG, makeProj, toUTM, toTM3, normAng, normName, nameMatch, plLen, plPointAt, plNearest, polyArea, centroid,
    pointInRing, sketchJunctions, buildGraph, osmJunctions, buildField, look, samplePolys, buildBuckets,
    fwdT, invT, similarity2D, score, refine, matchAll, dxfPersil };
})();
if (typeof module !== 'undefined') module.exports = CORE;
