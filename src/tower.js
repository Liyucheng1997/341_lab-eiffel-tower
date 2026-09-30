// 埃菲尔铁塔结构生成
import * as THREE from 'three';
import { Bars } from './bars.js';
import { girder, pathGirder, DETAIL } from './lattice.js';
import {
  H, PLAN, LEGS, outer, inner, legW, chordSize, memberW, shaftMemberW,
  chordPoint, legCenter, levels, subdivide,
} from './profile.js';
import { FACE_NAMES, makeNamesTexture } from './names.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const X = v(1, 0, 0), Y = v(0, 1, 0), Z = v(0, 0, 1);
const clamp = THREE.MathUtils.clamp;

// 四个立面：axis = 法线所在轴，sgn = 正负，key = 朝向
const FACES = [
  { axis: 'z', sgn: 1, key: 'NW' },
  { axis: 'z', sgn: -1, key: 'SE' },
  { axis: 'x', sgn: 1, key: 'SW' },
  { axis: 'x', sgn: -1, key: 'NE' },
];
// 立面局部坐标 → 世界坐标：u 沿立面水平方向，r 为到塔轴线的法向距离
const fp = (f, u, y, r) => (f.axis === 'z' ? v(u, y, f.sgn * r) : v(f.sgn * r, y, u));
const faceNormal = (f) => (f.axis === 'z' ? Z : X);

export function buildTower(mats) {
  const steel = new Bars(1 << 17);
  const anchors = []; // 闪烁灯泡可附着的构件中心线
  const group = new THREE.Group();
  group.name = 'towerExtras';
  const floorLights = [];
  const aviation = [];
  const anchor = (a, b) => anchors.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const cp = (h, L, c) => chordPoint(h, L.sx, L.sz, c[0], c[1]);

  const mesh = (geo, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const box = (sx, sy, sz, x, y, z, mat, cast = true) => mesh(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z, cast);
  // 方环形楼板：inner 为中央洞口半宽
  const ringSlab = (ri, ro, yTop, th, mat) => {
    const y = yTop - th / 2;
    if (ri <= 0) { box(2 * ro, th, 2 * ro, 0, y, 0, mat); return; }
    for (const s of [1, -1]) {
      box(2 * ro, th, ro - ri, 0, y, s * (ri + ro) / 2, mat);
      box(ro - ri, th, 2 * ri, s * (ri + ro) / 2, y, 0, mat);
    }
  };

  // 栏杆：loop 为闭合多边形 [[x,z],...]
  const railing = (loop, y, h, spacing, opt = {}) => {
    for (let e = 0; e < loop.length; e++) {
      const [x0, z0] = loop[e], [x1, z1] = loop[(e + 1) % loop.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(len / spacing));
      const P = (t, yy) => v(x0 + (x1 - x0) * t, yy, z0 + (z1 - z0) * t);
      steel.add(P(0, y + h), P(1, y + h), 0.09, 0.07, Y);
      steel.add(P(0, y + h * 0.5), P(1, y + h * 0.5), 0.05, 0.05, Y);
      steel.add(P(0, y + 0.12), P(1, y + 0.12), 0.06, 0.05, Y);
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        steel.add(P(t0, y), P(t0, y + h), 0.08, 0.08, X);
        if (opt.lattice) {
          steel.add(P(t0, y + 0.12), P(t1, y + h * 0.5), 0.035, 0.03, Y);
          steel.add(P(t1, y + 0.12), P(t0, y + h * 0.5), 0.035, 0.03, Y);
          steel.add(P(t0, y + h * 0.5), P(t1, y + h), 0.035, 0.03, Y);
          steel.add(P(t1, y + h * 0.5), P(t0, y + h), 0.035, 0.03, Y);
        }
        if (opt.bars) {
          const nbar = Math.max(1, Math.round((len / n) / opt.bars));
          for (let j = 1; j < nbar; j++) {
            const t = t0 + ((t1 - t0) * j) / nbar;
            steel.add(P(t, y + 0.12), P(t, y + h), 0.03, 0.03, X);
          }
        }
        if (opt.lightEvery && k % opt.lightEvery === 0) {
          const p = P(t0, y + (opt.lightY ?? h + 0.08));
          floorLights.push(p.x, p.y, p.z);
        }
      }
    }
  };
  const square = (r) => [[-r, -r], [r, -r], [r, r], [-r, r]];

  // ───────────── 节点标高 ─────────────
  const lvA = levels(H.base, H.band1Bottom, legW, 0.55);      // 地面 → 一层
  const lvB = levels(H.floor1, H.band2Bottom, legW, 0.8);     // 一层 → 二层
  const lvS = levels(H.floor2, H.shaftTop, (h) => 2 * outer(h), 0.5); // 上部塔身立面大节间
  const lvC = subdivide(lvS, 2);                               // 上部角柱小节间

  // ───────────── 1. 16 根主弦杆（arêtiers），箱形格构，贯通地面至 273 m ─────────────
  for (const L of LEGS) {
    for (const c of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const pts = [];
      let h = H.base;
      while (h < H.shaftTop - 0.3) {
        pts.push(cp(h, L, c));
        h += clamp(chordSize(h) * 0.95, 0.45, 1.7);
      }
      pts.push(cp(H.shaftTop, L, c));
      pathGirder(steel, pts, {
        w: (i) => chordSize(pts[i].y), d: (i) => chordSize(pts[i].y),
        side: X, lace: 'all', tRatio: 0.2, tlRatio: 0.06, postEvery: 4, minLevel: 2,
      });
      for (let i = 0; i < pts.length - 1; i++) anchor(pts[i], pts[i + 1]);
    }
  }

  // ───────────── 2. 塔柱四个立面的横撑 + 圣安德烈十字斜撑，内部水平隔撑 ─────────────
  const legFaces = [
    { a: [1, 0], b: [1, 1], normal: X }, // 外侧 X 面
    { a: [0, 1], b: [1, 1], normal: Z }, // 外侧 Z 面
    { a: [0, 0], b: [0, 1], normal: X }, // 内侧 X 面
    { a: [0, 0], b: [1, 0], normal: Z }, // 内侧 Z 面
  ];
  const member = (a, b, w, normal, doAnchor = true) => {
    girder(steel, a, b, {
      w, d: w * 0.42, normal, lace: 'w', pitch: w * 1.2, t: w * 0.16, tl: w * 0.075, minLevel: 3,
    });
    if (doAnchor) anchor(a, b);
  };
  const legPanels = (lv) => {
    for (const L of LEGS) {
      for (const f of legFaces) {
        for (let k = 0; k < lv.length; k++) {
          const h0 = lv[k];
          const A0 = cp(h0, L, f.a), B0 = cp(h0, L, f.b);
          member(A0, B0, memberW(h0), f.normal);
          if (k < lv.length - 1) {
            const h1 = lv[k + 1];
            const A1 = cp(h1, L, f.a), B1 = cp(h1, L, f.b);
            const wm = memberW((h0 + h1) / 2) * 0.9;
            member(A0, B1, wm, f.normal);
            member(B0, A1, wm, f.normal);
          }
        }
      }
      // 塔柱内部水平 X 形隔撑
      for (const h of lv) {
        const w = memberW(h) * 0.5;
        const o = { w, d: w * 0.5, normal: Y, lace: 'w', pitch: w * 1.3, minLevel: 3 };
        girder(steel, cp(h, L, [0, 0]), cp(h, L, [1, 1]), o);
        girder(steel, cp(h, L, [1, 0]), cp(h, L, [0, 1]), o);
      }
    }
  };
  legPanels(lvA);
  legPanels(lvB);
  legPanels(lvC);

  // ───────────── 3. 二层以上：四柱合为一体，立面大 X 撑 + 内侧水平框 ─────────────
  const shaftFaces = [
    { A: LEGS[0], B: LEGS[1], c: [0, 1], normal: Z },
    { A: LEGS[3], B: LEGS[2], c: [0, 1], normal: Z },
    { A: LEGS[0], B: LEGS[3], c: [1, 0], normal: X },
    { A: LEGS[1], B: LEGS[2], c: [1, 0], normal: X },
  ];
  for (const f of shaftFaces) {
    for (let k = 0; k < lvS.length; k++) {
      const h0 = lvS[k];
      const A0 = cp(h0, f.A, f.c), B0 = cp(h0, f.B, f.c);
      member(A0, B0, shaftMemberW(h0) * 0.85, f.normal);
      if (k < lvS.length - 1) {
        const h1 = lvS[k + 1];
        const A1 = cp(h1, f.A, f.c), B1 = cp(h1, f.B, f.c);
        const wm = shaftMemberW((h0 + h1) / 2);
        member(A0, B1, wm, f.normal);
        member(B0, A1, wm, f.normal);
      }
    }
  }
  for (const h of lvS) {
    for (let i = 0; i < 4; i++) {
      const a = cp(h, LEGS[i], [0, 0]), b = cp(h, LEGS[(i + 1) % 4], [0, 0]);
      const w = shaftMemberW(h) * 0.6;
      girder(steel, a, b, { w, d: w * 0.5, normal: Y, lace: 'w', minLevel: 3 });
    }
  }

  // ───────────── 4. 一层下方四座装饰大拱（1889 年原设计，纯装饰） ─────────────
  {
    const yA = H.band1Bottom - 1.2, ys = 22;
    const xs = inner(ys);
    const R = (xs * xs + (yA - ys) ** 2) / (2 * (yA - ys));
    const yc = yA - R;
    const th = Math.atan2(xs, ys - yc);
    const rPlane = PLAN.band1Outer - 0.5;
    for (const f of FACES) {
      const N = 72, pts = [], sides = [];
      for (let i = 0; i <= N; i++) {
        const a = -th + (2 * th * i) / N;
        pts.push(fp(f, R * Math.sin(a), yc + R * Math.cos(a), rPlane));
        sides.push(f.axis === 'z' ? v(Math.sin(a), Math.cos(a), 0) : v(0, Math.cos(a), Math.sin(a)));
      }
      pathGirder(steel, pts, { w: 2.3, d: 0.9, sideAt: (i) => sides[i], lace: 'w', postEvery: 1, tRatio: 0.2, tlRatio: 0.09, minLevel: 2 });
      for (let i = 0; i < N; i++) anchor(pts[i], pts[i + 1]);
      // 拱顶与环梁间的吊杆
      for (const u of [-6, -3, 0, 3, 6]) {
        const a = Math.asin(u / R);
        const yTop = yc + R * Math.cos(a) + 1.15;
        if (H.band1Bottom - yTop > 0.05) steel.add(fp(f, u, yTop, rPlane), fp(f, u, H.band1Bottom, rPlane), 0.25, 0.25, X);
      }
    }
  }

  // ───────────── 5. 一层 / 二层环梁（桁架带），楼板格栅，外挑牛腿 ─────────────
  const subLace = (p, q, fn) =>
    girder(steel, p, q, { w: 0.5, d: 0.2, normal: fn, lace: 'w', pitch: 0.55, t: 0.09, tl: 0.045, minLevel: 3 });
  const bandGirder = (a, b, w, d, pitch) => {
    girder(steel, a, b, {
      w, d, side: Y, lace: 'w', cross: true, posts: true, pitch, t: 0.6, tl: 0.14,
      lacingFn: DETAIL.level >= 3 ? subLace : null, minLevel: 2,
    });
    const hh = w / 2;
    anchor(v(a.x, a.y + hh, a.z), v(b.x, b.y + hh, b.z));
    anchor(v(a.x, a.y - hh, a.z), v(b.x, b.y - hh, b.z));
  };
  const joists = (rIn, rOut, y, spacing, depth) => {
    for (const f of FACES) {
      const full = f.axis === 'z';
      const uMax = full ? rOut : rIn;
      const n = Math.round((2 * uMax) / spacing);
      for (let k = 0; k <= n; k++) {
        const u = -uMax + (2 * uMax * k) / n;
        girder(steel, fp(f, u, y, rIn), fp(f, u, y, rOut), { w: depth, d: 0.3, side: Y, lace: 'w', pitch: depth * 0.8, t: 0.12, minLevel: 3 });
      }
    }
  };
  const consoles = (rBand, rEdge, yDeck, spacing, drop) => {
    for (const f of FACES) {
      const n = Math.round((2 * rBand) / spacing);
      for (let k = 0; k <= n; k++) {
        const u = -rBand + (2 * rBand * k) / n;
        const a = fp(f, u, yDeck - drop, rBand), b = fp(f, u, yDeck - 0.2, rEdge), c = fp(f, u, yDeck - 0.2, rBand);
        steel.add(a, b, 0.18, 0.14, faceNormal(f));
        steel.add(c, b, 0.2, 0.16, Y);
      }
    }
  };
  // 一层
  {
    const w = H.floor1 - 0.3 - H.band1Bottom, ym = H.band1Bottom + w / 2;
    for (const f of FACES) {
      bandGirder(fp(f, -PLAN.band1Outer, ym, PLAN.band1Outer), fp(f, PLAN.band1Outer, ym, PLAN.band1Outer), w, 1.4, 3.42);
      bandGirder(fp(f, -PLAN.band1Inner, ym, PLAN.band1Inner), fp(f, PLAN.band1Inner, ym, PLAN.band1Inner), w, 1.0, 3.47);
      // 镌名饰带（实心），名字贴在其外表面
      steel.add(fp(f, -PLAN.band1Outer - 0.7, 55.3, PLAN.band1Outer + 0.78), fp(f, PLAN.band1Outer + 0.7, 55.3, PLAN.band1Outer + 0.78), 1.9, 0.14, Y);
      // 饰带上下的小拱廊（1889 年立面的连续券饰）
      const nArc = 20;
      for (let k = 0; k < nArc; k++) {
        const u0 = -PLAN.band1Outer + (2 * PLAN.band1Outer * k) / nArc, u1 = u0 + (2 * PLAN.band1Outer) / nArc;
        const um = (u0 + u1) / 2, rr = (u1 - u0) / 2;
        let prev = null;
        for (let j = 0; j <= 8; j++) {
          const a = Math.PI - (Math.PI * j) / 8;
          const p = fp(f, um + rr * Math.cos(a), 51.1 + rr * 0.9 * Math.sin(a), PLAN.band1Outer + 0.75);
          if (prev) steel.add(prev, p, 0.12, 0.1, faceNormal(f));
          prev = p;
        }
      }
    }
    joists(PLAN.band1Inner, PLAN.band1Outer, H.floor1 - 1.3, 3.42, 1.8);
    consoles(PLAN.band1Outer, PLAN.floor1Half, H.floor1, 3.42, 2.4);
  }
  // 二层
  {
    const w = H.floor2 - 0.3 - H.band2Bottom, ym = H.band2Bottom + w / 2;
    for (const f of FACES) {
      bandGirder(fp(f, -PLAN.band2Outer, ym, PLAN.band2Outer), fp(f, PLAN.band2Outer, ym, PLAN.band2Outer), w, 1.1, 3.25);
      bandGirder(fp(f, -PLAN.band2Inner, ym, PLAN.band2Inner), fp(f, PLAN.band2Inner, ym, PLAN.band2Inner), w, 0.9, 2.9);
    }
    joists(PLAN.band2Inner, PLAN.band2Outer, H.floor2 - 1.1, 3.25, 1.4);
    // 中央区楼板格栅
    for (let k = 0; k <= 8; k++) {
      const z = -PLAN.band2Inner + (2 * PLAN.band2Inner * k) / 8;
      girder(steel, v(-PLAN.band2Inner, H.floor2 - 1.1, z), v(PLAN.band2Inner, H.floor2 - 1.1, z), { w: 1.4, d: 0.3, side: Y, lace: 'w', pitch: 1.1, t: 0.12, minLevel: 3 });
    }
    consoles(PLAN.band2Outer, PLAN.floor2Half, H.floor2, 3.25, 1.8);
  }

  // 72 位科学家姓名
  for (const f of FACES) {
    const tex = makeNamesTexture(FACE_NAMES[f.key]);
    if (!tex) continue;
    const m = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: new THREE.Color(1, 0.8, 0.45), emissiveIntensity: 0,
      transparent: true, alphaTest: 0.3, roughness: 0.4, metalness: 0.6,
    });
    mats.names.push(m);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2 * PLAN.band1Outer + 1.2, 1.25), m);
    const p = fp(f, 0, 55.3, PLAN.band1Outer + 0.86);
    pl.position.copy(p);
    pl.rotation.y = f.axis === 'z' ? (f.sgn > 0 ? 0 : Math.PI) : (f.sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
    group.add(pl);
  }

  // ───────────── 6. 楼板、栏杆、玻璃地板、展馆 ─────────────
  // 一层
  ringSlab(PLAN.band1Inner, PLAN.floor1Half, H.floor1, 0.35, mats.deck);
  ringSlab(PLAN.void1, PLAN.band1Inner, H.floor1, 0.12, mats.glassFloor);
  railing(square(PLAN.floor1Half - 0.1), H.floor1, 1.3, 1.25, { lattice: true, lightEvery: 2 });
  railing(square(PLAN.void1 + 0.05), H.floor1, 1.1, 1.6, { bars: 0.12 });
  // 一层展馆（2014 年 Ferrier 玻璃展馆 + 餐厅）
  const pavilion = (f, uHalf, rIn, rOut, y0, hgt) => {
    const c = fp(f, 0, y0 + hgt / 2, (rIn + rOut) / 2);
    const sx = f.axis === 'z' ? 2 * uHalf : rOut - rIn;
    const sz = f.axis === 'z' ? rOut - rIn : 2 * uHalf;
    box(sx, hgt, sz, c.x, c.y, c.z, mats.glass, false).renderOrder = 2;
    box(sx - 0.4, 0.05, sz - 0.4, c.x, y0 + 0.05, c.z, mats.interior, false);
    const roof = fp(f, 0, y0 + hgt + 0.2, (rIn + rOut) / 2);
    box(sx + 1.2, 0.4, sz + 1.2, roof.x, roof.y, roof.z, mats.deck);
    const nm = Math.round((2 * uHalf) / 2.1);
    for (let k = 0; k <= nm; k++) {
      const u = -uHalf + (2 * uHalf * k) / nm;
      for (const r of [rIn, rOut]) steel.add(fp(f, u, y0, r), fp(f, u, y0 + hgt, r), 0.12, 0.12, X);
    }
    for (const r of [rIn, rOut]) steel.add(fp(f, -uHalf, y0 + hgt, r), fp(f, uHalf, y0 + hgt, r), 0.18, 0.14, Y);
  };
  pavilion(FACES[1], 16.5, 22.6, 32.2, H.floor1, 6.0);   // 东南：古斯塔夫·埃菲尔展馆
  pavilion(FACES[2], 16.5, 22.6, 32.2, H.floor1, 6.0);   // 西南：费里耶展馆
  pavilion(FACES[0], 16.5, 22.6, 32.2, H.floor1, 6.5);   // 西北：一层餐厅
  // 二层
  ringSlab(2.6, PLAN.floor2Half, H.floor2, 0.3, mats.deck);
  railing(square(PLAN.floor2Half - 0.1), H.floor2, 2.3, 1.5, { bars: 0.3, lightEvery: 2, lightY: 1.2 });
  railing(square(PLAN.floor2Half - 0.1), H.floor2, 1.1, 1.5, {});
  pavilion(FACES[0], 7.5, 12.8, 17.2, H.floor2, 3.4);
  pavilion(FACES[1], 7.5, 12.8, 17.2, H.floor2, 3.4);
  // 儒勒·凡尔纳餐厅（位于南柱内，二层上方）
  box(7.2, 4.6, 7.2, 15.2, 120.6, -15.2, mats.glass, false).renderOrder = 2;
  box(6.8, 0.05, 6.8, 15.2, 118.4, -15.2, mats.interior, false);
  box(7.8, 0.35, 7.8, 15.2, 118.2, -15.2, mats.deck);

  // ───────────── 7. 中央电梯井（二层 → 顶层）与轿厢 ─────────────
  {
    const r = 1.9, y0 = H.floor2 - 1.2, y1 = H.floor3;
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) steel.add(v(sx * r, y0, sz * r), v(sx * r, y1, sz * r), 0.3, 0.3, X);
    const nRing = Math.round((y1 - y0) / 3.2);
    for (let k = 0; k <= nRing; k++) {
      const y = y0 + ((y1 - y0) * k) / nRing, y2 = y0 + ((y1 - y0) * (k + 1)) / nRing;
      const c = [[r, r], [-r, r], [-r, -r], [r, -r]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
        steel.add(v(ax, y, az), v(bx, y, bz), 0.14, 0.14, Y);
        if (k < nRing) {
          if (k % 2) steel.add(v(ax, y, az), v(bx, y2, bz), 0.08, 0.08, Y);
          else steel.add(v(bx, y, bz), v(ax, y2, az), 0.08, 0.08, Y);
        }
      }
    }
    // 井道与四角柱之间的辐射连杆
    for (const h of lvS) {
      for (const L of LEGS) steel.add(v(L.sx * r, h, L.sz * r), cp(h, L, [0, 0]), 0.22, 0.22, Y);
    }
  }
  const coreCabins = [];
  for (const sx of [-1, 1]) {
    const m = box(1.55, 2.6, 3.1, sx * 0.9, H.floor2 + 1.3, 0, mats.cabin);
    coreCabins.push({ mesh: m, phase: sx > 0 ? 0 : 0.5 });
  }
  // 塔柱斜行电梯（北、东、西柱，地面 → 二层）
  const legCabins = [];
  for (const L of [LEGS[1], LEGS[2], LEGS[0]]) {
    const tang = v(-L.sz, 0, L.sx).normalize();
    const pts = [];
    for (let h = H.base + 1; h <= H.floor2 + 0.01; h += 2.2) pts.push(legCenter(h, L.sx, L.sz));
    for (const off of [-1.6, 1.6]) {
      for (let i = 0; i < pts.length - 1; i++) {
        steel.add(pts[i].clone().addScaledVector(tang, off), pts[i + 1].clone().addScaledVector(tang, off), 0.28, 0.28, tang);
      }
    }
    const m = box(4.2, 5.2, 4.6, 0, 0, 0, mats.cabin);
    m.rotation.y = Math.atan2(L.sx, L.sz);
    legCabins.push({ mesh: m, L, phase: Math.random() });
  }

  // ───────────── 8. 顶部：牛腿、三层封闭层、露天平台、钟楼肋、灯塔、天线 ─────────────
  {
    const rT = PLAN.floor3Half;
    const rs = outer(H.shaftTop);
    for (const f of FACES) {
      for (let k = 0; k <= 6; k++) {
        const u = -rs + (2 * rs * k) / 6;
        const yb = H.shaftTop - 7;
        const a = fp(f, u, yb, outer(yb)), b = fp(f, u, H.shaftTop - 0.2, rT), c = fp(f, u, H.shaftTop - 0.2, rs);
        girder(steel, a, b, { w: 0.55, d: 0.3, normal: faceNormal(f), lace: 'w', minLevel: 3 });
        girder(steel, c, b, { w: 0.6, d: 0.3, side: Y, lace: 'w', minLevel: 3 });
        anchor(a, b);
      }
    }
    for (const L of LEGS) {
      const a = cp(H.shaftTop - 7, L, [1, 1]), b = v(L.sx * rT, H.shaftTop - 0.2, L.sz * rT);
      girder(steel, a, b, { w: 0.6, d: 0.35, normal: v(-L.sz, 0, L.sx), lace: 'w', minLevel: 3 });
    }
    // 三层封闭层（玻璃观景廊）
    ringSlab(0, rT, H.shaftTop, 0.3, mats.deck);
    for (const f of FACES) {
      const c = fp(f, 0, (H.shaftTop + H.floor3) / 2, rT - 0.1);
      const sx = f.axis === 'z' ? 2 * rT : 0.08, sz = f.axis === 'z' ? 0.08 : 2 * rT;
      box(sx, H.floor3 - H.shaftTop - 0.35, sz, c.x, c.y, c.z, mats.glass, false).renderOrder = 2;
      for (let k = 0; k <= 12; k++) {
        const u = -rT + (2 * rT * k) / 12;
        steel.add(fp(f, u, H.shaftTop, rT), fp(f, u, H.floor3, rT), 0.12, 0.12, X);
      }
    }
    box(2 * rT - 0.4, 0.05, 2 * rT - 0.4, 0, H.shaftTop + 0.05, 0, mats.interior, false);
    // 露天平台 + 防护格栅
    ringSlab(0, rT + 0.3, H.floor3, 0.3, mats.deck);
    railing(square(rT + 0.2), H.floor3, 2.6, 1.2, { bars: 0.22, lightEvery: 2, lightY: 1.3 });
    railing(square(rT + 0.2), H.floor3, 1.15, 1.2, {});
    // 埃菲尔的办公室（公寓）
    box(4.6, 2.9, 3.4, 0, H.floor3 + 1.45, 0, mats.cream);
    box(5.0, 0.3, 3.8, 0, H.floor3 + 3.05, 0, mats.roof);
    for (const sx of [-1, 1]) box(0.9, 1.2, 0.06, sx * 1.1, H.floor3 + 1.7, 1.72, mats.window, false);

    // 钟楼：4 根曲线格构肋
    const y0 = H.floor3, y1 = H.lantern;
    const rr = (y) => 1.6 + 3.6 * Math.sqrt(Math.max(0, 1 - ((y - y0) / (y1 - y0)) ** 2));
    for (const L of LEGS) {
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const y = y0 + ((y1 - y0) * i) / 26;
        pts.push(v(L.sx * rr(y), y, L.sz * rr(y)));
      }
      pathGirder(steel, pts, { w: 0.8, d: 0.5, side: v(L.sx, 0, L.sz), lace: 'all', postEvery: 2, minLevel: 2 });
      for (let i = 0; i < pts.length - 1; i++) anchor(pts[i], pts[i + 1]);
    }
    const ringsY = [y0 + 3.6, y0 + 7.8, y0 + 11.6, y1 - 0.2];
    for (let j = 0; j < ringsY.length; j++) {
      const y = ringsY[j], r = rr(y);
      for (let i = 0; i < 4; i++) {
        const A = LEGS[i], B = LEGS[(i + 1) % 4];
        steel.add(v(A.sx * r, y, A.sz * r), v(B.sx * r, y, B.sz * r), 0.3, 0.3, Y);
        if (j > 0) {
          const yp = ringsY[j - 1], rp = rr(yp);
          steel.add(v(A.sx * rp, yp, A.sz * rp), v(B.sx * r, y, B.sz * r), 0.12, 0.12, Y);
          steel.add(v(B.sx * rp, yp, B.sz * rp), v(A.sx * r, y, A.sz * r), 0.12, 0.12, Y);
        }
      }
    }
    // 灯笼平台 + 灯塔玻璃灯室 + 铜穹顶
    box(4.2, 0.3, 4.2, 0, y1 + 0.15, 0, mats.deck);
    railing(square(2.0), y1 + 0.3, 1.0, 0.8, {});
    const lanternGlass = mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.8, 24, 1, true), mats.glass, 0, y1 + 1.7, 0, false);
    lanternGlass.renderOrder = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      steel.add(v(1.26 * Math.cos(a), y1 + 0.3, 1.26 * Math.sin(a)), v(1.26 * Math.cos(a), y1 + 3.1, 1.26 * Math.sin(a)), 0.08, 0.08, X);
    }
    const dome = mesh(new THREE.SphereGeometry(1.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.copper, 0, y1 + 3.1, 0);
    dome.scale.y = 0.85;
    // 天线（2022 年加装数字广播天线后总高 330 m）
    const cyl = (r0, r1, ya, yb, mat) => mesh(new THREE.CylinderGeometry(r1, r0, yb - ya, 20), mat, 0, (ya + yb) / 2, 0);
    cyl(0.45, 0.4, y1 + 4.2, 297.2, mats.antennaWhite);
    mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.25, 24), mats.deck, 0, 297.2, 0);
    for (let k = 0; k < 5; k++) cyl(1.0, 1.0, 297.3 + k * 3.04, 297.3 + (k + 1) * 3.04, k % 2 ? mats.antennaWhite : mats.antennaRed);
    for (const yy of [299.4, 302.4, 305.5, 308.6]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const m = box(0.6, 1.8, 0.25, 1.2 * Math.cos(a), yy, 1.2 * Math.sin(a), mats.antennaWhite);
        m.rotation.y = -a;
      }
    }
    mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 24), mats.deck, 0, 312.6, 0);
    for (let k = 0; k < 4; k++) cyl(0.55, 0.52, 312.7 + k * 2.55, 312.7 + (k + 1) * 2.55, k % 2 ? mats.antennaWhite : mats.antennaRed);
    cyl(0.24, 0.16, 322.9, 329.6, mats.antennaWhite);
    cyl(0.16, 0.06, 329.6, 330, mats.antennaRed);
    // 航空障碍灯
    aviation.push(0, 330.1, 0, 1, 0, 322.9, 0.6, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      aviation.push(1.25 * Math.cos(a), 312.8, 1.25 * Math.sin(a), 0);
      aviation.push(1.4 * Math.cos(a), 297.5, 1.4 * Math.sin(a), 0);
    }
    for (const L of LEGS) aviation.push(L.sx * (rT + 0.2), H.floor3 + 2.7, L.sz * (rT + 0.2), 0);
  }

  // ───────────── 9. 石砌墩座 ─────────────
  for (const L of LEGS) {
    for (const c of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = cp(H.base, L, c);
      const s = chordSize(H.base) * 2.2;
      box(s, H.base + 1.0, s, p.x, (H.base - 1.0) / 2, p.z, mats.stone);
    }
    const lc = legCenter(0, L.sx, L.sz);
    box(legW(0) + 5, 0.5, legW(0) + 5, lc.x, 0.2, lc.z, mats.stone, false);
  }

  // ───────────── 电梯动画 ─────────────
  const legPath = (u) => {
    // u ∈ [0,1]，沿塔柱中心线从地面到二层；在一层停靠
    const h = H.base + 2.6 + u * (H.floor2 + 2.6 - H.base - 2.6);
    return h;
  };
  const smoothCycle = (t, period) => {
    // 0→1→0 往返，两端停靠
    const p = ((t / period) % 1 + 1) % 1;
    const tri = p < 0.5 ? p * 2 : 2 - p * 2;
    const s = clamp((tri - 0.08) / 0.84, 0, 1);
    return s * s * (3 - 2 * s);
  };
  const update = (t) => {
    for (const c of legCabins) {
      const h = legPath(smoothCycle(t + c.phase * 90, 90));
      const p = legCenter(h, c.L.sx, c.L.sz);
      c.mesh.position.set(p.x, h, p.z);
    }
    for (const c of coreCabins) {
      const s = smoothCycle(t + c.phase * 70, 70);
      c.mesh.position.y = H.floor2 + 1.4 + s * (H.shaftTop - H.floor2 + 0.2);
    }
  };

  const labels = [
    { text: '一层平台 57.64 m', pos: v(-PLAN.floor1Half - 2, H.floor1 + 2, -PLAN.floor1Half - 2) },
    { text: '二层平台 115.73 m', pos: v(-PLAN.floor2Half - 2, H.floor2 + 2, -PLAN.floor2Half - 2) },
    { text: '三层平台 276.13 m', pos: v(-PLAN.floor3Half - 2, H.floor3 + 2, -PLAN.floor3Half - 2) },
    { text: '灯塔 / 天线顶 330 m', pos: v(-2, 330.5, -2) },
    { text: '底座 124.9 m × 124.9 m', pos: v(0, 2, -PLAN.base / 2 - 3) },
    { text: '装饰拱', pos: v(0, 49, -PLAN.band1Outer - 1) },
  ];

  return {
    steel, anchors, group, floorLights, aviation, labels, update,
    beaconPos: v(0, H.lantern + 1.6, 0),
    stats: { lvA: lvA.length - 1, lvB: lvB.length - 1, lvS: lvS.length - 1 },
  };
}
