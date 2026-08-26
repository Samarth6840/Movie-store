
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { parseFont } from './font.js';

const SEARCH_PATHS = {
  darwin: ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts'],
  linux: ['/usr/share/fonts', '/usr/local/share/fonts'],
  win32: ['C:\\Windows\\Fonts'],
};

const extraPaths = () =>
  (process.env.TRAILER_FONT_PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));

const PREFERRED = [
  'impact',
  'futura',
  'didot',
  'optima',
  'copperplate',
  'trajan',
  'baskerville',
  'bodoni',
  'georgia bold',
  'times new roman bold',
  'helvetica',
  'arial bold',
  'arial black',
  'avenir',
  'gill sans',
  'palatino',
  'charter',
  'dejavu sans bold',
  'dejavusans-bold',
  'liberationsans-bold',
  'notosans-bold',
  'ubuntu-b',
  'freesansbold',
];

const REJECT = /emoji|braille|symbol|dingbat|webding|wingding|keyboard|icons|marlett|ornaments|nastaleeq|kufi|mshtakan/i;

const isFontFile = (name) => /\.(ttf|ttc)$/i.test(name);

const filesIn = async (dir, depth = 1) => {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && depth > 0) found.push(...(await filesIn(full, depth - 1)));
    else if (entry.isFile() && isFontFile(entry.name) && !REJECT.test(entry.name)) found.push(full);
  }
  return found;
};

const rankOf = (file) => {
  const stem = path.basename(file).replace(/\.(ttf|ttc)$/i, '').toLowerCase();
  const index = PREFERRED.findIndex((name) => stem.includes(name));
  return index === -1 ? PREFERRED.length : index;
};

const COLLECTION_FACES = 4;


export const discoverFaces = async ({ limit = 28, dirs } = {}) => {
  const roots = dirs ?? [...(SEARCH_PATHS[process.platform] ?? []), ...extraPaths()];
  const files = [];
  for (const root of roots) {
    if (!(await stat(root).catch(() => null))) continue;
    files.push(...(await filesIn(root)));
  }
  files.sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));

  const faces = [];
  const seen = new Set();
  for (const file of files) {
    if (faces.length >= limit) break;
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      continue;
    }
    const collection = file.toLowerCase().endsWith('.ttc');
    for (let index = 0; index < (collection ? COLLECTION_FACES : 1); index += 1) {
      if (faces.length >= limit) break;
      try {
        const font = parseFont(bytes, index);
        
        
        const fingerprint = `${font.numGlyphs}:${font.unitsPerEm}:${font.ascender}:${font.advanceOf(font.glyphOf(65))}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const stem = path.basename(file).replace(/\.(ttf|ttc)$/i, '');
        faces.push({ name: collection ? `${stem} #${index}` : stem, file, index, font });
      } catch {
        break; 
      }
    }
  }
  return faces;
};

export const facesFor = (faces, text) => faces.filter((face) => face.font.covers(text));

export const faceLibrary = (() => {
  let pending = null;
  return (options) => {
    pending ??= discoverFaces(options).then((faces) => {
      if (faces.length === 0) {
        throw new Error(
          'No usable TrueType fonts were found. Set TRAILER_FONT_PATH to a directory containing .ttf files.',
        );
      }
      return faces;
    });
    return pending;
  };
})();
