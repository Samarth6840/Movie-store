/**
 * Test double for the fake-data port.
 *
 * Implements the same contract as the Faker adapter using small in-file word
 * lists, so the generation rules can be tested without loading Faker's locale
 * datasets. It is deliberately *not* used by the server.
 *
 * @module test/stubs/stub-provider
 */

import { createRng, oneOf, oneOfWeighted, shuffled, intBetween } from '../../server/lib/random.js';
import { assertProvider } from '../../server/lib/providers/provider.js';

const FIRST_NAMES = ['Ada', 'Bruno', 'Cora', 'Dmitri', 'Elif', 'Farid', 'Greta', 'Hugo'];
const LAST_NAMES = ['Adler', 'Baptiste', 'Cole', 'Draganov', 'Eriksen', 'Fontaine', 'Grimm'];
const COMPANIES = ['Northwind', 'Vitrine Group', 'Kessler & Sons', 'Halcyon Media'];
const CITIES = ['Aldergrove', 'Brackenmoor', 'Castellane', 'Dunhollow'];

/**
 * @param {{code?: string}} [locale]
 * @returns {import('../../server/lib/providers/provider.js').FakeDataProvider}
 */
export const createStubProvider = (locale = {}) =>
  assertProvider({
    locale: locale.code ?? 'stub',

    pick: (seed, list) => oneOf(createRng(seed), list),
    weighted: (seed, entries) => oneOfWeighted(createRng(seed), entries),
    int: (seed, { min, max }) => intBetween(createRng(seed), min, max),
    shuffle: (seed, list) => shuffled(createRng(seed), list),

    firstName: (seed) => oneOf(createRng(seed), FIRST_NAMES),
    lastName: (seed) => oneOf(createRng(seed), LAST_NAMES),
    fullName: (seed) => {
      const rng = createRng(seed);
      return `${oneOf(rng, FIRST_NAMES)} ${oneOf(rng, LAST_NAMES)}`;
    },
    companyName: (seed) => oneOf(createRng(seed), COMPANIES),
    city: (seed) => oneOf(createRng(seed), CITIES),
  });
