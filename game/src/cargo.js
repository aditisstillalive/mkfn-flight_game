// Supply crates for the drop mission: released from the belly with the aircraft's velocity, they
// tumble for a moment, pop an orange-and-white parachute and drift down under drag. Where each one
// lands is measured against the nearest drop zone, so a low, slow, level pass scores best.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const CHUTE_DELAY = 1.1;   // seconds of free fall before the canopy opens

function buildCrateMesh() {
  const group = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), new THREE.MeshLambertMaterial({ color: '#b7834a', flatShading: true }));
  crate.castShadow = true;
  group.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 1.25), new THREE.MeshLambertMaterial({ color: '#3a3f44' }));
  group.add(band);
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshLambertMaterial({ color: '#ff7a2a', flatShading: true, side: THREE.DoubleSide }),
  );
  canopy.position.y = 6.5;
  chute.add(canopy);
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(3, 7.3, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(-3, 7.3, 0),
      new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 7.3, 3), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 7.3, -3),
    ]),
    new THREE.LineBasicMaterial({ color: '#ffffff' }),
  );
  chute.add(lines);
  chute.visible = false;
  group.add(chute);
  return { group, chute };
}

/** The crates in flight. `release(pos, vel)` drops one; `update(dt)` returns the ones that landed. */
export function createCargoSystem(scene) {
  const crates = [];
  return {
    crates,
    release(position, velocity, time) {
      const mesh = buildCrateMesh();
      mesh.group.position.copy(position).add(new THREE.Vector3(0, -1.8, 0));
      scene.add(mesh.group);
      const crate = { ...mesh, pos: mesh.group.position, vel: velocity.clone(), released: time, age: 0, landed: false, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) };
      crates.push(crate);
      return crate;
    },
    update(dt) {
      const landed = [];
      for (const crate of crates) {
        if (crate.landed) continue;
        crate.age += dt;
        const open = crate.age > CHUTE_DELAY;
        crate.chute.visible = open;
        const drag = open ? 4 : 0.04;
        const speed = crate.vel.length();
        crate.vel.y -= 9.81 * dt;
        crate.vel.addScaledVector(crate.vel, -Math.min(1, drag * speed * 0.05 * dt) );
        if (open) crate.vel.x *= Math.max(0, 1 - dt * 0.8), crate.vel.z *= Math.max(0, 1 - dt * 0.8);
        crate.pos.addScaledVector(crate.vel, dt);
        if (!open) crate.group.rotation.set(crate.spin.x * crate.age * 3, crate.spin.y * crate.age * 3, 0);
        else crate.group.rotation.x *= Math.max(0, 1 - dt * 3), crate.group.rotation.z *= Math.max(0, 1 - dt * 3);
        const ground = Math.max(terrainHeight(crate.pos.x, crate.pos.z), 0);
        if (crate.pos.y <= ground + 0.5) {
          crate.pos.y = ground + 0.5;
          crate.landed = true;
          crate.chute.visible = false;
          crate.group.rotation.set(0, crate.group.rotation.y, 0);
          landed.push(crate);
        }
      }
      return landed;
    },
    clear() {
      for (const crate of crates) scene.remove(crate.group);
      crates.length = 0;
    },
  };
}
