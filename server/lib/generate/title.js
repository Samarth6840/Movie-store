/**
 * Movie titles.
 *
 * A title is one weighted pattern from the locale, rendered by the grammar
 * engine. Both halves live in `locales/*.json`, so this module contains no
 * words in any language.
 *
 * @module server/lib/generate/title
 */

import { renderPattern } from './grammar.js';

/** The locale's patterns as `oneOfWeighted`/`ctx.weighted` entries. */
const patternEntries = (locale) =>
  locale.patterns.map(({ template, weight = 1 }) => ({ value: template, weight }));

/**
 * Generate a title.
 *
 * @param {object} locale
 * @param {import('../context.js').Context} ctx
 * @returns {string}
 */
export const titleFor = (locale, ctx) =>
  renderPattern(locale, ctx.at('words'), ctx.weighted('pattern', patternEntries(locale)));

/**
 * Generate a tagline — the line under the title on a poster. Optional per
 * locale: a locale without `taglines` simply has none.
 *
 * @param {object} locale
 * @param {import('../context.js').Context} ctx
 * @returns {string|null}
 */
export const taglineFor = (locale, ctx) => {
  const templates = locale.taglines ?? [];
  if (templates.length === 0) return null;
  return renderPattern(locale, ctx.at('words'), ctx.pick('tagline', templates), { casing: false });
};
