// 夜间灯光系统
//  · 金色照明（1985 年起：336 盏高压钠灯自塔内向上照射钢构件）→ 着色器内的「朝向塔轴」自发光
//  · 闪烁灯（2000 年起：20 000 只闪光灯泡，入夜后每小时整点闪烁 5 分钟）
//  · 旋转探照灯（顶部灯塔，4 束光，射程约 80 km）
//  · 航空障碍灯、平台照明
import * as THREE from 'three';

export const nightUniforms = {
  uGold: { value: new THREE.Color(1.0, 0.56, 0.18) },
  uGlow: { value: 0 },
};

// 给钢结构材质注入金色照明
export function patchGolden(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGold = nightUniforms.uGold;
    shader.uniforms.uGlow = nightUniforms.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vAxisView;
varying float vRand;
varying float vWY;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vec4 gwp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vRand = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
#else
  vec4 gwp = modelMatrix * vec4(transformed, 1.0);
  vRand = 0.5;
#endif
  vWY = gwp.y;
  vAxisView = (viewMatrix * vec4(0.0, gwp.y, 0.0, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uGold;
uniform float uGlow;
varying vec3 vAxisView;
varying float vRand;
varying float vWY;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uGlow > 0.001) {
    // 投光灯位于塔内部，朝向塔轴的表面被照亮更强
    vec3 toAxis = normalize(vAxisView + vViewPosition);
    float facing = dot(normal, toAxis);
    float g = 0.38 + 0.62 * smoothstep(-0.35, 0.85, facing);
    g *= 0.8 + 0.4 * vRand;
    // 底部与各层平台附近灯具更密
    g *= 1.0 + 0.25 * exp(-abs(vWY - 57.0) * 0.12) + 0.25 * exp(-abs(vWY - 115.0) * 0.15) + 0.2 * exp(-vWY * 0.05);
    totalEmissiveRadiance += uGold * uGlow * g;
  }`);
  };
  material.customProgramCacheKey = () => 'golden-v1';
}

// ── 闪烁灯泡 ──
export function createSparkle(anchors, count = 20000) {
  const nSeg = anchors.length / 6;
  const cum = new Float32Array(nSeg);
  let total = 0;
  for (let i = 0; i < nSeg; i++) {
    const o = i * 6;
    total += Math.hypot(anchors[o + 3] - anchors[o], anchors[o + 4] - anchors[o + 1], anchors[o + 5] - anchors[o + 2]);
    cum[i] = total;
  }
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const rate = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const r = Math.random() * total;
    let lo = 0, hi = nSeg - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const o = lo * 6, t = Math.random();
    pos[k * 3] = anchors[o] + (anchors[o + 3] - anchors[o]) * t + (Math.random() - 0.5) * 0.4;
    pos[k * 3 + 1] = anchors[o + 1] + (anchors[o + 4] - anchors[o + 1]) * t;
    pos[k * 3 + 2] = anchors[o + 2] + (anchors[o + 5] - anchors[o + 2]) * t + (Math.random() - 0.5) * 0.4;
    phase[k] = Math.random();
    rate[k] = 0.55 + Math.random() * 0.9;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOn: { value: 0 }, uScale: { value: 800 }, uSize: { value: 0.55 },
    },
    vertexShader: `
      attribute float aPhase; attribute float aRate;
      uniform float uTime, uOn, uScale, uSize;
      varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float c = fract(uTime * aRate + aPhase);
        float flash = smoothstep(0.0, 0.025, c) * (1.0 - smoothstep(0.03, 0.11, c));
        vI = flash * uOn;
        float px = uSize * uScale / max(-mv.z, 1.0);
        gl_PointSize = vI > 0.004 ? clamp(px * (0.7 + 0.6 * flash), 2.0, 14.0) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vI;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p);
        float core = smoothstep(0.5, 0.0, r);
        float a = core * core * core;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * vI * a * 4.0, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

// ── 通用发光点（航空障碍灯 / 平台灯）──
export function createGlowPoints(positions, color, size, blinkFlags) {
  const n = positions.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('aBlink', new THREE.BufferAttribute(new Float32Array(blinkFlags || new Array(n).fill(0)), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uOn: { value: 0 }, uTime: { value: 0 },
      uScale: { value: 800 }, uSize: { value: size }, uGain: { value: 4 },
    },
    vertexShader: `
      attribute float aBlink;
      uniform float uTime, uOn, uScale, uSize;
      varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float blink = aBlink > 0.5 ? step(0.5, fract(uTime * 0.75)) : 1.0;
        vI = uOn * blink;
        gl_PointSize = vI > 0.004 ? clamp(uSize * uScale / max(-mv.z, 1.0), 1.5, 40.0) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uGain;
      varying float vI;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(uColor * vI * a * a * uGain, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = 5;
  return p;
}

// ── 旋转探照灯 ──
export function createBeacon(pos) {
  const group = new THREE.Group();
  group.position.copy(pos);
  const uni = { uOn: { value: 0 } };
  const len = 2600;
  const geo = new THREE.CylinderGeometry(38, 0.3, len, 32, 24, true);
  geo.translate(0, len / 2, 0);
  geo.rotateZ(-Math.PI / 2); // 沿 +X
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: `
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        vT = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOn;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float fall = pow(1.0 - vT, 2.6) * 0.9 + 0.1 * (1.0 - vT);
        float near = 1.0 + 6.0 * pow(1.0 - vT, 40.0);
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.88) * edge * fall * near * 0.1 * uOn, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beams = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(geo, mat);
    b.rotation.y = (k * Math.PI) / 2;
    b.rotation.z = 0.02;
    b.frustumCulled = false;
    b.renderOrder = 6;
    beams.add(b);
  }
  group.add(beams);
  // 灯源眩光
  const glare = createGlowPoints([0, 0, 0], 0xfff4e0, 6, [0]);
  glare.material.uniforms.uGain.value = 10;
  group.add(glare);
  return {
    group,
    update(t, on, speed) {
      uni.uOn.value = on;
      glare.material.uniforms.uOn.value = on;
      beams.rotation.y = t * speed;
    },
    setScale(s) { glare.material.uniforms.uScale.value = s; },
  };
}
