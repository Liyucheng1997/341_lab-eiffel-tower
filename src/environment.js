// 场景环境：天空、星空、战神广场、塞纳河、耶拿桥、特罗卡德罗、巴黎街区
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const RIVER_Z0 = 118, RIVER_Z1 = 268, WATER_Y = -5.5;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildEnvironment(scene) {
  const rand = rng(1889);
  const env = { night: { uNight: { value: 0 } } };
  const std = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

  // ───────── 天空 ─────────
  const skyU = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDay: { value: 1 }, uTw: { value: 0 }, uNight: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uSunDir; uniform float uDay, uTw, uNight;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float hc = clamp(d.y, 0.0, 1.0);
          float grad = pow(1.0 - hc, 2.5);
          vec3 dayC = mix(vec3(0.10,0.27,0.66), vec3(0.60,0.75,0.92), grad);
          float sunSide = 0.5 + 0.5 * dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5));
          vec3 twHor = mix(vec3(0.42,0.30,0.42), vec3(1.0,0.45,0.15), sunSide * sunSide);
          vec3 twC = mix(vec3(0.07,0.10,0.26), twHor, pow(1.0 - hc, 4.0));
          vec3 nightC = mix(vec3(0.004,0.007,0.02), vec3(0.05,0.045,0.06), pow(1.0 - hc, 5.0));
          nightC += vec3(0.20,0.10,0.04) * exp(-hc * 16.0) * 0.8;   // 巴黎城市光污染
          float ws = uDay + uTw + uNight + 1e-4;
          vec3 col = (dayC * uDay + twC * uTw + nightC * uNight) / ws;
          float sd = max(dot(d, uSunDir), 0.0);
          float above = smoothstep(-0.04, 0.02, uSunDir.y);
          col += vec3(1.0,0.85,0.6) * pow(sd, 900.0) * 40.0 * above;
          col += vec3(1.0,0.6,0.3) * pow(sd, 10.0) * 0.35 * (uTw + 0.25 * uDay) * above;
          if (d.y < 0.0) col *= mix(1.0, 0.55, clamp(-d.y * 6.0, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // 星空
  {
    const n = 3500, p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rand(), w = rand() * 0.95 + 0.05;
      const th = u * Math.PI * 2, y = w, r = Math.sqrt(1 - y * y);
      p.set([Math.cos(th) * r * 8500, y * 8500, Math.sin(th) * r * 8500], i * 3);
      s[i] = 0.5 + Math.pow(rand(), 6) * 3.0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uNight: skyU.uNight, uTime: { value: 0 } },
      vertexShader: `attribute float aS; uniform float uTime; varying float vA;
        void main(){ vA = aS * (0.75 + 0.25 * sin(uTime * 2.0 + position.x)); gl_PointSize = aS * 1.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uNight; varying float vA;
        void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.85,0.9,1.0) * smoothstep(0.5,0.0,r) * vA * uNight * 0.6, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    env.stars = new THREE.Points(g, m);
    env.stars.frustumCulled = false;
    env.stars.renderOrder = -9;
    scene.add(env.stars);
  }

  // ───────── 地面 ─────────
  const ground = std(0x44463f, 1);
  const addPlane = (w, d, x, z, mat, y = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  addPlane(14000, 7000 + RIVER_Z0, 0, (RIVER_Z0 - 7000) / 2, ground);
  addPlane(14000, 7000 - RIVER_Z1, 0, (RIVER_Z1 + 7000) / 2, ground);
  const gravel = std(0x9c8f76, 1), lawn = std(0x4d6a33, 1), paving = std(0x8c8272, 0.95);
  addPlane(170, 150, 0, 0, paving, 0.03);                       // 塔下广场
  addPlane(260, 960, 0, -575, gravel, 0.02);                   // 战神广场
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const z0 = -118 - k * 180, z1 = z0 - 160;
      addPlane(86, z0 - z1, sx * 58, (z0 + z1) / 2, lawn, 0.05);
    }
    addPlane(70, 90, sx * 115, -40, lawn, 0.05);                // 塔侧花园
  }

  // 树（悬铃木）
  {
    const pos = [];
    for (const x of [-126, -116, 116, 126]) for (let z = -112; z > -1040; z -= 9) pos.push([x, z]);
    for (let x = -1400; x <= 1400; x += 11) if (Math.abs(x) > 30) { pos.push([x, RIVER_Z0 - 8]); pos.push([x, RIVER_Z1 + 8]); }
    for (let i = 0; i < 160; i++) {
      const x = (rand() < 0.5 ? -1 : 1) * (85 + rand() * 60), z = -95 + rand() * 185;
      pos.push([x, z]);
    }
    for (const sx of [-1, 1]) for (let z = 300; z < 470; z += 10) { pos.push([sx * 38, z]); pos.push([sx * 125, z]); }
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crowns = new THREE.InstancedMesh(crownGeo, std(0x3f5a2a, 1, { flatShading: true }), pos.length);
    const trunks = new THREE.InstancedMesh(trunkGeo, std(0x4a3b2c, 1), pos.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    pos.forEach(([x, z], i) => {
      const h = 9 + rand() * 6, r = 3.5 + rand() * 2;
      m.compose(p.set(x, h, z), q, s.set(r, h * 0.45, r)); crowns.setMatrixAt(i, m);
      m.compose(p.set(x, 0, z), q, s.set(1, h * 0.7, 1)); trunks.setMatrixAt(i, m);
    });
    crowns.castShadow = true; crowns.receiveShadow = true; trunks.castShadow = true;
    scene.add(crowns, trunks);
  }

  // ───────── 塞纳河 + 驳岸 + 耶拿桥 ─────────
  const stone = std(0xb7ab96, 0.95);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1b2c33, roughness: 0.3, metalness: 0.25, envMapIntensity: 0.35 });
  const water = addPlane(14000, RIVER_Z1 - RIVER_Z0, 0, (RIVER_Z0 + RIVER_Z1) / 2, waterMat, WATER_Y);
  env.water = water;
  env.reflector = null;
  env.enableReflection = (on, renderer) => {
    if (on && !env.reflector) {
      const pr = renderer.getPixelRatio();
      const r = new Reflector(new THREE.PlaneGeometry(14000, RIVER_Z1 - RIVER_Z0), {
        textureWidth: Math.floor(window.innerWidth * pr * 0.5), textureHeight: Math.floor(window.innerHeight * pr * 0.5),
        color: 0x6f7f86, clipBias: 0.003,
      });
      r.rotation.x = -Math.PI / 2;
      r.position.set(0, WATER_Y + 0.02, (RIVER_Z0 + RIVER_Z1) / 2);
      scene.add(r);
      env.reflector = r;
    }
    if (env.reflector) env.reflector.visible = on;
    water.visible = !on;
  };
  const boxM = (sx, sy, sz, x, y, z, mat, cast = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
  };
  for (const z of [RIVER_Z0, RIVER_Z1]) boxM(14000, 8, 3, 0, -4, z + (z === RIVER_Z0 ? 1.5 : -1.5), stone);
  // 耶拿桥（5 跨石拱桥，与塔轴线对齐）
  {
    const span = (RIVER_Z1 - RIVER_Z0) / 5;
    boxM(35, 1.4, RIVER_Z1 - RIVER_Z0 + 8, 0, -0.45, (RIVER_Z0 + RIVER_Z1) / 2, stone, true);
    for (const sx of [-1, 1]) boxM(0.6, 1.1, RIVER_Z1 - RIVER_Z0 + 8, sx * 17.2, 0.8, (RIVER_Z0 + RIVER_Z1) / 2, stone);
    for (let k = 1; k < 5; k++) boxM(36, 9, 5.5, 0, -5.5, RIVER_Z0 + span * k, stone, true);
    for (let k = 0; k < 5; k++) {
      const zc = RIVER_Z0 + span * (k + 0.5), R = span / 2;
      for (let j = 0; j < 14; j++) {
        const a0 = Math.PI * (j / 14), a1 = Math.PI * ((j + 1) / 14);
        const z0 = zc - R * Math.cos(a0), z1 = zc - R * Math.cos(a1);
        const y0 = -6 + 4.6 * Math.sin(a0), y1 = -6 + 4.6 * Math.sin(a1);
        const m = boxM(34, 1.1, Math.hypot(z1 - z0, y1 - y0) + 0.1, 0, (y0 + y1) / 2, (z0 + z1) / 2, stone);
        m.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
      }
    }
    for (const sx of [-1, 1]) for (const z of [RIVER_Z0 - 4, RIVER_Z1 + 4]) boxM(4, 5, 6, sx * 15.5, 2.5, z, stone, true);
  }

  // ───────── 特罗卡德罗花园 + 夏约宫 ─────────
  {
    const pool = new THREE.MeshStandardMaterial({ color: 0x25404a, roughness: 0.3, metalness: 0.25, envMapIntensity: 0.35 });
    addPlane(56, 120, 0, 385, pool, 0.12);
    for (const sx of [-1, 1]) addPlane(80, 170, sx * 80, 385, lawn, 0.05);
    addPlane(200, 60, 0, 505, paving, 0.06);
    const wall = std(0xd8ccb2, 0.9);
    env.chaillotMat = wall;
    for (const sx of [-1, 1]) {
      const cz = 690, R = 205;
      for (let j = 0; j < 12; j++) {
        const a = (25 + (55 * (j + 0.5)) / 12) * (Math.PI / 180);
        const m = boxM(16, 24, 20, sx * R * Math.sin(a), 12, cz - R * Math.cos(a), wall, true);
        m.rotation.y = -sx * a;
      }
      boxM(20, 26, 70, sx * 72, 13, 510, wall, true);
    }
  }

  // ───────── 军事学校 ─────────
  {
    const wall = std(0xd9cfba, 0.9);
    boxM(320, 20, 26, 0, 10, -1090, wall, true);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x4f5a60, 0.6, { metalness: 0.4 }));
    dome.position.set(0, 26, -1080);
    scene.add(dome);
    boxM(40, 26, 30, 0, 13, -1082, wall, true);
  }

  // ───────── 巴黎街区（奥斯曼式建筑）─────────
  {
    const excluded = (x, z) =>
      (Math.abs(x) < 175 && z > -1150 && z < RIVER_Z0 - 10) ||
      (z > RIVER_Z0 - 22 && z < RIVER_Z1 + 22) ||
      (Math.abs(x) < 280 && z >= RIVER_Z1 && z < 760) ||
      Math.hypot(x, z) > 2900;
    const blocks = [];
    const step = 86;
    for (let gx = -34; gx <= 34; gx++) {
      for (let gz = -34; gz <= 34; gz++) {
        const cx = gx * step + (gz % 2) * 21, cz = gz * step;
        if (excluded(cx, cz)) continue;
        const along = rand() < 0.5;
        const k = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < k; i++) {
          const L = 64 / k;
          const off = -32 + L * (i + 0.5);
          const bx = along ? cx + off : cx, bz = along ? cz : cz + off;
          const w = along ? L - 1 : 64, d = along ? 64 : L - 1;
          const far = Math.hypot(bx, bz);
          let h = 17 + rand() * 9;
          // 格勒内勒滨河高层区（Front de Seine）
          if (bx > 700 && bx < 1150 && bz > -260 && bz < RIVER_Z0 - 20 && rand() < 0.55) h = 60 + rand() * 45;
          else if (far > 1600 && rand() < 0.05) h = 35 + rand() * 25;
          blocks.push([bx, bz, w, d, h]);
        }
      }
    }
    // 蒙帕纳斯大楼（210 m，东南方向约 2.4 km）
    blocks.push([-620, -2300, 50, 32, 210]);
    const wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
    const roofGeo = new THREE.CylinderGeometry(0.7071 * 0.72, 0.7071, 1, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.5, 0);
    const wallMat = std(0xb9ab93, 0.92);
    const cityU = { uNight: env.night.uNight };
    wallMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = cityU.uNight;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCP; varying vec3 vCN;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vCP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vCN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform float uNight; varying vec3 vCP; varying vec3 vCN;
          float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float isWall = 1.0 - step(0.5, abs(vCN.y));
          vec2 wuv = vec2(abs(vCN.x) > 0.5 ? vCP.z : vCP.x, vCP.y);
          vec2 cell = floor(wuv / vec2(3.1, 3.2));
          vec2 fw = fract(wuv / vec2(3.1, 3.2));
          float win = step(0.3, fw.x) * step(fw.x, 0.7) * step(0.22, fw.y) * step(fw.y, 0.82) * step(4.2, vCP.y) * isWall;
          diffuseColor.rgb *= mix(1.0, 0.42, win);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float rr = hh(cell + floor(vCP.xz / 40.0) * 7.0 + vCN.xz * 3.0);
          float lit = step(0.62, rr);
          vec3 wc = mix(vec3(1.0, 0.66, 0.34), vec3(1.0, 0.88, 0.7), fract(rr * 13.0));
          totalEmissiveRadiance += wc * win * lit * uNight * 1.1;
          float shop = step(vCP.y, 3.6) * step(0.6, vCP.y) * isWall * step(0.45, hh(cell * 0.37));
          totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * shop * uNight * 0.9;`);
    };
    wallMat.customProgramCacheKey = () => 'city-walls';
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, blocks.length);
    const roofs = new THREE.InstancedMesh(roofGeo, std(0x5c656d, 0.6, { metalness: 0.4 }), blocks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    blocks.forEach(([x, z, w, d, h], i) => {
      m.compose(p.set(x, 0, z), q, s.set(w, h, d)); walls.setMatrixAt(i, m);
      const roofH = h > 50 ? 0.01 : 4.5;
      m.compose(p.set(x, h, z), q, s.set(w, roofH, d)); roofs.setMatrixAt(i, m);
    });
    walls.receiveShadow = true; roofs.receiveShadow = true;
    walls.computeBoundingSphere(); roofs.computeBoundingSphere();
    env.city = new THREE.Group();
    env.city.add(walls, roofs);
    scene.add(env.city);

    // 路灯
    const lamps = [];
    for (let g = -34; g <= 34; g++) {
      const c = g * step + step / 2;
      for (let t = -2900; t < 2900; t += 28) {
        if (!excluded(c, t)) lamps.push(c, 7, t);
        if (!excluded(t, c)) lamps.push(t, 7, c);
      }
    }
    for (let x = -1400; x <= 1400; x += 24) { lamps.push(x, 6, RIVER_Z0 - 14, x, 6, RIVER_Z1 + 14); }
    for (const x of [-131, 131]) for (let z = -110; z > -1040; z -= 24) lamps.push(x, 5, z);
    env.lampPositions = lamps;
  }

  return { ...env, sky, skyU };
}
