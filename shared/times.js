

const isCount = (n) => typeof n === 'number' && Number.isFinite(n);

export const times = (n, fn) => {
  if (!isCount(n)) throw new TypeError('times: the count must be a finite number.');
  if (n < 0) throw new RangeError('times: the count cannot be negative.');

  const whole = Math.floor(n);
  const tail = n - whole;

  return (value, rng) => {
    const withTail = tail > 0 && rng() < tail;
    let acc = value;
    for (let i = whole; i--; ) acc = fn(acc, rng);
    return withTail ? fn(acc, rng) : acc;
  };
};

export const pipe =
  (...ops) =>
  (value, rng) =>
    ops.reduce((acc, op) => op(acc, rng), value);

export const from = (initial, op) => (rng) => op(initial, rng);

export const inc = (value) => value + 1;

export const counted = (n) => from(0, times(n, inc));

export const listed = (n, make) =>
  from(
    [],
    times(n, (list, rng) => [...list, make(list.length, rng, list)]),
  );

export const until = (attempt, accept, limit = 8) => {
  let value = attempt(0);
  for (let n = 1; n < limit && !accept(value); n += 1) value = attempt(n);
  return value;
};
