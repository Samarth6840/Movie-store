
const TOLERANCE = 0.15;

const addQuadratic = (into, from, control, to) => {
  const deviation = Math.hypot(
    control.x - (from.x + to.x) / 2,
    control.y - (from.y + to.y) / 2,
  );
  const steps = Math.max(2, Math.min(24, Math.ceil(Math.sqrt(deviation / TOLERANCE))));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const inverse = 1 - t;
    const weight = 2 * inverse * t;
    into.push({
      x: inverse * inverse * from.x + weight * control.x + t * t * to.x,
      y: inverse * inverse * from.y + weight * control.y + t * t * to.y,
    });
  }
};

const flattenContour = (points, place) => {
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
  const first = points[0];
  const last = points[points.length - 1];

  
  let ordered = points;
  let start = first;
  if (!first.on) {
    if (last.on) {
      ordered = [last, ...points.slice(0, -1)];
      start = last;
    } else {
      start = midpoint(first, last);
      ordered = [start, ...points];
    }
  }

  const polyline = [place(start)];
  let pending = null; 
  for (let i = 1; i <= ordered.length; i += 1) {
    const point = ordered[i % ordered.length];
    if (!point.on) {
      if (pending) {
        
        const implied = midpoint(pending, point);
        addQuadratic(polyline, polyline[polyline.length - 1], place(pending), place(implied));
      }
      pending = point;
      continue;
    }
    if (pending) {
      addQuadratic(polyline, polyline[polyline.length - 1], place(pending), place(point));
      pending = null;
    } else {
      polyline.push(place(point));
    }
  }
  return polyline;
};

export const layoutLine = (font, text, { size, tracking = 0 }) => {
  const scale = size / font.unitsPerEm;
  const place = ({ x, y }) => ({ x: x * scale, y: y * scale });
  const extra = tracking * size;

  let pen = 0;
  const glyphs = [];
  for (const character of text) {
    const glyph = font.glyphOf(character.codePointAt(0));
    const advance = font.advanceOf(glyph) * scale + extra;
    glyphs.push({
      text: character,
      x: pen,
      advance,
      contours: font.outlineOf(glyph).map((contour) => flattenContour(contour, place)),
    });
    pen += advance;
  }

  return {
    
    width: Math.max(0, pen - (glyphs.length > 0 ? extra : 0)),
    ascent: font.ascender * scale,
    descent: font.descender * scale,
    size,
    glyphs,
  };
};

export const fitSize = (font, text, { maxWidth, maxSize, tracking = 0 }) => {
  const reference = layoutLine(font, text, { size: maxSize, tracking });
  if (reference.width <= maxWidth || reference.width === 0) return maxSize;
  return maxSize * (maxWidth / reference.width);
};

export const wrapText = (font, text, { size, maxWidth, tracking = 0, maxLines = 3 }) => {
  const words = text.split(/\s+/).filter(Boolean);
  const widthOf = (candidate) => layoutLine(font, candidate, { size, tracking }).width;
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && widthOf(candidate) > maxWidth && lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
};
