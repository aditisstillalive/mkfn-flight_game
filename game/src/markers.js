// Objective markers placed in the world: the glowing gates of a ring course (the next one pulses
// orange, those after it wait in pale white, passed ones flash green and fade), painted drop zones
// with smoke for the supply run, and a tall light beacon over the airfield you are flying to.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const RING_RADIUS = 24;

/** A ring gate facing along `facing` (unit vector, the way you should fly through it). */
function buildRingMesh() {
  const group = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS, 1.6, 10, 40),
    new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.95, fog: false }),
  );
  group.add(torus);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS - 3.2, 0.5, 6, 40),
    new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0.8, fog: false }),
  );
  group.add(inner);
  const chevrons = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.4), torus.material);
    const a = i * Math.PI / 2;
    tick.position.set(Math.cos(a) * (RING_RADIUS + 3.5), Math.sin(a) * (RING_RADIUS + 3.5), 0);
    tick.rotation.z = a + Math.PI / 2;
    chevrons.add(tick);
  }
  group.add(chevrons);
  return { group, torus, inner };
}

/** The course of rings. `update(time)` animates them; `setProgress(i)` marks ring i as next. */
export function buildRingCourse(points) {
  const root = new THREE.Group();
  root.name = 'rings';
  const rings = points.map((p, i) => {
    const next = points[i + 1] || p;
    const prev = points[i - 1] || { x: p.x - (next.x - p.x), y: p.y, z: p.z - (next.z - p.z) };
    const facing = new THREE.Vector3(next.x - prev.x, (next.y - prev.y) * 0.3, next.z - prev.z).normalize();
    const mesh = buildRingMesh();
    mesh.group.position.set(p.x, p.y, p.z);
    mesh.group.lookAt(mesh.group.position.clone().add(facing));
    root.add(mesh.group);
    return { ...mesh, center: mesh.group.position.clone(), facing, passedAt: -1 };
  });
  let progress = 0;
  const course = {
    root,
    rings,
    radius: RING_RADIUS,
    setProgress(index, time) {
      if (index > progress && rings[progress]) rings[progress].passedAt = time;
      progress = index;
    },
    update(time) {
      rings.forEach((ring, i) => {
        const mat = ring.torus.material;
        if (i < progress) {
          const age = time - ring.passedAt;
          ring.group.visible = age < 1.2;
          mat.color.set('#5dff8a');
          mat.opacity = Math.max(0, 1 - age / 1.2);
          ring.group.scale.setScalar(1 + age * 0.5);
        } else if (i === progress) {
          ring.group.visible = true;
          mat.color.set('#ff8a2a');
          mat.opacity = 0.95;
          ring.group.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
        } else {
          ring.group.visible = i < progress + 4;
          mat.color.set('#fff6e6');
          mat.opacity = 0.55 - (i - progress) * 0.1;
          ring.group.scale.setScalar(1);
        }
        ring.inner.material.opacity = mat.opacity * 0.8;
      });
    },
  };
  course.update(0);
  return course;
}

/** Did the segment from `a` to `b` pass through `ring`? */
export function crossedRing(ring, a, b, radius = RING_RADIUS) {
  const da = a.clone().sub(ring.center).dot(ring.facing);
  const db = b.clone().sub(ring.center).dot(ring.facing);
  if (da > 0 || db < 0) return false;
  const t = da / (da - db);
  const hit = a.clone().lerp(b, t);
  return hit.distanceTo(ring.center) < radius + 1;
}

/** Painted target circles on the ground with a plume of smoke, for the supply drop. */
export function buildDropZones(targets) {
  const root = new THREE.Group();
  root.name = 'drop-zones';
  const zones = targets.map((t) => {
    const y = Math.max(terrainHeight(t.x, t.z), 0);
    const group = new THREE.Group();
    group.position.set(t.x, y + 1.4, t.z);
    for (const [r, colour] of [[30, '#ffffff'], [22, '#ff5a2a'], [14, '#ffffff'], [6, '#ff5a2a']]) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshBasicMaterial({ color: colour, polygonOffset: true, polygonOffsetFactor: -6 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = (30 - r) * 0.01;
      group.add(disc);
    }
    const smoke = new THREE.Group();
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 14; i += 1) {
      const smokeMat = new THREE.MeshLambertMaterial({ color: '#ffd2b8', emissive: '#a04a20', emissiveIntensity: 0.5, transparent: true, opacity: 0.35, depthWrite: false });
      const p = new THREE.Mesh(puff, smokeMat);
      p.userData.phase = i / 14;
      smoke.add(p);
    }
    group.add(smoke);
    root.add(group);
    return { ...t, ground: y, group, smoke, done: false };
  });
  return {
    root,
    zones,
    update(time) {
      for (const zone of zones) {
        zone.smoke.visible = !zone.done;
        zone.smoke.children.forEach((p) => {
          const k = (time * 0.12 + p.userData.phase) % 1;
          p.position.set(k * 16, 2 + k * 60, Math.sin(k * 6 + p.userData.phase * 9) * 3);
          p.scale.setScalar(1.8 + k * 7);
          p.material.opacity = 0.42 * (1 - k);
        });
      }
    },
  };
}

/** A tall column of light standing over a destination, visible from across the isles. */
export function buildBeacon(x, z, colour = '#ffd36a') {
  const y = Math.max(terrainHeight(x, z), 0);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 10, 600, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.set(x, y + 300, z);
  beam.name = 'beacon';
  // fade the column out on short final so it never stands between the pilot and the runway
  beam.onBeforeRender = (renderer, scene, camera) => {
    const d = Math.hypot(camera.position.x - x, camera.position.z - z);
    beam.material.opacity = 0.22 * THREE.MathUtils.clamp((d - 1200) / 1800, 0, 1);
  };
  return beam;
}
