// The three ways to watch the flight. Chase: a spring-damped camera behind and above the Pipit that
// leans only part of the way into a bank so the horizon stays readable, pulls back with speed and
// never dips into the ground. Cockpit: the pilot's eye in the left seat with a little g-load head
// bob. Flyby: a slow orbit for admiring the aircraft. Right-drag free-look works in all three.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

export const VIEWS = ['chase', 'cockpit', 'flyby', 'tower'];

const EYE = new THREE.Vector3(-0.27, 0.72, -1.0);

/** Creates the rig around `camera`. Call `update(state, look, dt)` once per rendered frame. */
export function createCameraRig(camera) {
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const upSmooth = new THREE.Vector3(0, 1, 0);
  const upAircraft = new THREE.Vector3();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const lookQuat = new THREE.Quaternion();
  let view = 'chase';
  let orbit = 0;
  let snap = true;
  let shake = 0;
  let frameShift = 0;

  function chase(state, look, dt) {
    // follow the heading and pitch of the flight path, not every twitch of the nose
    const speed = state.vel.length();
    const yaw = speed > 6 ? Math.atan2(-state.vel.x, -state.vel.z) : -state.heading * Math.PI / 180;
    const pitchPath = speed > 6 ? Math.asin(THREE.MathUtils.clamp(state.vel.y / speed, -1, 1)) : 0;
    const blendPitch = state.onGround ? 0 : pitchPath * 0.6 + state.pitch * 0.4;
    const distance = 15 + Math.min(8, speed * 0.06);
    euler.set(blendPitch * 0.85 - 0.16 + look.pitch, yaw + look.yaw, 0, 'YXZ');
    quat.setFromEuler(euler);
    offset.set(0, 0, distance).applyQuaternion(quat);
    desired.copy(state.pos).add(offset).add(new THREE.Vector3(0, 2.6, 0));
    const floor = Math.max(terrainHeight(desired.x, desired.z), 0) + 2.5;
    if (desired.y < floor) desired.y = floor;
    if (snap) { position.copy(desired); velocity.set(0, 0, 0); snap = false; }
    // critically damped spring toward the desired spot
    const k = 26;
    const c = 2 * Math.sqrt(k);
    velocity.addScaledVector(desired.clone().sub(position), k * dt).addScaledVector(velocity, -c * dt);
    position.addScaledVector(velocity, dt);
    position.lerp(desired, Math.min(1, dt * 2));
    if (position.y < floor) position.y = floor;
    camera.position.copy(position);
    lookAt.copy(state.pos).addScaledVector(state.vel, 0.12).add(new THREE.Vector3(0, 1.2, 0));
    upAircraft.set(0, 1, 0).applyQuaternion(state.quat);
    const lean = new THREE.Vector3(0, 1, 0).lerp(upAircraft, 0.35).normalize();
    upSmooth.lerp(lean, Math.min(1, dt * 3)).normalize();
    camera.up.copy(upSmooth);
    camera.lookAt(lookAt);
    camera.fov = 62 + Math.min(10, Math.max(0, speed - 40) * 0.25);
  }

  function cockpit(state, look, dt) {
    const bob = THREE.MathUtils.clamp((state.gLoad - 1) * -0.025, -0.08, 0.05);
    camera.position.copy(EYE).add(new THREE.Vector3(0, bob, 0)).applyQuaternion(state.quat).add(state.pos);
    lookQuat.setFromEuler(new THREE.Euler(-0.13 + look.pitch, look.yaw, 0, 'YXZ'));
    camera.quaternion.copy(state.quat).multiply(lookQuat);
    camera.up.set(0, 1, 0);
    camera.fov = 66;
    snap = true;
  }

  function flyby(state, look, dt) {
    orbit += dt * 0.25;
    const a = orbit + look.yaw;
    desired.set(Math.sin(a) * 22, 5 + look.pitch * 15, Math.cos(a) * 22).add(state.pos);
    const floor = Math.max(terrainHeight(desired.x, desired.z), 0) + 2;
    if (desired.y < floor) desired.y = floor;
    camera.position.copy(desired);
    camera.up.set(0, 1, 0);
    lookAt.copy(state.pos);
    if (frameShift) {
      const right = new THREE.Vector3().subVectors(state.pos, camera.position).cross(camera.up).normalize();
      lookAt.addScaledVector(right, -frameShift);
    }
    camera.lookAt(lookAt);
    camera.fov = 55;
    snap = true;
  }

  /**
   * Tower: a camera standing still beside the flight path (or at the nearest strip's tower) that
   * turns and zooms to follow the aircraft past it, then moves ahead once it has flown out of range.
   */
  const spot = new THREE.Vector3();
  let spotSet = false;
  let spotFov = 0;
  const spotBias = new THREE.Vector3();
  function placeSpot(state) {
    const dir = state.vel.lengthSq() > 4 ? state.vel.clone().setY(0).normalize() : new THREE.Vector3(0, 0, -1).applyQuaternion(state.quat).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    spot.copy(state.pos).addScaledVector(dir, 380).addScaledVector(side, 60);
    spot.y = Math.max(terrainHeight(spot.x, spot.z), 0) + 4;
    spot.y = Math.max(spot.y, state.pos.y - 40);
    spotSet = true;
    spotFov = 0;
    spotBias.set(0, 0, 0);
  }
  function tower(state, look, dt) {
    if (!spotSet || spot.distanceTo(state.pos) > 1600) placeSpot(state);
    camera.position.copy(spot);
    camera.up.set(0, 1, 0);
    lookAt.copy(state.pos).add(spotBias);
    camera.lookAt(lookAt);
    if (look.yaw || look.pitch) camera.rotateY(look.yaw * 0.3), camera.rotateX(look.pitch * 0.3);
    const dist = spot.distanceTo(state.pos);
    camera.fov = spotFov || THREE.MathUtils.clamp(2 * Math.atan(28 / dist) * 180 / Math.PI, 10, 60);
    snap = true;
  }

  return {
    /** Stands the tower camera at `position`, aiming `bias` metres off the aircraft, at a fixed `fov`. */
    setSpot(position, fov = 0, bias = new THREE.Vector3()) { spot.copy(position); spotSet = true; spotFov = fov; spotBias.copy(bias); },
    get view() { return view; },
    setView(next) { view = next; snap = true; if (next === 'tower') spotSet = false; },
    cycle() { view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]; snap = true; spotSet = false; return view; },
    snapNext() { snap = true; },
    /** Shifts the flyby framing so the aircraft sits `metres` to the right of centre (title screen). */
    setFrameShift(metres) { frameShift = metres; },
    /** A short shake, e.g. on a hard landing; strength in metres. */
    bump(strength) { shake = Math.max(shake, strength); },
    update(state, look, dt) {
      if (view === 'cockpit') cockpit(state, look, dt);
      else if (view === 'flyby') flyby(state, look, dt);
      else if (view === 'tower') tower(state, look, dt);
      else chase(state, look, dt);
      if (shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        shake *= Math.max(0, 1 - dt * 6);
      }
      camera.updateProjectionMatrix();
      target.copy(state.pos);
      return target;
    },
  };
}
