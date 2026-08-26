/**
 * `@faker-js/faker` adapter for the fake-data port.
 *
 * Two things are worth pointing out.
 *
 * 1. The locale chain is *data*, not code: a locale file names the Faker locale
 *    modules it wants (`["de_DE", "de", "base"]`) and they are resolved here.
 *    Adding a language therefore never touches this file.
 *
 * 2. Faker keeps a single internal Mersenne Twister. Rather than trying to
 *    orchestrate that shared state, every call reseeds it from the caller's seed
 *    before reading exactly one value. Calls become order-independent, which is
 *    what lets likes, reviews, cast and trailer be generated in any order (or
 *    concurrently) and still reproduce.
 *
 * @module server/lib/providers/faker-provider
 */

import { Faker, allLocales } from '@faker-js/faker';

import { toInt32Seed } from '../../../shared/seed.js';
import { assertProvider } from './provider.js';

/**
 * Resolve a chain of Faker locale module names to locale definitions.
 *
 * @param {string[]} chain e.g. `['de_DE', 'de', 'base']`
 * @returns {object[]}
 */
const resolveChain = (chain) => {
  const resolved = chain.map((name) => {
    const locale = allLocales[name];
    if (!locale) {
      throw new Error(
        `Unknown Faker locale "${name}". Available: ${Object.keys(allLocales).slice(0, 12).join(', ')}…`,
      );
    }
    return locale;
  });
  // `base` carries the locale-agnostic datasets; keep it last as a safety net.
  return resolved.includes(allLocales.base) ? resolved : [...resolved, allLocales.base];
};

/**
 * Some datasets are incomplete for some locales (Faker falls back, but a few
 * modules can still throw). Anything that fails degrades to a neutral value
 * instead of taking the request down.
 */
const orElse = (fn, fallback) => {
  try {
    const value = fn();
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch {
    return fallback;
  }
};

/**
 * Build a provider for one locale chain.
 *
 * @param {{code: string, fakerLocale: string[]}} locale
 * @returns {import('./provider.js').FakeDataProvider}
 */
export const createFakerProvider = (locale) => {
  const faker = new Faker({ locale: resolveChain(locale.fakerLocale) });

  /** Reseed, then hand the instance over for a single read. */
  const at = (seed) => {
    faker.seed(toInt32Seed(seed));
    return faker;
  };

  return assertProvider({
    locale: locale.code,

    pick: (seed, list) => at(seed).helpers.arrayElement(list),
    weighted: (seed, entries) => at(seed).helpers.weightedArrayElement(entries),
    int: (seed, range) => at(seed).number.int(range),
    shuffle: (seed, list) => at(seed).helpers.shuffle(list),

    firstName: (seed, sex) => orElse(() => at(seed).person.firstName(sex), 'Alex'),
    lastName: (seed, sex) => orElse(() => at(seed).person.lastName(sex), 'Morgan'),
    fullName: (seed, sex) => orElse(() => at(seed).person.fullName({ sex }), 'Alex Morgan'),
    companyName: (seed) => orElse(() => at(seed).company.name(), 'Meridian'),
    city: (seed) => orElse(() => at(seed).location.city(), 'Springfield'),
  });
};
