// The Pipit's backlit instrument panel, painted on one canvas each frame: airspeed, attitude,
// altimeter, heading (with a bug on the current objective), vertical speed and tachometer, plus a
// column of fuel, flap and damage readouts and annunciator lamps. The chase-view HUD draws this
// canvas along the bottom of the screen; the cockpit maps the same canvas onto its panel.
import { UNITS, AIRCRAFT } from './config.js';

export const PANEL_WIDTH = 1680;
export const PANEL_HEIGHT = 280;

const R = 112;
const GLOW = 'rgba(255, 214, 150, 0.85)';
const INK = '#f6eedd';
const NEEDLE = '#ffb347';

function bezel(ctx, x, y, label) {
  const rim = ctx.createRadialGradient(x - 30, y - 40, 10, x, y, R + 14);
  rim.addColorStop(0, '#6b7178');
  rim.addColorStop(1, '#1d2125');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y, R + 12, 0, Math.PI * 2);
  ctx.fill();
  const face = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
  face.addColorStop(0, '#15181b');
  face.addColorStop(0.86, '#0d0f11');
  face.addColorStop(1, '#3a2a14');   // the amber backlight bleeding round the rim
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  for (const a of [0.8, 2.35, 3.9, 5.5]) {
    ctx.fillStyle = '#9097a0';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * (R + 6), y + Math.sin(a) * (R + 6), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (label) {
    lit(ctx, () => {
      ctx.fillStyle = INK;
      ctx.font = '600 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + R * 0.52);
    });
  }
}

/** Draws `fn` with the soft glow of backlit paint. */
function lit(ctx, fn) {
  ctx.save();
  ctx.shadowColor = GLOW;
  ctx.shadowBlur = 7;
  fn();
  ctx.restore();
}

function arc(ctx, x, y, r, a0, a1, colour, width) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();
}

function ticks(ctx, x, y, from, to, count, angleOf, labelOf, major = 1) {
  lit(ctx, () => {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.font = 'bold 21px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= count; i += 1) {
      const v = from + (to - from) * (i / count);
      const a = angleOf(v);
      const big = i % major === 0;
      ctx.lineWidth = big ? 3.5 : 2;
      const r0 = big ? R - 20 : R - 12;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * (R - 3), y + Math.sin(a) * (R - 3));
      ctx.stroke();
      if (big && labelOf) {
        const t = labelOf(v);
        if (t !== null) ctx.fillText(t, x + Math.cos(a) * (R - 38), y + Math.sin(a) * (R - 38));
      }
    }
  });
}

function needle(ctx, x, y, angle, length, width = 6, colour = NEEDLE) {
  lit(ctx, () => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(-14, -width / 2);
    ctx.lineTo(length, -1.2);
    ctx.lineTo(length, 1.2);
    ctx.lineTo(-14, width / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = '#2b2f33';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawAirspeed(ctx, x, y, kt) {
  bezel(ctx, x, y, 'KNOTS');
  const angleOf = (v) => -Math.PI / 2 + (Math.min(v, 180) / 180) * Math.PI * 1.8;
  arc(ctx, x, y, R - 8, angleOf(40), angleOf(85), '#f2f2f2', 6);
  arc(ctx, x, y, R - 8, angleOf(48), angleOf(125), '#3ccf5a', 6);
  arc(ctx, x, y, R - 8, angleOf(125), angleOf(171), '#f2c230', 6);
  arc(ctx, x, y, R - 8, angleOf(170), angleOf(173), '#ff3b30', 8);
  ticks(ctx, x, y, 0, 180, 36, angleOf, (v) => (v % 40 === 0 && v > 0 ? String(v) : null), 4);
  needle(ctx, x, y, angleOf(kt), R - 16);
}

function drawAttitude(ctx, x, y, pitch, bank) {
  bezel(ctx, x, y, null);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-bank);
  const shift = pitch * 180 / Math.PI * 3.2;
  ctx.translate(0, shift);
  ctx.fillStyle = '#2f86d6';
  ctx.fillRect(-R * 2, -R * 4, R * 4, R * 4);
  ctx.fillStyle = '#8a5a2e';
  ctx.fillRect(-R * 2, 0, R * 4, R * 4);
  lit(ctx, () => {
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-R * 2, 0); ctx.lineTo(R * 2, 0); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    for (let p = -30; p <= 30; p += 5) {
      if (p === 0) continue;
      const w = p % 10 === 0 ? 30 : 15;
      const py = -p * 3.2;
      ctx.beginPath(); ctx.moveTo(-w, py); ctx.lineTo(w, py); ctx.stroke();
      if (p % 10 === 0) ctx.fillText(String(Math.abs(p)), w + 5, py + 4);
    }
  });
  ctx.restore();
  // bank scale and fixed aircraft symbol
  ctx.save();
  ctx.translate(x, y);
  lit(ctx, () => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (const d of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const a = -Math.PI / 2 + d * Math.PI / 180;
      const r0 = Math.abs(d) % 30 === 0 ? R - 22 : R - 14;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3));
      ctx.stroke();
    }
    ctx.fillStyle = NEEDLE;
    ctx.save();
    ctx.rotate(-bank);
    ctx.beginPath(); ctx.moveTo(0, -R + 4); ctx.lineTo(-9, -R + 20); ctx.lineTo(9, -R + 20); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = NEEDLE;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-58, 0); ctx.lineTo(-20, 0); ctx.lineTo(-10, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(58, 0); ctx.lineTo(20, 0); ctx.lineTo(10, 10); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function drawAltimeter(ctx, x, y, feet) {
  bezel(ctx, x, y, 'ALT  FT');
  const angleOf = (v) => -Math.PI / 2 + (v / 10) * Math.PI * 2;
  ticks(ctx, x, y, 0, 10, 50, angleOf, (v) => (v < 10 ? String(Math.round(v)) : null), 5);
  const f = Math.max(0, feet);
  lit(ctx, () => {
    ctx.fillStyle = '#050607';
    ctx.fillRect(x - 40, y + 14, 80, 28);
    ctx.fillStyle = INK;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(f / 10) * 10).padStart(5, ' '), x, y + 36);
  });
  needle(ctx, x, y, angleOf((f / 1000) % 10), R * 0.5, 10, INK);
  needle(ctx, x, y, angleOf((f / 100) % 10), R - 18);
}

function drawHeading(ctx, x, y, heading, bug) {
  bezel(ctx, x, y, null);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-heading * Math.PI / 180);
  lit(ctx, () => {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const a = d * Math.PI / 180 - Math.PI / 2;
      const big = d % 30 === 0;
      ctx.lineWidth = big ? 3 : 1.6;
      const r0 = big ? R - 20 : d % 10 === 0 ? R - 14 : R - 9;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3));
      ctx.stroke();
      if (big) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        ctx.save();
        ctx.translate(Math.cos(a) * (R - 36), Math.sin(a) * (R - 36));
        ctx.rotate(d * Math.PI / 180);
        ctx.font = names[d] ? 'bold 24px sans-serif' : 'bold 17px sans-serif';
        ctx.fillStyle = d === 0 ? '#ff9b5a' : INK;
        ctx.fillText(names[d] || String(d / 10), 0, 0);
        ctx.restore();
      }
    }
    if (bug !== null && bug !== undefined) {
      const a = bug * Math.PI / 180 - Math.PI / 2;
      ctx.save();
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(-9, -R + 1, 18, 9);
      ctx.restore();
    }
  });
  ctx.restore();
  lit(ctx, () => {
    ctx.fillStyle = NEEDLE;
    ctx.beginPath();
    ctx.moveTo(x, y - 40); ctx.lineTo(x - 6, y - 8); ctx.lineTo(x - 34, y + 4); ctx.lineTo(x - 34, y + 12);
    ctx.lineTo(x - 6, y + 6); ctx.lineTo(x - 4, y + 30); ctx.lineTo(x - 14, y + 38); ctx.lineTo(x + 14, y + 38);
    ctx.lineTo(x + 4, y + 30); ctx.lineTo(x + 6, y + 6); ctx.lineTo(x + 34, y + 12); ctx.lineTo(x + 34, y + 4);
    ctx.lineTo(x + 6, y - 8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#050607';
    ctx.fillRect(x - 28, y - R + 22, 56, 26);
    ctx.fillStyle = INK;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(heading) % 360).padStart(3, '0'), x, y - R + 42);
  });
}

function drawVsi(ctx, x, y, fpm) {
  bezel(ctx, x, y, 'VERT SPEED');
  const angleOf = (v) => Math.PI + (THREE_CLAMP(v, -2000, 2000) / 2000) * Math.PI * 0.85;
  ticks(ctx, x, y, -2000, 2000, 40, angleOf, (v) => (v % 1000 === 0 ? String(Math.abs(v / 100)) : null), 5);
  needle(ctx, x, y, angleOf(fpm), R - 16);
}

function drawTach(ctx, x, y, rpm, engineOn) {
  bezel(ctx, x, y, engineOn ? 'RPM ×100' : 'ENGINE OFF');
  const angleOf = (v) => Math.PI * 0.75 + (Math.min(v, 3000) / 3000) * Math.PI * 1.5;
  arc(ctx, x, y, R - 8, angleOf(2100), angleOf(2650), '#3ccf5a', 6);
  arc(ctx, x, y, R - 8, angleOf(2700), angleOf(2750), '#ff3b30', 8);
  ticks(ctx, x, y, 0, 3000, 30, angleOf, (v) => (v % 500 === 0 ? String(v / 100) : null), 5);
  needle(ctx, x, y, angleOf(rpm), R - 16);
}

function THREE_CLAMP(v, a, b) { return Math.max(a, Math.min(b, v)); }

function drawColumn(ctx, x, y, state, extras) {
  ctx.fillStyle = '#121518';
  ctx.fillRect(x, y - R - 6, 200, (R + 6) * 2);
  ctx.strokeStyle = '#3c4248';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y - R - 6, 200, (R + 6) * 2);
  const bar = (label, frac, top, colour, text) => {
    lit(ctx, () => {
      ctx.fillStyle = INK;
      ctx.font = '600 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 12, top);
      ctx.textAlign = 'right';
      ctx.fillText(text, x + 188, top);
    });
    ctx.fillStyle = '#05070a';
    ctx.fillRect(x + 12, top + 6, 176, 14);
    ctx.fillStyle = colour;
    ctx.fillRect(x + 13, top + 7, 174 * THREE_CLAMP(frac, 0, 1), 12);
  };
  const fuelFrac = state.fuel / AIRCRAFT.fuelCapacity;
  bar('FUEL', fuelFrac, y - R + 14, fuelFrac < 0.15 ? '#ff5a3a' : '#f2c230', `${Math.round(state.fuel)} L`);
  bar('THROTTLE', state.throttle, y - R + 54, '#7fd0ff', `${Math.round(state.throttle * 100)}%`);
  bar('AIRFRAME', 1 - state.damage, y - R + 94, state.damage > 0.5 ? '#ff5a3a' : '#3ccf5a', `${Math.round((1 - state.damage) * 100)}%`);
  const lamps = [
    ['STALL', state.stallWarning, '#ff3b30'],
    ['LOW FUEL', fuelFrac < 0.15, '#ffb020'],
    ['BRAKE', extras.brakes, '#ffb020'],
    [`FLAP ${Math.round(state.flaps * 30)}°`, state.flaps > 0.02, '#3ccf5a'],
  ];
  lamps.forEach(([text, on, colour], i) => {
    const lx = x + 12 + (i % 2) * 90;
    const ly = y + 26 + Math.floor(i / 2) * 40;
    ctx.fillStyle = on ? colour : '#22262a';
    if (on) { ctx.save(); ctx.shadowColor = colour; ctx.shadowBlur = 14; }
    ctx.fillRect(lx, ly, 84, 30);
    if (on) ctx.restore();
    ctx.fillStyle = on ? '#140b04' : '#5a6066';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, lx + 42, ly + 20);
  });
}

/** Creates the panel canvas; `draw(state, extras)` repaints it from the flight state. */
export function createInstrumentPanel() {
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_WIDTH;
  canvas.height = PANEL_HEIGHT;
  const ctx = canvas.getContext('2d');
  return {
    canvas,
    draw(state, extras = {}) {
      const bg = ctx.createLinearGradient(0, 0, 0, PANEL_HEIGHT);
      bg.addColorStop(0, '#2a2f35');
      bg.addColorStop(1, '#181b1f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
      const y = PANEL_HEIGHT / 2;
      const step = 238;
      const x0 = 132;
      drawAirspeed(ctx, x0, y, state.airspeed * UNITS.knots);
      drawAttitude(ctx, x0 + step, y, state.pitch, state.bank);
      drawAltimeter(ctx, x0 + step * 2, y, state.altitude * UNITS.feet);
      drawHeading(ctx, x0 + step * 3, y, state.heading, extras.bug);
      drawVsi(ctx, x0 + step * 4, y, state.verticalSpeed * UNITS.fpm);
      drawTach(ctx, x0 + step * 5, y, state.engineRpm, state.engineOn);
      drawColumn(ctx, x0 + step * 5 + R + 28, y, state, extras);
    },
  };
}
