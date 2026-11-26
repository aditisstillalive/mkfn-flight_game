// The sea around the isles: a wide glossy plane whose ripples are a tiling normal map painted at
// start-up and scrolled every frame, so the sun glints on the swell and shallow sand shows through.
import * as THREE from 'three';

/** Paints a seamlessly tiling ripple normal map from a sum of whole-period waves. */
function paintRippleNormals(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const waves = [
    [3, 1, 1.0, 0.2], [1, 4, 0.8, 1.3], [5, -2, 0.5, 2.1], [-2, 7, 0.4, 0.7], [9, 3, 0.25, 3.3], [4, -9, 0.2, 5.1],
  ];
  const height = (u, v) => {
    let h = 0;
    for (const [a, b, amp, ph] of waves) h += amp * Math.sin(2 * Math.PI * (a * u + b * v) + ph);
    return h;
  };
  const e = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const dx = (height(u + e, v) - height(u - e, v)) * 0.6;
      const dy = (height(u, v + e) - height(u, v - e)) * 0.6;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(900, 900);
  return texture;
}

/** Builds the sea plane; call `update(dt)` each frame to drift the ripples. */
export function buildWater() {
  const normalMap = paintRippleNormals();
  const material = new THREE.MeshPhongMaterial({
    color: '#1b6f98',
    specular: '#ffe8c8',
    shininess: 90,
    normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'sea';
  return {
    mesh,
    update(dt) {
      normalMap.offset.x += dt * 0.004;
      normalMap.offset.y += dt * 0.0025;
    },
  };
}
