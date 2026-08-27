
import { Router } from 'express';
import { loadLocales } from '../lib/locales.js';
import { createFakerProvider } from '../lib/providers/faker-provider.js';
import { normalizeSeed } from '../../shared/seed.js';
import { getTrailerCache, prewarmTrailers, MAX_CONCURRENT_RENDERS } from '../lib/trailer/index.js';
import { getClipCache } from '../lib/cache/clip-cache.js';

const router = Router();

const providerCache = new Map();
const getProvider = (locale) => {
  if (!providerCache.has(locale.code)) {
    providerCache.set(locale.code, createFakerProvider(locale));
  }
  return providerCache.get(locale.code);
};

router.get('/cache', async (_req, res) => {
  try {
    const [trailer, clip] = await Promise.all([
      getTrailerCache(),
      getClipCache().catch(() => null),
    ]);
    res.json({
      maxConcurrentRenders: MAX_CONCURRENT_RENDERS,
      trailers: trailer?.stats() ?? null,
      clips: clip?.stats() ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Prewarm finished trailers for the first `count` movies of a seed/locale, in
// the background, without exceeding the render concurrency limit.
router.post('/cache/prewarm', async (req, res) => {
  try {
    const locales = await loadLocales();
    const localeCode = req.query.locale ?? 'en-US';
    const locale = locales.get(localeCode);
    if (!locale) {
      return res.status(400).json({ error: `Unknown locale: ${localeCode}` });
    }
    const seed = normalizeSeed(req.query.seed ?? '0');
    const count = Math.max(1, Math.min(50, parseInt(req.query.count ?? '6', 10) || 6));
    const provider = getProvider(locale);

    res.json({ status: 'started', seed: seed.toString(), locale: localeCode, count });
    prewarmTrailers({ seed, localeCode, count, locale, provider }).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
