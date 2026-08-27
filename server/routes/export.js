
import { Router } from 'express';
import { loadLocales } from '../lib/locales.js';
import { pageOf } from '../lib/generate/page.js';
import { renderTrailer } from '../lib/trailer/index.js';
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

const sanitize = (name) => name.replace(/[^a-zA-Z0-9\u0400-\u04FF\u00C0-\u024F\s\-]/g, '').trim().replace(/\s+/g, '_');

router.get('/export', async (req, res) => {
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

    const prov = getProvider(locale);

    const result = pageOf({
      locale,
      provider: prov,
      seed,
      page,
      pageSize,
      reviews,
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="trailers_page_${page}.zip"`,
    });

    
    const { default: archiver } = await import('archiver');
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.pipe(res);

    // Render movies concurrently (bounded) so a page of trailers exports much
    // faster than pure serial, while still leaning on the global worker cap.
    const LIMIT = 3;
    const queue = [...result.movies];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(LIMIT, queue.length) }, async () => {
      while (cursor < queue.length) {
        const movie = queue[cursor++];
        try {
          const buffer = await renderTrailer({
            seed,
            localeCode,
            globalIndex: movie.index - 1,
            movie,
            locale,
            provider: prov,
          });
          archive.append(buffer, { name: `${sanitize(movie.title)}.mp4` });
        } catch {
          // Skip trailers that fail to render rather than aborting the batch.
        }
      }
    });
    await Promise.all(workers);

    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
