

export const createFrame = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 3),
});

export const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

export const mix = (a, b, t) => a + (b - a) * t;

export const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const ramp = (value, from, to) => clamp01((value - from) / (to - from || 1));

export const mixColor = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export const fill = (frame, [r, g, b]) => {
  const { data } = frame;
  for (let i = 0; i < data.length; i += 3) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
};

export const shadeFrame = (frame, shade) => {
  const { width, height, data } = frame;
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = shade((x + 0.5) / width, v, x, y);
      const at = (y * width + x) * 3;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
    }
  }
};

export const pixelAt = (frame, x, y) => {
  const at = (y * frame.width + x) * 3;
  return [frame.data[at], frame.data[at + 1], frame.data[at + 2]];
};

export const blendPixel = (frame, x, y, [r, g, b], alpha) => {
  if (alpha <= 0 || x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
  const at = (y * frame.width + x) * 3;
  const { data } = frame;
  if (alpha >= 1) {
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    return;
  }
  data[at] += (r - data[at]) * alpha;
  data[at + 1] += (g - data[at + 1]) * alpha;
  data[at + 2] += (b - data[at + 2]) * alpha;
};

export const compositeMask = (frame, mask, color, { x = 0, y = 0, alpha = 1 } = {}) => {
  if (alpha <= 0) return;
  const { coverage, width: mw, height: mh } = mask;
  for (let row = 0; row < mh; row += 1) {
    const ty = y + row;
    if (ty < 0 || ty >= frame.height) continue;
    for (let column = 0; column < mw; column += 1) {
      const value = coverage[row * mw + column];
      if (value === 0) continue;
      blendPixel(frame, x + column, ty, color, (value / 255) * alpha);
    }
  }
};

export const compositeMaskShaded = (frame, mask, colorAt, { x = 0, y = 0, alpha = 1 } = {}) => {
  if (alpha <= 0) return;
  const { coverage, width: mw, height: mh } = mask;
  for (let row = 0; row < mh; row += 1) {
    const ty = y + row;
    if (ty < 0 || ty >= frame.height) continue;
    const v = (row + 0.5) / mh;
    for (let column = 0; column < mw; column += 1) {
      const value = coverage[row * mw + column];
      if (value === 0) continue;
      blendPixel(frame, x + column, ty, colorAt((column + 0.5) / mw, v), (value / 255) * alpha);
    }
  }
};

export const addLight = (frame, x, y, [r, g, b], amount) => {
  if (amount <= 0 || x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
  const at = (y * frame.width + x) * 3;
  const { data } = frame;
  data[at] += r * amount;
  data[at + 1] += g * amount;
  data[at + 2] += b * amount;
};

export const blur = (frame, radius, passes = 2) => {
  if (radius < 1) return;
  const { width, height, data } = frame;
  const scratch = new Float32Array(data.length);
  const span = radius * 2 + 1;

  for (let pass = 0; pass < passes; pass += 1) {
    
    for (let y = 0; y < height; y += 1) {
      const row = y * width * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let x = -radius; x <= radius; x += 1) {
          sum += data[row + Math.min(width - 1, Math.max(0, x)) * 3 + channel];
        }
        for (let x = 0; x < width; x += 1) {
          scratch[row + x * 3 + channel] = sum / span;
          const leaving = Math.min(width - 1, Math.max(0, x - radius));
          const entering = Math.min(width - 1, Math.max(0, x + radius + 1));
          sum += data[row + entering * 3 + channel] - data[row + leaving * 3 + channel];
        }
      }
    }
    
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let y = -radius; y <= radius; y += 1) {
          sum += scratch[Math.min(height - 1, Math.max(0, y)) * width * 3 + x * 3 + channel];
        }
        for (let y = 0; y < height; y += 1) {
          data[y * width * 3 + x * 3 + channel] = sum / span;
          const leaving = Math.min(height - 1, Math.max(0, y - radius));
          const entering = Math.min(height - 1, Math.max(0, y + radius + 1));
          sum +=
            scratch[entering * width * 3 + x * 3 + channel] -
            scratch[leaving * width * 3 + x * 3 + channel];
        }
      }
    }
  }
};

export const copyInto = (target, source) => {
  target.data.set(source.data);
};

export const dissolve = (target, source, amount) => {
  const t = clamp01(amount);
  if (t <= 0) return;
  if (t >= 1) return copyInto(target, source);
  const a = target.data;
  const b = source.data;
  for (let i = 0; i < a.length; i += 1) a[i] += (b[i] - a[i]) * t;
};
