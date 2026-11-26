// The heads-up display painted over the 3D view each frame: a heading tape with the objective bug,
// airspeed and altitude boxes with vertical speed, a pointer to the current target (an edge arrow
// when it is off screen), the objective and clock, a north-up minimap of the isles, flashing
// warnings (STALL, PULL UP, LOW FUEL), toasts for events, and the lit instrument panel in chase view.
import * as THREE from 'three';
import { UNITS, WORLD, AIRCRAFT } from './config.js';
import { AIRFIELDS } from './islands.js';
import { PANEL_WIDTH, PANEL_HEIGHT } from './instruments.js';
import { terrainHeight } from './terrain.js';

const AMBER = '#ffcf7a';
const GREEN = '#9dffb0';
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

function box(ctx, x, y, w, h, alpha = 0.45) {
  ctx.fillStyle = `rgba(8, 14, 20, ${alpha})`;
  ctx.strokeStyle = 'rgba(255, 220, 160, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function glowText(ctx, text, x, y, colour = AMBER, size = 18, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function headingTape(ctx, cx, y, width, heading, bug) {
  box(ctx, cx - width / 2, y, width, 46, 0.4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - width / 2, y, width, 46);
  ctx.clip();
  const pxPerDeg = width / 70;
  ctx.strokeStyle = AMBER;
  ctx.fillStyle = AMBER;
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'center';
  for (let d = Math.floor(heading - 40); d <= heading + 40; d += 1) {
    if (((d % 5) + 5) % 5) continue;
    const x = cx + (d - heading) * pxPerDeg;
    const norm = ((d % 360) + 360) % 360;
    const major = norm % 10 === 0;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 46);
    ctx.lineTo(x, y + 46 - (major ? 12 : 6));
    ctx.stroke();
    if (norm % 30 === 0) {
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[norm] || String(norm / 10).padStart(2, '0');
      ctx.fillText(label, x, y + 24);
    }
  }
  if (bug !== null && bug !== undefined) {
    let delta = ((bug - heading + 540) % 360) - 180;
    delta = Math.max(-34, Math.min(34, delta));
    const x = cx + delta * pxPerDeg;
    ctx.fillStyle = '#ff8a2a';
    ctx.beginPath();
    ctx.moveTo(x, y + 30); ctx.lineTo(x - 8, y + 46); ctx.lineTo(x + 8, y + 46); ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  box(ctx, cx - 34, y + 48, 68, 30, 0.7);
  glowText(ctx, String(Math.round(heading) % 360).padStart(3, '0') + '°', cx, y + 71, '#ffffff', 21, 'center');
}

function readout(ctx, x, y, label, value, unit, sub, colour = '#ffffff') {
  box(ctx, x, y, 128, 74, 0.5);
  glowText(ctx, label, x + 10, y + 19, AMBER, 13);
  glowText(ctx, value, x + 116, y + 50, colour, 30, 'right');
  glowText(ctx, unit, x + 116, y + 19, AMBER, 13, 'right');
  if (sub) glowText(ctx, sub, x + 10, y + 67, GREEN, 13);
}

/** Creates the HUD on its own canvas, drawn over the WebGL view. */
export function createHud(canvas, mapCanvas) {
  const ctx = canvas.getContext('2d');
  const toasts = [];
  const tmp = new THREE.Vector3();
  let width = 0;
  let height = 0;
  let scale = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(1.25, Math.max(0.7, Math.min(width / 1280, height / 720)));
  }
  resize();
  window.addEventListener('resize', resize);

  function targetMarker(camera, target, state) {
    tmp.set(target.x, target.y + 4, target.z);
    const dist = Math.hypot(target.x - state.pos.x, target.z - state.pos.z);
    const ahead = tmp.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
    tmp.project(camera);
    let sx = (tmp.x * 0.5 + 0.5) * width;
    let sy = (-tmp.y * 0.5 + 0.5) * height;
    const onScreen = ahead && sx > 30 && sx < width - 30 && sy > 90 && sy < height - 30;
    const label = `${target.label}  ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}`;
    if (onScreen) {
      ctx.strokeStyle = '#ff8a2a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 14); ctx.lineTo(sx + 14, sy); ctx.lineTo(sx, sy + 14); ctx.lineTo(sx - 14, sy); ctx.closePath();
      ctx.stroke();
      glowText(ctx, label, sx, sy - 22, '#ffb36a', 14, 'center');
    } else {
      let dx = sx - width / 2;
      let dy = sy - height / 2;
      if (!ahead) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
      const a = Math.atan2(dy, dx);
      const r = Math.min(width, height) * 0.36;
      sx = width / 2 + Math.cos(a) * r;
      sy = height / 2 + Math.sin(a) * r;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.fillStyle = '#ff8a2a';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -12); ctx.lineTo(-2, 0); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
      glowText(ctx, label, sx, sy + 30, '#ffb36a', 13, 'center');
    }
  }

  function minimap(x, y, size, state, target) {
    box(ctx, x - 4, y - 4, size + 8, size + 8, 0.55);
    // show a 9 km window around the aircraft, north up
    const span = 9000;
    const half = WORLD.size / 2;
    const px = mapCanvas.width / WORLD.size;
    const sx = (state.pos.x - span / 2 + half) * px;
    const sy = (state.pos.z - span / 2 + half) * px;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 6);
    ctx.clip();
    ctx.fillStyle = '#1d5f80';
    ctx.fillRect(x, y, size, size);
    ctx.drawImage(mapCanvas, sx, sy, span * px, span * px, x, y, size, size);
    const toMap = (wx, wz) => [x + ((wx - state.pos.x) / span + 0.5) * size, y + ((wz - state.pos.z) / span + 0.5) * size];
    for (const f of AIRFIELDS) {
      const [mx, my] = toMap(f.x, f.z);
      const h = f.heading * Math.PI / 180;
      const l = f.length / span * size / 2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx - Math.sin(h) * l, my + Math.cos(h) * l);
      ctx.lineTo(mx + Math.sin(h) * l, my - Math.cos(h) * l);
      ctx.stroke();
    }
    if (target) {
      const [tx, ty] = toMap(target.x, target.z);
      ctx.fillStyle = '#ff8a2a';
      ctx.beginPath();
      ctx.arc(Math.max(x + 6, Math.min(x + size - 6, tx)), Math.max(y + 6, Math.min(y + size - 6, ty)), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(state.heading * Math.PI / 180);
    ctx.fillStyle = '#ffe14a';
    ctx.strokeStyle = '#2a1a00';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    glowText(ctx, 'N', x + size / 2, y + 15, '#ffffff', 13, 'center');
  }

  /** Wind from, its speed, and an arrow showing where it blows relative to the nose. */
  function windGauge(x, y, state) {
    const w = state.wind;
    const speed = Math.hypot(w.x, w.z);
    box(ctx, x - 4, y, 178, 34, 0.5);
    if (speed < 0.3) { glowText(ctx, 'WIND CALM', x + 85, y + 23, AMBER, 13, 'center'); return; }
    const from = ((Math.atan2(-w.x, w.z) * 180 / Math.PI) + 360) % 360;
    glowText(ctx, `WIND ${String(Math.round(from)).padStart(3, '0')}° ${Math.round(speed * UNITS.knots)} KT`, x + 8, y + 23, AMBER, 13);
    const rel = (Math.atan2(w.x, -w.z) - state.heading * Math.PI / 180);
    ctx.save();
    ctx.translate(x + 150, y + 17);
    ctx.rotate(rel);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-5, -4); ctx.lineTo(5, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function warnings(state, time) {
    const list = [];
    if (state.stallWarning) list.push(['STALL', '#ff4a3a']);
    if (!state.onGround && !state.crashed) {
      const ahead = state.pos.clone().addScaledVector(state.vel, 6);
      const ground = Math.max(terrainHeight(ahead.x, ahead.z), 0);
      if (ahead.y - ground < 25 && state.verticalSpeed < -1 && state.agl > 8) list.push(['PULL UP', '#ff4a3a']);
    }
    if (state.fuel < AIRCRAFT.fuelCapacity * 0.12 && state.engineOn) list.push(['LOW FUEL', '#ffb020']);
    if (!state.engineOn && !state.crashed) list.push(['ENGINE OUT — GLIDE', '#ffb020']);
    if (state.gLoad > 4.5) list.push([`${state.gLoad.toFixed(1)} G`, '#ffb020']);
    if (state.airspeed > AIRCRAFT.vne * 0.95) list.push(['OVERSPEED', '#ff4a3a']);
    if (!list.length || Math.floor(time * 3) % 3 === 2) return;
    list.forEach(([text, colour], i) => glowText(ctx, text, width / 2, height * 0.26 + i * 34 * scale, colour, 28 * scale, 'center', 800));
  }

  return {
    resize,
    clearToasts() { toasts.length = 0; },
    /** Shows a message mid-screen for a few seconds. */
    toast(text, colour = '#ffffff', seconds = 3) {
      toasts.push({ text, colour, until: performance.now() / 1000 + seconds });
      if (toasts.length > 3) toasts.shift();
    },
    draw({ state, camera, view, run, panel, time, mouseYoke }) {
      ctx.clearRect(0, 0, width, height);
      if (!state) return;
      const target = run ? run.target(state) : null;
      if (target && !state.crashed) targetMarker(camera, target, state);
      ctx.save();
      ctx.scale(scale, scale);
      const W = width / scale;
      const H = height / scale;
      headingTape(ctx, W / 2, 14, 420, state.heading, run ? run.bug(state) : null);
      const cy = Math.max(112, H * 0.38);
      const knots = state.airspeed * UNITS.knots;
      readout(ctx, 16, cy, 'AIRSPEED', String(Math.round(knots)), 'KT',
        `GS ${Math.round(state.groundSpeed * UNITS.knots)}  THR ${Math.round(state.throttle * 100)}%`, state.stallWarning ? '#ff6a5a' : '#ffffff');
      const fpm = state.verticalSpeed * UNITS.fpm;
      readout(ctx, W - 144, cy, 'ALTITUDE', String(Math.round(state.altitude * UNITS.feet / 10) * 10), 'FT',
        `${fpm >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(fpm / 10) * 10)} fpm  AGL ${Math.round(Math.max(0, state.agl) * UNITS.feet)}`);
      if (run) {
        box(ctx, 16, 14, 330, 78, 0.5);
        glowText(ctx, run.def.title.toUpperCase(), 30, 38, AMBER, 15);
        glowText(ctx, run.clock(), 332, 38, '#ffffff', 17, 'right');
        glowText(ctx, run.objective(state), 30, 66, '#ffffff', 16, 'left', 600);
        const fuelPct = Math.round(state.fuel / AIRCRAFT.fuelCapacity * 100);
        glowText(ctx, `FUEL ${Math.round(state.fuel)} L (${fuelPct}%)   AIRFRAME ${Math.round((1 - state.damage) * 100)}%`, 30, 85, state.damage > 0.5 || fuelPct < 12 ? '#ff8a6a' : GREEN, 12);
      }
      minimap(W - 186, 14, 170, state, target);
      windGauge(W - 186, 192, state);
      if (mouseYoke) glowText(ctx, 'MOUSE YOKE', W - 101, 246, GREEN, 12, 'center');
      if (view !== 'cockpit' && panel) {
        const pw = Math.min(W * 0.66, 1000);
        const ph = pw * PANEL_HEIGHT / PANEL_WIDTH;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 18;
        ctx.globalAlpha = 0.96;
        ctx.drawImage(panel, (W - pw) / 2, H - ph - 10, pw, ph);
        ctx.restore();
      }
      ctx.restore();
      warnings(state, time);
      const now = performance.now() / 1000;
      for (let i = toasts.length - 1; i >= 0; i -= 1) if (toasts[i].until < now) toasts.splice(i, 1);
      toasts.forEach((t, i) => glowText(ctx, t.text, width / 2, height * 0.2 + i * 30 * scale, t.colour, 22 * scale, 'center', 700));
    },
  };
}
