
import { createFrame } from '../paint/frame.js';
import { letterbox } from '../paint/grade.js';
import { buildScene } from '../scene/scene.js';
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

  letterbox(frame, 2.39);
};

export const createBuffers = (width, height) => ({
  frame: createFrame(width, height),
  scratch: createFrame(width, height),
  prevShot: createFrame(width, height),
});
