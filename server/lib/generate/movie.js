
import { renderPattern } from './grammar.js';
import { titleFor, taglineFor } from './title.js';
import { castFor, directorFor, studioFor } from './people.js';
import { reviewsFor } from './reviews.js';

export const LATEST_YEAR = 2026;
const EARLIEST_YEAR = 1971;

const RUNTIME_MIN = 82;
const RUNTIME_MAX = 187;

const yearEntries = () => {
  const entries = [];
  for (let year = EARLIEST_YEAR; year <= LATEST_YEAR; year += 1) {
    const age = LATEST_YEAR - year;
    entries.push({ value: year, weight: 1 / (1 + age * 0.28) });
  }
  return entries;
};

const YEAR_ENTRIES = yearEntries();

const genreEntries = (locale) =>
  locale.genres.map((entry) =>
    typeof entry === 'string' ? { value: entry, weight: 1 } : { value: entry.value, weight: entry.weight ?? 1 },
  );

const scoreFor = (ctx) => {
  const rng = ctx.streamFor('score');
  const bell = (rng() + rng() + rng()) / 3;
  return Math.round((1.2 + bell * 7.9) * 10) / 10;
};

const synopsisFor = (locale, ctx) => {
  const templates = locale.synopses ?? [];
  if (templates.length === 0) return '';
  return renderPattern(locale, ctx.at('words'), ctx.pick('synopsis', templates), { casing: false });
};

export const identityFor = (locale, ctx, index) => {
  const director = directorFor(ctx.at('crew'));
  return {
    key: ctx.seed.toString(36),
    index: index + 1, 
    title: titleFor(locale, ctx.at('title')),
    tagline: taglineFor(locale, ctx.at('tagline')),
    genre: ctx.weighted('genre', genreEntries(locale)),
    year: ctx.weighted('year', YEAR_ENTRIES),
    cast: castFor(ctx.at('cast')),
    director,
    studio: studioFor(locale, ctx.at('studio')),
    runtime: ctx.int('runtime', RUNTIME_MIN, RUNTIME_MAX),
    certification: ctx.pick('certification', locale.certifications ?? ['']),
    synopsis: synopsisFor(locale, ctx.at('synopsis')),
    score: scoreFor(ctx),
  };
};

export const movieFor = (locale, ctx, index, settings) => {
  const identity = identityFor(locale, ctx, index);
  return {
    ...identity,
    reviews: reviewsFor(locale, ctx.at('reviews'), settings.reviews, identity),
  };
};
