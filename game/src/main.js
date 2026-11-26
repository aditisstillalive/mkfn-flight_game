// Kestrel Isles: boots the renderer and world, then runs the game loop. The loop steps the flight
// model at a fixed 120 Hz, turns its events (touchdowns, crashes, gates) into sound, effects and
// HUD messages, moves the camera and paints the instruments and HUD. Between sorties the Pipit
// flies itself round Halden behind the title screen. `?shot=<name>` stages a screenshot scene.
import * as THREE from 'three';
import { STEP, AIRCRAFT } from './config.js';
import { buildWorld } from './world.js';
import { buildAircraft } from './aircraft-model.js';
import { createFlightState, stepFlight, setWind } from './flight-model.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera-rig.js';
import { createInstrumentPanel } from './instruments.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createMenus } from './menu.js';
import { createMissionRun } from './missions.js';
import { createCargoSystem } from './cargo.js';
import { createEffects } from './effects.js';
import { autopilot } from './autopilot.js';
import { surfaceKind } from './islands.js';
import { terrainHeight } from './terrain.js';
import { runShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: Boolean(shotName), powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

/** Starts a state for mission `def` from its start block. */
function startState(def) {
  const s = def.start;
  const y = s.speed > 0 ? s.y : Math.max(terrainHeight(s.x, s.z), 0) + AIRCRAFT.gearHeight;
  const state = createFlightState({ position: new THREE.Vector3(s.x, y, s.z), headingDeg: s.heading, speed: s.speed, fuel: s.fuel, throttle: s.throttle });
  state.onGround = s.speed === 0;
  state.flaps = s.flaps || 0;
  if (def.wind) setWind(state, def.wind.from, def.wind.speed);
  return state;
}

function boot() {
  const canvas = document.getElementById('view');
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 40000);
  const world = buildWorld(scene);
  const panel = createInstrumentPanel();
  const panelTexture = new THREE.CanvasTexture(panel.canvas);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.anisotropy = 4;
  const aircraft = buildAircraft(panelTexture);
  scene.add(aircraft.root);
  const input = createInput(canvas);
  const rig = createCameraRig(camera);
  const hud = createHud(document.getElementById('hud'), world.map);
  const audio = createAudio();
  const cargo = createCargoSystem(scene);
  const effects = createEffects(scene);
  const status = document.getElementById('status');

  const game = {
    THREE, scene, camera, renderer, rig, hud, input, panel, aircraft, cargo, effects,
    mode: 'menu',          // menu | flying | paused | debrief | shot
    state: null,
    run: null,
    endAt: 0,
    time: 0,
    accumulator: 0,
    attractControls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, brakes: false, flaps: 0 },
  };

  function startAttract() {
    game.state = createFlightState({ position: new THREE.Vector3(-2400, 260, 4300), headingDeg: 60, speed: 50, throttle: 0.6 });
    game.state.onGround = false;
    rig.setView('flyby');
    rig.setFrameShift(11);
  }

  function startMission(def) {
    if (game.run) game.run.dispose();
    effects.clear();
    game.state = startState(def);
    input.reset({ throttle: def.start.throttle, flaps: def.start.flaps || 0 });
    game.run = createMissionRun(def, scene, cargo);
    game.endAt = 0;
    game.accumulator = 0;
    rig.setFrameShift(0);
    rig.setView(rig.view === 'flyby' ? 'chase' : rig.view);
    rig.snapNext();
    menus.hideAll();
    game.mode = 'flying';
    hud.toast(def.title, '#ffcf7a', 3);
    hud.toast(def.start.speed > 0 ? 'C camera · F flaps · P pause' : 'Shift or 0 for power · S to rotate at 50 kt', '#ffffff', 5);
    status.textContent = `${def.title}. ${def.brief}`;
  }

  const menus = createMenus({
    onFly(def) { audio.start(); startMission(def); },
    onResume() { menus.hideAll(); game.mode = 'flying'; },
    onRestart() { startMission(game.run ? game.run.def : menus.selected); },
    onMenu() {
      if (game.run) game.run.dispose();
      game.run = null;
      effects.clear();
      startAttract();
      menus.showMenu();
      game.mode = 'menu';
    },
  });
  game.menus = menus;
  game.startMission = startMission;

  /** Reacts to what the flight model reported this step. */
  function handleEvents(state) {
    for (const e of state.events) {
      if (e.type === 'touchdown') {
        const hard = e.grade === 'Hard';
        audio.touchdown(e.grade);
        effects.touchdown(state.pos, hard, e.surface);
        rig.bump(hard ? 0.6 : 0.15);
        hud.toast(`${e.grade} touchdown · ${Math.round(e.sink * 196.85)} ft/min`, hard ? '#ff8a6a' : '#9dffb0', 3);
      } else if (e.type === 'crash') {
        audio.crash();
        effects.crash(state.pos, surfaceKind(state.pos.x, state.pos.z, terrainHeight(state.pos.x, state.pos.z)) === 'water');
        rig.bump(1.5);
        hud.toast(e.reason, '#ff6a5a', 4);
      } else if (e.type === 'fuel-out') {
        audio.warn();
        hud.toast('Fuel exhausted — best glide 60 kt', '#ffb020', 4);
      } else if (e.type === 'tail-strike') {
        hud.toast('Tail strike!', '#ff8a6a', 2);
      }
    }
  }

  function flyingFrame(dt) {
    const state = game.state;
    input.update(dt, state.onGround);
    if (input.wasPressed('KeyC')) hud.toast(`${rig.cycle()} view`.toUpperCase(), '#ffffff', 1.2);
    if (input.wasPressed('KeyN')) hud.toast(audio.toggleMute() ? 'Sound off' : 'Sound on', '#ffffff', 1.2);
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) { game.mode = 'paused'; menus.showPause(); return; }
    if (input.wasPressed('Space') && !state.onGround && game.run && game.run.release(state, game.time)) {
      audio.release();
      hud.toast(`Crate away · ${game.run.crates} left`, '#ffcf7a', 1.5);
    }
    game.accumulator += dt;
    while (game.accumulator >= STEP) {
      stepFlight(state, input.controls, STEP);
      game.accumulator -= STEP;
    }
    const ringsBefore = game.run.ringIndex;
    handleEvents(state);
    game.run.update(state, dt, game.time);
    state.events.length = 0;
    if (game.run.ringIndex > ringsBefore) { audio.gate(); hud.toast(`Gate ${game.run.ringIndex} ✓`, '#9dffb0', 1.4); }
    if (state.gLoad > 3.6 && Math.random() < 0.6) effects.vapour(state);
    if (state.damage > 0.4 && !state.crashed && Math.random() < state.damage * 0.5) effects.engineSmoke(state);
    if (game.run.status !== 'flying' && !game.endAt) {
      game.endAt = game.time + (game.run.status === 'won' ? 2.5 : 3.5);
      if (game.run.status === 'won') audio.success();
    }
    if (game.endAt && game.time > game.endAt) { game.mode = 'debrief'; menus.showDebrief(game.run, state); }
  }

  function attractFrame(dt) {
    const state = game.state;
    const goal = { heading: (game.time * 6) % 360, altitude: 240, speed: 50, maxBank: 20 };
    autopilot(state, goal, game.attractControls);
    game.accumulator += dt;
    while (game.accumulator >= STEP) { stepFlight(state, game.attractControls, STEP); game.accumulator -= STEP; }
    state.events.length = 0;
    if (state.crashed) startAttract();
  }

  /** Puts the aircraft where the state says and paints camera, panel and HUD. */
  function render(dt) {
    const state = game.state;
    aircraft.root.position.copy(state.pos);
    aircraft.root.quaternion.copy(state.quat);
    const controls = game.mode === 'menu' ? game.attractControls : input.controls;
    aircraft.animate(controls, state, dt, rig.view === 'cockpit');
    if (state.crashed) aircraft.root.visible = false;
    else aircraft.root.visible = true;
    rig.update(state, input.look, dt);
    world.update(camera, state.pos, dt, state.wind);
    effects.update(dt);
    const flying = game.mode !== 'menu';
    if (flying) {
      panel.draw(state, { bug: game.run ? game.run.bug(state) : null, brakes: input.controls.brakes && state.onGround });
      panelTexture.needsUpdate = true;
    }
    renderer.render(scene, camera);
    hud.draw({ state: flying ? state : null, camera, view: rig.view, run: game.run, panel: panel.canvas, time: game.time, mouseYoke: input.mouse.yoke });
  }
  game.render = render;
  window.kestrel = game;   // handy from the console: kestrel.state, kestrel.run

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  if (shotName) {
    game.mode = 'shot';
    runShot(game, shotName, { startState, autopilot, stepFlight, createMissionRun });
    return;
  }

  startAttract();
  menus.showMenu();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.time += dt;
    if (game.mode === 'flying') flyingFrame(dt);
    else if (game.mode === 'menu') attractFrame(dt);
    else if (game.mode === 'debrief') { game.accumulator = 0; }
    else if (game.mode === 'paused') {
      input.update(0, true);
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) { menus.hideAll(); game.mode = 'flying'; }
    }
    audio.update(game.state, game.mode !== 'flying');
    input.consume();
    render(game.mode === 'paused' ? 0 : dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
