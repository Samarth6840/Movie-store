
import { createContext } from '../context.js';
import { movieFor } from './movie.js';

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_BATCH_SIZE = 24;

export const contextForRecord = (provider, seed, localeCode, index) =>
  createContext(provider, seed, localeCode, 'movie', index);

export const pageOf = ({
  locale,
  provider,
  seed,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  reviews,
}) => {
  const offset = (page - 1) * pageSize;
  const settings = { reviews };
  const movies = Array.from({ length: pageSize }, (_, position) => {
    const index = offset + position;
    return movieFor(locale, contextForRecord(provider, seed, locale.code, index), index, settings);
  });
  return { page, pageSize, offset, movies };
};
