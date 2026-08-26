
import path from 'node:path';
import { copyInto } from '../paint/frame.js';
import { createContext } from '../context.js';
import { scriptFor } from './script.js';
import { compositeFrame, createBuffers } from './compositor.js';
import { synthesiseScore } from './audio.js';
import { encodeVideo, mergeAudio, encodeJpeg } from './encoder.js';
import { renderPosterWithTitle } from './poster.js';
import { DiskCache, cacheKey } from './cache.js';
import { faceLibrary } from '../type/fonts.js';

const FPS = 12;
const WIDTH = 640;
const HEIGHT = 360;

const POSTER_WIDTH = 640;
const POSTER_HEIGHT = 360;

const MAX_DURATION = 5;

let cache = null;

const getCache = async () => {
  if (!cache) {
    cache = new DiskCache(path.join(process.cwd(), '.cache', 'trailers'));
    await cache.init();
  }
  return cache;
};

export const renderTrailer = async ({ seed, localeCode, globalIndex, movie, locale, provider }) => {
  const ctx = createContext(provider, seed, localeCode, 'trailer', globalIndex);

  const faces = await faceLibrary();
  const script = scriptFor(ctx, movie, faces);
  const key = cacheKey(script);

  const disk = await getCache();
  const cached = await disk.get(key, '.mp4');
  if (cached) return cached;

  const sceneCache = new Map();
  const buffers = createBuffers(WIDTH, HEIGHT);
  const totalFrames = Math.ceil(script.totalDuration * FPS);
  const frameIterator = (async function* () {
    for (let i = 0; i < totalFrames; i += 1) {
      compositeFrame(script, i, FPS, WIDTH, HEIGHT, ctx, sceneCache, buffers.frame, buffers.scratch, buffers.prevShot);
      yield Buffer.from(buffers.frame.data.buffer, buffers.frame.data.byteOffset, buffers.frame.data.byteLength);
      copyInto(buffers.prevShot, buffers.frame);
    }
  })();

  const videoBuffer = await encodeVideo(frameIterator, { width: WIDTH, height: HEIGHT, fps: FPS });

  const audioCtx = createContext(provider, seed, localeCode, 'trailer', globalIndex, 'audio');
  const audioBuffer = synthesiseScore({
    key: script.audio.key,
    tempo: script.audio.tempo,
    mood: script.audio.mood,
    duration: script.audio.duration,
    seed: Number(audioCtx.seed & 0xffffffffn),
  });

  let finalBuffer;
  try {
    finalBuffer = await mergeAudio(videoBuffer, audioBuffer);
  } catch {
    
    finalBuffer = videoBuffer;
  }

  await disk.set(key, '.mp4', finalBuffer);
  return finalBuffer;
};

export const renderPoster = async ({ seed, localeCode, globalIndex, movie, locale, provider }) => {
  const ctx = createContext(provider, seed, localeCode, 'trailer', globalIndex);

  const faces = await faceLibrary();
  const script = scriptFor(ctx, movie, faces);
  const key = cacheKey(script);

  const disk = await getCache();
  const cached = await disk.get(key, '.jpg');
  if (cached) return cached;

  const facesForTitle = movie.title
    ? faces.filter((f) => f.font.covers(movie.title))
    : faces;
  const font = facesForTitle.length > 0 ? facesForTitle[0].font : faces[0]?.font;

  const frame = renderPosterWithTitle(script, ctx, POSTER_WIDTH, POSTER_HEIGHT, font, movie.title);
  const jpegBuffer = await encodeJpeg(frame.data, POSTER_WIDTH, POSTER_HEIGHT);

  await disk.set(key, '.jpg', jpegBuffer);
  return jpegBuffer;
};

export const TRAILER_FPS = FPS;
export const TRAILER_WIDTH = WIDTH;
export const TRAILER_HEIGHT = HEIGHT;
