
import { SCENE_NAMES, SCENES } from '../scene/scene.js';
import { GRADES } from '../paint/grade.js';
import { facesFor } from '../type/fonts.js';

const SHOT_DURATION_MIN = 1.5;
const SHOT_DURATION_MAX = 2.0;

const TITLE_HOLD = 2.0;

const TRANSITION_MIN = 0.4;
const TRANSITION_MAX = 0.9;

const TRANSITIONS = ['cut', 'dissolve', 'fade-black', 'flash'];

const TITLE_ANIMATIONS = [
  'typewriter',
  'fade-up',
  'scale-in',
  'letter-stagger',
  'blur-in',
  'slide-from-right',
  'slice-reveal',
];

const BILLING_STYLES = ['above', 'below', 'alternating'];

const MOODS = ['epic', 'dark', 'ethereal', 'driving'];

const KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb'];

export const scriptFor = (ctx, movie, faces = []) => {
  const shotCount = ctx.int('shotCount', 2, 2);

  const scenePool = ctx.shuffle('sceneOrder', [...SCENE_NAMES]);
  const scenes = scenePool.slice(0, shotCount);

  const gradeIndex = ctx.int('grade', 0, GRADES.length - 1);
  const grade = GRADES[gradeIndex];

  // Prefer a font that actually covers the title's characters so the title and
  // end-title cards never render missing-glyph (```.notdef```) boxes. Fall back
  // to the full library if no face covers it (e.g. an unusual character).
  const coveringFaces =
    faces.length > 0 ? (facesFor(faces, movie.title).length > 0 ? facesFor(faces, movie.title) : faces) : faces;
  const faceIndex = coveringFaces.length > 0 ? ctx.int('font', 0, coveringFaces.length - 1) : -1;
  const face = faceIndex >= 0 ? coveringFaces[faceIndex].font : null;

  const titleAnim = ctx.pick('titleAnim', TITLE_ANIMATIONS);
  const billingStyle = ctx.pick('billing', BILLING_STYLES);
  const mood = ctx.pick('mood', MOODS);
  const key = ctx.pick('key', KEYS);
  const tempo = ctx.int('tempo', 90, 140);

  const shots = scenes.map((sceneName, i) => {
      const floatRange = (label, min, max) => {
        const rng = ctx.streamFor(label);
        return min + rng() * (max - min);
      };

      const duration = i < shotCount - 1
        ? floatRange(`dur.${i}`, SHOT_DURATION_MIN, SHOT_DURATION_MAX)
        : TITLE_HOLD;

    const transition = i < shotCount - 1
      ? { type: ctx.pick(`trans.${i}`, TRANSITIONS), duration: floatRange(`transD.${i}`, TRANSITION_MIN, TRANSITION_MAX) }
      : null;

    return {
      index: i,
      scene: sceneName,
      duration,
      transition,
      titleCard: i === 0
        ? {
            text: movie.title,
            animation: titleAnim,
            face,
            size: 96,
            tracking: 0.18,
            color: [255, 255, 255],
            shadowColor: [0, 0, 0],
            shadowOffset: 3,
          }
        : null,
      billingCards: i === 1 && movie.cast.length > 0
        ? movie.cast.slice(0, Math.min(3, movie.cast.length)).map((name, j) => ({
            text: name.toUpperCase(),
            style: billingStyle,
            face,
            size: 44,
            tracking: 0.22,
            color: [230, 230, 230],
            delay: j * 0.3,
          }))
        : null,
      endTitleCard: i === shotCount - 1
        ? {
            text: movie.title.toUpperCase(),
            tagline: movie.tagline,
            face,
            size: 80,
            tracking: 0.2,
            color: [255, 255, 255],
          }
        : null,
    };
  });

  const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);

  return {
    title: movie.title,
    movieKey: movie.key,
    shots,
    grade: grade.name,
    totalDuration,
    audio: { key, tempo, mood, duration: totalDuration + 0.5 },
  };
};
