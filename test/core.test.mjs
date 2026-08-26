/**
 * Tests for the fractional-iteration core.
 *
 * The behaviour under test is the one the brief cares about most: a count of
 * `4.7` must average 4.7, only ever produce 4 or 5, and — critically — must not
 * reshuffle already-generated values when the count is nudged.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { times, counted, listed, inc, pipe } from '../shared/times.js';
import { createRng } from '../server/lib/random.js';
import { mad, mixSeed, normalizeSeed, randomSeed, hashText, SEED_BITS } from '../shared/seed.js';

const SAMPLES = 20000;

/** Run `fn` over many independent seeds and collect the results. */
const overSeeds = (fn, samples = SAMPLES) =>
  Array.from({ length: samples }, (_, i) => fn(createRng(mixSeed(9001n, i))));

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

test('times applies an integer count exactly', () => {
  const add = times(3, inc);
  for (const seed of [1n, 2n, 99n]) {
    assert.equal(add(0, createRng(seed)), 3);
  }
});

test('times(0) is the identity', () => {
  assert.equal(times(0, inc)(41, createRng(7n)), 41);
});

test('a fractional count only ever yields the two neighbouring integers', () => {
  const results = new Set(overSeeds(counted(4.7), 2000));
  assert.deepEqual([...results].sort((a, b) => a - b), [4, 5]);
});

test('a fractional count converges on the requested average', () => {
  for (const target of [0, 0.5, 2.3, 4.7, 9.1, 10]) {
    const observed = mean(overSeeds(counted(target)));
    assert.ok(
      Math.abs(observed - target) < 0.05,
      `count ${target}: observed average ${observed.toFixed(3)}`,
    );
  }
});

test('0.5 splits one-to-one, as the brief specifies', () => {
  const values = overSeeds(counted(0.5));
  const ones = values.filter((v) => v === 1).length;
  assert.ok(Math.abs(ones / values.length - 0.5) < 0.02, `share of 1s: ${ones / values.length}`);
});

test('raising the count never lowers the result for a given seed', () => {
  // This is what keeps likes stable while the slider moves: the coin for the
  // fractional tail sits at a fixed position in the stream.
  for (let i = 0; i < 500; i++) {
    const seed = mixSeed(4242n, i);
    let previous = -1;
    for (const n of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3.9, 4, 7.2, 10]) {
      const value = counted(n)(createRng(seed));
      assert.ok(value >= previous, `count ${n} produced ${value} after ${previous}`);
      previous = value;
    }
  }
});

test('listed keeps earlier elements when the length changes', () => {
  const make = (index) => `item-${index}`;
  const seed = mixSeed(77n, 5);
  const shorter = listed(2.4, make)(createRng(seed));
  const longer = listed(6.8, make)(createRng(seed));
  assert.deepEqual(shorter, longer.slice(0, shorter.length));
});

test('listed averages the requested length', () => {
  const observed = mean(overSeeds(listed(3.25, (i) => i)).map((list) => list.length));
  assert.ok(Math.abs(observed - 3.25) < 0.05, `observed ${observed}`);
});

test('pipe composes operations left to right', () => {
  const op = pipe(times(2, inc), times(3, (x) => x * 2));
  assert.equal(op(1, createRng(1n)), (1 + 2) * 8);
});

test('times rejects nonsense counts', () => {
  assert.throws(() => times(-1, inc), RangeError);
  assert.throws(() => times(Number.NaN, inc), TypeError);
  assert.throws(() => times('3', inc), TypeError);
});

test('seed mixing avalanches: neighbouring indices are unrelated', () => {
  const a = mad(1n, 1n);
  const b = mad(1n, 2n);
  assert.notEqual(a, b);
  // Hamming distance between two 64-bit mixes of adjacent inputs should be broad.
  const diff = (a ^ b).toString(2).replace(/0/g, '').length;
  assert.ok(diff > 16, `only ${diff} bits differ`);
});

test('seed mixing is order-sensitive and reproducible', () => {
  assert.equal(mixSeed(5n, 1, 2), mixSeed(5n, 1, 2));
  assert.notEqual(mixSeed(5n, 1, 2), mixSeed(5n, 2, 1));
});

test('seeds normalise predictably and stay within the advertised width', () => {
  assert.equal(normalizeSeed('123456789012'), 123456789012n);
  assert.equal(normalizeSeed('  42 '), 42n);
  assert.equal(normalizeSeed(''), 0n);
  assert.equal(normalizeSeed(null), 0n);
  assert.equal(normalizeSeed('hello'), hashText('hello') & ((1n << BigInt(SEED_BITS)) - 1n));
  assert.ok(normalizeSeed('9'.repeat(30)) < 1n << BigInt(SEED_BITS));
});

test('generated seeds use the full advertised width', () => {
  const seeds = Array.from({ length: 200 }, randomSeed);
  assert.equal(new Set(seeds).size, seeds.length, 'generated seeds should not repeat');
  const widest = seeds.reduce((max, s) => (BigInt(s) > max ? BigInt(s) : max), 0n);
  assert.ok(widest > 1n << BigInt(SEED_BITS - 8), 'seeds should reach the top of the range');
});

test('the same seed always yields the same stream', () => {
  const draw = (seed) => Array.from({ length: 8 }, createRng(seed));
  assert.deepEqual(draw(12345n), draw(12345n));
  assert.notDeepEqual(draw(12345n), draw(12346n));
});

test('the stream is uniform enough to trust', () => {
  const rng = createRng(31337n);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) buckets[Math.floor(rng() * 10)] += 1;
  for (const count of buckets) {
    assert.ok(Math.abs(count - 10000) < 600, `bucket skew: ${buckets.join(',')}`);
  }
});
