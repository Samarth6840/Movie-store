/**
 * Ground planes in perspective: water and wet asphalt.
 *
 * A ridge is a silhouette — a shape with a crest. A sea is something else: a surface
 * receding *away from the camera*, where detail has to compress toward the horizon.
 * Painting waves as a function of screen position gives the uniform hatch that
 * betrays a procedural image instantly; painting them as a function of ground
 * distance gives water.
 *
 * The mapping is the standard one for a camera looking at a flat plane: a point at
 * screen height `v` below a horizon at `horizonV` lies at ground distance
 * proportional to `1 / (v - horizonV)`, and its lateral position scales with that
 * same distance. Everything else here is shading on top of that one idea.
 *
 * @module server/lib/scene/ground
 */

import { mixColor } from '../paint/frame.js';
import { fbm, noise2 } from '../paint/noise.js';

const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Project a screen point onto a ground plane.
 *
 * @param {number} u
 * @param {number} v
 * @param {number} horizonV
 * @returns {{z: number, x: number} | null} `null` above the horizon.
 */
const groundAt = (u, v, horizonV) => {
  const drop = v - horizonV;
  if (drop <= 0.0005) return null;
  const z = 0.16 / drop; // distance; ~large near the horizon, ~0.5 at the bottom
  return { z, x: (u - 0.5) * z };
};

/**
 * A sea shader: swell in perspective under a sun path.
 *
 * Three things make it read as water rather than as noise. The wave field is sampled
 * in *ground* coordinates, so it foreshortens. The specular is a narrow band of
 * glitter along the sun's bearing that widens toward the camera — the glitter path,
 * the most recognisable feature of any lit sea. And the base colour is the sky's own
 * colour, darkened: water is mostly a mirror.
 *
 * @param {{horizonV?: number, deep: [number,number,number],
 *          shallow: [number,number,number], sunU?: number,
 *          sunColor?: [number,number,number], sunStrength?: number,
 *          roughness?: number, seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const seaShader = (params) => {
  const {
    horizonV = 0.6,
    deep,
    shallow,
    sunU = 0.5,
    sunColor = [255, 232, 190],
    sunStrength = 0.7,
    roughness = 0.5,
    seed = 0,
  } = params;

  return (u, v) => {
    const ground = groundAt(u, v, horizonV);
    if (!ground) return [0, 0, 0, 0];
    const { z, x } = ground;

    // Near the horizon the plane is so compressed that no wave survives; fade the
    // detail out there rather than letting it alias into a moiré.
    const detail = unit(1.6 - z * 0.22);

    // Two swell scales plus a chop, all in ground coordinates.
    const swell = fbm(x * 2.6, z * 1.5, { octaves: 3, seed, gain: 0.55 });
    const chop = fbm(x * 11 + 4, z * 7, { octaves: 3, seed: seed + 31 });
    const surface = swell * 0.65 + chop * 0.35 * detail;

    // The wave's facing: the slope of the surface toward the viewer. Facets tilted
    // up catch sky, facets tilted away sit dark.
    const step = 0.02;
    const slope =
      fbm(x * 2.6, (z + step) * 1.5, { octaves: 3, seed, gain: 0.55 }) -
      fbm(x * 2.6, (z - step) * 1.5, { octaves: 3, seed, gain: 0.55 });
    const facing = unit(0.5 + slope * 9);

    // Base: sky-mirror colour, deeper (darker) closer to the camera where the eye
    // looks *into* the water rather than across it.
    const closeness = unit(1 - z * 0.45);
    let colour = mixColor(shallow, deep, closeness * 0.75);
    const brightness = 0.78 + facing * 0.4 + surface * 0.16;
    colour = [colour[0] * brightness, colour[1] * brightness, colour[2] * brightness];

    // The glitter path. Its half-width grows with closeness because the same range
    // of wave slopes subtends a wider angle nearby.
    if (sunStrength > 0) {
      const pathWidth = 0.012 + closeness * 0.22;
      const across = Math.exp(-((u - sunU) * (u - sunU)) / (2 * pathWidth * pathWidth));
      // Individual glints: only the facets whose slope happens to point at the sun.
      const glintNoise = noise2(x * 42, z * 26, seed + 7);
      const glint = Math.pow(unit(glintNoise * 0.6 + surface * 0.4 + roughness * 0.25), 7);
      const specular = across * (glint * 3.4 + 0.12) * sunStrength * detail;
      colour = [
        colour[0] + sunColor[0] * specular,
        colour[1] + sunColor[1] * specular,
        colour[2] + sunColor[2] * specular,
      ];
    }
    return [colour[0], colour[1], colour[2], 1];
  };
};

/**
 * A wet-asphalt shader: a road plane holding smeared reflections.
 *
 * Wet ground reflects, but *vertically stretched and horizontally broken* — that
 * asymmetry is the whole look of a rain-soaked street at night. So the reflected
 * light sources are narrow in `x`, long in `z`, and chopped by ripples.
 *
 * @param {{horizonV?: number, asphalt: [number,number,number],
 *          lights?: Array<[number,number,number]>, wetness?: number,
 *          seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const wetStreetShader = (params) => {
  const {
    horizonV = 0.62,
    asphalt,
    lights = [
      [255, 60, 120],
      [70, 200, 255],
      [180, 100, 255],
      [255, 170, 60],
    ],
    wetness = 0.8,
    seed = 0,
  } = params;

  // A handful of light sources at fixed bearings, each with a colour and a width.
  const sources = Array.from({ length: 7 }, (_, i) => ({
    u: noise2(i * 3.7, seed * 0.3, seed),
    colour: lights[Math.floor(noise2(i * 5.1, 2.2, seed + 1) * lights.length) % lights.length],
    width: 0.006 + noise2(i * 2.9, 4.4, seed + 2) * 0.02,
    power: 0.5 + noise2(i * 6.3, 1.1, seed + 3),
  }));

  return (u, v) => {
    const ground = groundAt(u, v, horizonV);
    if (!ground) return [0, 0, 0, 0];
    const { z, x } = ground;
    const closeness = unit(1 - z * 0.4);

    // Asphalt: coarse aggregate texture, plus a slight brightening into the
    // distance where the road catches more of the sky.
    const grit = fbm(x * 30, z * 22, { octaves: 3, seed: seed + 11 });
    const base = 0.6 + (1 - closeness) * 0.5 + grit * 0.3;
    let colour = [asphalt[0] * base, asphalt[1] * base, asphalt[2] * base];

    // Ripples break the reflections up. Concentric-ish, moving outward from the
    // camera, so they run across the reflections rather than along them.
    const ripple = fbm(x * 8, z * 3.2, { octaves: 2, seed: seed + 19 });

    for (const source of sources) {
      // A reflection sits directly below its source, displaced by the ripple.
      const offset = (ripple - 0.5) * 0.06 * wetness * closeness;
      const across = Math.exp(
        -((u - source.u + offset) * (u - source.u + offset)) / (2 * source.width * source.width),
      );
      // Long in z: the streak persists all the way toward the camera, fading.
      const along = Math.pow(closeness, 0.6) * 0.8 + 0.2;
      // Chopped: the ripple gates the streak on and off in bands.
      const broken = 0.45 + 0.55 * Math.pow(unit(ripple * 1.4), 1.5);
      const amount = across * along * broken * wetness * source.power * 0.9;
      colour = [
        colour[0] + source.colour[0] * amount,
        colour[1] + source.colour[1] * amount,
        colour[2] + source.colour[2] * amount,
      ];
    }
    return [colour[0], colour[1], colour[2], 1];
  };
};

/**
 * A snow-field shader: a bright plane in perspective with drift and sastrugi.
 *
 * The inverse problem to asphalt — almost all of the information is in very low
 * contrast, so the shading has to be gentle or it turns to plastic.
 *
 * @param {{horizonV?: number, snow: [number,number,number],
 *          shadow?: [number,number,number], seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const snowFieldShader = (params) => {
  const { horizonV = 0.66, snow, shadow = [70, 88, 128], seed = 0 } = params;
  return (u, v) => {
    const ground = groundAt(u, v, horizonV);
    if (!ground) return [0, 0, 0, 0];
    const { z, x } = ground;
    const drift = fbm(x * 3.4, z * 2.1, { octaves: 3, seed });
    const step = 0.03;
    const slope =
      fbm(x * 3.4, (z + step) * 2.1, { octaves: 3, seed }) -
      fbm(x * 3.4, (z - step) * 2.1, { octaves: 3, seed });
    const facing = unit(0.5 + slope * 7);
    // Snow's shadows are blue (sky-lit) and its lights are neutral; that hue shift
    // does more for the read than any brightness change.
    const colour = mixColor(shadow, snow, unit(0.35 + facing * 0.55 + drift * 0.2));
    const fade = unit(1 - z * 0.12);
    return [colour[0] * (0.7 + fade * 0.4), colour[1] * (0.7 + fade * 0.4), colour[2] * (0.7 + fade * 0.4), 1];
  };
};
