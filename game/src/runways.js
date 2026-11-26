// Builds each airfield you can land at: the runway surface with its painted markings (threshold
// bars, numbers, centreline) on a canvas texture, edge lights, and the buildings that make a strip
// readable from the air: a hangar, a tower, a fuel tank and a windsock showing the breeze.
import * as THREE from 'three';
import { AIRFIELDS } from './islands.js';
import { makeRandom } from './noise.js';

const RAD = Math.PI / 180;

/** Runway designators for each end, from the heading: 95 degrees reads 10 one way and 28 the other. */
export function runwayNumbers(heading) {
  const fmt = (deg) => String(Math.round((((deg % 360) + 360) % 360) / 10) || 36).padStart(2, '0');
  return [fmt(heading), fmt(heading + 180)];
}

function paintRunway(field) {
  const rand = makeRandom(field.length);
  const canvas = document.createElement('canvas');
  const scale = 4;   // pixels per metre across
  canvas.width = Math.round(field.width * scale);
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const Hh = canvas.height;
  const pxPerM = Hh / field.length;
  const base = { asphalt: '#3d3f43', grass: '#6c9a46', gravel: '#c4b8a2' }[field.surface];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, Hh);
  // grain and wear
  for (let i = 0; i < 9000; i += 1) {
    const shade = rand() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    ctx.fillStyle = shade;
    ctx.fillRect(rand() * W, rand() * Hh, 2 + rand() * 3, 2 + rand() * 6);
  }
  if (field.surface === 'grass') {
    // mown stripes and white edge boards
    for (let y = 0; y < Hh; y += 64) {
      ctx.fillStyle = (y / 64) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, y, W, 64);
    }
    ctx.fillStyle = '#f4f4f0';
    for (let y = 10; y < Hh; y += 90) { ctx.fillRect(0, y, 6, 30); ctx.fillRect(W - 6, y, 6, 30); }
  } else {
    // tyre marks in the touchdown zones
    ctx.fillStyle = 'rgba(15,15,15,0.35)';
    for (const end of [0.12, 0.88]) {
      for (let i = 0; i < 40; i += 1) {
        const y = Hh * end + (rand() - 0.5) * 220;
        ctx.fillRect(W / 2 - 18 + rand() * 10, y, 4, 40 + rand() * 60);
        ctx.fillRect(W / 2 + 8 + rand() * 10, y, 4, 40 + rand() * 60);
      }
    }
  }
  const paint = field.surface === 'grass' ? '#f7f7f2' : '#f1f1ea';
  ctx.fillStyle = paint;
  // side stripes
  if (field.surface === 'asphalt') { ctx.fillRect(4, 0, 4, Hh); ctx.fillRect(W - 8, 0, 4, Hh); }
  // threshold piano keys at both ends
  const keys = field.surface === 'grass' ? 4 : 8;
  const keyW = (W - 24) / (keys * 2);
  for (const top of [true, false]) {
    for (let k = 0; k < keys * 2; k += 2) {
      const x = 12 + (k + 0.5) * keyW;
      const y = top ? 12 : Hh - 12 - 30 * pxPerM;
      ctx.fillRect(x, y, keyW, 30 * pxPerM);
    }
  }
  // centreline dashes
  for (let y = 70 * pxPerM; y < Hh - 70 * pxPerM; y += 50 * pxPerM) ctx.fillRect(W / 2 - 2, y, 4, 28 * pxPerM);
  // designators, each readable on approach from its own end
  const [ahead, back] = runwayNumbers(field.heading);
  ctx.font = `bold ${Math.round(W * 0.42)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(W / 2, Hh - 50 * pxPerM);
  ctx.scale(1, 2.2);
  ctx.fillText(ahead, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, 50 * pxPerM);
  ctx.rotate(Math.PI);
  ctx.scale(1, 2.2);
  ctx.fillText(back, 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function box(w, h, d, colour, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: colour, flatShading: true }));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildHangar(colour) {
  const group = new THREE.Group();
  group.add(box(34, 7, 28, '#d9d4c8', 0, 0, 0));
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 17, 28, 14, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: colour, flatShading: true }),
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.scale.set(0.45, 1, 1);
  roof.position.y = 7;
  roof.castShadow = true;
  group.add(roof);
  const door = box(26, 6.5, 0.4, '#5a6068', 0, 0, 14.1);
  group.add(door);
  return group;
}

function buildTower() {
  const group = new THREE.Group();
  group.add(box(5, 12, 5, '#e8e3da', 0, 0, 0));
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.6, 3.4, 8), new THREE.MeshLambertMaterial({ color: '#4c7894', emissive: '#203848', flatShading: true }));
  cab.position.y = 13.7;
  group.add(cab);
  group.add(box(9, 0.6, 9, '#b0443a', 0, 15.4, 0));
  return group;
}

function buildWindsock() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), new THREE.MeshLambertMaterial({ color: '#dddddd' }));
  pole.position.y = 3.5;
  group.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#ff7a1a', side: THREE.DoubleSide }));
  sock.rotation.z = -Math.PI / 2;   // open mouth at the pole, tip streaming downwind along +X
  sock.position.set(2.1, 6.6, 0);
  group.add(sock);
  return group;
}

function buildFuelTank() {
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 12), new THREE.MeshLambertMaterial({ color: '#e7e1cf', flatShading: true }));
  tank.rotation.z = Math.PI / 2;
  tank.position.y = 3.4;
  tank.castShadow = true;
  const group = new THREE.Group();
  group.add(tank);
  group.add(box(0.5, 1, 0.5, '#444', -2.5, 0, 0));
  group.add(box(0.5, 1, 0.5, '#444', 2.5, 0, 0));
  return group;
}

/** Edge lights down both sides and green/red threshold bars, as one instanced mesh per colour. */
function buildRunwayLights(field) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
  const make = (colour, count) => new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: colour, fog: false }), count);
  const spacing = 60;
  const perSide = Math.floor(field.length / spacing) + 1;
  const white = make('#fff4d0', perSide * 2);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < perSide; i += 1) {
    const along = -field.length / 2 + i * spacing;
    for (const side of [-1, 1]) {
      m.makeTranslation(side * (field.width / 2 + 2), 0.3, -along);
      white.setMatrixAt(n, m);
      n += 1;
    }
  }
  group.add(white);
  const ends = make('#5dff7a', 10);
  const far = make('#ff4a3a', 10);
  for (let i = 0; i < 10; i += 1) {
    const across = -field.width / 2 + (i + 0.5) * (field.width / 10);
    m.makeTranslation(across, 0.3, field.length / 2 + 3);
    ends.setMatrixAt(i, m);
    m.makeTranslation(across, 0.3, -field.length / 2 - 3);
    far.setMatrixAt(i, m);
  }
  group.add(ends, far);
  return group;
}

/**
 * PAPI: four lamps beside the touchdown zone that each show white above their angle and red below
 * it, so two white and two red means you are on a 3 degree glide path.
 */
function buildPapi(field) {
  const group = new THREE.Group();
  const lamps = [];
  const angles = [3.5, 3.17, 2.83, 2.5];
  angles.forEach((angle, i) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.6), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false }));
    lamp.position.set(-field.width / 2 - 14 - i * 9, 0.6, field.length / 2 - 90);
    group.add(lamp);
    lamps.push({ lamp, angle });
  });
  return { group, lamps };
}

/** Every airfield as a group placed in the world; local -Z runs along the runway's heading. */
export function buildAirfields() {
  const root = new THREE.Group();
  root.name = 'airfields';
  const papis = [];
  const socks = [];
  const local = new THREE.Vector3();
  for (const field of AIRFIELDS) {
    const group = new THREE.Group();
    group.position.set(field.x, field.elevation, field.z);
    group.rotation.y = -field.heading * RAD;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(field.width, field.length),
      new THREE.MeshLambertMaterial({ map: paintRunway(field), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.3;
    strip.receiveShadow = true;
    group.add(strip);
    group.add(buildRunwayLights(field));
    const papi = buildPapi(field);
    group.add(papi.group);
    papis.push({ ...papi, group });
    const side = field.width / 2 + 55;
    const hangar = buildHangar(field.home ? '#b8463a' : '#4f6d8c');
    hangar.position.set(side + 10, 0, -field.length * 0.15);
    hangar.rotation.y = -Math.PI / 2;
    group.add(hangar);
    if (field.home) {
      const tower = buildTower();
      tower.position.set(side, 0, field.length * 0.08);
      group.add(tower);
      const second = buildHangar('#b8463a');
      second.position.set(side + 10, 0, -field.length * 0.15 - 38);
      second.rotation.y = -Math.PI / 2;
      group.add(second);
    }
    const tank = buildFuelTank();
    tank.position.set(side - 12, 0, field.length * 0.2);
    group.add(tank);
    const sock = buildWindsock();
    sock.position.set(-field.width / 2 - 30, 0, -field.length * 0.3);
    group.add(sock);
    socks.push({ sock, field });
    root.add(group);
  }
  return {
    root,
    /** Turns each PAPI lamp red or white from where the viewer is, and swings the windsocks. */
    update(viewer, wind) {
      if (wind && wind.lengthSq() > 0.01) {
        const downwind = Math.atan2(wind.x, -wind.z);   // world heading the breeze blows toward
        for (const { sock, field } of socks) {
          sock.rotation.y = -(downwind - field.heading * RAD) + Math.PI / 2;
          sock.children[1].rotation.z = -Math.PI / 2 - Math.max(0, 0.5 - wind.length() * 0.06);
        }
      }
      for (const papi of papis) {
        local.copy(viewer);
        papi.group.worldToLocal(local);
        for (const { lamp, angle } of papi.lamps) {
          const dz = local.z - lamp.position.z;
          const seen = Math.atan2(local.y - lamp.position.y, Math.max(1, dz)) * 180 / Math.PI;
          lamp.material.color.set(dz > 0 && seen > angle ? '#fff8e8' : '#ff2a1a');
        }
      }
    },
  };
}
