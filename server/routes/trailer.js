
import { Router } from 'express';
import { loadLocales } from '../lib/locales.js';
import { renderTrailer } from '../lib/trailer/index.js';
import { normalizeSeed } from '../../shared/seed.js';
import { createFakerProvider } from '../lib/providers/faker-provider.js';
import { contextForRecord } from '../lib/generate/page.js';
import { identityFor } from '../lib/generate/movie.js';

const router = Router();
const providerCache = new Map();

const getProvider = (locale) => {
  if (!providerCache.has(locale.code)) {
    providerCache.set(locale.code, createFakerProvider(locale));
  }
  return providerCache.get(locale.code);
};

router.get('/debug/fonts', async (_req, res) => {
  const fontPath = process.env.TRAILER_FONT_PATH;
  const cwd = process.cwd();
  res.json({ fontPath, cwd, platform: process.platform });
});

router.get('/trailer/:seed/:locale/:index', async (req, res) => {
  try {
    const locales = await loadLocales();
    const localeCode = req.params.locale ?? 'en-US';
    const locale = locales.get(localeCode);
    if (!locale) {
      return res.status(400).json({ error: `Unknown locale: ${localeCode}` });
    }

    const seed = normalizeSeed(req.params.seed ?? '0');
    const globalIndex = Math.max(0, parseInt(req.params.index ?? '0', 10) || 0);

    const prov = getProvider(locale);
    const ctx = contextForRecord(prov, seed, localeCode, globalIndex);
    const movie = identityFor(locale, ctx, globalIndex);

    const buffer = await renderTrailer({
      seed,
      localeCode,
      globalIndex,
      movie,
      locale,
      provider: prov,
    });

    const total = buffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunkSize = end - start + 1;

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=86400',
      });
      res.send(buffer.subarray(start, end + 1));
    } else {
      res.set({
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=86400',
      });
      res.send(buffer);
    }
  } catch (err) {
    console.error('Trailer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
