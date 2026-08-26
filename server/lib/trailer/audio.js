
const SAMPLE_RATE = 44100;
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

const sine = (freq, t, harmonics = 0) => {
  let v = Math.sin(2 * Math.PI * freq * t);
  if (harmonics > 0) {
    v += 0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
    v += 0.1 * Math.sin(2 * Math.PI * freq * 3 * t);
  }
  return v;
};

const noiseHit = (t, decay, rng) => {
  if (t < 0 || t > decay) return 0;
  return (rng() * 2 - 1) * Math.exp(-t / (decay * 0.3));
};

export const synthesiseScore = ({ key = 'C', tempo = 120, mood = 'epic', duration = 10, seed = 0 }) => {
  const rng = mulberry32(seed);
  const scale = SCALES[key] ?? SCALES.C;
  const baseNote = mood === 'dark' ? 48 : mood === 'ethereal' ? 55 : 52; 
  const beatDuration = 60 / tempo;
  const totalSamples = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);

  const moodPadGain = mood === 'ethereal' ? 0.2 : mood === 'dark' ? 0.25 : 0.18;
  const moodMelodyGain = mood === 'driving' ? 0.45 : 0.35;
  const drumGain = mood === 'driving' ? 0.5 : mood === 'ethereal' ? 0.2 : 0.35;

  
  const padNote1 = baseNote + scale[0];
  const padNote2 = baseNote + scale[2];
  const padNote3 = baseNote + scale[4];

  
  const melodyPattern = [];
  const patternLength = 16;
  for (let i = 0; i < patternLength; i += 1) {
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

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatDuration;
    let sample = 0;

    
    const padEnv = Math.min(1, t / 1.5) * Math.min(1, (duration - t) / 1.0);
    sample += sine(noteFreq(padNote1), t, 1) * moodPadGain * padEnv;
    sample += sine(noteFreq(padNote2), t, 1) * moodPadGain * 0.7 * padEnv;
    sample += sine(noteFreq(padNote3), t, 0.5) * moodPadGain * 0.5 * padEnv;

    
    const note = melodyPattern[melodyIndex % patternLength];
    const noteStart = melodyTime;
    const noteEnd = noteStart + note.duration;
    if (t >= noteStart && t < noteEnd) {
      const noteT = t - noteStart;
      const env = envelope(noteT, 0.01, 0.05, 0.7, 0.05, note.duration);
      sample += sine(noteFreq(note.midi), t, 0) * moodMelodyGain * note.velocity * env;
    }
    if (t >= noteEnd) {
      melodyTime = noteEnd;
      melodyIndex += 1;
    }

    
    const beatPhase = beat % 1;
    if (beatPhase < 0.08) {
      const kickFreq = 60 * Math.exp(-beatPhase * 30);
      sample += Math.sin(2 * Math.PI * kickFreq * beatPhase) * drumGain * Math.exp(-beatPhase * 15);
    }

    
    if (Math.floor(beat) % 2 === 1 && beatPhase < 0.06) {
      sample += noiseHit(beatPhase, 0.06, rng) * drumGain * 0.6;
    }

    
    if ((beat * 2) % 1 < 0.02) {
      sample += noiseHit(beatPhase, 0.02, rng) * drumGain * 0.2;
    }

    
    const thunderStart = duration * 0.45;
    const thunderDur = 1.5;
    if (t >= thunderStart && t < thunderStart + thunderDur) {
      const tt = t - thunderStart;
      const thunderEnv = Math.sin(Math.PI * tt / thunderDur);
      sample += (rng() * 2 - 1) * 0.15 * thunderEnv * Math.exp(-tt * 2);
      sample += Math.sin(2 * Math.PI * 35 * tt) * 0.12 * thunderEnv;
    }

    
    const riserStart = duration - 2.5;
    if (t >= riserStart) {
      const rt = t - riserStart;
      const riserFreq = 200 + rt * rt * 80;
      const riserEnv = Math.min(1, rt / 1.5) * Math.min(1, (duration - t) / 0.5);
      sample += Math.sin(2 * Math.PI * riserFreq * t) * 0.1 * riserEnv;
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

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], headerLength + i * 2);
  }

  return buffer;
};
