// The sky over the isles: a late-afternoon gradient dome with a sun, the sunlight and skylight that
// light everything, the haze that fades distant islands into the horizon, and drifting banks of
// low-poly cumulus built from the same faceted style as the terrain.
import * as THREE from 'three';
import { makeRandom } from './noise.js';

export const SKY = {
  zenith: new THREE.Color('#3f7fc4'),
  horizon: new THREE.Color('#cfe0e8'),
  glow: new THREE.Color('#ffd9a0'),
  sunDirection: new THREE.Vector3(-0.55, 0.42, -0.72).normalize(),
};

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w * 0.99999;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 glow;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(horizon, zenith, pow(max(up, 0.0), 0.55));
    float sun = max(dot(d, sunDir), 0.0);
    col += glow * pow(sun, 6.0) * 0.45;
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sun) * 1.4;
    col = mix(col, horizon * 0.92, smoothstep(0.0, -0.2, d.y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The sky dome: follows the camera so it is always at the horizon. */
export function buildSkyDome() {
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      glow: { value: SKY.glow },
      sunDir: { value: SKY.sunDirection },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = 'sky';
  return dome;
}

/** Sunlight with a shadow box that follows the aircraft, plus soft skylight from above. */
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight('#cfe4ff', '#6d7b4c', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe6c2', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const box = sun.shadow.camera;
  box.left = -70; box.right = 70; box.top = 70; box.bottom = -70;
  box.near = 1; box.far = 900;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  scene.fog = new THREE.Fog(SKY.horizon.clone(), 1800, 15500);
  return {
    sun,
    hemi,
    /** Keeps the shadow box centred on `focus` so the aircraft and nearby ground always shadow. */
    follow(focus) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SKY.sunDirection, 450);
    },
  };
}

/** Banks of faceted cumulus: one instanced mesh of puffs, grouped into clouds around the isles. */
export function buildClouds(seed = 5) {
  const random = makeRandom(seed);
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#6f7f99', emissiveIntensity: 0.35, flatShading: true });
  const clouds = 70;
  const perCloud = 9;
  const mesh = new THREE.InstancedMesh(puff, material, clouds * perCloud);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let c = 0; c < clouds; c += 1) {
    const cx = (random() - 0.5) * 22000;
    const cz = (random() - 0.5) * 22000;
    const cy = 700 + random() * 500;
    const size = 50 + random() * 90;
    for (let k = 0; k < perCloud; k += 1) {
      const t = k / (perCloud - 1) - 0.5;
      p.set(cx + t * size * 3.2 + (random() - 0.5) * size, cy + (1 - Math.abs(t) * 1.6) * size * 0.5 * random(), cz + (random() - 0.5) * size * 1.4);
      const r = size * (0.55 + 0.6 * (1 - Math.abs(t) * 1.3)) * (0.7 + 0.5 * random());
      s.set(r, r * 0.62, r * (0.8 + 0.3 * random()));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI);
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      n += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'clouds';
  return mesh;
}
