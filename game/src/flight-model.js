// The Pipit's flight model: forces from angle of attack (lift that stalls past ~15 degrees, drag
// that grows with lift, flaps and sideslip), a propeller whose pull fades with speed, gravity, and
// wheels that roll, brake and grade every touchdown. Rotation is rate-commanded through control
// authority that grows with airspeed, with weathervane stability pulling the nose into the wind,
// so slow flight feels mushy and fast flight crisp. It also books fuel burn and airframe damage.
import * as THREE from 'three';
import { AIRCRAFT as A, RULES } from './config.js';
import { terrainHeight, terrainNormal } from './terrain.js';
import { surfaceKind, runwayAt } from './islands.js';

const G = 9.81;
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const REF_Q = 0.5 * 1.225 * A.authoritySpeed * A.authoritySpeed;

/** Points on the airframe that must never touch the ground: wing tips, nose, tail and belly. */
const HARD_POINTS = [
  new THREE.Vector3(-5.6, 0.95, -0.55), new THREE.Vector3(5.6, 0.95, -0.55),
  new THREE.Vector3(0, -0.2, -3.3), new THREE.Vector3(0, 0.1, 4.3), new THREE.Vector3(0, 1.8, 4.25),
];

const tmp = {
  fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3(),
  vdir: new THREE.Vector3(), lift: new THREE.Vector3(), force: new THREE.Vector3(),
  normal: new THREE.Vector3(), p: new THREE.Vector3(), dq: new THREE.Quaternion(),
  axis: new THREE.Vector3(),
};

/** A fresh aircraft state, parked or flying, at `position` facing `headingDeg`. */
export function createFlightState({ position, headingDeg = 0, speed = 0, fuel = A.fuelCapacity, throttle = 0, pitchDeg = 0 }) {
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * Math.PI / 180, -headingDeg * Math.PI / 180, 0, 'YXZ'));
  const vel = FWD.clone().applyQuaternion(quat).multiplyScalar(speed);
  return {
    pos: position.clone(), vel, quat, omega: new THREE.Vector3(),
    throttle, flaps: 0, fuel, damage: 0, engineRpm: throttle > 0 || speed > 0 ? 900 + 1700 * throttle : 0, engineOn: true,
    onGround: speed === 0, brakes: false, crashed: false, crashReason: '',
    alpha: 0, airspeed: speed, groundSpeed: speed, verticalSpeed: 0, gLoad: 1, stalled: false, stallWarning: false,
    heading: headingDeg, pitch: 0, bank: 0, altitude: position.y, agl: 0,
    lastTouchdown: null, events: [], time: 0, maxG: 1,
  };
}

function emit(state, type, detail = {}) {
  state.events.push({ type, time: state.time, ...detail });
}

function liftCoefficient(alpha, flaps) {
  const clMax = A.cl0 + A.clSlope * A.stallAlpha;
  const a = Math.abs(alpha);
  let cl;
  if (alpha > -0.2 && a < A.stallAlpha) cl = A.cl0 + A.clSlope * alpha;
  else if (alpha >= A.stallAlpha) cl = Math.max(0.55, clMax - (alpha - A.stallAlpha) * 3.2);
  else cl = Math.min(-0.4, A.cl0 + A.clSlope * alpha * 0.5);
  return cl + flaps * A.flapLift * (alpha < A.stallAlpha + 0.1 ? 1 : 0.4);
}

function crash(state, reason) {
  if (state.crashed) return;
  state.crashed = true;
  state.crashReason = reason;
  state.vel.multiplyScalar(0.1);
  state.omega.set(0, 0, 0);
  state.engineOn = false;
  emit(state, 'crash', { reason });
}

/** Grades a touchdown at sink rate `sink` (m/s) and decides whether the airframe survives it. */
function touchdown(state, sink, normal) {
  const kind = surfaceKind(state.pos.x, state.pos.z, terrainHeight(state.pos.x, state.pos.z), 0);
  const field = runwayAt(state.pos.x, state.pos.z);
  if (kind === 'water') return crash(state, 'Ditched in the sea');
  if (!field && normal.y < 0.94) return crash(state, 'Touched down on a hillside');
  if (Math.abs(state.bank) > RULES.crashBank) return crash(state, 'Wingtip hit the ground');
  if (state.pitch < -0.12) return crash(state, 'Nose-first into the ground');
  if (sink > RULES.crashSink) return crash(state, `Slammed in at ${Math.round(sink * 196.85)} ft/min`);
  let grade = 'Butter';
  if (sink > 1.2) grade = 'Smooth';
  if (sink > 2.2) grade = 'Firm';
  if (sink > RULES.safeSink) {
    grade = 'Hard';
    state.damage += 0.6 * (sink - RULES.safeSink) / (RULES.crashSink - RULES.safeSink);
  }
  if (!field) state.damage += 0.05;
  state.lastTouchdown = { sink, grade, field: field ? field.id : null, surface: kind, time: state.time };
  emit(state, 'touchdown', state.lastTouchdown);
}

/** Advances the aircraft by `dt` seconds under `controls` {pitch, roll, yaw, throttle, brakes, flaps}. */
export function stepFlight(state, controls, dt) {
  if (state.crashed) return;
  state.time += dt;
  const { fwd, up, right, vdir, lift, force, normal } = tmp;
  fwd.copy(FWD).applyQuaternion(state.quat);
  up.copy(UP).applyQuaternion(state.quat);
  right.copy(RIGHT).applyQuaternion(state.quat);

  // engine and fuel
  state.throttle += (controls.throttle - state.throttle) * Math.min(1, dt * 2.5);
  state.flaps += Math.sign(controls.flaps - state.flaps) * Math.min(Math.abs(controls.flaps - state.flaps), dt * 0.5);
  if (state.engineOn && state.fuel <= 0) {
    state.engineOn = false;
    state.fuel = 0;
    emit(state, 'fuel-out');
  }
  const speed = state.vel.length();
  const rpmTarget = state.engineOn ? 750 + 1950 * state.throttle : speed * 9;
  state.engineRpm += (rpmTarget - state.engineRpm) * Math.min(1, dt * 1.8);
  if (state.engineOn) state.fuel = Math.max(0, state.fuel - (A.burnIdle + (A.burnFull - A.burnIdle) * state.throttle) * dt);
  const rho = 1.225 * Math.exp(-Math.max(0, state.pos.y) / 8500);
  const power = state.engineOn ? state.throttle * (1 - 0.45 * state.damage) * (rho / 1.225) : 0;
  const thrust = A.maxThrust * power * Math.max(0, 1 - speed / A.propSpeedLimit);

  // aerodynamics in the body frame
  const vf = state.vel.dot(fwd);
  const vu = state.vel.dot(up);
  const vr = state.vel.dot(right);
  const alpha = speed > 1 ? Math.atan2(-vu, Math.max(vf, 0.1)) : 0;
  const beta = speed > 1 ? Math.atan2(vr, Math.max(Math.abs(vf), 0.1)) : 0;
  const q = 0.5 * rho * speed * speed;
  const cl = liftCoefficient(alpha, state.flaps);
  const stalled = alpha > A.stallAlpha;
  const cd = A.cd0 + A.inducedK * cl * cl + state.flaps * A.flapDrag + (stalled ? 0.35 * (alpha - A.stallAlpha) : 0) + Math.abs(beta) * 0.25 + state.damage * 0.02;
  force.set(0, -A.mass * G, 0).addScaledVector(fwd, thrust);
  let liftMag = 0;
  if (speed > 0.5) {
    vdir.copy(state.vel).divideScalar(speed);
    lift.crossVectors(right, vdir).normalize();
    liftMag = q * A.wingArea * cl;
    force.addScaledVector(lift, liftMag);
    force.addScaledVector(vdir, -q * A.wingArea * cd);
    force.addScaledVector(right, -q * A.wingArea * 0.9 * beta);
  }
  state.alpha = alpha;
  state.stalled = stalled && !state.onGround;
  state.stallWarning = !state.onGround && alpha > A.stallAlpha - 0.05 && speed > 5;
  state.gLoad = (liftMag * lift.dot(up) + thrust * 0.0) / (A.mass * G);
  if (state.onGround) state.gLoad = 1;
  state.maxG = Math.max(state.maxG, state.gLoad);

  // rotation: rate command scaled by authority, plus weathervane stability
  const authority = Math.min(1, q / REF_Q);
  const bite = authority * (1 - 0.35 * state.damage);
  const desired = tmp.axis.set(
    controls.pitch * A.rates.pitch * bite - 3.2 * (alpha - 0.035) * authority,
    -controls.yaw * A.rates.yaw * bite - 2.2 * beta * authority,
    -controls.roll * A.rates.roll * bite + state.damage * 0.12 * authority,
  );
  // a touch of dihedral: with the yoke centred the wings drift back toward level
  if (Math.abs(controls.roll) < 0.05 && Math.abs(state.bank) < 1.2) desired.z += state.bank * 0.35 * authority;
  if (state.stalled) {
    desired.x -= 0.35;
    desired.z += Math.sin(state.time * 2.3) * 0.6;
  }
  state.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
  state.bank = Math.asin(THREE.MathUtils.clamp(-right.y, -1, 1));
  if (up.y < 0) state.bank = Math.sign(state.bank || 1) * Math.PI - state.bank;

  const groundH = terrainHeight(state.pos.x, state.pos.z);
  if (state.onGround) {
    terrainNormal(state.pos.x, state.pos.z, normal);
    const slow = 1 - authority;
    desired.x = Math.max(desired.x, -state.pitch * 4) - Math.max(0, state.pitch) * 2.5 * slow;
    if (state.pitch < 0) desired.x = Math.max(desired.x, -state.pitch * 6);
    desired.z = state.bank * 6;
    const steer = Math.min(1, state.groundSpeed / 4) * Math.max(0.2, 1 - state.groundSpeed / 40);
    desired.y = -controls.yaw * 0.9 * steer - controls.roll * 0.25 * steer;
  }
  const response = state.onGround ? 8 : 1.8 + 5 * authority;
  state.omega.lerp(desired, Math.min(1, dt * response));
  const angle = state.omega.length() * dt;
  if (angle > 1e-7) {
    tmp.dq.setFromAxisAngle(tmp.p.copy(state.omega).normalize(), angle);
    state.quat.multiply(tmp.dq).normalize();
  }

  // wheels on the ground: rolling friction, brakes and tyre grip against sideways skids
  if (state.onGround) {
    const field = runwayAt(state.pos.x, state.pos.z);
    const roll = field ? (field.surface === 'asphalt' ? 0.025 : 0.06) : 0.13;
    const weightOnWheels = Math.max(0, A.mass * G - liftMag);
    const along = state.vel.dot(fwd);
    const brake = controls.brakes ? A.brakeDecel * A.mass * (weightOnWheels / (A.mass * G)) : 0;
    const resist = roll * weightOnWheels + brake;
    if (Math.abs(along) > 0.05) force.addScaledVector(fwd, -Math.sign(along) * resist);
    else if (thrust < resist) state.vel.addScaledVector(fwd, -along);
    state.vel.addScaledVector(right, -state.vel.dot(right) * Math.min(1, dt * 10));
  }

  state.vel.addScaledVector(force, dt / A.mass);
  if (state.onGround && Math.abs(state.vel.dot(fwd)) < 0.08 && thrust < 50) state.vel.set(0, Math.min(0, state.vel.y), 0);
  state.pos.addScaledVector(state.vel, dt);

  // ground contact under the wheels
  const wheelDrop = A.gearHeight * Math.max(0.3, up.y);
  const clearance = state.pos.y - wheelDrop - terrainHeight(state.pos.x, state.pos.z);
  if (clearance < 0) {
    terrainNormal(state.pos.x, state.pos.z, normal);
    if (!state.onGround) {
      touchdown(state, Math.max(0, -state.vel.y), normal);
      if (state.crashed) { state.pos.y -= clearance; return; }
      state.onGround = true;
    }
    state.pos.y -= clearance;
    const into = state.vel.dot(normal);
    if (into < 0) state.vel.addScaledVector(normal, -into);
    if (state.pitch > 0.24 && state.groundSpeed > 15) {
      state.damage += 0.15;
      emit(state, 'tail-strike');
      state.omega.x = -0.6;
    }
  } else if (state.onGround && clearance > 0.08) {
    state.onGround = false;
    emit(state, 'liftoff');
  }

  // airframe limits and hard points
  if (speed > A.vne) state.damage += (speed - A.vne) * 0.006 * dt;
  if (state.gLoad > RULES.maxG) state.damage += (state.gLoad - RULES.maxG) * 0.12 * dt;
  if (state.damage >= 1) { state.damage = 1; crash(state, 'Airframe failure'); return; }
  if (!state.onGround || Math.abs(state.bank) > 0.3) {
    for (const point of HARD_POINTS) {
      tmp.p.copy(point).applyQuaternion(state.quat).add(state.pos);
      const h = terrainHeight(tmp.p.x, tmp.p.z);
      if (tmp.p.y < Math.max(h, 0) - 0.05) {
        crash(state, h < 0 ? 'Ditched in the sea' : 'Flew into the terrain');
        return;
      }
    }
  }
  if (state.pos.y < 0.3 && groundH < 0) crash(state, 'Ditched in the sea');

  // readouts
  state.airspeed = speed;
  state.groundSpeed = Math.hypot(state.vel.x, state.vel.z);
  state.verticalSpeed = state.vel.y;
  state.altitude = state.pos.y;
  state.agl = state.pos.y - A.gearHeight - Math.max(0, groundH);
  state.heading = ((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360;
}
