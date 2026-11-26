// The terrain mesh: samples the islands' ground height on a grid, colours each triangle by what
// the ground is (sand, meadow, forest floor, rock, snow) in a flat-shaded low-poly style, and
// answers height queries on the very triangles it draws, so wheels touch the ground you see.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { groundHeight, surfaceKind } from './islands.js';
import { fbm } from './noise.js';

const N = WORLD.segments;
const CELL = WORLD.size / N;
const HALF = WORLD.size / 2;
const heights = new Float32Array((N + 1) * (N + 1));

const PALETTE = {
  seabed: new THREE.Color('#c8b98d'),
  deep: new THREE.Color('#5a7f86'),
  sand: new THREE.Color('#e6d4a0'),
  meadow: new THREE.Color('#86b356'),
  meadowDark: new THREE.Color('#5d9442'),
  forest: new THREE.Color('#41703a'),
  heath: new THREE.Color('#9a9a5a'),
  rock: new THREE.Color('#8c8277'),
  rockDark: new THREE.Color('#6d655e'),
  snow: new THREE.Color('#f4f6f8'),
  runway: new THREE.Color('#6f9b49'),
};

function sampleGrid() {
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      heights[j * (N + 1) + i] = groundHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
  }
}

const H = (i, j) => heights[Math.min(N, Math.max(0, j)) * (N + 1) + Math.min(N, Math.max(0, i))];

/** Height of the drawn terrain at world (x, z), interpolated on the same triangles as the mesh. */
export function terrainHeight(x, z) {
  const gx = (x + HALF) / CELL;
  const gz = (z + HALF) / CELL;
  if (gx < 0 || gz < 0 || gx >= N || gz >= N) return WORLD.seaFloor;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const a = H(i, j);
  const b = H(i + 1, j);
  const c = H(i, j + 1);
  const d = H(i + 1, j + 1);
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/** Upward unit normal of the terrain at (x, z), from central differences. */
export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = CELL * 0.5;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

/** How dense the forest is at (x, z), 0 to 1: shared by the ground colour and the tree planter. */
export function forestDensity(x, z) {
  return Math.max(0, fbm(x / 1100, z / 1100, 41, 4) * 1.9 - 0.95);
}

function triangleColour(cx, cz, h, slope, out) {
  const kind = surfaceKind(cx, cz, h, slope);
  const jitter = fbm(cx / 140, cz / 140, 9, 3);
  switch (kind) {
    case 'water': {
      const depth = Math.min(1, -h / 30);
      out.copy(PALETTE.seabed).lerp(PALETTE.deep, depth);
      break;
    }
    case 'sand': out.copy(PALETTE.sand); break;
    case 'snow': out.copy(PALETTE.snow); break;
    case 'rock': out.copy(PALETTE.rock).lerp(PALETTE.rockDark, jitter); break;
    case 'runway': out.copy(PALETTE.runway); break;
    default: {
      out.copy(PALETTE.meadow).lerp(PALETTE.meadowDark, jitter);
      const forest = forestDensity(cx, cz);
      if (forest > 0) out.lerp(PALETTE.forest, Math.min(1, forest * 2.5));
      if (h > 260) out.lerp(PALETTE.heath, Math.min(1, (h - 260) / 140));
      break;
    }
  }
  const shade = 0.94 + 0.12 * fbm(cx / 37, cz / 37, 13, 2);
  return out.multiplyScalar(shade);
}

/** Builds the flat-shaded terrain mesh and fills the height grid that terrainHeight reads. */
export function buildTerrain() {
  sampleGrid();
  const triangles = N * N * 2;
  const positions = new Float32Array(triangles * 9);
  const colours = new Float32Array(triangles * 9);
  const colour = new THREE.Color();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  let k = 0;
  const emit = (ia, ja, ib, jb, ic, jc) => {
    p[0].set(-HALF + ia * CELL, H(ia, ja), -HALF + ja * CELL);
    p[1].set(-HALF + ib * CELL, H(ib, jb), -HALF + jb * CELL);
    p[2].set(-HALF + ic * CELL, H(ic, jc), -HALF + jc * CELL);
    e1.subVectors(p[1], p[0]);
    e2.subVectors(p[2], p[0]);
    const n = e1.cross(e2).normalize();
    const slope = 1 - Math.abs(n.y);
    const cx = (p[0].x + p[1].x + p[2].x) / 3;
    const cz = (p[0].z + p[1].z + p[2].z) / 3;
    const ch = (p[0].y + p[1].y + p[2].y) / 3;
    triangleColour(cx, cz, ch, slope * 3, colour);
    for (let v = 0; v < 3; v += 1) {
      positions[k] = p[v].x; positions[k + 1] = p[v].y; positions[k + 2] = p[v].z;
      colours[k] = colour.r; colours[k + 1] = colour.g; colours[k + 2] = colour.b;
      k += 3;
    }
  };
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      emit(i, j, i, j + 1, i + 1, j);
      emit(i + 1, j, i, j + 1, i + 1, j + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Paints a top-down map of the isles into a canvas for the minimap and the mission briefing. */
export function paintMap(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wx = -HALF + (x + 0.5) * (WORLD.size / size);
      const wz = -HALF + (y + 0.5) * (WORLD.size / size);
      const h = terrainHeight(wx, wz);
      let r; let g; let b;
      if (h < 0) { const d = Math.min(1, -h / 30); r = 40 - 20 * d; g = 120 - 40 * d; b = 150 - 30 * d; }
      else if (h < 5) { r = 220; g = 205; b = 150; }
      else if (h > 550) { r = 235; g = 235; b = 235; }
      else { const t = Math.min(1, h / 500); r = 100 + 70 * t; g = 150 - 10 * t; b = 70 + 50 * t; }
      const o = (y * size + x) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export { HALF as WORLD_HALF };
