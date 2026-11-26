// The geography of the Kestrel Isles: the islands, their airfields and landmarks, and the height
// of the ground anywhere in the world. Pure functions with no rendering, so the flight model, the
// minimap and the terrain mesh all read the same ground.
import { WORLD } from './config.js';
import { fbm, ridged, smoothstep, lerp } from './noise.js';

/** Each island is a noisy dome: centre, radius, how high its hills climb and how rugged it is. */
export const ISLANDS = [
  { name: 'Halden', x: 0, z: 0, r: 3600, peak: 520, rugged: 0.55 },
  { name: 'Mount Orrin', x: -900, z: -2600, r: 1900, peak: 980, rugged: 0.9 },
  { name: 'Lowmere', x: 5600, z: 3300, r: 2300, peak: 90, rugged: 0.2 },
  { name: 'Corrie', x: -5200, z: -3900, r: 2300, peak: 640, rugged: 0.8 },
  { name: 'Tarn Rock', x: 4300, z: -4700, r: 900, peak: 160, rugged: 0.9 },
  { name: 'Fennel Cay', x: -3300, z: 5200, r: 1200, peak: 40, rugged: 0.15 },
  { name: 'Skerry', x: 2200, z: 6100, r: 600, peak: 55, rugged: 0.5 },
];

/**
 * Airfields: centre, runway heading in degrees (true, from north clockwise), length and width in
 * metres, surface, and the elevation the ground is levelled to. Halden Field is home: the only
 * strip with a hangar crew who repair damage.
 */
export const AIRFIELDS = [
  { id: 'halden', name: 'Halden Field', x: -1500, z: 2750, heading: 105, length: 1250, width: 32, surface: 'asphalt', elevation: 22, home: true },
  { id: 'saltmarsh', name: 'Saltmarsh Strip', x: 5300, z: 3500, heading: 35, length: 780, width: 24, surface: 'grass', elevation: 9, home: false },
  { id: 'corrie', name: 'Corrie Ridge', x: -5050, z: -3500, heading: 330, length: 620, width: 22, surface: 'gravel', elevation: 238, home: false },
];

/** Places the supply-drop mission sends crates to, and the lighthouse that names Tarn Rock. */
export const LANDMARKS = {
  lighthouse: { x: 4560, z: -5080 },
  villages: [
    { name: 'Brackwater', x: 1900, z: 2300 },
    { name: 'Oldquay', x: -2100, z: 1500 },
    { name: 'Merrow', x: 6300, z: 2600 },
    { name: 'Cairnside', x: -4300, z: -4700 },
    { name: 'Penhallow', x: -3200, z: 5100 },
  ],
  /** Open fields beside three villages where the supply-drop mission paints its targets. */
  dropZones: [
    { name: 'Oldquay', x: -1839, z: 1570 },
    { name: 'Penhallow', x: -3151, z: 4916 },
    { name: 'Brackwater', x: 1900, z: 2030 },
  ],
};

const RAD = Math.PI / 180;

/** The runway's own axes: unit vector along its heading and the one to its right. */
export function runwayAxes(field) {
  const h = field.heading * RAD;
  return { ax: Math.sin(h), az: -Math.cos(h), rx: Math.cos(h), rz: Math.sin(h) };
}

/** Position relative to a runway: metres along its centreline (+ toward its heading) and across it. */
export function runwayLocal(field, x, z) {
  const { ax, az, rx, rz } = runwayAxes(field);
  const dx = x - field.x;
  const dz = z - field.z;
  return { along: dx * ax + dz * az, across: dx * rx + dz * rz };
}

/** The natural shape of the land before any airfield is levelled into it. */
function naturalHeight(x, z) {
  let height = WORLD.seaFloor;
  for (const isle of ISLANDS) {
    const dx = x - isle.x;
    const dz = z - isle.z;
    const wobble = 0.72 + 0.56 * fbm(x / 1400 + isle.x, z / 1400 + isle.z, 3, 4);
    const e = 1 - Math.hypot(dx, dz) / (isle.r * wobble);
    if (e <= 0) continue;
    const shore = 46 * smoothstep(0, 0.16, e);
    const hills = isle.peak * Math.pow(Math.max(e - 0.08, 0), 1.45);
    const texture = lerp(0.55 + 0.6 * fbm(x / 900, z / 900, 11, 5), 0.25 + 1.2 * ridged(x / 1300, z / 1300, 23, 5), isle.rugged);
    height = Math.max(height, WORLD.seaFloor + shore + hills * texture);
  }
  return height;
}

/** Ground height in metres above sea level at world (x, z); negative is under water. */
export function groundHeight(x, z) {
  let h = naturalHeight(x, z);
  for (const field of AIRFIELDS) {
    const { along, across } = runwayLocal(field, x, z);
    const shoulder = field.elevation > 100 ? 260 : 160;
    const outAlong = Math.max(0, Math.abs(along) - field.length / 2 - 60);
    const outAcross = Math.max(0, Math.abs(across) - field.width / 2 - 70);
    const out = Math.hypot(outAlong, outAcross);
    if (out >= shoulder) continue;
    const w = 1 - smoothstep(0, shoulder, out);
    h = lerp(h, field.elevation, w);
  }
  return h;
}

/** The airfield whose runway surface contains (x, z), or null. */
export function runwayAt(x, z) {
  for (const field of AIRFIELDS) {
    const { along, across } = runwayLocal(field, x, z);
    if (Math.abs(along) <= field.length / 2 + 15 && Math.abs(across) <= field.width / 2 + 6) return field;
  }
  return null;
}

/** What the ground is made of at (x, z) given its height and slope: decides colour and landing. */
export function surfaceKind(x, z, h, slope = 0) {
  if (runwayAt(x, z)) return 'runway';
  if (h < 0.4) return 'water';
  if (h < 5) return 'sand';
  if (h > 560 + 80 * fbm(x / 300, z / 300, 5, 2)) return 'snow';
  if (slope > 0.75 || h > 380) return 'rock';
  return 'grass';
}

/** The nearest airfield to (x, z) and how far away it is, in metres. */
export function nearestAirfield(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const field of AIRFIELDS) {
    const d = Math.hypot(x - field.x, z - field.z);
    if (d < bestD) { bestD = d; best = field; }
  }
  return { field: best, distance: bestD };
}
