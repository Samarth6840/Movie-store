import path from 'node:path';
import { loadLocales } from './locales.js';
import { createFakerProvider } from './providers/faker-provider.js';
import { contextForRecord } from './generate/page.js';
import { identityFor } from './generate/movie.js';
import { normalizeSeed } from '../../shared/seed.js';
import { renderPoster } from './trailer/index.js';

const POSTER_COUNT = 24;
const DEFAULT_SEED = '0';
const DEFAULT_LOCALE = 'en-US';

let preGenDone = false;

export const isPreGenDone = () => preGenDone;

export const preGeneratePosters = async () => {
  const start = Date.now();
  console.log('[pre-gen] Starting poster pre-generation...');

  try {
    const locales = await loadLocales();
    const locale = locales.get(DEFAULT_LOCALE);
    if (!locale) {
      console.log('[pre-gen] Locale not found, skipping');
      return;
    }

    const prov = createFakerProvider(locale);
    const seed = normalizeSeed(DEFAULT_SEED);

    for (let i = 0; i < POSTER_COUNT; i++) {
      try {
        const ctx = contextForRecord(prov, seed, DEFAULT_LOCALE, i);
        const movie = identityFor(locale, ctx, i);
        await renderPoster({
          seed,
          localeCode: DEFAULT_LOCALE,
          globalIndex: i,
          movie,
          locale,
          provider: prov,
        });
      } catch (err) {
        console.error(`[pre-gen] Failed poster ${i}:`, err.message);
      }
    }

    preGenDone = true;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[pre-gen] Done! ${POSTER_COUNT} posters generated in ${elapsed}s`);
  } catch (err) {
    console.error('[pre-gen] Error:', err.message);
  }
};
