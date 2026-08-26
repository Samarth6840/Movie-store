

export const renderPlate = (width, height, shade, { scale = 1, margin = 0.14 } = {}) => {
  const span = 1 + margin * 2;
  const pw = Math.max(2, Math.round(width * scale * span));
  const ph = Math.max(2, Math.round(height * scale * span));
  const data = new Float32Array(pw * ph * 4);
  for (let y = 0; y < ph; y += 1) {
    const v = ((y + 0.5) / ph) * span - margin;
    for (let x = 0; x < pw; x += 1) {
      const u = ((x + 0.5) / pw) * span - margin;
      const colour = shade(u, v);
      const at = (y * pw + x) * 4;
      data[at] = colour[0];
      data[at + 1] = colour[1];
      data[at + 2] = colour[2];
      data[at + 3] = colour.length > 3 ? colour[3] : 1;
    }
  }
  return { width: pw, height: ph, margin, data };
};

export const samplePlate = (plate, u, v, into) => {
  const { width, height, margin, data } = plate;
  const span = 1 + margin * 2;
  const fx = ((u + margin) / span) * width - 0.5;
  const fy = ((v + margin) / span) * height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const clampX = (x) => (x < 0 ? 0 : x >= width ? width - 1 : x);
  const clampY = (y) => (y < 0 ? 0 : y >= height ? height - 1 : y);
  const left = clampX(x0);
  const right = clampX(x0 + 1);
  const top = clampY(y0);
  const bottom = clampY(y0 + 1);
  const a = (top * width + left) * 4;
  const b = (top * width + right) * 4;
  const c = (bottom * width + left) * 4;
  const d = (bottom * width + right) * 4;
  const wa = (1 - tx) * (1 - ty);
  const wb = tx * (1 - ty);
  const wc = (1 - tx) * ty;
  const wd = tx * ty;
  const alpha = data[a + 3] * wa + data[b + 3] * wb + data[c + 3] * wc + data[d + 3] * wd;
  for (let channel = 0; channel < 3; channel += 1) {
    into[channel] =
      data[a + channel] * data[a + 3] * wa +
      data[b + channel] * data[b + 3] * wb +
      data[c + channel] * data[c + 3] * wc +
      data[d + channel] * data[d + 3] * wd;
  }
  into[3] = alpha;
  
  if (alpha > 0.0001) {
    into[0] /= alpha;
    into[1] /= alpha;
    into[2] /= alpha;
  }
};


export const STILL = { zoomFrom: 1, zoomTo: 1, xFrom: 0, xTo: 0, yFrom: 0, yTo: 0 };

export const cameraAt = (camera, t, { ease = (x) => x, depth = 1 } = {}) => {
  const e = ease(t);
  return {
    zoom: 1 + (camera.zoomFrom + (camera.zoomTo - camera.zoomFrom) * e - 1) * depth,
    x: (camera.xFrom + (camera.xTo - camera.xFrom) * e) * depth,
    y: (camera.yFrom + (camera.yTo - camera.yFrom) * e) * depth,
  };
};

export const drawPlate = (frame, plate, view) => {
  const { width, height, data } = frame;
  const colour = new Float64Array(4);
  const { zoom, x: shiftX, y: shiftY } = view;
  for (let y = 0; y < height; y += 1) {
    const v = ((y + 0.5) / height - 0.5) / zoom + 0.5 + shiftY;
    for (let x = 0; x < width; x += 1) {
      const u = ((x + 0.5) / width - 0.5) / zoom + 0.5 + shiftX;
      samplePlate(plate, u, v, colour);
      const at = (y * width + x) * 3;
      data[at] = colour[0];
      data[at + 1] = colour[1];
      data[at + 2] = colour[2];
    }
  }
};

export const overPlate = (frame, plate, view, opacity = 1) => {
  if (opacity <= 0) return;
  const { width, height, data } = frame;
  const colour = new Float64Array(4);
  const { zoom, x: shiftX, y: shiftY } = view;
  for (let y = 0; y < height; y += 1) {
    const v = ((y + 0.5) / height - 0.5) / zoom + 0.5 + shiftY;
    for (let x = 0; x < width; x += 1) {
      const u = ((x + 0.5) / width - 0.5) / zoom + 0.5 + shiftX;
      samplePlate(plate, u, v, colour);
      const alpha = colour[3] * opacity;
      if (alpha <= 0.002) continue;
      const at = (y * width + x) * 3;
      if (alpha >= 0.998) {
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
        continue;
      }
      data[at] += (colour[0] - data[at]) * alpha;
      data[at + 1] += (colour[1] - data[at + 1]) * alpha;
      data[at + 2] += (colour[2] - data[at + 2]) * alpha;
    }
  }
};

export const projectPoint = (view, u, v) => ({
  u: (u - view.x - 0.5) * view.zoom + 0.5,
  v: (v - view.y - 0.5) * view.zoom + 0.5,
});
