
const MASK = (1n << 64n) - 1n;
const MULTIPLIER = 6364136223846793005n;
const ADDEND = 1442695040888963407n;

export const SEED_BITS = 48;

const MAX_SEED = (1n << BigInt(SEED_BITS)) - 1n;

const toU64 = (value) => BigInt.asUintN(64, BigInt(value));

const avalanche = (x) => {
  let z = toU64(x);
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
};

export const mad = (a, b) => avalanche((toU64(a) * MULTIPLIER + toU64(b) * ADDEND) & MASK);

export const mixSeed = (base, ...parts) => parts.reduce((acc, part) => mad(acc, part), toU64(base));

export const hashText = (text) => {
  let hash = 0xcbf29ce484222325n;
  for (const unit of String(text)) {
    hash = ((hash ^ BigInt(unit.codePointAt(0))) * 0x100000001b3n) & MASK;
  }
  return avalanche(hash);
};

export const normalizeSeed = (input) => {
  if (input === null || input === undefined) return 0n;
  const text = String(input).trim();
  if (text === '') return 0n;
  if (/^\d+$/.test(text)) return BigInt(text) & MAX_SEED;
  return hashText(text) & MAX_SEED;
};

export const formatSeed = (seed) => normalizeSeed(seed).toString();

export const randomSeed = () => {
  const bytes = new Uint8Array(SEED_BITS / 8);
  globalThis.crypto.getRandomValues(bytes);
  return bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n).toString();
};

export const toInt32Seed = (seed) => Number(toU64(seed) & 0x7fffffffn);
