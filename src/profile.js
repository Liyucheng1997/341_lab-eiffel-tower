// 埃菲尔铁塔几何剖面数据（单位：米）
// 坐标：原点 = 塔中心地面，Y 轴向上。
//   +Z 朝西北（塞纳河 / 特罗卡德罗），-Z 朝东南（战神广场）
//   +X 朝西南（格勒内勒），           -X 朝东北（巴黎市区）
// 四根塔柱：西柱(+X,+Z) 北柱(-X,+Z) 东柱(-X,-Z) 南柱(+X,-Z)
import * as THREE from 'three';

// 官方标高（SETE 数据）
export const H = {
  base: 1.8,            // 石砌墩座顶面 = 主弦杆柱脚
  band1Bottom: 50.2,    // 一层环梁底
  floor1: 57.64,        // 一层平台
  band2Bottom: 110.8,   // 二层环梁底
  floor2: 115.73,       // 二层平台
  shaftTop: 273.1,      // 塔身桁架顶 = 三层封闭层地面
  floor3: 276.13,       // 三层露天平台
  lantern: 290.6,       // 灯笼平台（灯塔）
  top: 330,             // 天线顶（2022 年起）
};

// 平面尺寸（半边长）
export const PLAN = {
  base: 124.9,          // 底座外边长 124.9 m（柱间净距 74.24 m）
  floor1Half: 35.35,    // 一层平台边长 70.69 m
  band1Outer: 34.2,     // 一层外环梁平面
  band1Inner: 20.8,     // 一层内环梁平面（中央空井边）
  void1: 18.8,          // 一层中央玻璃地板边
  floor2Half: 20.48,    // 二层平台边长 40.96 m
  band2Outer: 19.5,
  band2Inner: 11.6,
  floor3Half: 8.3,      // 三层平台边长约 16.6 m
};

// 塔柱外边缘半宽 —— 埃菲尔为抗风设计的指数型曲线：
// 底部 62.45 m（底座 124.9 m），柱脚倾角约 54°，一层 ≈ 33.9 m，二层 ≈ 19.0 m，顶部 ≈ 5.6 m
export const outer = (h) => 3.0 + 59.45 * Math.exp(-h / 88);
// 单根塔柱截面边长：底部 25.33 m（(124.9-74.24)/2），向上收窄
export const legW = (h) => 2.0 + 23.3 * Math.exp(-h / 80);
export const inner = (h) => outer(h) - legW(h);

// 构件尺寸（随高度收小）
export const chordSize = (h) => 0.34 + 0.056 * legW(h);       // 主弦杆（arêtier）箱形格构截面
export const memberW = (h) => 0.2 + 0.036 * legW(h);          // 塔柱面斜撑/横撑格构梁高
export const shaftMemberW = (h) => 0.22 + 0.021 * 2 * outer(h); // 上部塔身立面撑杆

export const LEGS = [
  { sx: 1, sz: 1, name: '西柱' },
  { sx: -1, sz: 1, name: '北柱' },
  { sx: -1, sz: -1, name: '东柱' },
  { sx: 1, sz: -1, name: '南柱' },
];

// 塔柱四根主弦杆的位置：cx/cz = 1 取外侧，0 取内侧
export function chordPoint(h, sx, sz, cx, cz) {
  const o = outer(h), i = inner(h);
  return new THREE.Vector3(sx * (cx ? o : i), h, sz * (cz ? o : i));
}

// 塔柱中心线
export function legCenter(h, sx, sz) {
  const c = (outer(h) + inner(h)) / 2;
  return new THREE.Vector3(sx * c, h, sz * c);
}

// 按「节间高度 ≈ ratio × 宽度」划分节点标高，使每个节间近似方形（与原结构一致）
export function levels(h0, h1, widthFn, ratio) {
  const N = 600;
  const s = [0];
  let acc = 0;
  for (let i = 1; i <= N; i++) {
    const a = h0 + ((h1 - h0) * (i - 1)) / N;
    const b = h0 + ((h1 - h0) * i) / N;
    acc += (b - a) / (ratio * widthFn((a + b) / 2));
    s.push(acc);
  }
  const n = Math.max(1, Math.round(acc));
  const out = [h0];
  let j = 0;
  for (let k = 1; k < n; k++) {
    const target = (acc * k) / n;
    while (s[j + 1] < target) j++;
    const f = (target - s[j]) / (s[j + 1] - s[j]);
    out.push(h0 + ((h1 - h0) * (j + f)) / N);
  }
  out.push(h1);
  return out;
}

export function subdivide(lv, n) {
  const out = [];
  for (let k = 0; k < lv.length - 1; k++) {
    for (let j = 0; j < n; j++) out.push(lv[k] + ((lv[k + 1] - lv[k]) * j) / n);
  }
  out.push(lv[lv.length - 1]);
  return out;
}
