// 一层环梁外侧饰带上镌刻的 72 位法国科学家与工程师姓名（每面 18 位）
import * as THREE from 'three';

export const FACE_NAMES = {
  // 西北面（朝特罗卡德罗）
  NW: ['SEGUIN', 'LALANDE', 'TRESCA', 'PONCELET', 'BRESSE', 'LAGRANGE', 'BÉLANGER', 'CUVIER', 'LAPLACE',
    'DULONG', 'CHASLES', 'LAVOISIER', 'AMPÈRE', 'CHEVREUL', 'FLACHAT', 'NAVIER', 'LEGENDRE', 'CHAPTAL'],
  // 东南面（朝军事学校）
  SE: ['JAMIN', 'GAY-LUSSAC', 'FIZEAU', 'SCHNEIDER', 'LE CHATELIER', 'BERTHIER', 'BARRAL', 'DE DION', 'GOÜIN',
    'JOUSSELIN', 'BROCA', 'BECQUEREL', 'CORIOLIS', 'CAIL', 'TRIGER', 'GIFFARD', 'PERRIER', 'STURM'],
  // 西南面（朝格勒内勒）
  SW: ['CAUCHY', 'BELGRAND', 'REGNAULT', 'FRESNEL', 'DE PRONY', 'VICAT', 'EBELMEN', 'COULOMB', 'POINSOT',
    'FOUCAULT', 'DELAUNAY', 'MORIN', 'HAÜY', 'COMBES', 'THÉNARD', 'ARAGO', 'POISSON', 'MONGE'],
  // 东北面（朝巴黎市区）
  NE: ['PETIET', 'DAGUERRE', 'WURTZ', 'LE VERRIER', 'PERDONNET', 'DELAMBRE', 'MALUS', 'BRÉGUET', 'POLONCEAU',
    'DUMAS', 'CLAPEYRON', 'BORDA', 'FOURIER', 'BICHAT', 'SAUVAGE', 'PELOUZE', 'CARNOT', 'LAMÉ'],
};

export function makeNamesTexture(names) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 112;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = 'bold 64px "Times New Roman", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const slot = c.width / names.length;
  names.forEach((n, i) => {
    g.fillStyle = '#3a2a12';
    g.fillText(n, slot * (i + 0.5) + 2, 60, slot * 0.88);
    g.fillStyle = '#e2bb62';
    g.fillText(n, slot * (i + 0.5), 58, slot * 0.88);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
