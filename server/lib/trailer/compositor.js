
import { createFrame, copyInto, dissolve, blur } from '../paint/frame.js';
import { bakeGrade, applyGrade, applyBloom, applyAberration, letterbox } from '../paint/grade.js';
import { buildScene } from '../scene/scene.js';
import { GRADES } from '../paint/grade.js';
import { renderTitleCard, renderBillingCards } from './animator.js';

export const compositeFrame = (
  script,
  frameIndex,
  fps,
  width,
  height,
  ctx,
  sceneCache,
  frame,
  scratch,
  prevShot = null,
) => {
  const timeSeconds = frameIndex / fps;
  const grade = GRADES.find((g) => g.name === script.grade) ?? GRADES[0];
  const gradeTable = bakeGrade(grade);

  
  let elapsed = 0;
  let shot = script.shots[0];
  let shotStart = 0;
  for (const s of script.shots) {
    if (timeSeconds < elapsed + s.duration) {
      shot = s;
      shotStart = elapsed;
      break;
    }
    elapsed += s.duration;
  }

  const shotProgress = Math.min(1, (timeSeconds - shotStart) / shot.duration);
  const absoluteProgress = timeSeconds / script.totalDuration;

  
  const sceneKey = `${shot.scene}.${shot.index}`;
  let scene = sceneCache.get(sceneKey);
  if (!scene) {
    const shotCtx = ctx.at('scene', shot.index);
    scene = buildScene(shot.scene, shotCtx, width, height);
    sceneCache.set(sceneKey, scene);
  }
  scene.draw(frame, shotProgress, timeSeconds);

  
  if (shot.titleCard && shot.titleCard.face) {
    renderTitleCard(frame, shot.titleCard.text, shot.titleCard.face, shot.titleCard, shotProgress);
  }

  
  if (shot.endTitleCard && shot.endTitleCard.face) {
    const endT = Math.max(0, (shotProgress - 0.3) / 0.7);
    renderTitleCard(frame, shot.endTitleCard.text, shot.endTitleCard.face, shot.endTitleCard, endT);
  }

  
  if (shot.billingCards && shot.billingCards.length > 0) {
    renderBillingCards(frame, shot.billingCards, shotProgress);
  }

  
  if (shot.transition && prevShot && shot.transition.type === 'dissolve') {
    const transStart = shot.duration - shot.transition.duration;
    if (shotProgress >= transStart / shot.duration) {
      const blend = (shotProgress - transStart / shot.duration) / (shot.transition.duration / shot.duration);
      dissolve(frame, prevShot, 1 - blend);
    }
  }

  if (shot.transition && shot.transition.type === 'fade-black') {
    const transStart = shot.duration - shot.transition.duration;
    if (shotProgress >= transStart / shot.duration) {
      const blend = (shotProgress - transStart / shot.duration) / (shot.transition.duration / shot.duration);
      const { data } = frame;
      for (let i = 0; i < data.length; i += 3) {
        data[i] *= 1 - blend;
        data[i + 1] *= 1 - blend;
        data[i + 2] *= 1 - blend;
      }
    }
  }

  if (shot.transition && shot.transition.type === 'flash') {
    const transStart = shot.duration - shot.transition.duration;
    if (shotProgress >= transStart / shot.duration) {
      const blend = (shotProgress - transStart / shot.duration) / (shot.transition.duration / shot.duration);
      const flash = blend < 0.5 ? blend * 2 : (1 - blend) * 2;
      const { data } = frame;
      for (let i = 0; i < data.length; i += 3) {
        data[i] += (255 - data[i]) * flash * 0.8;
        data[i + 1] += (255 - data[i + 1]) * flash * 0.8;
        data[i + 2] += (255 - data[i + 2]) * flash * 0.8;
      }
    }
  }

  
  applyGrade(frame, gradeTable, {
    saturation: grade.saturation,
    vignette: 0.35,
    grain: 0.035,
    frameIndex,
    exposure: 1.05,
  });

  letterbox(frame, 2.39);
};

export const createBuffers = (width, height) => ({
  frame: createFrame(width, height),
  scratch: createFrame(width, height),
  prevShot: createFrame(width, height),
});
