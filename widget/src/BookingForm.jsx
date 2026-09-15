// App shell (03-reservation-form-ui.md) — the shared widget root. Owns:
//   - listing fetch (header + form depend on it)
//   - language state, which lives ABOVE both the header and the form so the
//     in-widget switcher never clears what the visitor has typed
//   - the loading / not-found / disabled states
// Layout: three independent stacked pieces — header card, form (or success)
// card, attribution notice — not one packed card.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ListingHeader from './ListingHeader.jsx';
import ReservationForm from './ReservationForm.jsx';
import Success from './Success.jsx';
import Attribution from './Attribution.jsx';
import { getListing } from './api.js';
import { initI18n,  } from './i18n/index.js';

export default function BookingForm({ publicId, lang }) {
  const { t, i18n } = useTranslation();

  const [activeLang, setActiveLang] = useState(lang || 'en');
  const [listing, setListing] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reservation, setReservation] = useState(null); // set -> success state

  // Load the requested language's bundle when the active language changes.
  useEffect(() => {
    console.log('Active language changed to:', activeLang);
    initI18n(activeLang);
  }, [activeLang]);

  // Fetch the cached listing once per publicId.
  useEffect(() => {
    let cancelled = false;
    getListing(publicId)
      .then(({ status, body }) => {
        if (cancelled) return;
        if (status === 404) setNotFound(true);
        else if (status === 200 && body) setListing(body);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  function handleLangChange(code) {
    setActiveLang(code);
    // i18n.changeLanguage(code);
  }

  if (notFound) {
    return (
      <div className="fsb-shell">
        <div className="fsb-card fsb-state-card">
          <h2>{t('app.notFoundTitle')}</h2>
          <p>{t('app.notFoundText')}</p>
        </div>
        <Attribution />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="fsb-shell">
        <div className="fsb-card fsb-state-card">
          <h2>{t('app.unavailableTitle')}</h2>
          <p>{t('app.unavailableText')}</p>
        </div>
        <Attribution />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="fsb-shell">
        <div className="fsb-card fsb-state-card fsb-loading">{t('app.loading')}</div>
        <Attribution />
      </div>
    );
  }

  return (
    <div className="fsb-shell">
      <ListingHeader listing={listing} lang={activeLang} onLangChange={handleLangChange} />

      {listing.enabled === false ? (
        <div className="fsb-card fsb-state-card">
          <h2>{t('app.unavailableTitle')}</h2>
          <p>{t('app.unavailableText')}</p>
        </div>
      ) : reservation ? (
        <Success listing={listing} reservation={reservation} />
      ) : (
        <ReservationForm listing={listing} publicId={publicId} lang={activeLang} onSuccess={setReservation} />
      )}

      <Attribution />
    </div>
  );
}
