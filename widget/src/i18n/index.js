// i18n initialization (03-reservation-form-ui.md):
//   - react-i18next with per-locale JSON bundles loaded lazily (only the
//     active locale ships to a given visitor).
//   - Resolution order is handled by the caller: explicit override
//     (data-lang / ?lang=) → navigator.language → fallback default.
//     initI18n() just loads whatever locale is requested.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LOCALES = ['en', 'el', 'de', 'it', 'fr'];
export const FALLBACK_LOCALE = 'en';

const bundles = {
  en: () => import('./locales/en.json'),
  el: () => import('./locales/el.json'),
  de: () => import('./locales/de.json'),
  it: () => import('./locales/it.json'),
  fr: () => import('./locales/fr.json'),
};

// Returns the best locale for the visitor, honoring an explicit override.
export function resolveLocale(explicit, navigatorLanguage) {
  const pick = (candidate) => {
    if (!candidate) return null;
    const code = String(candidate).toLowerCase().split('-')[0]; // 'en-US' -> 'en'
    return SUPPORTED_LOCALES.includes(code) ? code : null;
  };
  return pick(explicit) || pick(navigatorLanguage) || FALLBACK_LOCALE;
}

// WordPress may return a listing's title in one of three shapes (the contract
// has shifted over time, see 05-open-items.md):
//   1. A plain string  -> "Taverna Test"
//   2. A multilingual array -> [{ language_code: "el", title: "..." }, ...]
//   3. A language-keyed object -> { el: "...", en: "..." }
// Resolve to the best-matching string for the current language, always.
export function resolveTitle(title, lang = FALLBACK_LOCALE) {
  if (!title) return '';
  if (Array.isArray(title)) {
    const found = title.find((t) => t && t.language_code === lang) || title[0];
    return (found && found.title) || '';
  }
  if (typeof title === 'object') {
    return title[lang] || title[FALLBACK_LOCALE] || Object.values(title)[0] || '';
  }
  return String(title);
}

let i18nReady = null;

// Loads the given locale's bundle and switches. Multiple widgets on one page
// share the single i18next instance (they may use different languages; the
// active one is switched on mount).
export async function initI18n(locale) {
  
  const safe = SUPPORTED_LOCALES.includes(locale) ? locale : FALLBACK_LOCALE;


  if (!i18n.isInitialized) {
    i18nReady = i18n.use(initReactI18next).init({
      resources: {},
      lng: safe,
      fallbackLng: FALLBACK_LOCALE,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    await i18nReady;
  }

  if (i18n.language !== safe) {
    const bundle = await bundles[safe]();
    i18n.addResourceBundle(safe, 'translation', bundle.default || bundle, true, true);
    await i18n.changeLanguage(safe);
  } else if (!i18n.hasResourceBundle(safe, 'translation')) {
    const bundle = await bundles[safe]();
    i18n.addResourceBundle(safe, 'translation', bundle.default || bundle, true, true);
  }

  return i18n;
}
