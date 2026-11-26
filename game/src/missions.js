// The sorties: what each mission asks, where it starts, and how it is won, lost and scored.
//   Orrin Ring Circuit - eleven gates around Halden and Mount Orrin against the clock, then land.
//   Mail to Corrie Ridge - a fuel-limited ferry from Halden to a short gravel strip up on a ridge.
//   Supply Drop - parachute crates onto three villages' drop zones, then land at home.
//   Free Flight - full tanks, no clock; refuel at any strip, repair at Halden Field.
// A mission run turns flight events (rings crossed, touchdowns, crashes, crates landed) into
// progress, a live objective line for the HUD, a target to point at, and a debrief with a rating.
import * as THREE from 'three';
import { AIRFIELDS, LANDMARKS, runwayAt, runwayAxes } from './islands.js';
import { terrainHeight } from './terrain.js';
import { AIRCRAFT, RULES, UNITS } from './config.js';
import { buildRingCourse, crossedRing, buildDropZones, buildBeacon } from './markers.js';

const field = (id) => AIRFIELDS.find((f) => f.id === id);

/** A start on the runway threshold of `id`, rolled out along its heading. */
function runwayStart(id, fuel) {
  const f = field(id);
  const { ax, az } = runwayAxes(f);
  const back = f.length / 2 - 40;
  return { x: f.x - ax * back, y: f.elevation + AIRCRAFT.gearHeight, z: f.z - az * back, heading: f.heading, speed: 0, throttle: 0, fuel, flaps: 0 };
}

const RING_POINTS = [
  [-1300, 3900, 150], [-2600, 2600, 170], [-3500, 800, 220], [-3200, -1200, 300], [-2200, -3600, 360],
  [-200, -4300, 330], [1600, -3000, 280], [2600, -1000, 220], [2300, 1200, 180], [900, 2900, 140], [-400, 3400, 90],
];

/** The gates of the circuit, each lifted to keep at least 70 m over the ground beneath it. */
export function ringPoints() {
  return RING_POINTS.map(([x, z, y]) => ({ x, y: Math.max(y, terrainHeight(x, z) + 70), z }));
}

export const MISSIONS = [
  {
    id: 'rings',
    title: 'Orrin Ring Circuit',
    tagline: 'Eleven gates round the isle, then land at home',
    brief: 'Thread every gate in order on a lap of Halden and Mount Orrin, then put her down on Halden Field. Gold under 5:30, silver under 7:00. Keep your speed up through the turns, but watch the g-meter.',
    start: { x: -1450, y: 160, z: 5000, heading: 352, speed: 52, throttle: 0.7, fuel: 120, flaps: 0 },
    wind: { from: 300, speed: 4 },
    medals: [330, 420, 600],
  },
  {
    id: 'ferry',
    title: 'Mail to Corrie Ridge',
    tagline: 'Short fuel, high strip, no second chances',
    brief: 'The ridge post office on Corrie needs its mailbags. You have 52 litres: enough if you fly lean, not if you race. Climb to clear the ridge, then land on the 620 m gravel strip at 780 ft and stop.',
    start: runwayStart('halden', 52),
    wind: { from: 290, speed: 5.5 },
  },
  {
    id: 'drop',
    title: 'Supply Drop',
    tagline: 'Three villages, four crates, one steady hand',
    brief: 'Fly low and slow over each smoking drop zone and press Space to release a crate. The closer it lands to the centre, the better. You carry one spare. Then land at Halden Field.',
    start: { x: -1000, y: 140, z: 4300, heading: 330, speed: 48, throttle: 0.55, fuel: 110, flaps: 0 },
    crates: 4,
    wind: { from: 200, speed: 3.5 },
    targets: LANDMARKS.dropZones,
  },
  {
    id: 'free',
    title: 'Free Flight',
    tagline: 'The whole archipelago, no clock',
    brief: 'Full tanks and the isles to yourself. Land at any strip to refuel; Halden Field’s crew fix any damage. Find the lighthouse on Tarn Rock.',
    start: runwayStart('halden', AIRCRAFT.fuelCapacity),
    wind: { from: 270, speed: 4.5 },
  },
];

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function bearingTo(state, x, z) {
  return ((Math.atan2(x - state.pos.x, -(z - state.pos.z)) * 180 / Math.PI) + 360) % 360;
}

/** Starts a run of mission `def`, adding its markers to `scene`. */
export function createMissionRun(def, scene, cargo) {
  const added = [];
  const add = (obj) => { scene.add(obj); added.push(obj); return obj; };
  const run = {
    def,
    time: 0,
    status: 'flying',   // flying | won | lost
    message: '',
    score: 0,
    log: [],
    landing: null,
    ringIndex: 0,
    crates: def.crates || 0,
    drops: [],
  };
  let course = null;
  let zones = null;
  if (def.id === 'rings') course = createCourse();
  if (def.id === 'drop') zones = buildDropZones(def.targets);
  if (course) add(course.root);
  if (zones) add(zones.root);
  const destination = def.id === 'ferry' ? field('corrie') : field('halden');
  if (def.id !== 'free') add(buildBeacon(destination.x, destination.z, def.id === 'ferry' ? '#9fe8ff' : '#ffd36a'));
  else for (const f of AIRFIELDS) add(buildBeacon(f.x, f.z, '#ffd36a'));
  const lastPos = new THREE.Vector3();
  let havePos = false;
  let parkedAt = 0;

  function createCourse() { return buildRingCourse(ringPoints()); }

  function finish(status, message) {
    if (run.status !== 'flying') return;
    run.status = status;
    run.message = message;
  }

  function landedAt(state, id) {
    return state.onGround && state.groundSpeed < 1 && runwayAt(state.pos.x, state.pos.z)?.id === id;
  }

  function scoreLanding() {
    const t = run.landing;
    if (!t) return 0;
    return { Butter: 400, Smooth: 300, Firm: 150, Hard: 0 }[t.grade] ?? 0;
  }

  run.update = (state, dt, time) => {
    if (run.status !== 'flying') return;
    run.time += dt;
    for (const event of state.events) {
      if (event.type === 'touchdown') {
        run.landing = event;
        run.log.push(`Touchdown ${event.grade.toLowerCase()} at ${Math.round(event.sink * UNITS.fpm)} ft/min${event.field ? '' : ' (off field)'}`);
      }
      if (event.type === 'crash') finish('lost', event.reason);
      if (event.type === 'fuel-out') run.log.push('Engine starved: fuel exhausted');
    }
    // refuel and repair while parked at a strip
    const parked = state.onGround && state.groundSpeed < 0.5 && state.throttle < 0.12;
    const strip = parked ? runwayAt(state.pos.x, state.pos.z) : null;
    run.servicing = '';
    if (strip && def.id === 'free') {
      if (state.fuel < AIRCRAFT.fuelCapacity - 1) run.servicing = `Refuelling at ${strip.name}`;
      state.fuel = Math.min(AIRCRAFT.fuelCapacity, state.fuel + RULES.refuelRate * dt);
      if (strip.home && state.damage > 0.005) { state.damage = Math.max(0, state.damage - RULES.repairRate * dt); run.servicing = 'Hangar crew repairing the airframe'; }
      if (!state.engineOn && state.fuel > 5) state.engineOn = true;
    }
    if (course) {
      course.update(time);
      const ring = course.rings[run.ringIndex];
      if (ring && havePos && crossedRing(ring, lastPos, state.pos)) {
        run.ringIndex += 1;
        course.setProgress(run.ringIndex, time);
        run.log.push(`Gate ${run.ringIndex} at ${fmtTime(run.time)}`);
        run.lastRingAt = time;
      }
      if (ring && ring.center.distanceTo(state.pos) > 3200 && run.ringIndex > 0) {
        // a missed gate costs time but keeps you in the race: skip it with a penalty
        const nextRing = course.rings[run.ringIndex + 1];
        if (nextRing && nextRing.center.distanceTo(state.pos) < ring.center.distanceTo(state.pos) - 400) {
          run.ringIndex += 1;
          course.setProgress(run.ringIndex, time);
          run.time += 20;
          run.log.push('Missed a gate: +20 s');
        }
      }
      if (run.ringIndex >= course.rings.length && landedAt(state, 'halden')) {
        const [gold, silver] = def.medals;
        const medal = run.time < gold ? 'Gold' : run.time < silver ? 'Silver' : 'Bronze';
        run.score = Math.round(5000 - run.time * 6 + scoreLanding() - state.damage * 1000);
        finish('won', `${medal}: circuit flown in ${fmtTime(run.time)}`);
      }
    }
    if (zones) {
      zones.update(time);
      for (const crate of cargo.update(dt, state.wind)) {
        let best = null;
        let bestD = Infinity;
        for (const zone of zones.zones) {
          if (zone.done) continue;
          const d = Math.hypot(crate.pos.x - zone.x, crate.pos.z - zone.z);
          if (d < bestD) { bestD = d; best = zone; }
        }
        if (best && bestD < 120) {
          best.done = true;
          const points = Math.max(0, Math.round(1000 - bestD * 9));
          run.drops.push({ zone: best.name, distance: bestD, points });
          run.log.push(`${best.name}: crate ${Math.round(bestD)} m from centre (+${points})`);
        } else {
          run.log.push(`Crate lost ${Math.round(bestD)} m wide`);
        }
      }
      const delivered = zones.zones.filter((z) => z.done).length;
      if (delivered < zones.zones.length && run.crates === 0 && cargo.crates.every((c) => c.landed)) finish('lost', 'Out of crates before every village was supplied');
      if (delivered === zones.zones.length && landedAt(state, 'halden')) {
        run.score = run.drops.reduce((s, d) => s + d.points, 0) + scoreLanding() - Math.round(state.damage * 800);
        const avg = run.drops.reduce((s, d) => s + d.distance, 0) / run.drops.length;
        finish('won', `All villages supplied, average ${Math.round(avg)} m from centre`);
      }
    }
    if (def.id === 'ferry' && landedAt(state, 'corrie')) {
      run.score = Math.round(2000 + state.fuel * 20 + scoreLanding() - state.damage * 1500 - run.time * 2);
      finish('won', `Mail delivered with ${Math.round(state.fuel)} L to spare`);
    }
    if (def.id !== 'free' && state.onGround && !state.engineOn && state.groundSpeed < 0.5 && !landedAt(state, destination.id)) {
      parkedAt += dt;
      if (parkedAt > 3) finish('lost', 'Out of fuel and stranded short of the strip');
    }
    lastPos.copy(state.pos);
    havePos = true;
  };

  /** Space while airborne on the drop mission: release one crate from the belly. */
  run.release = (state, time) => {
    if (!zones || run.crates <= 0 || state.onGround) return false;
    run.crates -= 1;
    cargo.release(state.pos, state.vel, time);
    return true;
  };

  /** The point the HUD should steer the pilot toward, with a label. */
  run.target = (state) => {
    if (course && run.ringIndex < course.rings.length) {
      const c = course.rings[run.ringIndex].center;
      return { x: c.x, y: c.y, z: c.z, label: `GATE ${run.ringIndex + 1}` };
    }
    if (zones) {
      const open = zones.zones.filter((z) => !z.done);
      if (open.length) {
        open.sort((a, b) => Math.hypot(a.x - state.pos.x, a.z - state.pos.z) - Math.hypot(b.x - state.pos.x, b.z - state.pos.z));
        return { x: open[0].x, y: open[0].ground, z: open[0].z, label: open[0].name.toUpperCase() };
      }
    }
    if (def.id === 'free') return null;
    return { x: destination.x, y: destination.elevation + 30, z: destination.z, label: destination.name.toUpperCase() };
  };

  /** One line for the HUD: what to do right now. */
  run.objective = (state) => {
    const t = run.target(state);
    const dist = t ? Math.hypot(t.x - state.pos.x, t.z - state.pos.z) : 0;
    const km = (dist / 1000).toFixed(1);
    if (course) {
      if (run.ringIndex < course.rings.length) return `Gate ${run.ringIndex + 1} of ${course.rings.length}  ·  ${km} km`;
      return `Course flown — land at Halden Field  ·  ${km} km`;
    }
    if (zones) {
      const left = zones.zones.filter((z) => !z.done).length;
      if (left) return `Drop on ${t.label.toLowerCase().replace(/^./, (c) => c.toUpperCase())}  ·  ${km} km  ·  ${run.crates} crates`;
      return `All supplied — land at Halden Field  ·  ${km} km`;
    }
    if (def.id === 'ferry') return `Land at Corrie Ridge and stop  ·  ${km} km`;
    return run.servicing || 'Free flight — explore the isles';
  };

  run.bug = (state) => {
    const t = run.target(state);
    return t ? bearingTo(state, t.x, t.z) : null;
  };

  run.clock = () => fmtTime(run.time);

  run.dispose = () => {
    for (const obj of added) scene.remove(obj);
    cargo.clear();
  };

  /** Which gate is next; used by the screenshot scenes. */
  run.course = course;
  run.zones = zones;
  return run;
}

export { fmtTime };
