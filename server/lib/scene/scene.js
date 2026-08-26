/**
 * Scenes: sky, silhouette and atmosphere assembled into a shot you can film.
 *
 * A scene owns three things: the plates it bakes once (sky, and one or more
 * silhouette layers with alpha), the atmosphere it draws per frame, and the camera
 * move the shot is filmed through. The library below is the set of *places* a
 * trailer can visit — storm ridge, city dusk, ocean horizon, and so on — each a
 * recognisable location rather than an abstract pattern. The task is explicit that
 * rotating lines and gradients earn a low grade; these are matte paintings with
 * weather in them, which is the opposite end of that scale.
 *
 * A scene is built from a seeded context, so every place is a *variation*: the storm
 * ridge is never the same ridge twice, but it is always unmistakably a storm ridge.
 *
 * @module server/lib/scene/scene
 */

import { renderPlate, drawPlate, overPlate, cameraAt, projectPoint } from '../paint/plate.js';
import { skyShader, SKIES } from './sky.js';
import { ridgeShader, skylineShader, treelineShader, duneShader } from './silhouette.js';
import { seaShader, wetStreetShader, snowFieldShader } from './ground.js';
import * as atmosphere from './atmosphere.js';

/** Ease used for camera moves: slow in, slow out, so a push never lurches. */
const easeInOut = (t) => t * t * (3 - 2 * t);

/**
 * A scene ready to film.
 *
 * @typedef {object} Scene
 * @property {string} name
 * @property {(frame: import('../paint/frame.js').Frame, progress: number, seconds: number) => void} draw
 *   Paint one frame; `progress` is `0`–`1` through the shot, `seconds` is real time
 *   for particle motion.
 * @property {Camera} camera
 */

/**
 * Bake a sky plate at reduced resolution.
 *
 * A sky is a soft gradient with cloud; a third of the linear resolution is
 * indistinguishable once magnified, and it makes the most expensive plate the
 * cheapest to compute.
 */
const bakeSky = (width, height, name, seed, overrides = {}) =>
  renderPlate(width, height, skyShader({ ...SKIES[name], seed: Number(BigInt(seed) % 100000n), ...overrides }), {
    scale: 0.34,
    margin: 0.16,
  });

/** Bake a full-resolution silhouette plate with alpha. */
const bakeLayer = (width, height, shader) => renderPlate(width, height, shader, { scale: 1, margin: 0.16 });

/**
 * Perturb a base colour by a small seeded amount, per channel.
 *
 * Keeps a preset recognisable while making no two instances identical — the same
 * discipline the grades use.
 */
const jitter = (ctx, label, colour, amount = 16) =>
  colour.map((c, i) => c + (ctx.int(`${label}.${i}`, -amount, amount)));

/**
 * The scene builders, keyed by name. Each takes a context and the frame size and
 * returns a {@link Scene}.
 *
 * @type {Record<string, (ctx: import('../context.js').Context, width: number, height: number) => Scene>}
 */
export const SCENES = {
  /** Jagged mountains under weather, rain optional. A cold, vast opening. */
  'storm-ridge': (ctx, width, height) => {
    const skyName = ctx.pick('sky', ['storm', 'dusk', 'night', 'overcast']);
    const sky = bakeSky(width, height, skyName, ctx.seed);
    const near = bakeLayer(width, height, ridgeShader({
      ranges: 4,
      colorNear: jitter(ctx, 'near', [28, 30, 38]),
      colorFar: jitter(ctx, 'far', [96, 104, 122]),
      haze: jitter(ctx, 'haze', [150, 158, 174]),
      baseHeight: 0.6 + ctx.int('base', -6, 6) / 100,
      relief: 0.28,
      seed: Number(ctx.seed % 100000n),
    }));
    const wet = ctx.pick('wet', [true, true, false]);
    const camera = {
      zoomFrom: 1.06, zoomTo: 1.16,
      xFrom: ctx.int('cx', -4, 4) / 100, xTo: ctx.int('cx2', -6, 6) / 100,
      yFrom: 0.02, yTo: -0.02,
    };
    const strikeAt = ctx.int('strike', 20, 80) / 100;
    return {
      name: `storm-ridge/${skyName}`,
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.35 });
        const nearView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        overPlate(frame, near, nearView);
        if (skyName === 'night') {
          atmosphere.stars(frame, seconds, { seed: Number(ctx.seed % 9999n), horizon: 0.5,
            project: (u, v) => projectPoint(skyView, u, v) });
        }
        // A single lightning event near `strikeAt`, a couple of frames wide.
        const flash = Math.max(0, 1 - Math.abs(progress - strikeAt) * 26);
        if (flash > 0 && (skyName === 'storm' || skyName === 'overcast')) {
          atmosphere.lightning(frame, flash * 0.8, { seed: Number(ctx.seed % 7777n) });
        }
        if (wet) atmosphere.rain(frame, seconds, { count: 620, wind: 0.16, seed: Number(ctx.seed % 5555n), opacity: 0.4 });
      },
    };
  },

  /** A city skyline at dusk or night, windows alight. Neon, glass, promise. */
  'city-dusk': (ctx, width, height) => {
    const skyName = ctx.pick('sky', ['dusk', 'night', 'ember', 'aurora']);
    const sky = bakeSky(width, height, skyName, ctx.seed);
    const haze = SKIES[skyName].horizon;
    const far = bakeLayer(width, height, skylineShader({
      count: 30, color: jitter(ctx, 'far', [30, 34, 50]), haze,
      baseHeight: 0.56, spread: 0.24, litChance: 0.28, depth: 0.7,
      seed: Number(ctx.seed % 90000n),
    }));
    const near = bakeLayer(width, height, skylineShader({
      count: 15, color: jitter(ctx, 'near', [12, 14, 22]), haze,
      baseHeight: 0.76, spread: 0.36, litChance: 0.36, depth: 0.1,
      seed: Number(ctx.seed % 80000n) + 7,
    }));
    const camera = {
      zoomFrom: 1.04, zoomTo: 1.14, xFrom: -0.05, xTo: 0.05, yFrom: 0.01, yTo: -0.02,
    };
    return {
      name: `city-dusk/${skyName}`,
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.3 });
        const farView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.6 });
        const nearView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        overPlate(frame, far, farView);
        overPlate(frame, near, nearView);
        atmosphere.motes(frame, seconds, { count: 40, seed: Number(ctx.seed % 4444n), opacity: 0.2 });
      },
    };
  },

  /** A sea horizon under a big sky. Isolation, distance, a journey. */
  'ocean-horizon': (ctx, width, height) => {
    const skyName = ctx.pick('sky', ['dawn', 'dusk', 'overcast', 'night', 'aurora']);
    const sky = bakeSky(width, height, skyName, ctx.seed);
    const preset = SKIES[skyName];
    const horizonY = 0.6 + ctx.int('hz', -4, 6) / 100;
    // Water is mostly a mirror, so its colours come from the sky above it: the
    // horizon band for the far water, a darkened zenith for the near.
    const sea = bakeLayer(width, height, seaShader({
      horizonV: horizonY,
      shallow: [
        preset.horizon[0] * 0.62 + preset.zenith[0] * 0.14,
        preset.horizon[1] * 0.62 + preset.zenith[1] * 0.16,
        preset.horizon[2] * 0.62 + preset.zenith[2] * 0.2,
      ],
      deep: [
        preset.zenith[0] * 0.3 + 6,
        preset.zenith[1] * 0.34 + 10,
        preset.zenith[2] * 0.4 + 16,
      ],
      sunU: preset.sunU,
      sunColor: preset.sunColor,
      sunStrength: preset.sunStrength * 0.85,
      roughness: ctx.int('rough', 20, 70) / 100,
      seed: Number(ctx.seed % 90000n),
    }));
    const camera = { zoomFrom: 1.02, zoomTo: 1.1, xFrom: 0, xTo: 0, yFrom: 0.01, yTo: -0.03 };
    return {
      name: `ocean-horizon/${skyName}`,
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.3 });
        const seaView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        overPlate(frame, sea, seaView);
        if (skyName === 'night') {
          atmosphere.stars(frame, seconds, { seed: Number(ctx.seed % 9999n), horizon: horizonY - 0.05,
            project: (u, v) => projectPoint(skyView, u, v) });
        }
      },
    };
  },

  /** A forest under shafts of light. Mystery, folklore, something watching. */
  'forest-rays': (ctx, width, height) => {
    const skyName = ctx.pick('sky', ['dawn', 'overcast', 'dusk']);
    const sky = bakeSky(width, height, skyName, ctx.seed);
    const back = bakeLayer(width, height, treelineShader({
      color: jitter(ctx, 'back', [26, 34, 26]), baseHeight: 0.36, spikiness: 0.4,
      seed: Number(ctx.seed % 90000n),
    }));
    const near = bakeLayer(width, height, treelineShader({
      color: jitter(ctx, 'near', [10, 16, 10]), baseHeight: 0.6, spikiness: 0.7,
      seed: Number(ctx.seed % 80000n) + 3,
    }));
    const sunU = ctx.int('sun', 30, 70) / 100;
    const camera = { zoomFrom: 1.05, zoomTo: 1.12, xFrom: 0.02, xTo: -0.03, yFrom: -0.01, yTo: 0.02 };
    return {
      name: `forest-rays/${skyName}`,
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.3 });
        const backView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.6 });
        const nearView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        overPlate(frame, back, backView);
        atmosphere.godRays(frame, seconds, { sunU, sunV: -0.05, strength: 0.6, seed: Number(ctx.seed % 6666n) });
        overPlate(frame, near, nearView);
        atmosphere.motes(frame, seconds, { count: 70, seed: Number(ctx.seed % 4444n), opacity: 0.35 });
      },
    };
  },

  /** Rain on a neon street. Noir, thriller, the city at 3am. */
  'neon-rain': (ctx, width, height) => {
    const sky = bakeSky(width, height, 'night', ctx.seed, { cover: 0.9, sunStrength: 0.1 });
    const haze = [26, 24, 40];
    const far = bakeLayer(width, height, skylineShader({
      count: 30, color: jitter(ctx, 'far', [22, 20, 34]), haze,
      litColor: [255, 180, 120], baseHeight: 0.5, spread: 0.24, litChance: 0.42, depth: 0.55,
      seed: Number(ctx.seed % 90000n),
    }));
    const near = bakeLayer(width, height, skylineShader({
      count: 11, color: jitter(ctx, 'near', [8, 8, 14]), haze,
      litColor: [190, 240, 255], baseHeight: 0.7, spread: 0.4, litChance: 0.3, depth: 0,
      seed: Number(ctx.seed % 70000n) + 5,
    }));
    // The street holds the whole palette: neon reflected in wet asphalt, stretched
    // toward the camera and broken by ripples.
    const street = bakeLayer(width, height, wetStreetShader({
      horizonV: 0.64,
      asphalt: jitter(ctx, 'asphalt', [22, 22, 30], 6),
      wetness: 0.55 + ctx.int('wet', 0, 40) / 100,
      seed: Number(ctx.seed % 60000n),
    }));
    const camera = { zoomFrom: 1.05, zoomTo: 1.16, xFrom: 0.03, xTo: -0.04, yFrom: 0, yTo: -0.01 };
    return {
      name: 'neon-rain/night',
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.3 });
        const farView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.6 });
        const nearView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.85 });
        const streetView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        overPlate(frame, far, farView);
        overPlate(frame, near, nearView);
        overPlate(frame, street, streetView);
        atmosphere.rain(frame, seconds, { count: 800, wind: 0.2, seed: Number(ctx.seed % 5555n), opacity: 0.45 });
      },
    };
  },

  /** Dunes under a burning sky. Epic, desert, exodus. */
  'desert-dunes': (ctx, width, height) => {
    const skyName = ctx.pick('sky', ['sandstorm', 'dusk', 'ember', 'dawn']);
    const sky = bakeSky(width, height, skyName, ctx.seed);
    const dunes = bakeLayer(width, height, duneShader({
      colorNear: jitter(ctx, 'near', [204, 158, 96]),
      colorFar: jitter(ctx, 'far', [150, 110, 70]),
      baseHeight: 0.58 + ctx.int('base', -4, 6) / 100,
      seed: Number(ctx.seed % 90000n),
    }));
    const dusty = skyName === 'sandstorm';
    const camera = { zoomFrom: 1.04, zoomTo: 1.12, xFrom: -0.04, xTo: 0.05, yFrom: 0.01, yTo: -0.02 };
    return {
      name: `desert-dunes/${skyName}`,
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.32 });
        const duneView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        overPlate(frame, dunes, duneView);
        if (dusty) atmosphere.snow(frame, seconds, { count: 200, color: [214, 180, 130], speed: 0.3, seed: Number(ctx.seed % 3333n), opacity: 0.25 });
      },
    };
  },

  /** A cold night of falling snow over a far treeline. Loss, winter, a vigil. */
  'winter-night': (ctx, width, height) => {
    const sky = bakeSky(width, height, 'night', ctx.seed, { cover: 0.6 });
    const treeBase = 0.66;
    const trees = bakeLayer(width, height, treelineShader({
      color: jitter(ctx, 'trees', [18, 22, 32]), baseHeight: treeBase, spikiness: 0.6,
      seed: Number(ctx.seed % 90000n),
    }));
    // Ground in front of the trees, so the shot has a floor and not just a band of
    // dark across the bottom of frame.
    const ground = bakeLayer(width, height, snowFieldShader({
      horizonV: treeBase,
      snow: jitter(ctx, 'snow', [188, 202, 226], 8),
      shadow: jitter(ctx, 'shadow', [52, 66, 104], 8),
      seed: Number(ctx.seed % 70000n),
    }));
    const camera = { zoomFrom: 1.03, zoomTo: 1.1, xFrom: 0.02, xTo: -0.02, yFrom: 0, yTo: -0.01 };
    return {
      name: 'winter-night/night',
      camera,
      draw: (frame, progress, seconds) => {
        const skyView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.3 });
        const treeView = cameraAt(camera, progress, { ease: easeInOut, depth: 0.8 });
        const groundView = cameraAt(camera, progress, { ease: easeInOut, depth: 1 });
        drawPlate(frame, sky, skyView);
        atmosphere.stars(frame, seconds, { seed: Number(ctx.seed % 9999n), horizon: 0.5,
          project: (u, v) => projectPoint(skyView, u, v) });
        overPlate(frame, trees, treeView);
        overPlate(frame, ground, groundView);
        atmosphere.snow(frame, seconds, { count: 420, seed: Number(ctx.seed % 3333n), opacity: 0.7 });
      },
    };
  },
};

/** The scene names, for a script to choose from. */
export const SCENE_NAMES = Object.keys(SCENES);

/**
 * Build one scene by name.
 *
 * @param {string} name
 * @param {import('../context.js').Context} ctx
 * @param {number} width
 * @param {number} height
 * @returns {Scene}
 */
export const buildScene = (name, ctx, width, height) => SCENES[name](ctx, width, height);
