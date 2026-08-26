
import { createFrame } from '../paint/frame.js';
import { letterbox } from '../paint/grade.js';
import { buildScene } from '../scene/scene.js';
import { renderStaticText } from './animator.js';

export const renderPoster = (script, ctx, width, height) => {
  const frame = createFrame(width, height);
  const firstShot = script.shots[0];

  const scene = buildScene(firstShot.scene, ctx.at('scene', 0), width, height);
  scene.draw(frame, 0.4, 1);

  letterbox(frame, 2.39);

  return frame;
};

export const renderPosterWithTitle = (script, ctx, width, height, font, title) => {
  const frame = renderPoster(script, ctx, width, height);

  if (font && title) {
    const tracking = title.length > 15 ? 0.12 : 0.18;
    renderStaticText(frame, title, font, {
      size: 80,
      tracking,
      color: [255, 255, 255],
      origin: {
        x: Math.round(width / 2),
        y: Math.round(height * 0.48),
      },
    });
  }

  return frame;
};
