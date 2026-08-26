
import { listed, until } from '../../../shared/times.js';

export const MAX_REVIEWS = 10;

const TONES = ['positive', 'mixed', 'negative'];

const toneEntries = (score) => [
  { value: 'positive', weight: Math.max(score - 2, 0.5) },
  { value: 'mixed', weight: 4 },
  { value: 'negative', weight: Math.max(8 - score, 0.5) },
];

const availableTones = (locale) => TONES.filter((tone) => (locale.reviews[tone] ?? []).length > 0);

const outletFor = (locale, ctx) => {
  const outlets = locale.outlets ?? [];
  return outlets.length > 0 ? ctx.pick('outlet', outlets) : ctx.companyName('outlet');
};

export const reviewFor = (locale, ctx, film, soFar = []) => {
  const tones = availableTones(locale);
  const entries = toneEntries(film.score).filter((entry) => tones.includes(entry.value));
  const tone = entries.length > 0 ? ctx.weighted('tone', entries) : tones[0];
  const lines = locale.reviews[tone];
  const seen = new Set(soFar.map((review) => review.text));
  const template = until(
    (attempt) => ctx.pick(`text.${tone}.${attempt}`, lines),
    (line) => !seen.has(line.replaceAll('{name}', film.director)),
  );
  const author = ctx.fullName('author', ctx.pick('author.sex', ['male', 'female']));

  return {
    tone,
    text: template.replaceAll('{name}', film.director),
    author,
    outlet: outletFor(locale, ctx),
  };
};

export const reviewsFor = (locale, ctx, average, film) => {
  const clamped = Math.min(Math.max(average, 0), MAX_REVIEWS);
  const make = (index, _rng, soFar) => reviewFor(locale, ctx.at('review', index), film, soFar);
  return listed(clamped, make)(ctx.streamFor('reviews'));
};
