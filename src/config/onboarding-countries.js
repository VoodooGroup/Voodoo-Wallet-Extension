import { WALLET_LOCALES } from '../lib/i18n/locales.js';

/** @typedef {{ locale: string, label: string }} OnboardingCountry */

/** Country flags shown after recovery phrase backup (maps to wallet locale). */
/** @type {OnboardingCountry[]} */
export const ONBOARDING_COUNTRIES = WALLET_LOCALES.map((loc) => ({
  locale: loc.code,
  label: loc.name,
}));