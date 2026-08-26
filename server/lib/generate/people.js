/**
 * People: cast and crew.
 *
 * Names come from the provider (Faker, in production), so they match the locale
 * automatically — German films get German actors, Ukrainian films Ukrainian ones.
 *
 * The cast size is itself fractional: `castFor(ctx, 4.4)` yields four actors and a
 * fifth with probability 0.4. That is the same `times()` machinery the likes and
 * reviews use, which is the point — one combinator, reused everywhere.
 *
 * @module server/lib/generate/people
 */

import { listed, until } from '../../../shared/times.js';

/** Average number of billed actors. Not locale-specific, so it lives in code. */
export const CAST_SIZE = 4.4;

const SEXES = ['male', 'female'];

/**
 * One person's full name, with a coherent sex so the given name and surname agree
 * in locales where surnames are gendered (Ukrainian, Czech, Polish…).
 *
 * @param {import('../context.js').Context} ctx
 * @param {string} label
 * @returns {string}
 */
export const personFor = (ctx, label) =>
  ctx.fullName(label, ctx.pick(`${label}.sex`, SEXES));

/**
 * The billed cast.
 *
 * Each actor is addressed by index, so the list is stable: actor 0 does not change
 * when the average cast size does. A repeated draw is re-rolled against a fresh
 * label — deterministically — so no one is billed twice.
 *
 * @param {import('../context.js').Context} ctx
 * @param {number} [size] Average cast size.
 * @returns {Array<string>}
 */
export const castFor = (ctx, size = CAST_SIZE) =>
  listed(size, (index, _rng, soFar) =>
    until(
      (attempt) => personFor(ctx, `cast.${index}.${attempt}`),
      (name) => !soFar.includes(name),
    ),
  )(ctx.streamFor('cast'));

/**
 * The director.
 *
 * @param {import('../context.js').Context} ctx
 * @returns {string}
 */
export const directorFor = (ctx) => personFor(ctx, 'director');

/**
 * A production company. The locale supplies the suffixes ("Pictures", "Studios",
 * "Фільм"…) so the studio name reads as a studio in that language.
 *
 * @param {object} locale
 * @param {import('../context.js').Context} ctx
 * @returns {string}
 */
export const studioFor = (locale, ctx) => {
  const suffixes = locale.companySuffixes ?? [];
  const stem = ctx.lastName('studio');
  if (suffixes.length === 0) return ctx.companyName('studio');
  return `${stem} ${ctx.pick('studio.suffix', suffixes)}`;
};
