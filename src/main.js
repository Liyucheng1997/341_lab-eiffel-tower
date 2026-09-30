import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';

import { buildTower } from './tower.js';
import { DETAIL } from './lattice.js';
import { buildEnvironment } from './environment.js';
import { nightUniforms, patchGolden, createSparkle, createGlowPoints, createBeacon } from './night.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

// ───────── 渲染器 ─────────
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 20000);
camera.position.set(180, 70, -520);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 135, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 4000;
controls.minDistance = 1;
controls.screenSpacePanning = true;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ───────── 灯光 ─────────
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -380, right: 380, top: 380, bottom: -380, near: 10, far: 2000 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
sun.target.position.set(0, 80, 0);
scene.add(sun, sun.target);
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.0);
moon.position.set(-500, 700, 300);
scene.add(moon);
const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4238, 1);
scene.add(hemi);
// 金色照明向地面与周围溢出的光
const spill1 = new THREE.PointLight(0xffa040, 0, 0, 2);
spill1.position.set(0, 30, 0);
const spill2 = new THREE.PointLight(0xffa040, 0, 0, 2);
spill2.position.set(0, 120, 0);
scene.add(spill1, spill2);

// ───────── 场景 ─────────
const env = buildEnvironment(scene);
scene.fog = new THREE.FogExp2(0x9fb7d0, 0.0002);

const mats = {
  names: [],
  deck: new THREE.MeshStandardMaterial({ color: 0x5b4a3b, roughness: 0.85, metalness: 0.25 }),
  glassFloor: new THREE.MeshStandardMaterial({ color: 0x9cc6d8, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xa9cad8, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false, emissive: 0xffc27a, emissiveIntensity: 0 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.9, emissive: 0xffb36b, emissiveIntensity: 0 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xb8aa92, roughness: 0.95 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xe0d4ba, roughness: 0.8 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x6b3b2a, roughness: 0.7 }),
  window: new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.3, emissive: 0xffc07a, emissiveIntensity: 0 }),
  antennaWhite: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.2 }),
  antennaRed: new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.5, metalness: 0.2 }),
  copper: new THREE.MeshStandardMaterial({ color: 0x6e7f5e, roughness: 0.55, metalness: 0.6 }),
  cabin: new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.5, metalness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 0 }),
};
patchGolden(mats.deck);

const steelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.35 });
patchGolden(steelMat);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
// 「埃菲尔铁塔棕」三阶渐变涂装：底部最深，顶部最浅
const cBot = new THREE.Color('#57432f'), cTop = new THREE.Color('#8b755e'), tmpC = new THREE.Color();
const colorAt = (y, i, arr, o) => {
  const t = THREE.MathUtils.clamp(y / 300, 0, 1);
  tmpC.copy(cBot).lerp(cTop, t < 0.19 ? 0 : t < 0.39 ? 0.5 : 1).lerp(cTop, t * 0.25);
  const j = 0.93 + 0.14 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  arr[o] = tmpC.r * j; arr[o + 1] = tmpC.g * j; arr[o + 2] = tmpC.b * j;
};

let tower = null, steelMesh = null, sparkle = null, floorLights = null, aviation = null;
const labelObjs = [];
const beacon = createBeacon(new THREE.Vector3(0, 292.2, 0));
scene.add(beacon.group);
const streetLamps = createGlowPoints(env.lampPositions, 0xffb265, 1.1);
streetLamps.material.uniforms.uGain.value = 2.2;
scene.add(streetLamps);

function rebuildTower() {
  if (tower) {
    scene.remove(steelMesh, tower.group, sparkle, floorLights, aviation);
    steelMesh.dispose();
    tower.group.traverse((o) => o.geometry && o.geometry.dispose());
    sparkle.geometry.dispose(); floorLights.geometry.dispose(); aviation.geometry.dispose();
    labelObjs.forEach((l) => scene.remove(l));
    labelObjs.length = 0;
  }
  mats.names.forEach((m) => { m.map?.dispose(); m.dispose(); });
  mats.names.length = 0;
  const t0 = performance.now();
  tower = buildTower(mats);
  steelMesh = tower.steel.toMesh(unitBox, steelMat, colorAt);
  steelMesh.castShadow = true;
  steelMesh.receiveShadow = true;
  scene.add(steelMesh, tower.group);
  sparkle = createSparkle(tower.anchors, 20000);
  floorLights = createGlowPoints(tower.floorLights, 0xfff0d8, 0.5);
  const av = [], avBlink = [];
  for (let i = 0; i < tower.aviation.length; i += 4) { av.push(tower.aviation[i], tower.aviation[i + 1], tower.aviation[i + 2]); avBlink.push(tower.aviation[i + 3]); }
  aviation = createGlowPoints(av, 0xff2010, 1.4, avBlink);
  aviation.material.uniforms.uGain.value = 8;
  scene.add(sparkle, floorLights, aviation);
  for (const l of tower.labels) {
    const div = document.createElement('div');
    div.className = 'label';
    div.textContent = l.text;
    const o = new CSS2DObject(div);
    o.position.copy(l.pos);
    o.visible = state.labels;
    labelObjs.push(o);
    scene.add(o);
  }
  const ms = performance.now() - t0;
  $('stat-bars').textContent = tower.steel.count.toLocaleString();
  $('stat-tris').textContent = (tower.steel.count * 12 / 1e6).toFixed(2) + ' M';
  $('stat-build').textContent = ms.toFixed(0) + ' ms';
  $('stat-panels').textContent = `${tower.stats.lvA} / ${tower.stats.lvB} / ${tower.stats.lvS}`;
}

// ───────── 状态 ─────────
const state = {
  time: 21.0,                 // 小时（本地时间）
  flow: true,
  speed: 1,
  lightMode: '夜间常亮',
  goldGain: 1.0,
  sparkleMode: '自动（整点 5 分钟）',
  beacon: true,
  beaconSpeed: 0.3,
  aviation: true,
  platformLights: true,
  detail: 3,
  shadows: true,
  bloom: 1.0,
  exposure: 1.0,
  reflection: false,
  city: true,
  labels: false,
  autoRotate: false,
};

// ───────── 太阳位置（巴黎 48.86°N，9 月 30 日，赤纬 -2.9°）─────────
const NORTH = new THREE.Vector3(-1, 0, 1).normalize(); // 北柱方向
const EAST = new THREE.Vector3(-1, 0, -1).normalize(); // 东柱方向
function sunDirection(hours, out) {
  const lat = 48.858 * DEG, dec = -2.9 * DEG;
  const ha = (hours - 13.62) * 15 * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(sinAlt);
  let cosAz = (Math.sin(dec) - sinAlt * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
  if (ha > 0) az = 2 * Math.PI - az;
  out.set(0, 0, 0).addScaledVector(NORTH, Math.cos(az) * Math.cos(alt)).addScaledVector(EAST, Math.sin(az) * Math.cos(alt));
  out.y = Math.sin(alt);
  return alt;
}

// ───────── 后期 ─────────
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
// 防止极亮高光在半精度缓冲中溢出为 Inf/NaN 后被泛光扩散
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 400.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ───────── GUI ─────────
const fmtTime = (h) => {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60), ss = Math.floor((((h % 1) * 60) % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
const gui = new GUI({ title: '控制面板' });
const fT = gui.addFolder('时间与天空');
fT.add(state, 'time', 0, 24, 0.01).name('时刻（小时）').listen();
fT.add(state, 'flow').name('时间流逝');
fT.add(state, 'speed', { '实时 ×1': 1, '×10': 10, '×60（1 秒 = 1 分钟）': 60, '×600': 600 }).name('流速');
fT.add({ f: () => (state.time = 12.5) }, 'f').name('☀ 正午');
fT.add({ f: () => (state.time = 19.2) }, 'f').name('🌇 日落');
fT.add({ f: () => (state.time = 20.9975) }, 'f').name('✨ 21:00 整点闪烁');
fT.add({ f: () => (state.time = 22.5) }, 'f').name('🌙 深夜 22:30');
const fL = gui.addFolder('夜间灯光');
fL.add(state, 'lightMode', ['夜间常亮', '真实时刻表（23:45 熄灯）', '关闭']).name('金色照明');
fL.add(state, 'goldGain', 0, 3, 0.01).name('照明亮度');
fL.add(state, 'sparkleMode', ['自动（整点 5 分钟）', '持续闪烁', '关闭']).name('闪烁灯 20000 只');
fL.add(state, 'beacon').name('旋转探照灯');
fL.add(state, 'beaconSpeed', 0, 2, 0.01).name('探照灯转速');
fL.add(state, 'aviation').name('航空障碍灯');
fL.add(state, 'platformLights').name('平台照明');
const fR = gui.addFolder('渲染');
fR.add(state, 'detail', { '1 · 实心杆件': 1, '2 · 主构件格构': 2, '3 · 全部格构（最精细）': 3 }).name('结构细节').onChange((v) => {
  DETAIL.level = Number(v);
  rebuildTower();
});
fR.add(state, 'shadows').name('阴影');
fR.add(state, 'bloom', 0, 2.5, 0.01).name('泛光强度');
fR.add(state, 'exposure', 0.3, 2.5, 0.01).name('曝光');
fR.add(state, 'reflection').name('河面实时反射（耗性能）').onChange((v) => env.enableReflection(v, renderer));
fR.add(state, 'city').name('周边城市').onChange((v) => (env.city.visible = v));
fR.add(state, 'labels').name('楼层标注').onChange((v) => labelObjs.forEach((l) => (l.visible = v)));
const fV = gui.addFolder('视角');
const presets = {
  '全景（战神广场）': [[180, 70, -520], [0, 135, 0]],
  '特罗卡德罗（隔河）': [[0, 36, 485], [0, 150, 0]],
  '塔下仰视': [[3, 1.7, 3], [0, 150, 0.5]],
  '装饰拱与塔柱': [[45, 14, -95], [8, 38, -30]],
  '主弦杆特写': [[62, 8, -62], [48, 16, -48]],
  '一层平台': [[-6, 59.4, -33], [-30, 30, -400]],
  '二层俯视': [[14, 117.5, -19.8], [0, 0, -300]],
  '顶层与天线': [[30, 300, -40], [0, 290, 0]],
  '航拍': [[-420, 520, -380], [0, 90, 0]],
};
let tween = null;
const flyTo = (name) => {
  const [p, t] = presets[name];
  tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t) };
};
for (const k of Object.keys(presets)) fV.add({ f: () => flyTo(k) }, 'f').name(k);
fV.add(state, 'autoRotate').name('自动环绕');
if (window.innerWidth < 800) gui.close();

// ───────── 主循环 ─────────
const sunDir = new THREE.Vector3();
const clock = new THREE.Clock();
let simSeconds = 0;
let goldFade = 0, sparkleFade = 0;
const fogDay = new THREE.Color(0x9fb7d0), fogTw = new THREE.Color(0xa87a68), fogNight = new THREE.Color(0x0d0c10), fogC = new THREE.Color();
const sunWarm = new THREE.Color(0xffa060), sunWhite = new THREE.Color(0xfff4e6);
let frames = 0, fpsT = 0;

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', resize);

function frame(dt) {
  const t = simSeconds;
  if (state.flow) state.time = (state.time + (dt * state.speed) / 3600) % 24;
  simSeconds += dt;

  // 相机过渡
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 2.2);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.t >= 1) tween = null;
  }
  controls.autoRotate = state.autoRotate;
  controls.autoRotateSpeed = 0.6;
  controls.update();
  if (camera.position.y < 0.6) camera.position.y = 0.6;

  // 太阳与天空
  const alt = sunDirection(state.time, sunDir);
  const sy = sunDir.y;
  const uDay = THREE.MathUtils.smoothstep(sy, 0.0, 0.25);
  const uTw = Math.exp(-(((sy - 0.01) / 0.09) ** 2));
  const uNight = 1 - THREE.MathUtils.smoothstep(sy, -0.2, -0.02);
  env.skyU.uSunDir.value.copy(sunDir);
  env.skyU.uDay.value = uDay; env.skyU.uTw.value = uTw; env.skyU.uNight.value = uNight;
  env.sky.position.copy(camera.position);
  env.stars.position.copy(camera.position);
  env.stars.material.uniforms.uTime.value = t;
  const darkness = 1 - THREE.MathUtils.smoothstep(sy, -0.12, 0.05); // 城市灯光开启程度
  env.night.uNight.value = darkness;

  const sunUp = THREE.MathUtils.smoothstep(sy, -0.02, 0.06);
  sun.intensity = 3.8 * sunUp;
  sun.color.copy(sunWarm).lerp(sunWhite, THREE.MathUtils.smoothstep(sy, 0.02, 0.35));
  sun.position.copy(sunDir).multiplyScalar(900).add(sun.target.position);
  sun.castShadow = state.shadows && sunUp > 0.01;
  moon.intensity = 0.12 * uNight;
  hemi.intensity = 0.06 + 0.32 * uDay + 0.3 * uTw;
  hemi.color.setRGB(0.75 - 0.4 * uNight, 0.84 - 0.4 * uNight, 1.0 - 0.3 * uNight);
  scene.environmentIntensity = 0.04 + 0.35 * uDay + 0.15 * uTw;
  const ws = uDay + uTw + uNight + 1e-4;
  fogC.setRGB(0, 0, 0).add(fogDay.clone().multiplyScalar(uDay / ws)).add(fogTw.clone().multiplyScalar(uTw / ws)).add(fogNight.clone().multiplyScalar(uNight / ws));
  scene.fog.color.copy(fogC);
  scene.fog.density = 0.00016 + 0.0001 * uNight;

  // 照明时刻表
  let lightsWanted = darkness > 0.02;
  if (state.lightMode === '关闭') lightsWanted = false;
  if (state.lightMode.startsWith('真实') && state.time >= 23.75) lightsWanted = false;
  if (state.lightMode.startsWith('真实') && state.time < 12) lightsWanted = false;
  goldFade = THREE.MathUtils.damp(goldFade, lightsWanted ? 1 : 0, 3, dt);
  const gold = goldFade * THREE.MathUtils.smoothstep(darkness, 0, 0.6);
  nightUniforms.uGlow.value = gold * 0.5 * state.goldGain;
  spill1.intensity = gold * 2600 * state.goldGain;
  spill2.intensity = gold * 1800 * state.goldGain;
  mats.names.forEach((m) => (m.emissiveIntensity = gold * 1.2));
  mats.glass.emissiveIntensity = darkness * 0.55;
  mats.interior.emissiveIntensity = darkness * 1.4;
  mats.window.emissiveIntensity = darkness * 1.5;
  mats.cabin.emissiveIntensity = darkness * 0.4;

  // 闪烁：入夜后每个整点闪烁 5 分钟
  const minute = (state.time % 1) * 60;
  let sparkleWanted = false;
  if (state.sparkleMode === '持续闪烁') sparkleWanted = true;
  else if (state.sparkleMode.startsWith('自动')) sparkleWanted = lightsWanted && darkness > 0.5 && minute < 5;
  sparkleFade = THREE.MathUtils.damp(sparkleFade, sparkleWanted ? 1 : 0, 6, dt);
  const projScale = window.innerHeight / (2 * Math.tan((camera.fov * DEG) / 2));
  if (sparkle) {
    sparkle.material.uniforms.uTime.value = simSeconds;
    sparkle.material.uniforms.uOn.value = sparkleFade * (0.3 + 0.7 * darkness);
    sparkle.material.uniforms.uScale.value = projScale;
    floorLights.material.uniforms.uOn.value = state.platformLights ? darkness : 0;
    floorLights.material.uniforms.uScale.value = projScale;
    aviation.material.uniforms.uOn.value = state.aviation ? 0.25 + 0.75 * darkness : 0;
    aviation.material.uniforms.uTime.value = simSeconds;
    aviation.material.uniforms.uScale.value = projScale;
    tower.update(simSeconds);
  }
  streetLamps.material.uniforms.uOn.value = darkness * (state.city ? 1 : 0);
  streetLamps.material.uniforms.uScale.value = projScale;
  beacon.update(simSeconds, state.beacon ? gold : 0, state.beaconSpeed);
  beacon.setScale(projScale);

  // 曝光与泛光
  renderer.toneMappingExposure = state.exposure * (1.0 + 0.1 * uNight);
  bloom.strength = state.bloom * (0.1 + 0.42 * darkness);
  bloom.radius = 0.35 + 0.15 * darkness;
  bloom.threshold = 0.98 - 0.3 * darkness;

  composer.render();
  labelRenderer.render(scene, camera);

  // HUD
  $('clock').textContent = fmtTime(state.time);
  const status = [];
  status.push(gold > 0.5 ? '金色照明 开' : '金色照明 关');
  if (sparkleFade > 0.5) status.push('✨ 闪烁中');
  if (state.beacon && gold > 0.5) status.push('探照灯 旋转');
  $('status').textContent = `太阳高度 ${(alt / DEG).toFixed(1)}° · ${status.join(' · ')}`;
  frames++; fpsT += dt;
  if (fpsT > 0.5) { $('stat-fps').textContent = (frames / fpsT).toFixed(0); frames = 0; fpsT = 0; }
}

function tick() {
  frame(Math.min(clock.getDelta(), 0.1));
  requestAnimationFrame(tick);
}

DETAIL.level = state.detail;
rebuildTower();
resize();
tick();
window.__eiffel = { state, scene, camera, controls, flyTo, renderer, composer, frame, resize };
