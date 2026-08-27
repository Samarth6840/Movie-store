
import { clamp01, mix } from './frame.js';
import { grain as grainAt } from './noise.js';


const LUMA = [0.2126, 0.7152, 0.0722];

export const GRADES = [
  {
    name: 'teal-orange',
    lift: [-2, 0, 6],
    gain: [1.1, 1.0, 0.95],
    gamma: 1.0,
    contrast: 1.14,
    saturation: 1.1,
    shadowTint: [20, 60, 90],
    highlightTint: [255, 190, 130],
    tintStrength: 0.3,
  },
  {
    name: 'cold-steel',
    lift: [0, 2, 8],
    gain: [0.92, 0.98, 1.12],
    gamma: 1.05,
    contrast: 1.2,
    saturation: 0.72,
    shadowTint: [18, 34, 62],
    highlightTint: [210, 226, 255],
    tintStrength: 0.34,
  },
  {
    name: 'bleach-bypass',
    lift: [4, 4, 4],
    gain: [1.06, 1.04, 1.02],
    gamma: 0.94,
    contrast: 1.34,
    saturation: 0.45,
    shadowTint: [30, 32, 36],
    highlightTint: [250, 250, 245],
    tintStrength: 0.2,
  },
  {
    name: 'amber-dusk',
    lift: [6, 2, -2],
    gain: [1.14, 1.0, 0.86],
    gamma: 0.98,
    contrast: 1.1,
    saturation: 1.18,
    shadowTint: [46, 26, 20],
    highlightTint: [255, 196, 120],
    tintStrength: 0.36,
  },
  {
    name: 'noir',
    lift: [0, 0, 2],
    gain: [1.0, 1.0, 1.04],
    gamma: 1.08,
    contrast: 1.42,
    saturation: 0.14,
    shadowTint: [10, 12, 20],
    highlightTint: [235, 238, 248],
    tintStrength: 0.28,
  },
  {
    name: 'toxic-green',
    lift: [-2, 4, -2],
    gain: [0.94, 1.08, 0.9],
    gamma: 1.02,
    contrast: 1.22,
    saturation: 0.86,
    shadowTint: [16, 40, 26],
    highlightTint: [220, 255, 190],
    tintStrength: 0.32,
  },
  {
    name: 'blood-crimson',
    lift: [8, -2, 0],
    gain: [1.18, 0.9, 0.92],
    gamma: 1.0,
    contrast: 1.26,
    saturation: 1.06,
    shadowTint: [46, 12, 16],
    highlightTint: [255, 178, 168],
    tintStrength: 0.34,
  },
  {
    name: 'moonlit',
    lift: [-4, 0, 10],
    gain: [0.86, 0.95, 1.18],
    gamma: 1.12,
    contrast: 1.16,
    saturation: 0.62,
    shadowTint: [10, 20, 44],
    highlightTint: [190, 214, 255],
    tintStrength: 0.4,
  },
  {
    name: 'sepia-archive',
    lift: [10, 6, 0],
    gain: [1.08, 1.0, 0.82],
    gamma: 0.96,
    contrast: 1.18,
    saturation: 0.36,
    shadowTint: [42, 32, 20],
    highlightTint: [255, 228, 176],
    tintStrength: 0.44,
  },
  {
    name: 'ash',
    lift: [4, 4, 6],
    gain: [1.0, 0.99, 1.0],
    gamma: 1.06,
    contrast: 1.08,
    saturation: 0.3,
    shadowTint: [26, 26, 30],
    highlightTint: [232, 230, 234],
    tintStrength: 0.24,
  },
];

const gradeTableCache = new WeakMap();

export const bakeGrade = (grade) => {
  const cached = gradeTableCache.get(grade);
  if (cached) return cached;
  const table = new Float32Array(768);
  for (let channel = 0; channel < 3; channel += 1) {
    for (let value = 0; value < 256; value += 1) {
      let x = value / 255;
      x = clamp01(x + grade.lift[channel] / 255);
      x = clamp01(x * grade.gain[channel]);
      x = Math.pow(x, grade.gamma);
      x = clamp01((x - 0.5) * grade.contrast + 0.5);
      
      const shadow = (1 - x) * (1 - x);
      const highlight = x * x;
      const tinted =
        x * 255 +
        ((grade.shadowTint[channel] - 128) * shadow + (grade.highlightTint[channel] - 200) * highlight) *
          grade.tintStrength;
      table[channel * 256 + value] = tinted;
    }
  }
  gradeTableCache.set(grade, table);
  return table;
};

export const applyGrade = (
  frame,
  table,
  { saturation = 1, vignette = 0.3, grain = 0.04, frameIndex = 0, exposure = 1 } = {},
) => {
  const { width, height, data } = frame;
  const grainAmount = grain * 255;
  for (let y = 0; y < height; y += 1) {
    const dy = (y + 0.5) / height - 0.5;
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      let r = table[data[at]];
      let g = table[256 + data[at + 1]];
      let b = table[512 + data[at + 2]];

      if (saturation !== 1) {
        const luma = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
        r = mix(luma, r, saturation);
        g = mix(luma, g, saturation);
        b = mix(luma, b, saturation);
      }

      if (vignette > 0) {
        const dx = (x + 0.5) / width - 0.5;
        
        const falloff = 1 - vignette * clamp01((dx * dx + dy * dy) * 2.6 - 0.08);
        r *= falloff;
        g *= falloff;
        b *= falloff;
      }

      if (grain > 0) {
        const n = grainAt(x, y, frameIndex) * grainAmount;
        r += n;
        g += n;
        b += n;
      }

      data[at] = r * exposure;
      data[at + 1] = g * exposure;
      data[at + 2] = b * exposure;
    }
  }
};

export const applyBloom = (frame, scratch, blur, { threshold = 190, strength = 0.5, radius = 14 } = {}) => {
  if (strength <= 0) return;
  const a = frame.data;
  const b = scratch.data;
  for (let i = 0; i < a.length; i += 3) {
    const luma = a[i] * LUMA[0] + a[i + 1] * LUMA[1] + a[i + 2] * LUMA[2];
    const excess = luma > threshold ? (luma - threshold) / (255 - threshold) : 0;
    b[i] = a[i] * excess;
    b[i + 1] = a[i + 1] * excess;
    b[i + 2] = a[i + 2] * excess;
  }
  blur(scratch, radius, 2);
  for (let i = 0; i < a.length; i += 1) a[i] += b[i] * strength;
};

export const applyAberration = (frame, amount) => {
  if (amount <= 0.01) return;
  const { width, height, data } = frame;
  const original = data.slice();
  const sample = (channel, x, y) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return original[(cy * width + cx) * 3 + channel];
  };
  for (let y = 0; y < height; y += 1) {
    const dy = (y + 0.5) / height - 0.5;
    for (let x = 0; x < width; x += 1) {
      const dx = (x + 0.5) / width - 0.5;
      const shift = amount * (dx * dx + dy * dy) * 4;
      const at = (y * width + x) * 3;
      data[at] = sample(0, Math.round(x + dx * shift * 2), Math.round(y + dy * shift * 2));
      data[at + 2] = sample(2, Math.round(x - dx * shift * 2), Math.round(y - dy * shift * 2));
    }
  }
};

export const letterbox = (frame, aspect = 2.39) => {
  const { width, height, data } = frame;
  const barHeight = Math.round((height - width / aspect) / 2);
  if (barHeight <= 0) return;
  data.fill(0, 0, barHeight * width * 3);
  data.fill(0, (height - barHeight) * width * 3);
};
