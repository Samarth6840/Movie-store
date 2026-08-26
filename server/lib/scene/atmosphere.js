/**
 * Atmosphere: the moving particles and light that sit over a scene.
 *
 * The plates are still paintings; these are what move within a held shot. Rain and
 * snow give a storm its violence, embers give a fire its heat, stars and motes give
 * a still night something alive in it. They are drawn per frame, after the plates,
 * so they can respond to the frame index while the expensive imagery stays baked.
 *
 * Every particle field is a *deterministic function of an index and the frame*, not
 * a simulated system with state. Particle 40 is wherever the seed and the clock say
 * it is; there is nothing to step, so any frame can be drawn on its own and the
 * whole thing reproduces exactly.
 *
 * @module server/lib/scene/atmosphere
 */

import { addLight, blendPixel } from '../paint/frame.js';
import { noise2 } from '../paint/noise.js';

/** Deterministic `[0,1)` hash of an integer particle index and a salt. */
const rand = (index, salt) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Fall of rain: bright, near-vertical streaks driven downward and across.
 *
 * Streaks wrap in `[0, 1)` so the field is endless, and each carries its own speed
 * and length, because rain photographed with a slow shutter is a spread of streak
 * lengths, not a uniform hatch. `wind` shears the whole field.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} t Seconds into the shot (or any monotone clock).
 * @param {{count?: number, wind?: number, color?: [number,number,number],
 *          speed?: number, seed?: number, opacity?: number}} [options]
 */
export const rain = (frame, t, { count = 500, wind = 0.12, color = [180, 196, 220], speed = 1.1, seed = 0, opacity = 0.5 } = {}) => {
  const { width, height } = frame;
  for (let i = 0; i < count; i += 1) {
    const columnSeed = rand(i, seed + 1);
    const fall = speed * (0.6 + rand(i, seed + 2) * 0.8);
    const length = height * (0.03 + rand(i, seed + 3) * 0.06);
    const phase = (columnSeed + t * fall) % 1;
    const y = phase * (height + length) - length;
    const x = (rand(i, seed + 4) + phase * wind) % 1 * width;
    const dx = wind * length;
    const steps = Math.ceil(length);
    for (let s = 0; s < steps; s += 1) {
      const f = s / steps;
      blendPixel(frame, Math.round(x + dx * f), Math.round(y + length * f), color, opacity * (1 - f) * 0.9);
    }
  }
};

/**
 * Fall of snow: slow drifting flecks with a horizontal sway.
 *
 * Each flake sways on its own sine so the field shimmers rather than sliding as a
 * sheet, and nearer (larger, brighter) flakes fall faster — a cheap depth cue.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} t
 * @param {{count?: number, color?: [number,number,number], speed?: number,
 *          seed?: number, opacity?: number}} [options]
 */
export const snow = (frame, t, { count = 300, color = [235, 240, 250], speed = 0.12, seed = 0, opacity = 0.7 } = {}) => {
  const { width, height } = frame;
  for (let i = 0; i < count; i += 1) {
    const depth = rand(i, seed + 5); // 0 far, 1 near
    const fall = speed * (0.5 + depth);
    const phase = (rand(i, seed + 6) + t * fall) % 1;
    const y = phase * height;
    const sway = Math.sin(t * (1 + depth * 2) + i) * (6 + depth * 14);
    const x = (rand(i, seed + 7) * width + sway + width) % width;
    const size = 0.5 + depth * 1.8;
    const bright = opacity * (0.4 + depth * 0.6);
    blendPixel(frame, Math.round(x), Math.round(y), color, bright);
    if (size > 1.2) {
      blendPixel(frame, Math.round(x) + 1, Math.round(y), color, bright * 0.6);
      blendPixel(frame, Math.round(x), Math.round(y) + 1, color, bright * 0.6);
    }
  }
};

/**
 * Rising embers: warm motes that drift up and flicker out.
 *
 * The signature of anything burning off-screen. They accelerate upward slightly and
 * fade as they rise, and they are drawn as *light* so they glow against a dark
 * plate rather than sitting on it as dots.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} t
 * @param {{count?: number, color?: [number,number,number], speed?: number,
 *          seed?: number, strength?: number}} [options]
 */
export const embers = (frame, t, { count = 120, color = [255, 150, 60], speed = 0.14, seed = 0, strength = 1 } = {}) => {
  const { width, height } = frame;
  for (let i = 0; i < count; i += 1) {
    const rise = speed * (0.5 + rand(i, seed + 8));
    const phase = (rand(i, seed + 9) + t * rise) % 1;
    const y = height - phase * height * 1.05;
    const drift = Math.sin(t * (0.8 + rand(i, seed + 10)) + i * 2) * 24 * phase;
    const x = rand(i, seed + 11) * width + drift;
    const flicker = 0.5 + 0.5 * Math.sin(t * 14 + i * 7);
    const life = Math.sin(phase * Math.PI); // brightest mid-flight
    const amount = strength * life * flicker * 0.5;
    addLight(frame, Math.round(x), Math.round(y), color, amount);
    addLight(frame, Math.round(x) + 1, Math.round(y), color, amount * 0.5);
    addLight(frame, Math.round(x), Math.round(y) - 1, color, amount * 0.5);
  }
};

/**
 * A field of stars, fixed to the plate and twinkling.
 *
 * Positions come from the seed, so the sky is the same every frame; only brightness
 * breathes. Drawn as light, so a bright star blooms a little.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} t
 * @param {{count?: number, seed?: number, horizon?: number, project?: (u:number,v:number)=>{u:number,v:number}}} [options]
 */
export const stars = (frame, t, { count = 260, seed = 0, horizon = 0.7, project } = {}) => {
  const { width, height } = frame;
  for (let i = 0; i < count; i += 1) {
    const su = rand(i, seed + 12);
    const sv = rand(i, seed + 13) * horizon;
    const placed = project ? project(su, sv) : { u: su, v: sv };
    if (placed.v < 0 || placed.v > 1) continue;
    const x = placed.u * width;
    const y = placed.v * height;
    const magnitude = Math.pow(rand(i, seed + 14), 3); // few bright, many faint
    const twinkle = 0.6 + 0.4 * Math.sin(t * (1.5 + rand(i, seed + 15) * 3) + i);
    const bright = (0.2 + magnitude) * twinkle;
    const colour = magnitude > 0.7 ? [200, 214, 255] : [255, 250, 236];
    addLight(frame, Math.round(x), Math.round(y), colour, bright);
    if (magnitude > 0.6) {
      addLight(frame, Math.round(x) + 1, Math.round(y), colour, bright * 0.4);
      addLight(frame, Math.round(x), Math.round(y) + 1, colour, bright * 0.4);
    }
  }
};

/**
 * Dust motes: slow, out-of-focus flecks catching the light.
 *
 * The thing that makes an interior or a shaft of light feel like air rather than
 * vacuum. Large, dim, soft, drifting on gentle noise.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} t
 * @param {{count?: number, color?: [number,number,number], seed?: number, opacity?: number}} [options]
 */
export const motes = (frame, t, { count = 60, color = [255, 240, 210], seed = 0, opacity = 0.3 } = {}) => {
  const { width, height } = frame;
  for (let i = 0; i < count; i += 1) {
    const baseX = rand(i, seed + 16);
    const baseY = rand(i, seed + 17);
    const x = (baseX + noise2(i, t * 0.2, seed) * 0.06 - 0.03) * width;
    const y = (baseY + noise2(i + 9, t * 0.2, seed + 1) * 0.06 - 0.03) * height;
    const radius = 1 + rand(i, seed + 18) * 2.5;
    const breath = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 3);
    const bright = opacity * breath;
    for (let dy = -Math.ceil(radius); dy <= radius; dy += 1) {
      for (let dx = -Math.ceil(radius); dx <= radius; dx += 1) {
        const falloff = 1 - Math.sqrt(dx * dx + dy * dy) / (radius + 1);
        if (falloff > 0) blendPixel(frame, Math.round(x) + dx, Math.round(y) + dy, color, bright * falloff * falloff);
      }
    }
  }
};

/**
 * God-rays / volumetric shafts from a point above frame.
 *
 * Radial streaks of light, brighter where they start and fanning out, modulated by
 * slow noise so they shift like light through moving cloud or leaves. Added, not
 * blended — they are light.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} t
 * @param {{sunU?: number, sunV?: number, color?: [number,number,number],
 *          strength?: number, seed?: number, count?: number}} [options]
 */
export const godRays = (frame, t, { sunU = 0.5, sunV = -0.1, color = [255, 232, 180], strength = 0.5, seed = 0, count = 28 } = {}) => {
  if (strength <= 0) return;
  const { width, height } = frame;
  const sx = sunU * width;
  const sy = sunV * height;
  for (let ray = 0; ray < count; ray += 1) {
    const angle = (ray / count) * Math.PI - Math.PI / 2 + Math.sin(t * 0.2 + ray) * 0.02;
    const flicker = 0.5 + 0.5 * noise2(ray * 0.7, t * 0.4, seed);
    const reach = height * (0.7 + noise2(ray, seed, seed + 3) * 0.5);
    const steps = 40;
    for (let s = 1; s < steps; s += 1) {
      const d = (s / steps) * reach;
      const x = sx + Math.cos(angle) * d;
      const y = sy + Math.sin(angle) * d;
      const fade = (1 - s / steps) * flicker * strength * 0.06;
      addLight(frame, Math.round(x), Math.round(y), color, fade);
    }
  }
};

/**
 * A single lightning flash: a full-frame lift plus a jagged bolt, on chosen frames.
 *
 * Returns the brightness it applied, so the caller can drive a thunder cue or a
 * one-frame exposure bump off the same event.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {number} intensity `0` for no flash this frame.
 * @param {{seed?: number, color?: [number,number,number]}} [options]
 * @returns {number}
 */
export const lightning = (frame, intensity, { seed = 0, color = [220, 228, 255] } = {}) => {
  if (intensity <= 0) return 0;
  const { width, height, data } = frame;
  // A broad sky-lift: brightest at the top, fading down.
  for (let y = 0; y < height; y += 1) {
    const lift = intensity * Math.max(0, 1 - y / height) * 90;
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      data[at] += color[0] * lift / 255;
      data[at + 1] += color[1] * lift / 255;
      data[at + 2] += color[2] * lift / 255;
    }
  }
  // A single forked bolt, walked as a jagged path from the top.
  let x = (0.3 + rand(seed, 1) * 0.4) * width;
  let y = 0;
  const segments = 26;
  while (y < height * 0.7 && segments > 0) {
    const nx = x + (rand(seed + Math.round(y), 2) - 0.5) * width * 0.08;
    const ny = y + height / segments;
    const steps = Math.ceil(Math.hypot(nx - x, ny - y));
    for (let s = 0; s <= steps; s += 1) {
      const px = Math.round(x + ((nx - x) * s) / steps);
      const py = Math.round(y + ((ny - y) * s) / steps);
      addLight(frame, px, py, color, intensity * 1.6);
      addLight(frame, px + 1, py, color, intensity * 0.6);
      addLight(frame, px - 1, py, color, intensity * 0.6);
    }
    x = nx;
    y = ny;
  }
  return intensity;
};
