/**
 * Silhouettes: the dark shapes that name a place.
 *
 * A sky is mood; a silhouette is *where you are*. A jagged ridge against dusk is a
 * mountain film; a notched skyline against the same dusk is a city one. All of them
 * are the same idea — a crest height per column, everything below it filled — so
 * they share one structure and differ in how the crest is drawn and how the mass
 * below it is shaded.
 *
 * That shading is what separates a matte painting from a cut-out. Four things do
 * most of the work, and every shader here uses them:
 *
 *   - **aerial perspective** — distant masses wash toward the haze colour, which is
 *     the single strongest depth cue there is;
 *   - **slope shading** — the crest's own derivative stands in for a surface normal,
 *     so faces turned toward the light are lit and faces turned away are not;
 *   - **rim light** — a thin bright band just under the crest, where a backlit ridge
 *     catches the sky;
 *   - **texture** — fractal detail across the mass, so it is rock rather than paint.
 *
 * These bake into translucent plates: opaque below the crest, clear above, with a
 * hair of anti-aliasing across it. That alpha is what lets a ridge sit *in front of*
 * a sky on its own parallax layer.
 *
 * @module server/lib/scene/silhouette
 */

import { mixColor } from '../paint/frame.js';
import { fbm, noise2, profile, ridged } from '../paint/noise.js';

/**
 * Coverage of a column at height `v` given a crest height, with a soft edge.
 *
 * A couple of pixels' worth of softness in `v` — enough to anti-alias the crest
 * without turning it to fog.
 */
const below = (v, crest, soft = 0.004) => {
  if (v > crest + soft) return 1;
  if (v < crest - soft) return 0;
  return (v - (crest - soft)) / (2 * soft);
};

/** Clamp to `[0, 1]`, inline-cheap. */
const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * A ridgeline shader: layered mountain crests receding into haze.
 *
 * Ranges are tested near-to-far and the first one covering the pixel wins, which is
 * what makes a near ridge occlude the range behind it rather than the other way
 * round.
 *
 * @param {{ranges?: number, colorNear: [number,number,number],
 *          colorFar: [number,number,number], haze: [number,number,number],
 *          rim?: [number,number,number], sunU?: number,
 *          baseHeight?: number, relief?: number, seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const ridgeShader = (params) => {
  const {
    ranges = 4,
    colorNear,
    colorFar,
    haze,
    rim = [210, 220, 240],
    sunU = 0.6,
    baseHeight = 0.62,
    relief = 0.26,
    seed = 0,
  } = params;

  // Per-range constants, computed once so the per-pixel path is arithmetic only.
  // Index 0 is nearest; higher indices sit further back and higher in frame.
  const layers = Array.from({ length: ranges }, (_, i) => {
    const depth = ranges === 1 ? 0 : i / (ranges - 1);
    return {
      depth,
      frequency: 2.4 + i * 1.9,
      amplitude: relief * (1 - depth * 0.42),
      base: baseHeight - depth * 0.15,
      phase: seed * 0.31 + i * 17.7,
      sharpness: 0.75 - depth * 0.3,
      body: mixColor(colorNear, colorFar, depth),
      seed: seed + i * 101,
    };
  });

  /** Crest height of one range at `u`. Sampled repeatedly, so kept tight. */
  const crestOf = (layer, u) => {
    const jagged = ridged(u * layer.frequency + layer.phase, 3.3, { octaves: 3, seed: layer.seed });
    const rolling = profile(u * layer.frequency * 0.45 + layer.phase, { octaves: 3, seed: layer.seed + 40 });
    return layer.base - (jagged * layer.sharpness + rolling * (1 - layer.sharpness)) * layer.amplitude;
  };

  return (u, v) => {
    for (const layer of layers) {
      const crest = crestOf(layer, u);
      const coverage = below(v, crest, 0.004 + layer.depth * 0.006);
      if (coverage <= 0) continue;

      // Slope from the crest's own derivative: a west-facing flank and an
      // east-facing one shade differently, which is what gives a range its form.
      const step = 0.006;
      const slope = (crestOf(layer, u + step) - crestOf(layer, u - step)) / (2 * step);
      const facing = unit(0.5 + slope * (sunU > 0.5 ? 0.9 : -0.9));

      // Rock texture, stretched vertically so it reads as strata rather than spots.
      const texture = fbm(u * 26, v * 9 + layer.depth * 5, { octaves: 3, seed: layer.seed + 7 });

      // Depth into the mass: the further below the crest, the darker (less sky
      // bounce reaches it) — and the closer the range, the stronger that falloff.
      const into = unit((v - crest) * (3.2 - layer.depth * 1.6));

      let brightness = 0.72 + facing * 0.5 + texture * 0.22 - into * 0.3;

      // Rim light: a thin band under the crest catching the sky behind it. Only
      // worth it on the nearer ranges, where the eye is looking for the edge.
      const rimBand = Math.exp(-Math.abs(v - crest) * 420) * (1 - layer.depth) * 0.9;

      const body = layer.body;
      let colour = [body[0] * brightness, body[1] * brightness, body[2] * brightness];
      // Aerial perspective, applied last so it washes out the detail as well as
      // the base colour — which is exactly what distance does.
      colour = mixColor(colour, haze, layer.depth * 0.7);
      colour = [
        colour[0] + rim[0] * rimBand,
        colour[1] + rim[1] * rimBand,
        colour[2] + rim[2] * rimBand,
      ];
      return [colour[0], colour[1], colour[2], coverage];
    }
    return [0, 0, 0, 0];
  };
};

/**
 * A skyline shader: a city's notched profile with lit windows.
 *
 * Buildings are *enumerated*, not hashed per column. Hashing a column band makes
 * every building the same width and puts their window rows on one shared grid, which
 * reads instantly as a texture; a real skyline is a sequence of blocks of differing
 * width, each with its own floor height and its own window pattern. Enumerating them
 * costs one small array and fixes both.
 *
 * @param {{count?: number, color: [number,number,number],
 *          litColor?: [number,number,number], haze?: [number,number,number],
 *          baseHeight?: number, spread?: number, litChance?: number,
 *          depth?: number, seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const skylineShader = (params) => {
  const {
    count = 22,
    color,
    litColor = [255, 206, 130],
    haze = [40, 46, 64],
    baseHeight = 0.68,
    spread = 0.3,
    litChance = 0.34,
    depth = 0,
    seed = 0,
  } = params;

  // Lay the city out once: variable widths summing to a little over the frame, so
  // the row of blocks always reaches both edges.
  const buildings = [];
  {
    let x = -0.06;
    for (let i = 0; x < 1.06; i += 1) {
      const width = 0.018 + noise2(i * 3.1, seed * 0.7, seed) * (1.4 / count);
      const tall = Math.pow(noise2(i * 1.7 + 5, seed * 0.3, seed + 11), 1.5);
      const top = baseHeight - tall * spread;
      buildings.push({
        x0: x,
        x1: x + width,
        top,
        // Each building gets its own floor height and column count, so no two share
        // a window grid.
        floors: 5 + Math.floor(noise2(i * 2.3, 7.7, seed + 3) * 9),
        columns: 2 + Math.floor(noise2(i * 4.1, 2.2, seed + 4) * 4),
        shade: 0.72 + noise2(i * 5.9, 1.1, seed + 5) * 0.5,
        seed: seed + i * 977,
        // A slight setback tint so adjacent blocks separate even when equally tall.
        recess: noise2(i * 7.3, 3.3, seed + 6),
      });
      x += width + 0.001;
    }
  }

  return (u, v) => {
    // Front-to-back within the row is meaningless (they share a ground line), so
    // the first block containing `u` is the answer.
    for (const building of buildings) {
      if (u < building.x0 || u >= building.x1) continue;
      const coverage = below(v, building.top, 0.0022);
      if (coverage <= 0) return [0, 0, 0, 0];

      const body = mixColor(
        [color[0] * building.shade, color[1] * building.shade, color[2] * building.shade],
        haze,
        depth * 0.55 + building.recess * 0.12,
      );

      // Windows: a per-building grid, inset from the edges so the block keeps a
      // visible frame, and only lit some of the time.
      const localU = (u - building.x0) / (building.x1 - building.x0);
      const height = building.top;
      const localV = (v - height) / Math.max(0.02, 1 - height);
      const column = Math.floor(localU * building.columns);
      const floor = Math.floor(localV * building.floors * 3);
      const inColumn = localU * building.columns - column;
      const inFloor = localV * building.floors * 3 - floor;
      const onPane = inColumn > 0.28 && inColumn < 0.78 && inFloor > 0.22 && inFloor < 0.66;
      if (onPane && v > height + 0.008) {
        const roll = noise2(column * 13.7 + building.seed, floor * 5.3, building.seed);
        if (roll < litChance) {
          // Warm, and not all the same warmth — offices, lamps, blinds.
          const warm = 0.55 + noise2(column, floor, building.seed + 1) * 0.65;
          const dim = 1 - depth * 0.5;
          return [litColor[0] * warm * dim, litColor[1] * warm * dim, litColor[2] * warm * dim, 1];
        }
        // An unlit pane is *darker* than its wall — that contrast is what makes the
        // grid read as glass instead of as decoration.
        return [body[0] * 0.66, body[1] * 0.66, body[2] * 0.66, coverage];
      }
      return [body[0], body[1], body[2], coverage];
    }
    return [0, 0, 0, 0];
  };
};

/**
 * A treeline shader: a forest's soft, spiky upper edge with trunks below.
 *
 * Higher-frequency and more irregular than a ridge, and much closer, so it gets no
 * aerial perspective — but it does get vertical trunk structure, without which a
 * forest is an indistinct dark band.
 *
 * @param {{color: [number,number,number], baseHeight?: number, spikiness?: number,
 *          trunks?: number, seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const treelineShader = (params) => {
  const { color, baseHeight = 0.52, spikiness = 0.5, trunks = 0.5, seed = 0 } = params;
  return (u, v) => {
    const coarse = profile(u * 3.4 + seed, { octaves: 2, seed });
    const spikes = ridged(u * 52 + seed * 3, 1.7, { octaves: 2, seed: seed + 2 });
    const crest = baseHeight - coarse * 0.13 - spikes * 0.06 * spikiness;
    const coverage = below(v, crest, 0.0028);
    if (coverage <= 0) return [0, 0, 0, 0];

    // Canopy texture: clumped, so the mass has lit tops and dark hollows.
    const canopy = fbm(u * 34, v * 22, { octaves: 3, seed: seed + 7 });
    // Trunks: narrow vertical bands, only below the canopy line.
    const trunkBand = Math.pow(Math.abs(Math.sin(u * 180 + noise2(u * 8, 1, seed + 9) * 3)), 22);
    const belowCanopy = unit((v - crest) * 7 - 0.6);
    const trunk = trunkBand * belowCanopy * trunks;

    const brightness = 0.7 + canopy * 0.45 - belowCanopy * 0.25 - trunk * 0.35;
    return [color[0] * brightness, color[1] * brightness, color[2] * brightness, coverage];
  };
};

/**
 * A dune shader: smooth, overlapping sand crests with lit and shadowed faces.
 *
 * Low relief and high softness — the opposite of a ridge. Sand's character is almost
 * entirely in the *shading*: the crests themselves are gentle, and what the eye
 * reads is the knife-edge between a sunlit face and a shadowed one, plus wind
 * ripples running across the slope.
 *
 * @param {{colorNear: [number,number,number], colorFar: [number,number,number],
 *          haze?: [number,number,number], sunU?: number, baseHeight?: number,
 *          seed?: number}} params
 * @returns {(u: number, v: number) => [number, number, number, number]}
 */
export const duneShader = (params) => {
  const {
    colorNear,
    colorFar,
    haze = [206, 180, 140],
    sunU = 0.6,
    baseHeight = 0.62,
    seed = 0,
  } = params;
  const layers = 4;
  const shapes = Array.from({ length: layers }, (_, i) => ({
    depth: i / (layers - 1),
    frequency: 1.3 + i * 1.05,
    phase: i * 7.3 + seed * 0.21,
    base: baseHeight - (i / (layers - 1)) * 0.13,
    amplitude: 0.11 - (i / (layers - 1)) * 0.045,
    seed: seed + i * 53,
  }));
  const crestOf = (shape, u) =>
    shape.base - profile(u * shape.frequency + shape.phase, { octaves: 2, seed: shape.seed }) * shape.amplitude;

  return (u, v) => {
    for (const shape of shapes) {
      const crest = crestOf(shape, u);
      const coverage = below(v, crest, 0.004);
      if (coverage <= 0) continue;

      const step = 0.008;
      const slope = (crestOf(shape, u + step) - crestOf(shape, u - step)) / (2 * step);
      // Sand has a hard terminator: the lit face is bright, the lee face falls off
      // fast. A steep power on the facing term gives that edge.
      const facing = unit(0.5 + slope * (sunU > 0.5 ? 1.4 : -1.4));
      const lit = Math.pow(facing, 1.6);

      // Wind ripples: fine, running roughly along the contour, fading with depth.
      const ripple =
        Math.sin((u * 150 + v * 40 + profile(u * 4, { octaves: 2, seed: shape.seed + 3 }) * 20)) *
        0.5 +
        0.5;
      const rippleAmount = (1 - shape.depth) * 0.09;

      const brightness = 0.62 + lit * 0.62 + ripple * rippleAmount;
      const body = mixColor(colorNear, colorFar, shape.depth);
      let colour = [body[0] * brightness, body[1] * brightness, body[2] * brightness];
      colour = mixColor(colour, haze, shape.depth * 0.45);
      return [colour[0], colour[1], colour[2], coverage];
    }
    return [0, 0, 0, 0];
  };
};
