// Screenshot scenes behind ?shot=cover|cockpit|drop|landing|menu. Each starts a real mission, puts
// the Pipit at a chosen point of it and lets the autopilot fly the real flight model for a few
// seconds before the frame is drawn, so every screenshot is the game's own code running.
// When the frame is ready the page sets window.__shotReady for the capture script.
import * as THREE from 'three';
import { MISSIONS } from './missions.js';
import { AIRFIELDS, runwayAxes, LANDMARKS } from './islands.js';
import { STEP } from './config.js';
import { bearing } from './autopilot.js';

const mission = (id) => MISSIONS.find((m) => m.id === id);
const airfield = (id) => AIRFIELDS.find((f) => f.id === id);

function fly(game, helpers, seconds, goalFn, controls) {
  for (let t = 0; t < seconds; t += STEP) {
    helpers.autopilot(game.state, goalFn(game.state), controls);
    helpers.stepFlight(game.state, controls, STEP);
    game.time += STEP;
  }
  game.state.events.length = 0;
}

function settle(game, frames = 30) {
  const t0 = performance.now();
  for (let i = 0; i < frames; i += 1) game.render(1 / 60);
  console.log(`settled ${frames} frames in ${Math.round(performance.now() - t0)} ms`);
}

/** Places the state `metres` before point (x, y, z) on a heading, flying toward it. */
function placeBefore(game, target, headingDeg, metres, speed, throttle) {
  const h = headingDeg * Math.PI / 180;
  const pos = new THREE.Vector3(target.x - Math.sin(h) * metres, target.y, target.z + Math.cos(h) * metres);
  const s = game.state;
  s.pos.copy(pos);
  s.quat.setFromEuler(new THREE.Euler(0, -h, 0, 'YXZ'));
  s.vel.set(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(speed);
  s.onGround = false;
  s.throttle = throttle;
  s.engineRpm = 750 + 1950 * throttle;
}

const SCENES = {
  /** Chase view threading a gate of the ring circuit toward Mount Orrin. */
  cover(game, helpers) {
    game.startMission(mission('rings'));
    const run = game.run;
    const k = 3;
    run.ringIndex = k;
    run.course.setProgress(k, 0);
    run.time = 151;
    const ring = run.course.rings[k];
    const prev = run.course.rings[k - 1];
    const hdg = bearing(prev.center.x, prev.center.z, ring.center.x, ring.center.z);
    placeBefore(game, ring.center, hdg, 420, 56, 0.72);
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.72, brakes: false, flaps: 0 };
    fly(game, helpers, 5, (s) => ({ heading: bearing(s.pos.x, s.pos.z, ring.center.x, ring.center.z), altitude: ring.center.y - 2, speed: 56 }), controls);
    Object.assign(game.input.controls, controls);
    game.input.look.yaw = -0.36;
    game.input.look.pitch = 0.1;
    game.rig.setView('chase');
    settle(game);
  },
  /** From the left seat on short final into Halden Field at the end of the ring circuit. */
  cockpit(game, helpers) {
    game.startMission(mission('rings'));
    const run = game.run;
    run.ringIndex = run.course.rings.length;
    run.course.setProgress(run.ringIndex, -10);
    run.time = 314;
    const f = airfield('halden');
    const { ax, az } = runwayAxes(f);
    const thr = { x: f.x - ax * f.length / 2, z: f.z - az * f.length / 2 };
    const glide = (s) => f.elevation + 4 + Math.hypot(s.pos.x - thr.x, s.pos.z - thr.z) * 0.055;
    const d = 380;
    placeBefore(game, { x: thr.x, y: f.elevation + 4 + d * 0.055, z: thr.z }, f.heading, d, 33, 0.3);
    game.state.fuel = 31;
    game.state.flaps = 1;
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, brakes: false, flaps: 1 };
    fly(game, helpers, 2.5, (s) => ({ heading: f.heading, altitude: glide(s), speed: 33, maxSink: 3 }), controls);
    Object.assign(game.input.controls, controls);
    game.input.controls.flaps = 1;
    game.rig.setView('cockpit');
    game.input.look.pitch = -0.05;
    settle(game, 10);
  },
  /** A crate swinging under its canopy toward Oldquay's smoking drop zone as the Pipit climbs away. */
  drop(game, helpers) {
    game.startMission(mission('drop'));
    const zone = game.run.zones.zones[0];
    const hdg = 300;
    const h = hdg * Math.PI / 180;
    const along = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    const side = new THREE.Vector3(-along.z, 0, along.x);
    const pass = zone.ground + 55;
    placeBefore(game, { x: zone.x, y: pass, z: zone.z }, hdg, 420, 38, 0.45);
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.45, brakes: false, flaps: 0.5 };
    game.state.flaps = 0.5;
    fly(game, helpers, 8.9, () => ({ heading: hdg, altitude: pass, speed: 38 }), controls);
    game.run.release(game.state, game.time);
    for (let t = 0; t < 3.5; t += STEP) {
      helpers.autopilot(game.state, { heading: hdg, altitude: pass, speed: 40 }, controls);
      helpers.stepFlight(game.state, controls, STEP);
      game.cargo.update(STEP);
      game.time += STEP;
    }
    game.state.events.length = 0;
    Object.assign(game.input.controls, controls);
    game.rig.setView('chase');
    game.input.look.yaw = Math.PI - 0.45;
    game.input.look.pitch = -0.3;
    game.run.time = 102;
    game.run.zones.update(game.time);
    settle(game, 30);
  },
  /** Chase view on a stabilised final into Halden Field with flaps out. */
  landing(game, helpers) {
    game.startMission(mission('rings'));
    const run = game.run;
    run.ringIndex = run.course.rings.length;
    run.course.setProgress(run.ringIndex, -10);
    run.time = 318;
    const f = airfield('halden');
    const { ax, az } = runwayAxes(f);
    const thr = { x: f.x - ax * f.length / 2, z: f.z - az * f.length / 2 };
    const d = 700;
    placeBefore(game, { x: thr.x, y: f.elevation + d * 0.055 + 3, z: thr.z }, f.heading, d, 34, 0.3);
    game.state.flaps = 1;
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, brakes: false, flaps: 1 };
    fly(game, helpers, 2.5, (s) => ({ heading: f.heading, altitude: f.elevation + 3 + Math.hypot(s.pos.x - thr.x, s.pos.z - thr.z) * 0.055, speed: 34, maxSink: 3 }), controls);
    Object.assign(game.input.controls, controls);
    game.input.controls.flaps = 1;
    game.rig.setView('chase');
    game.input.look.yaw = 0.3;
    game.input.look.pitch = 0.05;
    settle(game);
  },
  /** The title and mission board over the attract flight. */
  menu(game, helpers) {
    game.mode = 'menu';
    game.menus.showMenu();
    game.menus.select(mission('rings'));
    const s = game.state = helpers.startState({ start: { x: -2700, y: 230, z: 3700, heading: 70, speed: 50, throttle: 0.6, fuel: 120 } });
    s.onGround = false;
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, brakes: false, flaps: 0 };
    fly(game, helpers, 3, () => ({ heading: 80, altitude: 240, speed: 50, maxBank: 20 }), controls);
    Object.assign(game.attractControls, controls);
    game.rig.setView('flyby');
    game.rig.setFrameShift(11);
    settle(game, 40);
  },
};

/** Stages the named scene, draws it and flags the page ready for capture. */
export function runShot(game, name, helpers) {
  const scene = SCENES[name] || SCENES.cover;
  game.state = helpers.startState(mission('free'));
  scene(game, helpers);
  game.render(0);
  window.__shotReady = true;
}
