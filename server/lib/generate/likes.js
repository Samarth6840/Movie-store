
import { counted } from '../../../shared/times.js';

export const MAX_LIKES = 10;

export const likesFor = (ctx, average) => {
  const clamped = Math.min(Math.max(average, 0), MAX_LIKES);
  return counted(clamped)(ctx.streamFor('likes'));
};
