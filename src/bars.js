import * as THREE from 'three';

// 杆件收集器：每根杆件 = 一个被拉伸/旋转的单位立方体实例。
// 全塔数十万根杆件合并为一个 InstancedMesh，一次绘制完成。
export class Bars {
  constructor(capacity = 65536) {
    this.buf = new Float32Array(capacity * 16);
    this.count = 0;
  }

  _ensure() {
    if ((this.count + 1) * 16 > this.buf.length) {
      const nb = new Float32Array(this.buf.length * 2);
      nb.set(this.buf);
      this.buf = nb;
    }
  }

  // 从 a 到 b 的杆件；w = 沿 side 方向的尺寸，d = 另一横向尺寸
  add(a, b, w, d, side) {
    let yx = b.x - a.x, yy = b.y - a.y, yz = b.z - a.z;
    const len = Math.sqrt(yx * yx + yy * yy + yz * yz);
    if (len < 1e-6) return;
    yx /= len; yy /= len; yz /= len;
    let sx = side.x, sy = side.y, sz = side.z;
    let dp = sx * yx + sy * yy + sz * yz;
    sx -= dp * yx; sy -= dp * yy; sz -= dp * yz;
    let sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sl < 1e-5) {
      if (Math.abs(yx) < 0.9) { sx = 1; sy = 0; sz = 0; } else { sx = 0; sy = 0; sz = 1; }
      dp = sx * yx + sy * yy + sz * yz;
      sx -= dp * yx; sy -= dp * yy; sz -= dp * yz;
      sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    }
    sx /= sl; sy /= sl; sz /= sl;
    const zx = sy * yz - sz * yy, zy = sz * yx - sx * yz, zz = sx * yy - sy * yx;
    this._ensure();
    const m = this.buf, o = this.count * 16;
    m[o] = sx * w; m[o + 1] = sy * w; m[o + 2] = sz * w; m[o + 3] = 0;
    m[o + 4] = yx * len; m[o + 5] = yy * len; m[o + 6] = yz * len; m[o + 7] = 0;
    m[o + 8] = zx * d; m[o + 9] = zy * d; m[o + 10] = zz * d; m[o + 11] = 0;
    m[o + 12] = (a.x + b.x) / 2; m[o + 13] = (a.y + b.y) / 2; m[o + 14] = (a.z + b.z) / 2; m[o + 15] = 1;
    this.count++;
  }

  // 轴对齐盒子
  box(cx, cy, cz, sx, sy, sz) {
    this._ensure();
    const m = this.buf, o = this.count * 16;
    m.fill(0, o, o + 16);
    m[o] = sx; m[o + 5] = sy; m[o + 10] = sz;
    m[o + 12] = cx; m[o + 13] = cy; m[o + 14] = cz; m[o + 15] = 1;
    this.count++;
  }

  toMesh(geometry, material, colorAt) {
    const mesh = new THREE.InstancedMesh(geometry, material, this.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(this.buf.slice(0, this.count * 16), 16);
    if (colorAt) {
      const c = new Float32Array(this.count * 3);
      for (let i = 0; i < this.count; i++) colorAt(this.buf[i * 16 + 13], i, c, i * 3);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(c, 3);
    }
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return mesh;
  }
}
