
import { Router } from 'express';
import { loadLocales } from '../lib/locales.js';
import { renderPoster } from '../lib/trailer/index.js';
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

router.get('/poster/:seed/:locale/:index', async (req, res) => {
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

    const buffer = await renderPoster({
      seed,
      localeCode,
      globalIndex,
      movie,
      locale,
      provider: prov,
    });

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
