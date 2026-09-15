// Listing header card (03-reservation-form-ui.md, piece 1). Depends only on
// the initial listing fetch and never re-renders on form interaction, so it
// stays independent from the form card. Also hosts the language switcher —
// language state lives at the app shell, but the switcher control is here.
//
// The switcher is a custom select: a button showing the current language's
// flag + name, opening a menu of all languages. Flags are the per-locale PNGs
// from ./assets.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, resolveTitle } from './i18n/index.js';

// Flag assets live in ./assets (per-locale PNGs). The name is each language's
// own endonym, used for the button/menu labels and the aria-label.
import greece from './assets/greece.png';
import unitedKingdom from './assets/united-kingdom.png';
import germany from './assets/germany.png';
import italy from './assets/italy-1.png';
import france from './assets/france.png';

const FLAGS = {
  el: { src: greece, name: 'Ελληνικά' },
  en: { src: unitedKingdom, name: 'English' },
  de: { src: germany, name: 'Deutsch' },
  it: { src: italy, name: 'Italiano' },
  fr: { src: france, name: 'Français' },
};

function getTitle(title, lang = 'en') {
  return resolveTitle(title, lang);
}

export default function ListingHeader({ listing, lang, onLangChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const active = FLAGS[lang] || FLAGS.en;

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Close on Escape; keep focus on the trigger.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function handleSelect(code) {
    setOpen(false);
    if (code !== lang) onLangChange(code);
  }

  return (
    <header className="fsb-header fsb-card">
      <div className="fsb-header-main">
          {listing.logoUrl ? (
          <img className="fsb-logo" src={listing.logoUrl} alt="" />
        ) : (
          <div className="fsb-logo fsb-logo-placeholder" aria-hidden="true">
            {getTitle(listing.title, lang).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="fsb-header-text">
          <h2 className="fsb-title">{getTitle(listing.title, lang)}</h2>
          {listing.location && (
            <p className="fsb-location">{listing.location}</p>
          )}
          {(listing.contactPhone || listing.contactEmail) && (
            <p className="fsb-contact">
              {listing.contactPhone && (
                <a
                  className="fsb-contact-link"
                  href={`tel:${listing.contactPhone}`}
                >
                  {listing.contactPhone}
                </a>
              )}
              {listing.contactPhone && listing.contactEmail && (
                <span className="fsb-contact-sep" aria-hidden="true">
                  {' · '}
                </span>
              )}
              {listing.contactEmail && (
                <a
                  className="fsb-contact-link"
                  href={`mailto:${listing.contactEmail}`}
                >
                  {listing.contactEmail}
                </a>
              )}
            </p>
          )}
          {listing.enabled === false && (
            <p className="fsb-unavailable">{t('app.unavailableTitle')}</p>
          )}
        </div>
      </div>

      <div ref={rootRef} className="fsb-lang-select">
        <button
          type="button"
          className="fsb-lang-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('header.language')}
        >
          <img className="fsb-lang-flag" src={active.src} alt="" />
          {/* <span className="fsb-lang-trigger-name">{active.name}</span> */}
          <span className="fsb-lang-caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {open && (
          <ul
            ref={listRef}
            className="fsb-lang-menu"
            role="listbox"
            aria-label={t('header.language')}
          >
            {SUPPORTED_LOCALES.map((code) => {
              const flag = FLAGS[code];
              if (!flag) return null;
              const current = code === lang;
              return (
                <li key={code} role="option" aria-selected={current}>
                  <button
                    type="button"
                    className={`fsb-lang-option${current ? ' fsb-lang-option-active' : ''}`}
                    onClick={() => handleSelect(code)}
                  >
                    <img className="fsb-lang-flag" src={flag.src} alt="" />
                    <span className="fsb-lang-option-name">{flag.name}</span>
                    {current && (
                      <span className="fsb-lang-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </header>
  );
}
