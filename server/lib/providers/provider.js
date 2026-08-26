/**
 * The fake-data port.
 *
 * Generation logic never talks to a third-party library directly; it talks to
 * this narrow interface. The production implementation is
 * `faker-provider.js` (a `@faker-js/faker` adapter); the test suite substitutes
 * a tiny stub so that the generation rules can be exercised without pulling the
 * whole locale dataset in.
 *
 * Every method takes an explicit `seed`. That is the important part: a provider
 * call is a *pure function of its seed*, never of how many calls came before it.
 * Two records generated concurrently, or in a different order, therefore still
 * produce identical output.
 *
 * @module server/lib/providers/provider
 */

/**
 * @typedef {object} FakeDataProvider
 * @property {string} locale Locale chain label this provider was built for.
 * @property {(seed: bigint|number, list: Array<T>) => T} pick Random element of a list.
 * @property {(seed: bigint|number, entries: Array<{value: T, weight: number}>) => T} weighted
 *           Weighted random element.
 * @property {(seed: bigint|number, range: {min: number, max: number}) => number} int
 *           Integer in an inclusive range.
 * @property {(seed: bigint|number, list: Array<T>) => Array<T>} shuffle Shuffled copy.
 * @property {(seed: bigint|number, sex: 'male'|'female') => string} firstName
 * @property {(seed: bigint|number, sex: 'male'|'female') => string} lastName
 * @property {(seed: bigint|number, sex: 'male'|'female') => string} fullName
 * @property {(seed: bigint|number) => string} companyName
 * @property {(seed: bigint|number) => string} city
 * @template T
 */

/** Names every provider implementation must expose. Used by the contract test. */
export const PROVIDER_METHODS = Object.freeze([
  'pick',
  'weighted',
  'int',
  'shuffle',
  'firstName',
  'lastName',
  'fullName',
  'companyName',
  'city',
]);

/**
 * Assert that an object satisfies the port. Cheap insurance that the stub and
 * the real adapter never drift apart.
 *
 * @param {object} candidate
 * @returns {FakeDataProvider}
 */
export const assertProvider = (candidate) => {
  const missing = PROVIDER_METHODS.filter((name) => typeof candidate?.[name] !== 'function');
  if (missing.length > 0) {
    throw new TypeError(`Provider is missing method(s): ${missing.join(', ')}`);
  }
  return candidate;
};
