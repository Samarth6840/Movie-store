
import { hashText, mixSeed } from '../../shared/seed.js';
import { createRng } from './random.js';

const componentOf = (part) => (typeof part === 'string' ? hashText(part) : BigInt(part));

export const seedAt = (base, ...path) => mixSeed(base, ...path.map(componentOf));


export const createContext = (provider, base, ...path) => {
  const seed = seedAt(base, ...path);
  const forLabel = (label) => seedAt(seed, label);

  return {
    seed,
    rng: createRng(seed),
    provider,

    at: (...more) => createContext(provider, seed, ...more),
    streamFor: (label) => createRng(forLabel(label)),

    pick: (label, list) => provider.pick(forLabel(label), list),
    weighted: (label, entries) => provider.weighted(forLabel(label), entries),
    int: (label, min, max) => provider.int(forLabel(label), { min, max }),
    shuffle: (label, list) => provider.shuffle(forLabel(label), list),

    firstName: (label, sex) => provider.firstName(forLabel(label), sex),
    lastName: (label, sex) => provider.lastName(forLabel(label), sex),
    fullName: (label, sex) => provider.fullName(forLabel(label), sex),
    companyName: (label) => provider.companyName(forLabel(label)),
    city: (label) => provider.city(forLabel(label)),
  };
};
