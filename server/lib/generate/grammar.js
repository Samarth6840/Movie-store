/**
 * Locale-driven title grammar.
 *
 * Titles are not concatenated word salad: a locale supplies *patterns* and
 * *word banks*, and this engine renders a pattern while keeping grammatical
 * agreement. That is what makes "Der kalte Himmel" and "Холодне небо" come out
 * right instead of "Der kalt Himmel".
 *
 * A pattern is a string with slots, e.g. `"{DEF:1} {ADJ:1} {NOUN:1}"`. The digit
 * after the colon is an *agreement reference*: every slot sharing a reference
 * agrees with the head word bound to it. Rendering happens in two passes —
 * heads first (they decide gender and number), then the words that must agree.
 *
 * The engine knows nothing about any particular language. Every word, article,
 * ending and pattern lives in `locales/*.json`.
 *
 * @module server/lib/generate/grammar
 */

/**
 * `{TYPE}`, `{TYPE:ref}`, or `{TYPE:ref:modifier…}`.
 *
 * Modifiers are per-locale spelling decisions, which is why they live in the
 * locale file rather than in code. Two kinds exist, told apart by name:
 *
 *   - a *spelling* modifier (`lc`, `uc`) transforms whatever text was drawn — an
 *     English synopsis wants "a buried empire" (`{NOUN:1:lc}`), while German
 *     capitalises its nouns everywhere and asks for no modifier at all;
 *   - anything else is a *form key*, naming an alternate spelling stored on the
 *     word itself. Ukrainian stores the genitive of "Кленовиця" under `gen` and
 *     asks for it with `{PLACE:1:gen}` after the preposition "до". The engine
 *     never learns what "gen" means; it is a label the locale file chose.
 */
const SLOT = /\{([A-Z_]+)((?::[A-Za-z0-9_]+)*)\}/g;

/** Spelling modifiers, applied to a word after it has been drawn. */
const SPELLINGS = {
  lc: (text, code) => text.toLocaleLowerCase(code),
  uc: (text, code) => text.toLocaleUpperCase(code),
};

/** Slots that introduce a head word and therefore fix agreement features. */
export const HEAD_SLOTS = new Set(['NOUN', 'PLURAL', 'ABSTRACT']);

/** Slots whose form depends on a head word. */
export const AGREEING_SLOTS = new Set(['ADJ', 'DEF', 'INDEF']);

/** The word bank each slot that has one draws from. */
export const SLOT_BANKS = {
  NOUN: 'nouns',
  PLURAL: 'nouns',
  ABSTRACT: 'abstracts',
  ADJ: 'adjectives',
  PLACE: 'places',
  GERUND: 'gerunds',
  NUM: 'numbers',
  ORD: 'ordinals',
};

const DEFAULT_FEATURES = { gender: 'n', number: 's' };

/**
 * Split a pattern into literal text and slot descriptors.
 *
 * @param {string} template
 * @returns {Array<{literal: string} | {type: string, ref: string, modifiers: Array<string>}>}
 */
export const parsePattern = (template) => {
  const tokens = [];
  let cursor = 0;
  for (const match of template.matchAll(SLOT)) {
    if (match.index > cursor) tokens.push({ literal: template.slice(cursor, match.index) });
    const [ref = '1', ...modifiers] = match[2].split(':').slice(1);
    tokens.push({ type: match[1], ref, modifiers });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) tokens.push({ literal: template.slice(cursor) });
  return tokens;
};

/**
 * The stored form a slot asks for by name, if any: the first modifier that is not
 * a spelling transform. Exported so the locale loader can check, at startup, that
 * every word in the addressed bank actually carries that form.
 *
 * @param {{modifiers?: Array<string>}} token
 * @returns {string | undefined}
 */
export const formKeyOf = (token) => token.modifiers?.find((mod) => !(mod in SPELLINGS));

/** Pick the right inflected form of an adjective for a set of features. */
const inflectAdjective = (entry, features, paradigm) => {
  if (typeof entry === 'string') return entry;
  if (entry.text) return entry.text;
  const key = features.number === 'p' ? 'p' : features.gender;
  const table = entry.forms?.[paradigm] ?? entry.forms?.weak ?? entry.forms;
  return table?.[key] ?? table?.n ?? entry.base ?? '';
};

/**
 * A word's surface text, honouring an alternate form the pattern asked for by
 * name. `forms` on a word entry is a free-form map the locale owns — Ukrainian
 * puts its genitive there — and falling back to the default spelling means a
 * locale can supply the alternate for only the words that need one.
 */
const surfaceOf = (entry, fallback, token) => {
  const key = formKeyOf(token);
  return (key && entry.forms?.[key]) || fallback;
};

/** Read a word entry's surface form and the features it carries. */
const readHead = (type, entry, token) => {
  const plural = type === 'PLURAL';
  return {
    text: surfaceOf(entry, plural ? (entry.plural ?? entry.text) : entry.text, token),
    features: { gender: entry.gender ?? 'n', number: plural ? 'p' : 's' },
  };
};

const bankFor = (locale, type) => {
  const bank = locale.words[SLOT_BANKS[type]] ?? [];
  return type === 'PLURAL' ? bank.filter((noun) => Boolean(noun.plural)) : bank;
};

/**
 * Render one pattern.
 *
 * @param {object} locale Parsed locale file.
 * @param {import('../context.js').Context} ctx
 * @param {string} template
 * @param {{casing?: boolean}} [options] `casing: false` renders prose (synopses,
 *   taglines) through the same slot engine without applying headline casing.
 * @returns {string}
 */
export const renderPattern = (locale, ctx, template, { casing = true } = {}) => {
  const tokens = parsePattern(template);
  const features = new Map();
  const rendered = new Array(tokens.length);

  // Pass 1 — heads and independent words.
  tokens.forEach((token, index) => {
    if (token.literal !== undefined) {
      rendered[index] = token.literal;
      return;
    }
    if (HEAD_SLOTS.has(token.type)) {
      const entry = ctx.pick(`${token.type}.${token.ref}`, bankFor(locale, token.type));
      const head = readHead(token.type, entry, token);
      features.set(token.ref, head.features);
      rendered[index] = respell(locale, token, head.text);
      return;
    }
    if (AGREEING_SLOTS.has(token.type)) return; // pass 2
    rendered[index] = respell(locale, token, renderFreeSlot(locale, ctx, token));
  });

  // Pass 2 — words that agree with a head.
  tokens.forEach((token, index) => {
    if (rendered[index] !== undefined || token.literal !== undefined) return;
    const agreement = features.get(token.ref) ?? DEFAULT_FEATURES;
    rendered[index] = respell(
      locale,
      token,
      renderAgreeingSlot(locale, ctx, token, agreement, tokens),
    );
  });

  const text = rendered.join('').replace(/\s+/g, ' ').trim();
  if (casing) return applyCasing(locale, text);
  // Prose: keep each word's authored spelling, but capitalise the opening letter
  // so a synopsis that begins with a lower-case Ukrainian noun still starts a
  // sentence properly.
  return text.charAt(0).toLocaleUpperCase(locale.code) + text.slice(1);
};

/** Apply a slot's spelling modifiers, in the order the locale wrote them. */
const respell = (locale, token, text) =>
  (token.modifiers ?? []).reduce(
    (acc, mod) => (SPELLINGS[mod] ? SPELLINGS[mod](acc, locale.code) : acc),
    text,
  );

/** Slots that stand on their own: names, places, numbers, verbs. */
const renderFreeSlot = (locale, ctx, token) => {
  const drawn = () => {
    const entry = ctx.pick(`${token.type}.${token.ref}`, bankFor(locale, token.type));
    return surfaceOf(entry, entry.text, token);
  };
  switch (token.type) {
    case 'PLACE':
    case 'GERUND':
    case 'NUM':
    case 'ORD':
      return drawn();
    case 'NAME':
      return ctx.fullName(`NAME.${token.ref}`, ctx.pick(`NAME.sex.${token.ref}`, ['male', 'female']));
    case 'SURNAME':
      return ctx.lastName(`SURNAME.${token.ref}`);
    case 'GIVEN':
      return ctx.firstName(`GIVEN.${token.ref}`, ctx.pick(`GIVEN.sex.${token.ref}`, ['male', 'female']));
    case 'CITY':
      return ctx.city(`CITY.${token.ref}`);
    default:
      return '';
  }
};

const renderAgreeingSlot = (locale, ctx, token, agreement, tokens) => {
  const table = locale.grammar ?? {};
  const key = agreement.number === 'p' ? 'p' : agreement.gender;
  const form = formKeyOf(token);
  switch (token.type) {
    case 'DEF':
      return (form && table.definite?.[form]?.[key]) || table.definite?.[key] || '';
    case 'INDEF':
      if (agreement.number === 'p') return table.indefinitePlural ?? '';
      return (form && table.indefinite?.[form]?.[key]) || table.indefinite?.[key] || '';
    case 'ADJ': {
      // A locale that stores case tables names the one it wants ({ADJ:1:gen});
      // with no such request, German-style weak endings apply when a definite
      // article introduces the same head, and the strong paradigm elsewhere.
      const paradigm = form ?? (hasDefiniteFor(tokens, token.ref) ? 'weak' : 'strong');
      const entry = ctx.pick(`ADJ.${token.ref}`, locale.words.adjectives);
      return inflectAdjective(entry, agreement, paradigm);
    }
    default:
      return '';
  }
};

const hasDefiniteFor = (tokens, ref) =>
  tokens.some((token) => token.type === 'DEF' && token.ref === ref);

/**
 * Apply the locale's capitalisation policy.
 *
 * `title` — English-style headline case. `sentence` — capitalise the first word
 * only (Ukrainian, French…). `preserve` — leave the words as stored, which is
 * what German needs, since nouns are already capitalised in the word bank.
 */
const applyCasing = (locale, text) => {
  const { mode = 'preserve', minorWords = [] } = locale.casing ?? {};
  const minor = new Set(minorWords.map((word) => word.toLowerCase()));
  const capitalise = (word) =>
    word.length === 0 ? word : word[0].toLocaleUpperCase(locale.code) + word.slice(1);

  if (mode === 'sentence') {
    const lowered = text.charAt(0).toLocaleLowerCase(locale.code) + text.slice(1);
    return capitalise(lowered);
  }
  if (mode === 'title') {
    return text
      .split(' ')
      .map((word, index) =>
        index > 0 && minor.has(word.toLowerCase()) ? word.toLowerCase() : capitalise(word),
      )
      .join(' ');
  }
  return capitalise(text);
};
