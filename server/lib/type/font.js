
const reader = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    u8: (at) => view.getUint8(at),
    u16: (at) => view.getUint16(at),
    i16: (at) => view.getInt16(at),
    u32: (at) => view.getUint32(at),
        f2dot14: (at) => view.getInt16(at) / 16384,
    tag: (at) =>
      String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)),
  };
};

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME = 0x10;
const Y_SAME = 0x20;

const ARGS_ARE_WORDS = 0x0001;
const ARGS_ARE_XY = 0x0002;
const HAVE_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const HAVE_XY_SCALE = 0x0040;
const HAVE_2X2 = 0x0080;

const directoryOffset = (read, faceIndex) => {
  if (read.tag(0) !== 'ttcf') return 0;
  const faces = read.u32(8);
  return read.u32(12 + Math.min(faceIndex, faces - 1) * 4);
};

const readTables = (read, base) => {
  const count = read.u16(base + 4);
  const tables = new Map();
  for (let i = 0; i < count; i += 1) {
    const record = base + 12 + i * 16;
    tables.set(read.tag(record), { offset: read.u32(record + 8), length: read.u32(record + 12) });
  }
  return tables;
};

const readCmap4 = (read, at, map) => {
  const segments = read.u16(at + 6) / 2;
  const endAt = at + 14;
  const startAt = endAt + segments * 2 + 2;
  const deltaAt = startAt + segments * 2;
  const rangeAt = deltaAt + segments * 2;
  for (let seg = 0; seg < segments; seg += 1) {
    const end = read.u16(endAt + seg * 2);
    const start = read.u16(startAt + seg * 2);
    if (start > end || start === 0xffff) continue;
    const delta = read.i16(deltaAt + seg * 2);
    const rangeOffset = read.u16(rangeAt + seg * 2);
    for (let code = start; code <= end; code += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const glyphAt = rangeAt + seg * 2 + rangeOffset + (code - start) * 2;
        glyph = read.u16(glyphAt);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0 && !map.has(code)) map.set(code, glyph);
    }
  }
};

const readCmap12 = (read, at, map) => {
  const groups = read.u32(at + 12);
  for (let group = 0; group < groups; group += 1) {
    const record = at + 16 + group * 12;
    const start = read.u32(record);
    const end = read.u32(record + 4);
    const glyph = read.u32(record + 8);
    
    const last = Math.min(end, start + 0xffff);
    for (let code = start; code <= last; code += 1) {
      if (!map.has(code)) map.set(code, glyph + (code - start));
    }
  }
};

const readCmap = (read, at) => {
  const map = new Map();
  const count = read.u16(at + 2);
  const subtables = [];
  for (let i = 0; i < count; i += 1) {
    const record = at + 4 + i * 8;
    subtables.push({
      platform: read.u16(record),
      encoding: read.u16(record + 2),
      offset: at + read.u32(record + 4),
    });
  }
  
  const rank = ({ platform, encoding }) =>
    (platform === 3 && encoding === 10) || platform === 0 ? 0 : platform === 3 ? 1 : 2;
  for (const subtable of subtables.sort((a, b) => rank(a) - rank(b))) {
    const format = read.u16(subtable.offset);
    if (format === 4) readCmap4(read, subtable.offset, map);
    else if (format === 12) readCmap12(read, subtable.offset, map);
  }
  return map;
};

const readLoca = (read, table, numGlyphs, longFormat) => {
  const offsets = new Uint32Array(numGlyphs + 1);
  for (let glyph = 0; glyph <= numGlyphs; glyph += 1) {
    offsets[glyph] = longFormat
      ? read.u32(table.offset + glyph * 4)
      : read.u16(table.offset + glyph * 2) * 2;
  }
  return offsets;
};

const readAdvances = (read, table, numGlyphs, metricCount) => {
  const advances = new Uint16Array(numGlyphs);
  let last = 0;
  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    if (glyph < metricCount) last = read.u16(table.offset + glyph * 4);
    advances[glyph] = last;
  }
  return advances;
};

const readSimpleGlyph = (read, at, contourCount) => {
  const endPoints = [];
  for (let i = 0; i < contourCount; i += 1) endPoints.push(read.u16(at + 10 + i * 2));
  const pointCount = contourCount === 0 ? 0 : endPoints[contourCount - 1] + 1;

  let cursor = at + 10 + contourCount * 2;
  cursor += 2 + read.u16(cursor); 

  const flags = new Uint8Array(pointCount);
  for (let point = 0; point < pointCount; ) {
    const flag = read.u8(cursor);
    cursor += 1;
    flags[point] = flag;
    point += 1;
    if (flag & REPEAT) {
      let repeats = read.u8(cursor);
      cursor += 1;
      while (repeats-- > 0 && point < pointCount) flags[point++] = flag;
    }
  }

  
  const readDeltas = (shortBit, sameBit) => {
    const values = new Int16Array(pointCount);
    let value = 0;
    for (let point = 0; point < pointCount; point += 1) {
      const flag = flags[point];
      if (flag & shortBit) {
        const delta = read.u8(cursor);
        cursor += 1;
        value += flag & sameBit ? delta : -delta;
      } else if (!(flag & sameBit)) {
        value += read.i16(cursor);
        cursor += 2;
      }
      values[point] = value;
    }
    return values;
  };
  const xs = readDeltas(X_SHORT, X_SAME);
  const ys = readDeltas(Y_SHORT, Y_SAME);

  const contours = [];
  let start = 0;
  for (const end of endPoints) {
    const points = [];
    for (let point = start; point <= end; point += 1) {
      points.push({ x: xs[point], y: ys[point], on: Boolean(flags[point] & ON_CURVE) });
    }
    if (points.length > 0) contours.push(points);
    start = end + 1;
  }
  return contours;
};

const transformContours = (contours, [a, b, c, d, dx, dy]) =>
  contours.map((points) =>
    points.map(({ x, y, on }) => ({ x: a * x + c * y + dx, y: b * x + d * y + dy, on })),
  );

const readCompositeGlyph = (read, at, outlineOf, depth) => {
  const contours = [];
  let cursor = at + 10;
  let more = true;
  while (more) {
    const flags = read.u16(cursor);
    const glyphIndex = read.u16(cursor + 2);
    cursor += 4;

    let dx = 0;
    let dy = 0;
    if (flags & ARGS_ARE_WORDS) {
      dx = read.i16(cursor);
      dy = read.i16(cursor + 2);
      cursor += 4;
    } else {
      dx = (read.u8(cursor) << 24) >> 24;
      dy = (read.u8(cursor + 1) << 24) >> 24;
      cursor += 2;
    }
    
    
    if (!(flags & ARGS_ARE_XY)) {
      dx = 0;
      dy = 0;
    }

    let matrix = [1, 0, 0, 1, dx, dy];
    if (flags & HAVE_SCALE) {
      const scale = read.f2dot14(cursor);
      cursor += 2;
      matrix = [scale, 0, 0, scale, dx, dy];
    } else if (flags & HAVE_XY_SCALE) {
      matrix = [read.f2dot14(cursor), 0, 0, read.f2dot14(cursor + 2), dx, dy];
      cursor += 4;
    } else if (flags & HAVE_2X2) {
      matrix = [
        read.f2dot14(cursor),
        read.f2dot14(cursor + 2),
        read.f2dot14(cursor + 4),
        read.f2dot14(cursor + 6),
        dx,
        dy,
      ];
      cursor += 8;
    }

    contours.push(...transformContours(outlineOf(glyphIndex, depth + 1), matrix));
    more = Boolean(flags & MORE_COMPONENTS);
  }
  return contours;
};

export const parseFont = (bytes, faceIndex = 0) => {
  const read = reader(bytes);
  const base = directoryOffset(read, faceIndex);
  const version = read.tag(base);
  if (version === 'OTTO') throw new Error('CFF/OpenType outlines are not supported.');
  const tables = readTables(read, base);
  for (const required of ['head', 'maxp', 'hhea', 'hmtx', 'loca', 'glyf', 'cmap']) {
    if (!tables.has(required)) throw new Error(`Font is missing the "${required}" table.`);
  }

  const head = tables.get('head').offset;
  const unitsPerEm = read.u16(head + 18);
  const longLoca = read.i16(head + 50) === 1;
  const hhea = tables.get('hhea').offset;
  const numGlyphs = read.u16(tables.get('maxp').offset + 4);

  const loca = readLoca(read, tables.get('loca'), numGlyphs, longLoca);
  const advances = readAdvances(read, tables.get('hmtx'), numGlyphs, read.u16(hhea + 34));
  const cmap = readCmap(read, tables.get('cmap').offset);
  const glyf = tables.get('glyf').offset;
  const cache = new Map();

  const outlineOf = (glyph, depth = 0) => {
    if (glyph < 0 || glyph >= numGlyphs || depth > 5) return [];
    const cached = cache.get(glyph);
    if (cached) return cached;
    
    if (loca[glyph] >= loca[glyph + 1]) return [];
    const at = glyf + loca[glyph];
    const contourCount = read.i16(at);
    const contours =
      contourCount >= 0
        ? readSimpleGlyph(read, at, contourCount)
        : readCompositeGlyph(read, at, outlineOf, depth);
    if (depth === 0) cache.set(glyph, contours);
    return contours;
  };

  return {
    unitsPerEm,
    ascender: read.i16(hhea + 4),
    descender: read.i16(hhea + 6),
    numGlyphs,
    glyphOf: (codePoint) => cmap.get(codePoint) ?? 0,
    advanceOf: (glyph) => advances[glyph] ?? 0,
    outlineOf: (glyph) => outlineOf(glyph, 0),
        covers: (text) =>
      [...text].every((character) => /\s/.test(character) || cmap.has(character.codePointAt(0))),
  };
};
