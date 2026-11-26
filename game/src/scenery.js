// Things on the land and sea that give the isles scale from the air: pine forests, fishing
// villages of whitewashed cottages, the striped lighthouse on Tarn Rock and sailboats in the bays.
// Everything repeated is one instanced mesh, so thousands of trees cost a handful of draw calls.
import * as THREE from 'three';
import { AIRFIELDS, LANDMARKS, runwayLocal } from './islands.js';
import { terrainHeight, terrainNormal, forestDensity } from './terrain.js';
import { makeRandom } from './noise.js';

/** Inside a strip's clearance: its sides, plus a corridor off each end for the approach. */
function nearRunway(x, z, margin) {
  return AIRFIELDS.some((f) => {
    const { along, across } = runwayLocal(f, x, z);
    if (Math.abs(along) < f.length / 2 + margin && Math.abs(across) < f.width / 2 + margin) return true;
    const beyond = Math.abs(along) - f.length / 2;
    return beyond > 0 && beyond < 900 && Math.abs(across) < f.width / 2 + 40 + beyond * 0.12;
  });
}

function nearVillage(x, z, r) {
  return LANDMARKS.villages.some((v) => Math.hypot(x - v.x, z - v.z) < r);
}

/** Pines planted where the forest noise is dense, on gentle slopes away from strips and towns. */
function buildForests(random) {
  const count = 9000;
  const crown = new THREE.ConeGeometry(1, 1, 6);
  crown.translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 5);
  trunk.translate(0, 0.5, 0);
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: '#2f6a35', flatShading: true }), count);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#6b4a32' }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tint = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < count * 14 && placed < count; tries += 1) {
    const x = (random() - 0.5) * 15000;
    const z = (random() - 0.5) * 15000;
    const density = forestDensity(x, z);
    if (random() > density * 2.2) continue;
    const h = terrainHeight(x, z);
    if (h < 7 || h > 420) continue;
    terrainNormal(x, z, n);
    if (n.y < 0.82) continue;
    if (nearRunway(x, z, 90) || nearVillage(x, z, 130)) continue;
    const tall = 9 + random() * 9;
    const wide = tall * (0.3 + random() * 0.1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * 6.28);
    p.set(x, h + tall * 0.28, z);
    s.set(wide, tall * 0.78, wide);
    m.compose(p, q, s);
    crowns.setMatrixAt(placed, m);
    tint.setHSL(0.3 + random() * 0.06, 0.42 + random() * 0.15, 0.22 + random() * 0.1);
    crowns.setColorAt(placed, tint);
    p.set(x, h - 0.5, z);
    s.set(wide, tall * 0.3, wide);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);
    placed += 1;
  }
  crowns.count = placed;
  trunks.count = placed;
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  return [crowns, trunks];
}

/** Villages: whitewashed cottages with coloured hipped roofs clustered round each named place. */
function buildVillages(random) {
  const perVillage = 26;
  const total = perVillage * LANDMARKS.villages.length;
  const wall = new THREE.BoxGeometry(1, 1, 1);
  wall.translate(0, 0.5, 0);
  const roof = new THREE.ConeGeometry(0.78, 0.6, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 1.3, 0);
  const walls = new THREE.InstancedMesh(wall, new THREE.MeshLambertMaterial({ color: '#f1ece2', flatShading: true }), total);
  const roofs = new THREE.InstancedMesh(roof, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), total);
  const roofColours = ['#b8463a', '#c7703c', '#40647f', '#6f4e3a', '#9a3a3a'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (const village of LANDMARKS.villages) {
    for (let k = 0; k < perVillage; k += 1) {
      const a = random() * 6.28;
      const r = 12 + random() * 110;
      const x = village.x + Math.cos(a) * r;
      const z = village.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 2) continue;
      const w = 6 + random() * 5;
      const d = 8 + random() * 6;
      const tall = 4 + random() * 3;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(a / 1.57) * 1.57 + (random() - 0.5) * 0.3);
      p.set(x, h - 0.5, z);
      s.set(w, tall, d);
      m.compose(p, q, s);
      walls.setMatrixAt(n, m);
      s.set(w * 1.25, tall, d * 1.25);
      m.compose(p, q, s);
      roofs.setMatrixAt(n, m);
      roofs.setColorAt(n, roofColours[Math.floor(random() * roofColours.length)]);
      n += 1;
    }
  }
  walls.count = n;
  roofs.count = n;
  for (const mesh of [walls, roofs]) { mesh.castShadow = true; mesh.receiveShadow = true; }
  return [walls, roofs];
}

/** The red-and-white lighthouse on Tarn Rock with a lamp that glows through the haze. */
function buildLighthouse() {
  const { x, z } = LANDMARKS.lighthouse;
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z) - 0.5, z);
  const bands = 5;
  for (let b = 0; b < bands; b += 1) {
    const r0 = 5 - b * 0.55;
    const r1 = 5 - (b + 1) * 0.55;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 6, 12), new THREE.MeshLambertMaterial({ color: b % 2 ? '#c8352c' : '#f4f1ea', flatShading: true }));
    ring.position.y = 3 + b * 6;
    ring.castShadow = true;
    group.add(ring);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 10), new THREE.MeshBasicMaterial({ color: '#fff1a8', fog: false }));
  lamp.position.y = 31.5;
  group.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.6, 10), new THREE.MeshLambertMaterial({ color: '#2a2f33' }));
  cap.position.y = 34.3;
  group.add(cap);
  return group;
}

/** A few sailboats moored in the bays, each a hull and a white sail. */
function buildBoats(random) {
  const group = new THREE.Group();
  const hullGeo = new THREE.BoxGeometry(2.4, 1.2, 8);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, -2.5, 0, 10, 0.5, 0, 1, 2.8], 3));
  sailGeo.computeVertexNormals();
  const hullMat = new THREE.MeshLambertMaterial({ color: '#2e4a6b' });
  const sailMat = new THREE.MeshLambertMaterial({ color: '#fbfaf4', side: THREE.DoubleSide });
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < 40; tries += 1) {
    const x = (random() - 0.5) * 15000;
    const z = (random() - 0.5) * 15000;
    const h = terrainHeight(x, z);
    if (h > -6 || h < -25) continue;
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.2;
    boat.add(hull);
    boat.add(new THREE.Mesh(sailGeo, sailMat));
    boat.position.set(x, 0, z);
    boat.rotation.y = random() * 6.28;
    group.add(boat);
    placed += 1;
  }
  return group;
}

/** Everything planted on the isles, as one group. */
export function buildScenery(seed = 21) {
  const random = makeRandom(seed);
  const group = new THREE.Group();
  group.name = 'scenery';
  group.add(...buildForests(random));
  group.add(...buildVillages(random));
  group.add(buildLighthouse());
  group.add(buildBoats(random));
  return group;
}
