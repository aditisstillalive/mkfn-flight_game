// Short-lived visual effects that tell the pilot what just happened: puffs of dust or spray when
// the wheels touch, vapour off the wingtips under heavy g, and a fireball with a column of black
// smoke where a flight ends badly. Particles are pooled meshes that grow, drift and fade.
import * as THREE from 'three';

const puffGeo = new THREE.IcosahedronGeometry(1, 0);

export function createEffects(scene) {
  const particles = [];

  function spawn({ pos, vel, colour, size, grow, life, opacity = 0.7, emissive = false }) {
    const material = emissive
      ? new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false })
      : new THREE.MeshLambertMaterial({ color: colour, transparent: true, opacity, depthWrite: false, flatShading: true });
    const mesh = new THREE.Mesh(puffGeo, material);
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(mesh);
    particles.push({ mesh, vel: vel.clone(), grow, life, age: 0, opacity });
  }

  return {
    /** Dust (or spray on sand) kicked up where the wheels meet the ground. */
    touchdown(pos, hard, surface) {
      const colour = surface === 'runway' ? '#cfc6b8' : surface === 'sand' ? '#efe0b4' : '#b9a27a';
      for (let i = 0; i < (hard ? 14 : 7); i += 1) {
        spawn({
          pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, -1.2, (Math.random() - 0.5) * 3)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4),
          colour, size: 0.6, grow: 2.2, life: 1.6, opacity: 0.55,
        });
      }
    },
    /** A wisp of condensation from each wingtip while pulling hard. */
    vapour(state) {
      for (const side of [-1, 1]) {
        const tip = new THREE.Vector3(side * 5.6, 0.95, 0).applyQuaternion(state.quat).add(state.pos);
        spawn({ pos: tip, vel: state.vel.clone().multiplyScalar(0.85), colour: '#ffffff', size: 0.35, grow: 0.8, life: 0.5, opacity: 0.4 });
      }
    },
    /** Oily smoke streaming from the cowling once the engine has been hurt. */
    engineSmoke(state) {
      const nose = new THREE.Vector3(0, 0.3, -2.4).applyQuaternion(state.quat).add(state.pos);
      spawn({ pos: nose, vel: state.vel.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 1.5, 0)), colour: state.damage > 0.7 ? '#222222' : '#6a6a6a', size: 0.5, grow: 2.5, life: 2.2, opacity: 0.5 });
    },
    /** Fireball, debris smoke and a column that keeps rising from the wreck. */
    crash(pos, inWater) {
      for (let i = 0; i < 18; i += 1) {
        spawn({
          pos: pos.clone(),
          vel: new THREE.Vector3((Math.random() - 0.5) * 18, 4 + Math.random() * 10, (Math.random() - 0.5) * 18),
          colour: inWater ? '#e8f4ff' : i % 2 ? '#ffb347' : '#ff5a1f', size: 1.5, grow: 5, life: 1.2, opacity: 0.9, emissive: !inWater,
        });
      }
      for (let i = 0; i < 26; i += 1) {
        spawn({
          pos: pos.clone().add(new THREE.Vector3(0, i * 0.5, 0)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 4, (Math.random() - 0.5) * 2),
          colour: inWater ? '#dfe8ee' : '#2a2a2c', size: 2, grow: 3.5, life: 6 + Math.random() * 5, opacity: 0.6,
        });
      }
    },
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) {
          scene.remove(p.mesh);
          p.mesh.material.dispose();
          particles.splice(i, 1);
          continue;
        }
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.max(0, 1 - dt * 1.2));
        p.mesh.scale.multiplyScalar(1 + p.grow * dt / Math.max(1, p.age * 2 + 1));
        p.mesh.material.opacity = p.opacity * (1 - p.age / p.life);
      }
    },
    clear() {
      for (const p of particles) { scene.remove(p.mesh); p.mesh.material.dispose(); }
      particles.length = 0;
    },
  };
}
