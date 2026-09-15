// Attribution notice (03-reservation-form-ui.md) — a quiet footer line below
// the form card. Baked into the component (not removable/configurable) and
// functions as a term of use for the embed.
import { useTranslation } from 'react-i18next';

export default function Attribution() {
  const { t } = useTranslation();
  return (
    <p className="fsb-attribution">
      {t('app.bookingProvidedBy')}{' '}
      <a href="https://findspot.net" target="_blank" rel="noopener noreferrer">
        {t('app.findspotLink')}
      </a>
    </p>
  );
}
