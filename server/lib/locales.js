
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePattern, HEAD_SLOTS, AGREEING_SLOTS, SLOT_BANKS, formKeyOf } from './generate/grammar.js';

const LOCALES_DIR = path.resolve(fileURLToPath(new URL('../../locales', import.meta.url)));

const REQUIRED_KEYS = ['code', 'label', 'fakerLocale', 'words', 'patterns', 'genres', 'reviews'];

const templatesOf = (locale) => [
  ...locale.patterns.map((entry) => entry.template),
  ...(locale.synopses ?? []),
  ...(locale.taglines ?? []),
];

const validateTemplates = (locale, file) => {
  templatesOf(locale).forEach((template) => {
    const tokens = parsePattern(template).filter((token) => token.type);
    const heads = new Set(
      tokens.filter((token) => HEAD_SLOTS.has(token.type)).map((token) => token.ref),
    );
    for (const token of tokens) {
      if (AGREEING_SLOTS.has(token.type) && !heads.has(token.ref)) {
        throw new Error(
          `Locale "${file}" template ("${template}") has a ${token.type} slot on ` +
            `reference "${token.ref}" with no head word to agree with.`,
        );
      }
      const form = formKeyOf(token);
      const bankName = SLOT_BANKS[token.type];
      if (!form || !bankName || AGREEING_SLOTS.has(token.type)) continue;
      const bank = locale.words[bankName] ?? [];
      const missing = bank.filter((word) => word.forms?.[form] === undefined);
      if (missing.length > 0) {
        throw new Error(
          `Locale "${file}" template ("${template}") asks for form "${form}" of ${token.type}, ` +
            `but ${missing.length} word(s) in words.${bankName} lack it (e.g. "${missing[0].text}").`,
        );
      }
    }
  });
};

const validate = (locale, file) => {
  const missing = REQUIRED_KEYS.filter((key) => locale[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Locale "${file}" is missing required key(s): ${missing.join(', ')}`);
  }
  for (const bank of ['nouns', 'abstracts', 'adjectives', 'places', 'gerunds', 'numbers', 'ordinals']) {
    if (!Array.isArray(locale.words[bank]) || locale.words[bank].length === 0) {
      throw new Error(`Locale "${file}" has an empty word bank: words.${bank}`);
    }
  }
  validateTemplates(locale, file);
  return locale;
};

export const loadLocales = async (dir = LOCALES_DIR) => {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const entries = await Promise.all(
    files.map(async (file) => {
      const parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      return validate(parsed, file);
    }),
  );
  if (entries.length === 0) throw new Error(`No locale files found in ${dir}`);
  return new Map(entries.map((locale) => [locale.code, locale]));
};

export const describeLocales = (locales) =>
  [...locales.values()].map(({ code, label, flag }) => ({ code, label, flag }));
