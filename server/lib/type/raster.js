
export const createMask = (width, height) => ({
  width,
  height,
  stride: width + 2,
  area: new Float32Array((width + 2) * height),
});

const addEdge = (mask, ax, ay, bx, by) => {
  if (ay === by) return;
  const { stride, height, area } = mask;
  const last = stride - 1;
  const dir = ay < by ? 1 : -1;
  
  const [x0y, y0, x1y, y1] = ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay];

  const dxdy = (x1y - x0y) / (y1 - y0);
  let x = y0 < 0 ? x0y - y0 * dxdy : x0y;
  const yStart = Math.max(0, Math.floor(y0));
  const yEnd = Math.min(height, Math.ceil(y1));

  for (let y = yStart; y < yEnd; y += 1) {
    const row = y * stride;
    const dy = Math.min(y + 1, y1) - Math.max(y, y0);
    const xNext = x + dxdy * dy;
    const d = dy * dir;
    const bump = (cell, value) => {
      area[row + (cell < 0 ? 0 : cell > last ? last : cell)] += value;
    };

    const left = Math.min(x, xNext);
    const right = Math.max(x, xNext);
    const leftFloor = Math.floor(left);
    const leftCell = leftFloor | 0;
    const rightCeil = Math.ceil(right);
    const rightCell = rightCeil | 0;

    if (rightCell <= leftCell + 1) {
      
      const mid = 0.5 * (x + xNext) - leftFloor;
      bump(leftCell, d - d * mid);
      bump(leftCell + 1, d * mid);
    } else {
      
      
      const slope = 1 / (right - left);
      const leftFraction = left - leftFloor;
      const firstArea = 0.5 * slope * (1 - leftFraction) * (1 - leftFraction);
      const rightFraction = right - rightCeil + 1;
      const lastArea = 0.5 * slope * rightFraction * rightFraction;

      bump(leftCell, d * firstArea);
      if (rightCell === leftCell + 2) {
        bump(leftCell + 1, d * (1 - firstArea - lastArea));
      } else {
        const secondArea = slope * (1.5 - leftFraction);
        bump(leftCell + 1, d * (secondArea - firstArea));
        for (let cell = leftCell + 2; cell < rightCell - 1; cell += 1) bump(cell, d * slope);
        const upToLast = secondArea + (rightCell - leftCell - 3) * slope;
        bump(rightCell - 1, d * (1 - upToLast - lastArea));
      }
      bump(rightCell, d * lastArea);
    }
    x = xNext;
  }
};

export const addPolygon = (mask, points) => {
  if (points.length < 2) return;
  for (let i = 0; i < points.length; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    addEdge(mask, from.x, from.y, to.x, to.y);
  }
};

export const resolveMask = (mask) => {
  const { width, height, stride, area } = mask;
  const coverage = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * stride;
    const out = y * width;
    for (let x = 0; x < width; x += 1) {
      sum += area[row + x];
      const value = sum < 0 ? -sum : sum;
      coverage[out + x] = (value > 1 ? 1 : value) * 255;
    }
  }
  return coverage;
};

export const rasterise = (width, height, polygons) => {
  const mask = createMask(width, height);
  for (const polygon of polygons) addPolygon(mask, polygon);
  return resolveMask(mask);
};
