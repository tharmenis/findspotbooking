// Success state (03-reservation-form-ui.md): replaces the form in place
// (unmounts the fields entirely — no redirect, since the widget may be
// embedded in another site's page; unmounting also prevents a stale submit
// button from re-firing via back/forward-cache). Shows a confirmation summary
// and a client-side .ics download (no server round trip).
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSlotForCalendar } from './availability.js';
import { resolveTitle } from './i18n/index.js';

// Builds a valid ICS file for the booking. Times are treated as local
// (booking slots have no timezone; the visitor's local time is what matters).
function buildIcs({ listingTitle, date, time, guests, firstName, lastName }) {
  const dtStart = `${date.replace(/-/g, '')}T${formatSlotForCalendar(time).replace(/:/g, '')}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const summary = `Reservation at ${listingTitle}`;
  const description = `${guests} guest(s) — ${firstName} ${lastName}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//findspot.net//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${date}-${time}@findspot.net`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export default function Success({ listing, reservation }) {
  const { t, i18n } = useTranslation();

  // Reservation comes from the server (echo of the persisted WP row), so the
  // fields are snake_case: arrival_date, arrival_hour, first_name, last_name.
  const guestsLabel = useMemo(
    () => t('success.guestsCount', { count: reservation.guests }),
    [t, reservation.guests]
  );

  const dateLabel = useMemo(() => {
    const d = new Date(`${reservation.arrival_date}T00:00:00`);
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  }, [i18n.language, reservation.arrival_date]);

  function handleAddToCalendar() {
    const listingTitle = resolveTitle(listing.title, i18n.language);
    const ics = buildIcs({
      listingTitle,
      date: reservation.arrival_date,
      time: reservation.arrival_hour,
      guests: reservation.guests,
      firstName: reservation.first_name,
      lastName: reservation.last_name,
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booking-${reservation.arrival_date}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="fsb-success fsb-card" aria-live="polite">
      <h3 className="fsb-success-title">{t('success.title')}</h3>
      {/* <p className="fsb-success-message">{t('success.message')}</p> */}

      <dl className="fsb-summary">
        <div>
          <dt>{t('success.listing')}</dt>
          <dd>{resolveTitle(listing.title, i18n.language)}</dd>
        </div>
        <div>
          <dt>{t('success.date')}</dt>
          <dd>{dateLabel}</dd>
        </div>
        <div>
          <dt>{t('success.time')}</dt>
          <dd>{reservation.arrival_hour}</dd>
        </div>
        <div>
          <dt>{t('success.guests')}</dt>
          <dd>{guestsLabel}</dd>
        </div>
      </dl>

      {/* <button type="button" className="fsb-btn" onClick={handleAddToCalendar}>
        {t('success.addToCalendar')}
      </button> */}
      <p className="fsb-success-email-note">{t('success.weSentYouAnEmail')}</p>
    </section>
  );
}
