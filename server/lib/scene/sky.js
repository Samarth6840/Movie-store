/**
 * Sky: the layer that sets the hour and the weather.
 *
 * Almost every exterior shot in the library is built the same way — a sky behind a
 * silhouette — so the sky is written once, parameterised, and shared. That is also
 * where most of a shot's *mood* comes from: the same ridge under a storm sky and
 * under a dawn sky are two different pictures, and it costs one parameter set
 * rather than a second scene.
 *
 * @module server/lib/scene/sky
 */

import { mixColor } from '../paint/frame.js';
import { fbm, turbulence, warp } from '../paint/noise.js';

/**
 * @typedef {object} SkyParams
 * @property {[number, number, number]} zenith Colour at the top of frame.
 * @property {[number, number, number]} horizon Colour at the horizon.
 * @property {[number, number, number]} cloud Lit side of the cloud.
 * @property {[number, number, number]} cloudShadow Unlit side.
 * @property {number} cover How much of the sky the clouds take, `0`–`1`.
 * @property {number} softness Above `0.5` gives billows, below gives torn wisps.
 * @property {number} sunU Horizontal position of the light source.
 * @property {number} sunV Vertical position; above `1` puts it below the horizon.
 * @property {[number, number, number]} sunColor
 * @property {number} sunStrength
 * @property {number} scale Cloud size; small values give a big, close sky.
 * @property {number} seed
 */

/**
 * Build a sky shader.
 *
 * Returns a function rather than a bitmap so the caller decides the resolution —
 * skies are usually baked at a third scale and magnified, since a gradient with
 * soft cloud has nothing that survives being sampled finely.
 *
 * @param {SkyParams} params
 * @returns {(u: number, v: number) => [number, number, number]}
 */
export const skyShader = (params) => {
  const {
    zenith,
    horizon,
    cloud,
    cloudShadow,
    cover = 0.5,
    softness = 0.5,
    sunU = 0.5,
    sunV = 0.8,
    sunColor = [255, 226, 180],
    sunStrength = 0.6,
    scale = 3,
    seed = 0,
  } = params;

  return (u, v) => {
    // The gradient is biased toward the horizon: real skies hold their zenith
    // colour across most of the dome and change quickly near the ground.
    const height = Math.pow(Math.max(0, Math.min(1, v)), 0.7);
    const base = mixColor(zenith, horizon, height);

    // Warping before sampling is what turns a texture into weather.
    const [wu, wv] = warp(u * scale, v * scale * 1.6, 0.35 + softness * 0.4, seed);
    const body = softness > 0.5
      ? fbm(wu, wv, { octaves: 5, seed, gain: 0.55 })
      : turbulence(wu, wv, { octaves: 5, seed });

    // Clouds thin out toward the horizon, where they are seen edge-on.
    const density = Math.max(0, body - (1 - cover)) / Math.max(0.05, cover);
    const mass = Math.min(1, density * (1 - height * 0.45) * 1.6);

    // A second, higher-frequency sample stands in for self-shadowing: where the
    // cloud is thickening upward it catches light, elsewhere it sits in shade.
    const lit = fbm(wu * 2.1 + 3.7, wv * 2.1, { octaves: 3, seed: seed + 11 });
    const shade = Math.min(1, Math.max(0, (lit - 0.35) * 1.9));
    const cloudColour = mixColor(cloudShadow, cloud, shade);

    let colour = mixColor(base, cloudColour, mass);

    // Light from the sun position: a broad glow plus a tight core, both falling off
    // with distance. Cloud in front of the sun scatters it, so the glow is *added*
    // through the cloud rather than being occluded by it.
    if (sunStrength > 0) {
      const du = (u - sunU) * 1.7;
      const dv = v - sunV;
      const distance = Math.sqrt(du * du + dv * dv);
      const glow = Math.exp(-distance * 3.2) * 0.8 + Math.exp(-distance * 11) * 1.4;
      const scatter = 1 - mass * 0.35;
      colour = [
        colour[0] + sunColor[0] * glow * sunStrength * scatter,
        colour[1] + sunColor[1] * glow * sunStrength * scatter,
        colour[2] + sunColor[2] * glow * sunStrength * scatter,
      ];
    }
    return colour;
  };
};

/**
 * Sky presets, by hour and weather.
 *
 * A scene picks one of these and the script perturbs it, so a seed lands near a
 * look rather than exactly on it. Keeping them named and separate from the scenes
 * means "storm ridge at dawn" and "storm ridge at night" cost nothing extra.
 *
 * @type {Record<string, Omit<SkyParams, 'seed'>>}
 */
export const SKIES = {
  storm: {
    zenith: [26, 30, 40],
    horizon: [78, 82, 92],
    cloud: [120, 124, 136],
    cloudShadow: [30, 33, 44],
    cover: 0.72,
    softness: 0.3,
    sunU: 0.62,
    sunV: 0.74,
    sunColor: [200, 210, 235],
    sunStrength: 0.3,
    scale: 2.6,
  },
  dusk: {
    zenith: [26, 38, 78],
    horizon: [232, 132, 74],
    cloud: [250, 176, 120],
    cloudShadow: [72, 52, 78],
    cover: 0.5,
    softness: 0.65,
    sunU: 0.5,
    sunV: 0.86,
    sunColor: [255, 186, 110],
    sunStrength: 0.85,
    scale: 3.1,
  },
  dawn: {
    zenith: [58, 74, 122],
    horizon: [244, 196, 158],
    cloud: [255, 214, 190],
    cloudShadow: [96, 92, 124],
    cover: 0.42,
    softness: 0.7,
    sunU: 0.36,
    sunV: 0.82,
    sunColor: [255, 224, 176],
    sunStrength: 0.75,
    scale: 3.4,
  },
  night: {
    zenith: [6, 9, 20],
    horizon: [22, 30, 54],
    cloud: [46, 54, 82],
    cloudShadow: [10, 13, 26],
    cover: 0.38,
    softness: 0.6,
    sunU: 0.72,
    sunV: 0.24,
    sunColor: [150, 176, 226],
    sunStrength: 0.34,
    scale: 2.8,
  },
  overcast: {
    zenith: [128, 134, 142],
    horizon: [186, 190, 196],
    cloud: [206, 210, 216],
    cloudShadow: [104, 110, 120],
    cover: 0.85,
    softness: 0.72,
    sunU: 0.5,
    sunV: 0.3,
    sunColor: [220, 226, 234],
    sunStrength: 0.18,
    scale: 2.2,
  },
  ember: {
    zenith: [48, 16, 14],
    horizon: [186, 62, 28],
    cloud: [226, 108, 46],
    cloudShadow: [58, 20, 18],
    cover: 0.66,
    softness: 0.4,
    sunU: 0.5,
    sunV: 0.92,
    sunColor: [255, 148, 62],
    sunStrength: 0.7,
    scale: 2.5,
  },
  aurora: {
    zenith: [8, 14, 32],
    horizon: [30, 62, 78],
    cloud: [66, 190, 158],
    cloudShadow: [16, 40, 60],
    cover: 0.44,
    softness: 0.75,
    sunU: 0.44,
    sunV: 0.36,
    sunColor: [110, 240, 200],
    sunStrength: 0.42,
    scale: 2.0,
  },
  sandstorm: {
    zenith: [128, 96, 56],
    horizon: [214, 172, 112],
    cloud: [226, 190, 138],
    cloudShadow: [110, 82, 48],
    cover: 0.8,
    softness: 0.45,
    sunU: 0.58,
    sunV: 0.6,
    sunColor: [255, 216, 150],
    sunStrength: 0.5,
    scale: 2.4,
  },
};

/** The preset names, for a script to draw from. */
export const SKY_NAMES = Object.keys(SKIES);
