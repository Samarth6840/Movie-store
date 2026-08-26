
const fract = (value) => value - Math.floor(value);

const hash2 = (x, y, seed) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export const noise2 = (x, y, seed = 0) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};

export const fbm = (x, y, { octaves = 4, seed = 0, gain = 0.5, lacunarity = 2 } = {}) => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += noise2(x * frequency, y * frequency, seed + octave * 17) * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
};

export const ridged = (x, y, { octaves = 4, seed = 0, gain = 0.5, lacunarity = 2 } = {}) => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    const folded = 1 - Math.abs(noise2(x * frequency, y * frequency, seed + octave * 31) * 2 - 1);
    sum += folded * folded * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
};

export const turbulence = (x, y, { octaves = 5, seed = 0 } = {}) => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += Math.abs(noise2(x * frequency, y * frequency, seed + octave * 53) * 2 - 1) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
};

export const profile = (x, { octaves = 5, seed = 0, gain = 0.5 } = {}) => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += noise2(x * frequency, seed * 0.37 + octave * 11.3, seed + octave * 7) * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return sum / total;
};

export const warp = (x, y, amount, seed = 0) => [
  x + (noise2(x, y, seed) * 2 - 1) * amount,
  y + (noise2(x + 5.2, y + 1.3, seed + 91) * 2 - 1) * amount,
];

export const grain = (x, y, frame) => hash2(x + frame * 0.017, y - frame * 0.031, frame) * 2 - 1;
