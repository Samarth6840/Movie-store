
const SAMPLE_RATE = 22050;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const BLOCK_ALIGN = NUM_CHANNELS * BYTES_PER_SAMPLE;

const SCALES = {
  C:  [0, 2, 4, 7, 9],
  D:  [0, 2, 4, 7, 9],
  E:  [0, 2, 4, 7, 9],
  F:  [0, 2, 5, 7, 9],
  G:  [0, 2, 4, 7, 9],
  A:  [0, 2, 4, 7, 9],
  Bb: [0, 2, 4, 7, 10],
};

const noteFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const mulberry32 = (seed) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const envelope = (t, attack, decay, sustain, release, duration) => {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < duration - release) return sustain;
  if (t < duration) return sustain * (1 - (t - (duration - release)) / release);
  return 0;
};

const sine = (freq, t) => Math.sin(2 * Math.PI * freq * t);

export const synthesiseScore = ({ key = 'C', tempo = 120, mood = 'epic', duration = 10, seed = 0 }) => {
  const rng = mulberry32(seed);
  const scale = SCALES[key] ?? SCALES.C;
  const baseNote = mood === 'dark' ? 48 : mood === 'ethereal' ? 55 : 52;
  const beatDuration = 60 / tempo;
  const totalSamples = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);

  const padGain = mood === 'ethereal' ? 0.2 : mood === 'dark' ? 0.25 : 0.18;
  const melodyGain = mood === 'driving' ? 0.45 : 0.35;

  const padNote1 = baseNote + scale[0];
  const padNote2 = baseNote + scale[2];

  const melodyPattern = [];
  for (let i = 0; i < 8; i++) {
    const degree = Math.floor(rng() * scale.length);
    const octave = rng() > 0.7 ? 12 : 0;
    melodyPattern.push({
      midi: baseNote + 12 + scale[degree] + octave,
      duration: beatDuration * (rng() > 0.6 ? 0.5 : 1),
      velocity: 0.5 + rng() * 0.5,
    });
  }

  let melodyTime = 0;
  let melodyIndex = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;

    const padEnv = Math.min(1, t / 1.0) * Math.min(1, (duration - t) / 0.8);
    sample += sine(noteFreq(padNote1), t) * padGain * padEnv;
    sample += sine(noteFreq(padNote2), t) * padGain * 0.7 * padEnv;

    const note = melodyPattern[melodyIndex % melodyPattern.length];
    const noteStart = melodyTime;
    const noteEnd = noteStart + note.duration;
    if (t >= noteStart && t < noteEnd) {
      const noteT = t - noteStart;
      const env = envelope(noteT, 0.01, 0.05, 0.7, 0.05, note.duration);
      sample += sine(noteFreq(note.midi), t) * melodyGain * note.velocity * env;
    }
    if (t >= noteEnd) {
      melodyTime = noteEnd;
      melodyIndex++;
    }

    const beat = t / beatDuration;
    const beatPhase = beat % 1;
    if (beatPhase < 0.08) {
      const kickFreq = 60 * Math.exp(-beatPhase * 30);
      sample += Math.sin(2 * Math.PI * kickFreq * beatPhase) * 0.4 * Math.exp(-beatPhase * 15);
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    samples[i] = Math.round(clamped * 32767);
  }

  return encodeWav(samples, SAMPLE_RATE, NUM_CHANNELS, BITS_PER_SAMPLE);
};

const encodeWav = (samples, sampleRate, numChannels, bitsPerSample) => {
  const dataLength = samples.length * (bitsPerSample / 8);
  const headerLength = 44;
  const buffer = Buffer.alloc(headerLength + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], headerLength + i * 2);
  }

  return buffer;
};
