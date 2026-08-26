
import { xoroshiro128plus, uniformIntDistribution } from 'pure-rand';

import { mixSeed } from '../../shared/seed.js';

const TWO_POW_32 = 0x1_0000_0000;

export const createRng = (seed) => {
  let rng = xoroshiro128plus(Number(BigInt(seed) & ((1n << 48n) - 1n)));
  return () => {
    const [value, nextRng] = rng.next();
    rng = nextRng;
    return (value + 0x8000_0000) / TWO_POW_32;
  };
};

export const seededInt = (seed, min, max) => {
  const rng = xoroshiro128plus(Number(BigInt(seed) & ((1n << 48n) - 1n)));
  const [value] = uniformIntDistribution(min, max)(rng);
  return value;
};

export const chance = (rng, probability) => rng() < probability;

export const between = (rng, min, max) => min + rng() * (max - min);

export const intBetween = (rng, min, max) => Math.floor(between(rng, min, max + 1));

export const oneOf = (rng, list) => list[intBetween(rng, 0, list.length - 1)];

export const oneOfWeighted = (rng, entries) => {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let ticket = rng() * total;
  for (const entry of entries) {
    ticket -= entry.weight;
    if (ticket < 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

export const shuffled = (rng, list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = intBetween(rng, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const sampleOf = (rng, list, count) => shuffled(rng, list).slice(0, Math.min(count, list.length));
