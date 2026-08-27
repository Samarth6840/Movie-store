

import { copyInto } from '../paint/frame.js';
import { createContext } from '../context.js';
import { scriptFor } from './script.js';
import { compositeFrame, createBuffers } from './compositor.js';
import { synthesiseScore } from './audio.js';
import { encodeVideo, mergeAudio, encodeJpeg } from './encoder.js';
import { renderPosterWithTitle } from './poster.js';
import { faceLibrary } from '../type/fonts.js';
import { contextForRecord } from '../generate/page.js';
import { identityFor } from '../generate/movie.js';
import { loadLocales } from '../locales.js';
import { createFakerProvider } from '../providers/faker-provider.js';

const FPS = 15;
const WIDTH = 640;
const HEIGHT = 360;

const POSTER_WIDTH = 640;
const POSTER_HEIGHT = 360;

let localesPromise = null;
const getLocales = () => {
  localesPromise ??= loadLocales();
  return localesPromise;
};

/**
 * Rebuild a locale + provider + record + movie from the serialisable render
 * inputs, so the same code runs identically inside a worker thread and on the
 * main thread.
 */
const materialize = async ({ seed, localeCode, globalIndex }) => {
  const locales = await getLocales();
  const locale = locales.get(localeCode);
  if (!locale) throw new Error(`Unknown locale: ${localeCode}`);
  const provider = createFakerProvider(locale);
  const ctx = contextForRecord(provider, seed, localeCode, globalIndex);
  const movie = identityFor(locale, ctx, globalIndex);
  return { locale, provider, ctx, movie };
};

export const renderTrailerInProcess = async ({ seed, localeCode, globalIndex }) => {
  const { provider, ctx, movie } = await materialize({ seed, localeCode, globalIndex });
  const faces = await faceLibrary();
  const script = scriptFor(ctx, movie, faces);

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
  return finalBuffer;
};

export const renderPosterInProcess = async ({ seed, localeCode, globalIndex }) => {
  const { ctx, movie } = await materialize({ seed, localeCode, globalIndex });
  const faces = await faceLibrary();
  const script = scriptFor(ctx, movie, faces);

  const facesForTitle = movie.title ? faces.filter((f) => f.font.covers(movie.title)) : faces;
  const font = facesForTitle.length > 0 ? facesForTitle[0].font : faces[0]?.font;

  const frame = renderPosterWithTitle(script, ctx, POSTER_WIDTH, POSTER_HEIGHT, font, movie.title);
  return encodeJpeg(frame.data, POSTER_WIDTH, POSTER_HEIGHT);
};

export const FPS_RENDER = FPS;
export const WIDTH_RENDER = WIDTH;
export const HEIGHT_RENDER = HEIGHT;
