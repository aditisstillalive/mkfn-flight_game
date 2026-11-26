// The Pipit KX-2's 3D model, built from primitives: a lathed fuselage in cream and teal, a strut-
// braced high wing, a tricycle undercarriage with wheel spats, and control surfaces that move with
// the pilot's inputs. It also carries the cockpit interior (glare shield, window frame and a lit
// instrument panel) seen from the pilot's seat. Forward is -Z, up is +Y, the right wing is +X.
import * as THREE from 'three';

const CREAM = '#f2ead8';
const TEAL = '#1f7f86';
const ORANGE = '#e8752a';
const DARK = '#2a2e33';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, flatShading: true, ...extra });

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Fuselage from a lathe profile laid along Z, slightly flattened at the sides. */
function buildFuselage() {
  const profile = [
    [0.0, -3.05], [0.46, -3.0], [0.62, -2.6], [0.68, -1.9], [0.72, -0.9], [0.7, 0.2],
    [0.58, 1.4], [0.42, 2.6], [0.26, 3.7], [0.14, 4.3], [0.0, 4.35],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const geo = new THREE.LatheGeometry(profile, 12);
  geo.rotateX(Math.PI / 2);   // lathe axis Y -> Z
  geo.scale(0.92, 1, 1);
  const body = shadowed(new THREE.Mesh(geo, mat(CREAM)));
  body.rotation.z = Math.PI / 12;   // put a flat face on top
  return body;
}

function part(geometry, material, x, y, z) {
  const mesh = shadowed(new THREE.Mesh(geometry, material));
  mesh.position.set(x, y, z);
  return mesh;
}

/** A control surface hinged at its leading edge, so rotating its pivot swings it like a flap. */
function hinged(width, depth, thick, material, axis) {
  const pivot = new THREE.Group();
  const geo = new THREE.BoxGeometry(axis === 'y' ? thick : width, axis === 'y' ? width : thick, depth);
  geo.translate(0, axis === 'y' ? width / 2 : 0, depth / 2);
  pivot.add(shadowed(new THREE.Mesh(geo, material)));
  return pivot;
}

function buildStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = TEAL;
  ctx.fillRect(0, 18, 512, 18);
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 40, 512, 6);
  ctx.fillStyle = '#20303a';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('KI-PX2', 300, 15 + 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The cockpit seen from the left seat: glare shield, frame, yoke and the panel texture slot. */
function buildCockpit(panelTexture) {
  const group = new THREE.Group();
  const frame = mat('#30353b', { flatShading: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.46), new THREE.MeshBasicMaterial({ map: panelTexture, toneMapped: false }));
  panel.position.set(0, 0.17, -1.85);
  panel.rotation.x = -0.18;
  group.add(panel);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.04, 0.16), frame);
  shield.position.set(0, 0.42, -1.86);
  shield.rotation.x = 0.12;
  group.add(shield);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.2), mat('#22262b'));
  dash.position.set(0, 0.15, -1.98);
  group.add(dash);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.95, 0.045), frame);
    pillar.position.set(side * 0.68, 0.82, -1.7);
    pillar.rotation.x = 0.55;
    pillar.rotation.z = side * -0.12;
    group.add(pillar);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.09), frame);
  header.position.set(0, 1.2, -1.3);
  group.add(header);
  const yoke = new THREE.Group();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), frame);
  column.rotation.x = Math.PI / 2;
  column.position.z = 0.14;
  yoke.add(column);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), mat('#1b1d20'));
  yoke.add(bar);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.05), mat('#1b1d20'));
    grip.position.set(side * 0.17, 0.05, 0);
    yoke.add(grip);
  }
  yoke.position.set(-0.27, 0.05, -1.55);
  group.add(yoke);
  group.visible = false;
  return { group, yoke };
}

/**
 * Builds the aircraft. Returns its scene group and `animate(controls, state, dt)` that spins the
 * propeller, deflects the surfaces, blinks the strobes and swaps exterior for cockpit.
 */
export function buildAircraft(panelTexture) {
  const root = new THREE.Group();
  root.name = 'pipit';
  const exterior = new THREE.Group();
  root.add(exterior);

  const cream = mat(CREAM);
  const teal = mat(TEAL);
  const orange = mat(ORANGE);
  const dark = mat(DARK);
  const glass = new THREE.MeshStandardMaterial({ color: '#203540', roughness: 0.08, metalness: 0.6, flatShading: true });

  const hideInCockpit = [];
  const cabinPart = (mesh) => { hideInCockpit.push(mesh); exterior.add(mesh); return mesh; };
  cabinPart(buildFuselage());
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.78), new THREE.MeshStandardMaterial({ map: buildStripeTexture(), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  for (const side of [-1, 1]) {
    const s = stripe.clone();
    s.position.set(side * 0.665, -0.05, 0.4);
    s.rotation.y = side * Math.PI / 2;
    cabinPart(s);
  }
  // cowling, spinner and exhaust
  const cowl = part(new THREE.CylinderGeometry(0.6, 0.66, 0.9, 12), teal, 0, 0, -2.6);
  cowl.rotation.x = Math.PI / 2;
  cabinPart(cowl);
  const spinner = part(new THREE.ConeGeometry(0.22, 0.5, 10), orange, 0, 0, -3.3);
  spinner.rotation.x = -Math.PI / 2;
  cabinPart(spinner);
  // cabin glazing
  const windshield = part(new THREE.BoxGeometry(1.06, 0.55, 0.9), glass, 0, 0.62, -1.05);
  windshield.rotation.x = -0.5;
  cabinPart(windshield);
  for (const side of [-1, 1]) {
    const pane = part(new THREE.BoxGeometry(0.04, 0.5, 1.5), glass, side * 0.62, 0.38, -0.25);
    cabinPart(pane);
  }
  // high wing with orange tips and its struts
  const wing = part(new THREE.BoxGeometry(10.8, 0.2, 1.62), cream, 0, 0.95, -0.55);
  exterior.add(wing);
  for (const side of [-1, 1]) {
    exterior.add(part(new THREE.BoxGeometry(0.5, 0.22, 1.64), orange, side * 5.55, 0.95, -0.55));
    const strut = part(new THREE.BoxGeometry(0.08, 0.08, 2.9), dark, side * 1.55, 0.2, -0.45);
    strut.rotation.y = side * -Math.PI / 2;
    strut.rotation.z = side * 0.46;
    exterior.add(strut);
  }
  const ailerons = [];
  for (const side of [-1, 1]) {
    const aileron = hinged(2.3, 0.42, 0.12, teal, 'x');
    aileron.position.set(side * 3.9, 0.95, 0.26);
    exterior.add(aileron);
    ailerons.push({ pivot: aileron, side });
  }
  const flaps = [];
  for (const side of [-1, 1]) {
    const flap = hinged(2.2, 0.38, 0.1, cream, 'x');
    flap.position.set(side * 1.7, 0.9, 0.28);
    exterior.add(flap);
    flaps.push(flap);
  }
  // tail: stabiliser, elevator, fin and rudder
  exterior.add(part(new THREE.BoxGeometry(3.6, 0.1, 0.8), cream, 0, 0.18, 3.75));
  const elevator = hinged(3.6, 0.42, 0.08, teal, 'x');
  elevator.position.set(0, 0.18, 4.15);
  exterior.add(elevator);
  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 2.9, 0, 0, 4.2, 0, 1.65, 4.25, 0, 1.65, 4.25, 0, 1.45, 3.75, 0, 0, 2.9,
  ], 3));
  finGeo.computeVertexNormals();
  const fin = shadowed(new THREE.Mesh(finGeo, mat(TEAL, { side: THREE.DoubleSide })));
  fin.position.y = 0.2;
  exterior.add(fin);
  const rudder = hinged(1.6, 0.4, 0.07, orange, 'y');
  rudder.position.set(0, 0.22, 4.22);
  exterior.add(rudder);
  // undercarriage
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-1.25, 0.25], [1.25, 0.25], [0, -2.35]]) {
    const leg = part(new THREE.BoxGeometry(0.08, 0.95, 0.1), dark, x * 0.85, -0.85, z);
    leg.rotation.z = x === 0 ? 0 : Math.sign(x) * -0.35;
    exterior.add(leg);
    const wheel = part(wheelGeo, dark, x, -1.25, z);
    exterior.add(wheel);
    wheels.push(wheel);
    exterior.add(part(new THREE.BoxGeometry(0.26, 0.36, 0.85), cream, x, -1.18, z));
  }
  // propeller blades and blur disc
  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.25);
  for (const angle of [0, Math.PI]) {
    const blade = part(new THREE.BoxGeometry(0.16, 1.0, 0.04), dark, 0, 0, 0);
    blade.geometry.translate(0, 0.5, 0);
    blade.rotation.z = angle;
    blade.rotation.y = 0.25;
    prop.add(blade);
  }
  exterior.add(prop);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.02, 32), new THREE.MeshBasicMaterial({ color: '#9aa0a6', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.set(0, 0, -3.27);
  root.add(disc);
  // navigation lights and strobes
  const light = (colour, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
    m.position.set(x, y, z);
    exterior.add(m);
    return m;
  };
  light('#ff2d2d', -5.82, 0.95, -0.6);
  light('#2dff6a', 5.82, 0.95, -0.6);
  const strobes = [light('#ffffff', -5.82, 0.95, -0.3), light('#ffffff', 5.82, 0.95, -0.3), light('#ffffff', 0, 1.88, 4.25)];

  const cockpit = buildCockpit(panelTexture);
  cockpit.group.position.set(0, 0, 0);
  root.add(cockpit.group);

  let propAngle = 0;
  let clock = 0;
  return {
    root,
    /** Moves every animated part to match the controls and the engine for this frame. */
    animate(controls, state, dt, cockpitView) {
      clock += dt;
      const rpm = state.engineRpm;
      propAngle += rpm / 60 * Math.PI * 2 * dt;
      prop.rotation.z = propAngle;
      const fast = Math.min(1, rpm / 1400);
      disc.material.opacity = (cockpitView ? 0.04 : 0.32) * fast;
      prop.visible = !cockpitView || fast < 0.9;
      for (const { pivot, side } of ailerons) pivot.rotation.x = -controls.roll * side * 0.38;
      for (const flap of flaps) flap.rotation.x = state.flaps * 0.5;
      elevator.rotation.x = -controls.pitch * 0.42;
      rudder.rotation.y = -controls.yaw * 0.45;
      for (const wheel of wheels) wheel.rotation.x -= state.groundSpeed * dt / 0.3;
      const flash = (clock % 1.3) < 0.07;
      for (const s of strobes) s.visible = flash;
      for (const mesh of hideInCockpit) mesh.visible = !cockpitView;
      cockpit.group.visible = cockpitView;
      cockpit.yoke.rotation.z = -controls.roll * 0.6;
      cockpit.yoke.position.z = -1.55 + controls.pitch * 0.07;
    },
  };
}
