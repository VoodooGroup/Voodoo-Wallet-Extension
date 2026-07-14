import en from './messages/en.js';
import { localeOverrides } from './messages/overrides.js';
import { DEFAULT_LOCALE } from './locales.js';

const MESSAGES = { en };

for (const [code, partial] of Object.entries(localeOverrides)) {
  MESSAGES[code] = { ...en, ...partial };
}

export function translate(locale, key, vars = {}) {
  const catalog = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
  const fallback = MESSAGES[DEFAULT_LOCALE];
  let msg = catalog?.[key] ?? fallback?.[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    msg = msg.replaceAll(`{${name}}`, String(value ?? ''));
  }
  return msg;
}

export function getMessages(locale) {
  return MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
}

export { MESSAGES };