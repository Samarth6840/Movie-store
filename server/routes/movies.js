
import { Router } from 'express';
import { loadLocales } from '../lib/locales.js';
import { pageOf } from '../lib/generate/page.js';
import { normalizeSeed } from '../../shared/seed.js';
import { createFakerProvider } from '../lib/providers/faker-provider.js';

const router = Router();
const providerCache = new Map();

const getProvider = (locale) => {
  if (!providerCache.has(locale.code)) {
    providerCache.set(locale.code, createFakerProvider(locale));
  }
  return providerCache.get(locale.code);
};

router.get('/movies', async (req, res) => {
  try {
    const locales = await loadLocales();
    const localeCode = req.query.locale ?? 'en-US';
    const locale = locales.get(localeCode);
    if (!locale) {
      return res.status(400).json({ error: `Unknown locale: ${localeCode}` });
    }

    const seed = normalizeSeed(req.query.seed ?? '0');
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize ?? '10', 10) || 10));
    const reviews = Math.max(0, Math.min(10, parseFloat(req.query.reviews ?? '2.3') || 0));

    const result = pageOf({
      locale,
      provider: getProvider(locale),
      seed,
      page,
      pageSize,
      reviews,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
