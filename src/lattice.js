// 格构构件生成器 —— 埃菲尔铁塔的每根「杆件」本身就是由角钢 + 缀条组成的格构梁，
// 这里按层级递归还原：主构件 → 格构梁（4 根角钢弦杆 + 各面 Z 形/X 形缀条）→ 缀条本身也可以是小格构梁。
import * as THREE from 'three';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// 细节层级：1 = 实心杆件，2 = 主弦杆/环梁/拱为格构，3 = 所有构件格构化 + 二级缀条
export const DETAIL = { level: 3 };

function makeFrame(dir, sideHint, normalHint) {
  const s = new V3();
  if (normalHint) s.crossVectors(normalHint, dir);
  else s.copy(sideHint).addScaledVector(dir, -sideHint.dot(dir));
  if (s.lengthSq() < 1e-8) {
    if (Math.abs(dir.x) < 0.9) s.set(1, 0, 0); else s.set(0, 0, 1);
    s.addScaledVector(dir, -s.dot(dir));
  }
  s.normalize();
  const n = new V3().crossVectors(dir, s).normalize();
  return [s, n];
}

/**
 * 直线格构梁
 * o.w      沿截面 s 方向的梁高（缀条所在平面内）
 * o.d      垂直方向厚度
 * o.normal 该梁所在立面的法线（缀条面与之平行）；或 o.side 直接指定 s 方向
 * o.lace   'w' 仅两侧大面有缀条；'all' 四面；'none' 实心
 * o.cross  X 形交叉缀条；o.posts 竖杆（形成 N/K 形桁架）
 * o.lacingFn(p, q, faceNormal) 自定义缀条（用于二级格构）
 */
export function girder(B, a, b, o) {
  const dir = new V3().subVectors(b, a);
  const L = dir.length();
  if (L < 1e-4) return;
  dir.divideScalar(L);
  const [s, n] = makeFrame(dir, o.side || UP, o.normal);
  const w = o.w, d = o.d;
  if (DETAIL.level < (o.minLevel ?? 2) || o.lace === 'none') {
    B.add(a, b, w, d, s);
    return;
  }
  const t = o.t ?? Math.min(w, d) * 0.28;
  const tl = o.tl ?? t * 0.45;
  const flat = d < t * 2.2;
  const hw = w / 2 - t / 2;
  const hd = Math.max(0, d / 2 - t / 2);
  const P = (tt, cs, cn) =>
    new V3().copy(a).addScaledVector(dir, L * tt).addScaledVector(s, cs).addScaledVector(n, cn);

  // 弦杆（角钢）
  if (flat) {
    for (const cs of [-hw, hw]) B.add(P(0, cs, 0), P(1, cs, 0), t, d, s);
  } else {
    for (const cs of [-hw, hw]) for (const cn of [-hd, hd]) B.add(P(0, cs, cn), P(1, cs, cn), t, t, s);
  }

  // 缀条
  const pitch = o.pitch ?? w * 1.1;
  const nb = Math.max(1, Math.round(L / pitch));
  const lace = o.lacingFn || ((p, q, fn) => B.add(p, q, tl * 0.55, tl, fn));
  const faces = [];
  for (const cn of flat ? [0] : [-hd, hd]) faces.push({ pt: (tt, u) => P(tt, u, cn), half: hw, fn: n });
  if (!flat && o.lace === 'all') {
    for (const cs of [-hw, hw]) faces.push({ pt: (tt, u) => P(tt, cs, u), half: hd, fn: s });
  }
  for (const f of faces) {
    for (let k = 0; k < nb; k++) {
      const t0 = k / nb, t1 = (k + 1) / nb;
      const sg = k % 2 ? 1 : -1;
      lace(f.pt(t0, -sg * f.half), f.pt(t1, sg * f.half), f.fn);
      if (o.cross) lace(f.pt(t0, sg * f.half), f.pt(t1, -sg * f.half), f.fn);
      if (o.posts && k > 0) lace(f.pt(t0, -f.half), f.pt(t0, f.half), f.fn);
    }
    if (o.battens !== false) {
      lace(f.pt(0, -f.half), f.pt(0, f.half), f.fn);
      lace(f.pt(1, -f.half), f.pt(1, f.half), f.fn);
    }
  }
}

/**
 * 沿曲线的箱形格构梁（主弦杆 / 装饰拱 / 顶部钟楼肋）
 * pts 为按缀条节距采样的中心线点
 */
export function pathGirder(B, pts, o) {
  const N = pts.length;
  if (N < 2) return;
  const W = typeof o.w === 'function' ? o.w : () => o.w;
  const D = typeof o.d === 'function' ? o.d : () => o.d;
  const fr = [];
  for (let i = 0; i < N; i++) {
    const tan = new V3().subVectors(pts[Math.min(i + 1, N - 1)], pts[Math.max(i - 1, 0)]).normalize();
    const side = o.sideAt ? o.sideAt(i) : o.side || UP;
    const [s, n] = makeFrame(tan, side, null);
    fr.push({ s, n, w: W(i), d: D(i) });
  }
  if (DETAIL.level < (o.minLevel ?? 2)) {
    for (let i = 0; i < N - 1; i++) {
      B.add(pts[i], pts[i + 1], (fr[i].w + fr[i + 1].w) / 2, (fr[i].d + fr[i + 1].d) / 2, fr[i].s);
    }
    return;
  }
  const tR = o.tRatio ?? 0.22, lR = o.tlRatio ?? 0.07;
  const C = (i, cs, cn) => {
    const f = fr[i];
    const t = tR * Math.min(f.w, f.d);
    return new V3().copy(pts[i]).addScaledVector(f.s, cs * (f.w / 2 - t / 2)).addScaledVector(f.n, cn * (f.d / 2 - t / 2));
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const cache = [];
  for (let i = 0; i < N; i++) cache.push(corners.map(([cs, cn]) => C(i, cs, cn)));
  const idx = (cs, cn) => corners.findIndex((c) => c[0] === cs && c[1] === cn);

  for (let i = 0; i < N - 1; i++) {
    const f = fr[i];
    const t = tR * Math.min(f.w, f.d);
    const tl = lR * Math.min(f.w, f.d);
    for (let c = 0; c < 4; c++) B.add(cache[i][c], cache[i + 1][c], t, t, f.s);
    const sg = i % 2 ? 1 : -1;
    for (const cn of [-1, 1]) {
      B.add(cache[i][idx(-sg, cn)], cache[i + 1][idx(sg, cn)], tl * 0.55, tl, f.n);
    }
    if (o.lace === 'all') {
      for (const cs of [-1, 1]) {
        B.add(cache[i][idx(cs, -sg)], cache[i + 1][idx(cs, sg)], tl * 0.55, tl, f.s);
      }
    }
    if (o.postEvery && i % o.postEvery === 0) {
      for (const cn of [-1, 1]) B.add(cache[i][idx(-1, cn)], cache[i][idx(1, cn)], tl * 0.6, tl, f.n);
      if (o.lace === 'all') for (const cs of [-1, 1]) B.add(cache[i][idx(cs, -1)], cache[i][idx(cs, 1)], tl * 0.6, tl, f.s);
    }
  }
}
