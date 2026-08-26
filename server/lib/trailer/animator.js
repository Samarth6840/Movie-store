/**
 * Typographic animator: brings static glyph layouts to life.
 *
 * A layout (from `type/layout.js`) tells us *where* each glyph sits at rest;
 * the animator tells us where it sits *at time t*, and what opacity and
 * transform it carries. Every animation is a pure function of time, glyph
 * index and glyph count — no state, no side effects — so a frame can be
 * painted in any order.
 *
 * The library provides several named presets (typewriter, letter-stagger, …)
 * and a `renderCard` helper that composites an animated layout onto a frame.
 *
 * @module server/lib/trailer/animator
 */

import { createFrame, compositeMask, compositeMaskShaded, blendPixel, smoothstep, ramp } from '../paint/frame.js';
import { createMask, addPolygon, resolveMask } from '../type/raster.js';
import { layoutLine } from '../type/layout.js';

/** Per-glyph transforms that the compositor can read. */
/**
 * @param {number} t Progress in `[0, 1]`.
 * @param {number} index Glyph index.
 * @param {number} count Total glyphs.
 * @param {object} animation Named animation preset.
 * @returns {{x: number, y: number, opacity: number, scale: number, blur: number}}
 */
const glyphTransform = (t, index, count, animation) => {
  const normalisedIndex = count > 1 ? index / (count - 1) : 0;
  const delay = normalisedIndex * 0.4;
  const local = Math.max(0, Math.min(1, (t - delay) / (1 - delay * 0.7)));

  switch (animation) {
    case 'typewriter':
      return {
        x: 0, y: 0,
        opacity: Math.min(1, local * 3),
        scale: 1,
        blur: 0,
      };

    case 'fade-up':
      return {
        x: 0,
        y: (1 - smoothstep(local)) * 20,
        opacity: smoothstep(local),
        scale: 1,
        blur: (1 - smoothstep(local)) * 4,
      };

    case 'scale-in':
      return {
        x: 0, y: 0,
        opacity: smoothstep(local),
        scale: 0.6 + smoothstep(local) * 0.4,
        blur: (1 - smoothstep(local)) * 6,
      };

    case 'letter-stagger': {
      const stagger = Math.max(0, Math.min(1, (t - normalisedIndex * 0.25) * 3));
      return {
        x: 0,
        y: (1 - smoothstep(stagger)) * 30 * (index % 2 === 0 ? -1 : 1),
        opacity: smoothstep(stagger),
        scale: 1,
        blur: 0,
      };
    }

    case 'blur-in':
      return {
        x: 0, y: 0,
        opacity: smoothstep(local),
        scale: 1,
        blur: (1 - smoothstep(local)) * 12,
      };

    case 'slide-from-right':
      return {
        x: (1 - smoothstep(local)) * 80,
        y: 0,
        opacity: smoothstep(local),
        scale: 1,
        blur: 0,
      };

    case 'slice-reveal': {
      const slice = Math.max(0, Math.min(1, (t - normalisedIndex * 0.15) * 2.5));
      return {
        x: 0,
        y: 0,
        opacity: smoothstep(slice),
        scale: 1,
        blur: (1 - smoothstep(slice)) * 8,
      };
    }

    default:
      return { x: 0, y: 0, opacity: 1, scale: 1, blur: 0 };
  }
};

/**
 * Render an animated text card onto a frame.
 *
 * @param {import('../paint/frame.js').Frame} frame Target frame.
 * @param {string} text The string to animate.
 * @param {import('../type/font.js').Font} font Parsed font.
 * @param {object} options
 * @param {number} options.size Pixel size.
 * @param {number} [options.tracking] Extra letter-spacing as fraction of em.
 * @param {[number, number, number]} [options.color] RGB ink colour.
 * @param {string} [options.animation] Named animation preset.
 * @param {number} options.t Progress `[0, 1]`.
 * @param {{x?: number, y?: number}} [options.origin] Where to place the baseline.
 */
export const renderAnimatedText = (
  frame,
  text,
  font,
  {
    size = 96,
    tracking = 0.18,
    color = [255, 255, 255],
    animation = 'fade-up',
    t = 0,
    origin = {},
  } = {},
) => {
  const layout = layoutLine(font, text, { size, tracking });
  const ox = origin.x ?? Math.round((frame.width - layout.width) / 2);
  const oy = origin.y ?? Math.round(frame.height / 2);

  for (let i = 0; i < layout.glyphs.length; i += 1) {
    const glyph = layout.glyphs[i];
    const transform = glyphTransform(t, i, layout.glyphs.length, animation);
    if (transform.opacity <= 0.01) continue;

    const polygons = glyph.contours.map((contour) =>
      contour.map((pt) => {
        const gx = ox + glyph.x + pt.x * transform.scale + transform.x;
        const gy = oy - pt.y * transform.scale - layout.ascent + transform.y;
        return { x: Math.round(gx), y: Math.round(gy) };
      }),
    );

    const maskWidth = Math.ceil(glyph.advance * transform.scale) + 8;
    const maskHeight = Math.ceil(size * transform.scale) + 8;
    const mask = { width: maskWidth, height: maskHeight, stride: maskWidth + 2, area: new Float32Array((maskWidth + 2) * maskHeight) };
    for (const polygon of polygons) {
      addPolygon(mask, polygon.map((pt) => ({
        x: pt.x - Math.round(ox + glyph.x) + 4,
        y: pt.y - Math.round(oy - layout.ascent) + 4,
      })));
    }
    const coverage = resolveMask(mask);
    compositeMask(frame, { coverage, width: maskWidth, height: maskHeight }, color, {
      x: Math.round(ox + glyph.x) - 4,
      y: Math.round(oy - layout.ascent) - 4,
      alpha: transform.opacity,
    });
  }
};

/**
 * Render a static text card (no animation, just placement).
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {string} text
 * @param {import('../type/font.js').Font} font
 * @param {object} options Same as `renderAnimatedText` minus `t` and `animation`.
 */
export const renderStaticText = (frame, text, font, options = {}) =>
  renderAnimatedText(frame, text, font, { ...options, t: 1, animation: 'none' });

/**
 * A full title card with gradient colour and optional shadow.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {string} text
 * @param {import('../type/font.js').Font} font
 * @param {object} card
 * @param {number} t Progress.
 */
export const renderTitleCard = (frame, text, font, card, t) => {
  if (!font || !text) return;
  const { size, tracking, color, animation, shadowColor, shadowOffset } = card;

  // Shadow pass (drawn behind).
  if (shadowOffset && shadowColor) {
    const shadowLayout = layoutLine(font, text, { size, tracking });
    const sx = Math.round((frame.width - shadowLayout.width) / 2) + shadowOffset;
    const sy = Math.round(frame.height / 2) + shadowOffset;
    renderAnimatedText(frame, text, font, {
      size, tracking, color: shadowColor, animation, t,
      origin: { x: sx, y: sy },
    });
  }

  // Main text.
  renderAnimatedText(frame, text, font, { size, tracking, color, animation, t });
};

/**
 * Render billing cards (actor names) in a layout.
 *
 * @param {import('../paint/frame.js').Frame} frame
 * @param {Array<object>} cards Billing card descriptors.
 * @param {number} t Progress.
 */
export const renderBillingCards = (frame, cards, t) => {
  if (!cards || cards.length === 0) return;
  const spacing = 14;
  const startY = frame.height * 0.72;

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (!card.face || !card.text) continue;
    const localT = Math.max(0, Math.min(1, (t - card.delay) / 0.6));
    if (localT <= 0.01) continue;

    const layout = layoutLine(card.face, card.text, { size: card.size, tracking: card.tracking });
    const x = Math.round((frame.width - layout.width) / 2);
    const y = Math.round(startY + i * (card.size + spacing));

    renderAnimatedText(frame, card.text, card.face, {
      size: card.size,
      tracking: card.tracking,
      color: card.color,
      animation: 'fade-up',
      t: localT,
      origin: { x, y },
    });
  }
};
