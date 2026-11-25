// Salinan logika app.js runMatch (pencarian + penggabungan nama) dan conf(), tanpa DOM. Dipakai run.js & run_nyata.js.
module.exports = (CORE, CFG, pola) => {
const DEG = Math.PI / 180;
async function cocokkan(Wl, K) {
  const s0 = Math.sqrt(K.luas / CORE.polyArea(K.parcel)), v = CFG.variasi_skala;
  const scales = [1 - v / 2, 1, 1 + v / 2].map(k => k * s0);
  const north = K.utara !== 'bebas', th0 = north ? 0 : null, thTol = ({ pasti: 3, yakin: 15 }[K.utara] || 45) * DEG;
  const opt = { scales, th0, thTol, bounds: { smin: s0 * (1 - v), smax: s0 * (1 + v), th0, thTol } };
  if (pola) opt.pola = pola;
  const build = tanpaNama => CORE.prepareCtx({ ways: Wl.osm.ways, nodeXY: Wl.nodeXY, roadsImg: tanpaNama ? K.roads.map(r => ({ ...r, name: '' })) : K.roads, parcelImg: K.parcel, imgW: K.imgW, imgH: K.imgH,
    s0, tau: Math.max(2, CFG.tau), inArea: Wl.inArea, ...(Wl.refXY ? { refXY: Wl.refXY } : {}), wRev: Math.min(0.6, Math.max(0, CFG.wRev)), log: () => {}, ...(pola ? { pola } : {}) });
  const adaNama = K.roads.some(r => (r.name || '').trim());
  const CTX = build(true);
  const out = await CORE.matchAll(CTX, opt, null, () => {});
  let list = out.map(c => ({ T: c.T, r: c.r }));
  if (adaNama) {
    const ctxN = build(false), outN = await CORE.matchAll(ctxN, opt, null, () => {});
    for (const c of outN) list.push({ T: c.T, r: CORE.score(CTX, c.T, true) });
    for (const c of list) { const rn = CORE.score(ctxN, c.T, true); c.nama = rn.score >= c.r.score - 0.03; }
    list.sort((a, b) => (b.r.score + (b.nama ? 0.06 : 0)) - (a.r.score + (a.nama ? 0.06 : 0)));
    const anc = CTX.parcelC, uniq = [];
    for (const c of list) { const p = CORE.fwdT(c.T, anc[0], anc[1]); if (uniq.some(u => { const q = CORE.fwdT(u.T, anc[0], anc[1]); return Math.hypot(p[0] - q[0], p[1] - q[1]) < 20; })) continue; uniq.push(c); if (uniq.length >= 6) break; }
    list = uniq;
  }
  return { CTX, list, meta: out.pola || null };
}
function conf(c) { // app.js conf(i) untuk i=0
  if (!c.length || !c[0].r) return 'manual';
  const sc = c[0].r.score, gap = c[1] && c[1].r ? sc - c[1].r.score : 1;
  if (sc >= 0.8 && gap > 0.06) return 'keyakinan tinggi';
  if (sc >= 0.65) return gap <= 0.06 ? 'ambigu' : 'sedang';
  return 'rendah';
}
// ---- metrik
function clip(subj, clipP) { // Sutherland–Hodgman, clipP cembung (CCW/CW otomatis)
  let out = subj; const sgn = Math.sign(clipP.reduce((a, p, i) => { const q = clipP[(i + 1) % clipP.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0));
  for (let i = 0; i < clipP.length && out.length; i++) {
    const A = clipP[i], B = clipP[(i + 1) % clipP.length], inp = out; out = [];
    const ins = p => sgn * ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])) >= 0;
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], a = ins(P), b = ins(Q);
      if (a) out.push(P);
      if (a !== b) { const d1 = (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]), d2 = (B[0] - A[0]) * (Q[1] - A[1]) - (B[1] - A[1]) * (Q[0] - A[0]), t = d1 / (d1 - d2); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
function iou(a, b) { const I = clip(a, b), ai = I.length >= 3 ? CORE.polyArea(I) : 0; return ai / (CORE.polyArea(a) + CORE.polyArea(b) - ai); }
return { cocokkan, conf, iou };
};
