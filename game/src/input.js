// Keyboard and mouse controls. Keys ramp the yoke smoothly toward full deflection and back, so a tap
// is a gentle correction and a hold is a hard turn; the mouse can fly as a virtual yoke (M), the
// wheel sets the throttle, and dragging with the right button looks around from any view.
// Nothing is bound to Ctrl, so a throttle key can never close the browser tab.

const AXIS_RATE = 2.6;      // full deflection in ~0.4 s
const RETURN_RATE = 4.5;    // and back to centre a little faster
const THROTTLE_RATE = 0.45; // throttle travel per second while a key is held

export const KEY_HELP = [
  ['W / S  or  ↑ / ↓', 'Pitch nose down / up'],
  ['A / D  or  ← / →', 'Roll left / right'],
  ['Q / E', 'Rudder left / right'],
  ['Shift / Z, wheel, 1–0', 'Throttle up / down, set'],
  ['F', 'Flaps 0 / 15° / 30°'],
  ['B  (Space on ground)', 'Wheel brakes'],
  ['Space (airborne)', 'Release supply crate'],
  ['C', 'Chase / cockpit / flyby camera'],
  ['Right-drag', 'Look around'],
  ['M', 'Mouse yoke on / off'],
  ['P or Esc', 'Pause'],
];

/** Creates the input system bound to `element`. Read `controls` each frame after `update(dt)`. */
export function createInput(element) {
  const held = new Set();
  const pressed = new Set();
  const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brakes: false, flaps: 0 };
  const look = { yaw: 0, pitch: 0, active: false };
  const mouse = { x: 0, y: 0, yoke: false, wheel: 0 };
  let flapIndex = 0;
  let lastX = 0;
  let lastY = 0;

  const onKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const code = event.code;
    if (!held.has(code)) pressed.add(code);
    held.add(code);
    if (code.startsWith('Arrow') || code === 'Space') event.preventDefault();
  };
  const onKeyUp = (event) => { held.delete(event.code); };
  const onBlur = () => held.clear();
  const onMouseDown = (event) => {
    if (event.button === 2) { look.active = true; lastX = event.clientX; lastY = event.clientY; }
  };
  const onMouseUp = (event) => { if (event.button === 2) look.active = false; };
  const onMouseMove = (event) => {
    const rect = element.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    if (look.active) {
      look.yaw -= (event.clientX - lastX) * 0.006;
      look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - (event.clientY - lastY) * 0.006));
      lastX = event.clientX;
      lastY = event.clientY;
    }
  };
  const onWheel = (event) => {
    mouse.wheel += Math.sign(event.deltaY);
    event.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  element.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', (event) => event.preventDefault());

  const axis = (current, negative, positive, dt) => {
    const target = (positive ? 1 : 0) - (negative ? 1 : 0);
    const rate = target === 0 || Math.sign(target) !== Math.sign(current) ? RETURN_RATE : AXIS_RATE;
    const step = rate * dt;
    if (Math.abs(target - current) <= step) return target;
    return current + Math.sign(target - current) * step;
  };
  const any = (...codes) => codes.some((c) => held.has(c));

  return {
    controls,
    look,
    mouse,
    /** True once for each key pressed since the last call to `consume`. */
    wasPressed: (code) => pressed.has(code),
    isHeld: (code) => held.has(code),
    /** Turns keys and mouse into control positions for this frame. */
    update(dt, onGround) {
      controls.pitch = axis(controls.pitch, any('KeyW', 'ArrowUp'), any('KeyS', 'ArrowDown'), dt);
      controls.roll = axis(controls.roll, any('KeyA', 'ArrowLeft'), any('KeyD', 'ArrowRight'), dt);
      controls.yaw = axis(controls.yaw, any('KeyQ'), any('KeyE'), dt);
      if (pressed.has('KeyM')) mouse.yoke = !mouse.yoke;
      if (mouse.yoke && !look.active) {
        const dead = (v) => (Math.abs(v) < 0.06 ? 0 : (v - Math.sign(v) * 0.06) / 0.94);
        const keyPitch = any('KeyW', 'ArrowUp', 'KeyS', 'ArrowDown');
        const keyRoll = any('KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight');
        if (!keyPitch) controls.pitch = Math.max(-1, Math.min(1, dead(mouse.y) * 1.6));
        if (!keyRoll) controls.roll = Math.max(-1, Math.min(1, dead(mouse.x) * 1.6));
      }
      if (any('ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd')) controls.throttle += THROTTLE_RATE * dt;
      if (any('KeyZ', 'Minus', 'NumpadSubtract')) controls.throttle -= THROTTLE_RATE * dt;
      if (mouse.wheel !== 0) { controls.throttle -= mouse.wheel * 0.05; mouse.wheel = 0; }
      for (let d = 0; d <= 9; d += 1) if (pressed.has(`Digit${d}`)) controls.throttle = d === 0 ? 1 : d / 10;
      controls.throttle = Math.max(0, Math.min(1, controls.throttle));
      if (pressed.has('KeyF')) { flapIndex = (flapIndex + 1) % 3; controls.flaps = flapIndex / 2; }
      controls.brakes = any('KeyB') || (onGround && any('Space'));
      if (!look.active) {
        look.yaw *= Math.max(0, 1 - dt * 3);
        look.pitch *= Math.max(0, 1 - dt * 3);
      }
    },
    /** Forgets this frame's key presses; call at the end of each frame. */
    consume() { pressed.clear(); },
    /** Puts the yoke, throttle and flaps where a mission starts. */
    reset({ throttle = 0, flaps = 0 } = {}) {
      controls.pitch = 0; controls.roll = 0; controls.yaw = 0;
      controls.throttle = throttle; controls.flaps = flaps;
      flapIndex = Math.round(flaps * 2);
    },
  };
}
