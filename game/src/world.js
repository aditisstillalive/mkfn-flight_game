// Assembles the whole world into one scene: sky dome and sunlight, terrain, sea, clouds, airfields
// and scenery. Keeps the sky centred on the camera and the shadow box on the aircraft each frame.
import { buildSkyDome, buildLights, buildClouds } from './sky.js';
import { buildTerrain, paintMap } from './terrain.js';
import { buildWater } from './water.js';
import { buildAirfields } from './runways.js';
import { buildScenery } from './scenery.js';

/** Builds every static part of the isles into `scene`; returns the per-frame updater and map. */
export function buildWorld(scene) {
  const sky = buildSkyDome();
  scene.add(sky);
  const lights = buildLights(scene);
  scene.add(buildTerrain());
  const water = buildWater();
  scene.add(water.mesh);
  scene.add(buildClouds());
  const airfields = buildAirfields();
  scene.add(airfields.root);
  scene.add(buildScenery());
  const map = paintMap(512);
  return {
    map,
    update(camera, focus, dt, wind) {
      sky.position.copy(camera.position);
      lights.follow(focus);
      water.update(dt);
      airfields.update(camera.position, wind);
    },
  };
}
