// Date field built on react-day-picker (v10). Replaces the native date input:
//   - popup calendar rendered in place (no portal — stays inside the shadow
//     root, so widget CSS applies)
//   - european date display d/m/y, week starts Monday (el + en-GB style)
//   - past dates disabled (matches the old input's min={today})
// Value contract is unchanged: the parent owns a YYYY-MM-DD string.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DayPicker } from 'react-day-picker';
import { enUS, el, de, it, fr } from 'react-day-picker/locale';
// react-day-picker's structural styles (the calendar is a <table> grid).
// Our visual theme layers on top via the fsb-rdp-* classes + CSS variables.
import 'react-day-picker/style.css';

const LOCALES = { en: enUS, el, de, it, fr };

// YYYY-MM-DD -> Date (local noon avoids tz off-by-one).
function parseIso(iso) {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

// Date -> YYYY-MM-DD (local).
function toIso(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// d/m/y display (european).
function formatDisplay(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function DatePicker({ id, value, onChange, invalid, min, blockedDates = [] }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = parseIso(value);
  const today = parseIso(min) || new Date();
  const locale = LOCALES[i18n.language] || enUS;

  // Build a matcher that disables past dates AND any blocked date from the
  // listing. react-day-picker's `disabled` accepts an array of matchers —
  // combining a before-date matcher with a list of specific dates works.
  const disabledMatchers = [
    { before: today },
    ...(blockedDates || []).map((iso) => parseIso(iso)).filter(Boolean),
  ];

  // If the currently selected value becomes blocked (e.g. listing updated
  // its blocked_dates mid-session), clear it so the form doesn't carry a
  // disabled date forward into submission.
  useEffect(() => {
    if (!value) return;
    const isBlocked =
      (blockedDates || []).includes(value) || parseIso(value) < today;
    if (isBlocked) onChange('');
  }, [value, blockedDates, today, onChange]);

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

  // Close on Escape; return focus to the input.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function handleSelect(date) {
    onChange(date ? toIso(date) : '');
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={rootRef} className={`fsb-datepicker ${invalid ? 'fsb-field-invalid' : ''}`}>
      <input
        ref={inputRef}
        id={id}
        className="fsb-input"
        type="text"
        inputMode="numeric"
        readOnly
        value={selected ? formatDisplay(selected) : ''}
        placeholder="dd/mm/yyyy"
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      />

      {open && (
        <div className="fsb-datepicker-popup" role="dialog" aria-label="Choose a date">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledMatchers}
            locale={locale}
            weekStartsOn={1}
            autoFocus
          
            classNames={{
              // Keep the library class AND our theme class on every element:
              // classNames replaces the defaults, so without the rdp-* class
              // the structural rules from style.css would be lost.
              root: 'rdp-root fsb-rdp',
              months: 'rdp-months fsb-rdp-months',
              month: 'rdp-month fsb-rdp-month',
              nav: 'rdp-nav fsb-rdp-nav',
              button_previous: 'rdp-button_previous fsb-rdp-button-prev',
              button_next: 'rdp-button_next fsb-rdp-button-next',
              month_caption: 'rdp-month_caption fsb-rdp-caption',
              weekdays: 'rdp-weekdays fsb-rdp-weekdays',
              weekday: 'rdp-weekday fsb-rdp-weekday',
              week: 'rdp-week fsb-rdp-week',
              day: 'rdp-day fsb-rdp-day',
              day_button: 'rdp-day_button fsb-rdp-day-btn',
              selected: 'rdp-selected fsb-rdp-selected',
              today: 'rdp-today fsb-rdp-today',
              disabled: 'rdp-disabled fsb-rdp-disabled',
              outside: 'rdp-outside fsb-rdp-outside',
            }}
          />
        </div>
      )}
    </div>
  );
}
