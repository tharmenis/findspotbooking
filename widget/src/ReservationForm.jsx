// Reservation form card (03-reservation-form-ui.md, piece 2). Owns the form
// state; the header above and attribution below are independent components.
// Handles the two distinct error cases differently:
//   1. 409 slot-taken  -> re-fetch availability, keep every field except time,
//                         inline warning near the time field.
//   2. Network/server  -> never clear the form; retry resubmits the same
//                         payload. Server-side validation errors surface as
//                         field-level messages.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PhoneInput from './PhoneInput.jsx';
import DatePicker from './DatePicker.jsx';
import { getAvailability, createReservation } from './api.js';
import { hasAnySlots } from './availability.js';

const GUEST_MIN = 1;
const GUEST_MAX = 12;
const COMMENTS_MAX = 500;

export default function ReservationForm({ listing, publicId, lang, onSuccess }) {
  const { t } = useTranslation();

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [guests, setGuests] = useState(2);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(''); // stored format: calling code + national digits
  const [email, setEmail] = useState('');
  const [comments, setComments] = useState('');

  const [windows, setWindows] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 409 slot-taken: separate from the network-error banner so the UI can keep
  // every other field intact while only the time selection resets.
  const [slotTaken, setSlotTaken] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function loadSlots(newDate) {
    if (!newDate) {
      setWindows([]);
      return;
    }
    setLoadingSlots(true);
    getAvailability(publicId, newDate)
      .then(({ status, body }) => {
        if (status === 200 && body && Array.isArray(body.windows)) {
          setWindows(body.windows);
        } else {
          setWindows([]);
        }
      })
      .catch(() => setWindows([]))
      .finally(() => setLoadingSlots(false));
  }

  function handleDate(value) {
    // DatePicker emits YYYY-MM-DD (or '' when cleared).
    setDate(value);
    setTime(''); // time selection is invalidated when the date changes
    clearError('date');
    clearError('time'); // time was just reset, so drop its error too
    loadSlots(value);
  }

  // Live validation: drop a field's error as soon as the user edits it, so
  // messages don't linger once a value has actually been submitted/typed.
  function clearError(key) {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function validate() {
    const errors = {};
    if (!date) errors.date = t('form.errors.dateRequired');
    else if (date < today) errors.date = t('form.errors.datePast');
    if (!time) errors.time = t('form.errors.timeRequired');
    if (!firstName.trim()) errors.firstName = t('form.errors.firstNameRequired');
    if (!lastName.trim()) errors.lastName = t('form.errors.lastNameRequired');
    if (!phone) errors.phone = t('form.errors.phoneInvalid');
    else if (!(await isPhoneValidFromStored(phone))) errors.phone = t('form.errors.phoneInvalid');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('form.errors.emailInvalid');
    }
    if (comments.length > COMMENTS_MAX) errors.comments = t('form.errors.commentsTooLong');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function applyServerFieldErrors(details) {
    // Server-side validation errors (422) map to the specific fields.
    const map = {
      arrival_date: 'date',
      arrival_hour: 'time',
      guests: 'guests',
      first_name: 'firstName',
      last_name: 'lastName',
      client_phone: 'phone',
      client_email: 'email',
    };
    const next = {};
    if (Array.isArray(details)) {
      for (const msg of details) {
        for (const [serverField, localField] of Object.entries(map)) {
          if (String(msg).toLowerCase().includes(serverField.replace(/_/g, ' '))) {
            next[localField] = msg;
            break;
          }
        }
      }
    }
    if (Object.keys(next).length > 0) setFieldErrors((f) => ({ ...f, ...next }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setNetworkError(false);
    setSlotTaken(false);

    if (!(await validate())) return;

    const payload = {
      public_id: publicId,
      arrival_date: date,
      arrival_hour: time,
      guests,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      client_phone: phone,
      client_email: email.trim(),
      // Forward the visitor's selected language so WordPress can send the
      // confirmation in the right locale. The BFF forwards req.body as-is.
      locale: lang || 'en',
      comments: comments.trim(),
    };

    setSubmitting(true);
    try {
      const { status, body } = await createReservation(payload);
      if (status === 409) {
        // Business outcome, not a failure: re-fetch availability, keep every
        // other field as typed, reset only the time selection.
        setSlotTaken(true);
        setTime('');
        loadSlots(date);
      } else if (status >= 200 && status < 300) {
        // Pass the server's created reservation (snake_case, echo of the
        // persisted row) so the success summary shows WP's data, not our
        // local draft. Fall back to the payload if the server returned no body.
        onSuccess(body || payload);
      } else if (status === 422 && body && Array.isArray(body.error?.details)) {
        applyServerFieldErrors(body.error.details);
        setNetworkError(true);
      } else {
        setNetworkError(true);
      }
    } catch {
      setNetworkError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const noSlotsToday = date && !loadingSlots && windows.length > 0 && !hasAnySlots(windows);

  return (
    <form className="fsb-form fsb-card" onSubmit={handleSubmit} noValidate>
      {/* Row 1: date, time, guests */}
      <div className="fsb-row fsb-row-3">
        <div className={`fsb-field ${fieldErrors.date ? 'fsb-field-invalid' : ''}`}>
          <label className="fsb-label" htmlFor="fsb-date">
            {t('form.date')}
          </label>
          <DatePicker
            id="fsb-date"
            value={date}
            navLayout="after"
            onChange={handleDate}
            invalid={!!fieldErrors.date}
            min={today}
            blockedDates={listing?.blockedDates || []}
          />
          {fieldErrors.date && <p className="fsb-error">{fieldErrors.date}</p>}
        </div>

        <div className={`fsb-field ${fieldErrors.time || slotTaken ? 'fsb-field-invalid' : ''}`}>
          <label className="fsb-label" htmlFor="fsb-time">
            {t('form.time')}
          </label>
          <select
            id="fsb-time"
            className="fsb-input"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setSlotTaken(false);
              clearError('time');
            }}
            disabled={!date || loadingSlots}
            aria-invalid={fieldErrors.time || slotTaken ? 'true' : undefined}
          >
            <option value="">{t('form.timePlaceholder')}</option>
            {windows.map((window, wi) => (
            
                window.slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))
            ))}
          </select>
          {slotTaken && <p className="fsb-error fsb-slot-taken">{t('form.errors.slotTaken')}</p>}
          {fieldErrors.time && !slotTaken && <p className="fsb-error">{fieldErrors.time}</p>}
          {noSlotsToday && <p className="fsb-error">{t('form.errors.noSlots')}</p>}
        </div>

        <div className="fsb-field">
          <span className="fsb-label">{t('form.guests')}</span>
          <div className="fsb-stepper">
            <button
              type="button"
              className="fsb-stepper-btn"
              onClick={() => {
                setGuests((g) => Math.max(GUEST_MIN, g - 1));
                clearError('guests');
              }}
              disabled={guests <= GUEST_MIN}
              aria-label={t('form.guestsDecrease')}
            >
              −
            </button>
            <span className="fsb-stepper-value" aria-live="polite">
              {guests}
            </span>
            <button
              type="button"
              className="fsb-stepper-btn"
              onClick={() => {
                setGuests((g) => Math.min(GUEST_MAX, g + 1));
                clearError('guests');
              }}
              disabled={guests >= GUEST_MAX}
              aria-label={t('form.guestsIncrease')}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: first name, last name */}
      <div className="fsb-row">
        <div className={`fsb-field ${fieldErrors.firstName ? 'fsb-field-invalid' : ''}`}>
          <label className="fsb-label" htmlFor="fsb-first">
            {t('form.firstName')}
          </label>
          <input
            id="fsb-first"
            className="fsb-input"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              clearError('firstName');
            }}
            aria-invalid={fieldErrors.firstName ? 'true' : undefined}
          />
          {fieldErrors.firstName && <p className="fsb-error">{fieldErrors.firstName}</p>}
        </div>
        <div className={`fsb-field ${fieldErrors.lastName ? 'fsb-field-invalid' : ''}`}>
          <label className="fsb-label" htmlFor="fsb-last">
            {t('form.lastName')}
          </label>
          <input
            id="fsb-last"
            className="fsb-input"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              clearError('lastName');
            }}
            aria-invalid={fieldErrors.lastName ? 'true' : undefined}
          />
          {fieldErrors.lastName && <p className="fsb-error">{fieldErrors.lastName}</p>}
        </div>
      </div>

      {/* Row 3: email, phone */}
      <div className="fsb-row">
        <div className={`fsb-field ${fieldErrors.email ? 'fsb-field-invalid' : ''}`}>
          <label className="fsb-label" htmlFor="fsb-email">
            {t('form.email')}
          </label>
          <input
            id="fsb-email"
            className="fsb-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError('email');
            }}
            aria-invalid={fieldErrors.email ? 'true' : undefined}
          />
          {fieldErrors.email && <p className="fsb-error">{fieldErrors.email}</p>}
        </div>
        <PhoneInput
          value={phone}
          onChange={(v) => {
            setPhone(v);
            clearError('phone');
          }}
          invalid={!!fieldErrors.phone}
        />
      </div>

      {/* Comments — full width */}
      <div className={`fsb-field ${fieldErrors.comments ? 'fsb-field-invalid' : ''}`}>
        <label className="fsb-label" htmlFor="fsb-comments">
          {t('form.comments')}
        </label>
        <textarea
          id="fsb-comments"
          className="fsb-input fsb-textarea"
          rows={3}
          maxLength={COMMENTS_MAX}
          placeholder={t('form.commentsPlaceholder')}
          value={comments}
          onChange={(e) => {
            setComments(e.target.value);
            clearError('comments');
          }}
          aria-invalid={fieldErrors.comments ? 'true' : undefined}
        />
        <div className="fsb-field-footer">
          {fieldErrors.comments ? (
            <p className="fsb-error">{fieldErrors.comments}</p>
          ) : (
            <span className="fsb-hint">
              {t('form.commentsHint', { count: COMMENTS_MAX - comments.length })}
            </span>
          )}
        </div>
      </div>

      {/* Network error banner — never clears the form (03-reservation-form-ui.md) */}
      {networkError && (
        <div className="fsb-banner fsb-banner-error" role="alert">
          <p className="fsb-banner-title">{t('retry.title')}</p>
          <p className="fsb-banner-text">{t('retry.message')}</p>
          <button type="submit" className="fsb-btn" disabled={submitting}>
            {submitting ? t('form.submitting') : t('retry.button')}
          </button>
        </div>
      )}

      <button type="submit" className="fsb-btn fsb-btn-primary" disabled={submitting}>
        {submitting ? t('form.submitting') : t('form.submit')}
      </button>
    </form>
  );
}

// Stored phone format is "digits only, country calling code included, no +"
// (e.g. 306980081107). Validate it with intl-tel-input's bundled utils
// (libphonenumber) — the same engine that drives the field's placeholder and
// formatting, so what passes here matches what the plugin considers valid.
let phoneUtilsPromise = null;
function getPhoneUtils() {
  if (!phoneUtilsPromise) {
    phoneUtilsPromise = import('intl-tel-input/utils').then((m) => m.default);
  }
  return phoneUtilsPromise;
}

async function isPhoneValidFromStored(stored) {
  const digits = String(stored || '').replace(/\D/g, '');
  if (!digits) return false;
  const utils = await getPhoneUtils();
  // The utils isValidNumber takes an E.164 string; the stored value is the
  // same digits without '+'.
  return utils.isValidNumber(`+${digits}`);
}
