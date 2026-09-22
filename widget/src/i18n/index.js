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

// WordPress stores titles with HTML entities (e.g. "Fish &amp; Chips",
// "Lefkada&#8217;s Bay"). React renders text nodes verbatim, so an undecoded
// entity would show up literally in the header, the success summary and the
// calendar entry. Decode to plain text at the resolution boundary so every
// consumer of resolveTitle gets a clean string.
const NAMED_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
  bull: '\u2022',
  copy: '\u00a9',
  deg: '\u00b0',
  divide: '\u00f7',
  euro: '\u20ac',
  hellip: '\u2026',
  laquo: '\u00ab',
  ldquo: '\u201c',
  lsquo: '\u2018',
  mdash: '\u2014',
  middot: '\u00b7',
  ndash: '\u2013',
  pound: '\u00a3',
  raquo: '\u00bb',
  rdquo: '\u201d',
  reg: '\u00ae',
  rsquo: '\u2019',
  times: '\u00d7',
  trade: '\u2122',
};

const ENTITY_RE = /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi;

function decodeOnce(value) {
  return value.replace(ENTITY_RE, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

export function decodeHtmlEntities(value) {
  if (!value || !value.includes('&')) return value;
  // Titles are sometimes double-encoded ("&amp;#8217;" -> "&#8217;"), so keep
  // decoding until the string stabilizes. Bounded to avoid pathological input.
  let decoded = value;
  for (let i = 0; i < 5; i += 1) {
    const next = decodeOnce(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
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
    return decodeHtmlEntities((found && found.title) || '');
  }
  if (typeof title === 'object') {
    return decodeHtmlEntities(
      title[lang] || title[FALLBACK_LOCALE] || Object.values(title)[0] || '',
    );
  }
  return decodeHtmlEntities(String(title));
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
