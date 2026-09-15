// Phone input built on intl-tel-input (v29). Replaces the hand-rolled
// country-code dropdown + national input:
//   - country selector with flags + search, localized names
//   - national-mode formatting + placeholder via bundled utils
//   - validation via libphonenumber (utils module), no remote script
// Value contract is unchanged: the parent owns a stored phone string. We use
// E.164 ("+306980081107") internally and expose the same digits-only string
// ("306980081107") to the form, so ReservationForm validation and the API
// payload stay as before.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import intlTelInput from 'intl-tel-input';
import 'intl-tel-input/styles-no-assets';
import flags1x from 'intl-tel-input/dist/img/flags.webp';
import flags2x from 'intl-tel-input/dist/img/flags@2x.webp';

// The utils module ships with the package (dist/js/utils.js, ESM default
// export). Loading it via loadUtils gives full validation + formatting
// without a remote script — important for the CSP-clean standalone shell.
function loadUtils() {
  return import('intl-tel-input/utils');
}

// Normalize a stored value (digits only) to E.164 for the plugin.
function toE164(stored) {
  const digits = String(stored || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

// Strip '+' and non-digits — the stored contract (digits only).
function toStored(e164) {
  return String(e164 || '').replace(/\D/g, '');
}

export default function PhoneInput({ value, onChange, invalid }) {
  const { i18n } = useTranslation();
  const inputRef = useRef(null);
  const itiRef = useRef(null);
  const onChangeRef = useRef(onChange);

  // Keep the latest callback without re-initializing the plugin.
  onChangeRef.current = onChange;

  // (Re)initialize the plugin when the input mounts or the language changes.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;

    // Point the no-assets flag sprite at the bundled assets (Vite resolves
    // these imports to fingerprinted URLs at build time).
    const host = input.closest('.fsb-shell') || document.documentElement;
    host.style.setProperty('--iti-path-flags-1x', `url(${flags1x})`);
    host.style.setProperty('--iti-path-flags-2x', `url(${flags2x})`);

    const iti = intlTelInput(input, {
      initialCountry: 'gr',
      separateDialCode: true,
      // Display and format the number in national form while typing; the
      // stored value is always E.164 via getNumber().
      numberDisplayFormat: 'NATIONAL',
      countrySearch: true,
      autoPlaceholder: 'aggressive',
      loadUtils,
      uiTranslations: {},
      // Localize country names via Intl.DisplayNames for the active locale.
      countryNameLocale: i18n.language,
    });
    itiRef.current = iti;

    // getNumber() throws until the utils module (loaded asynchronously via
    // loadUtils) is ready, so never call it before then.
    let cancelled = false;
    const pushValue = () => {
      if (!intlTelInput.utils) return;
      onChangeRef.current(toStored(iti.getNumber()));
    };

    // When utils resolve, apply any parent value set beforehand and report the
    // field's initial state so the form knows the stored phone number.
    iti.promise
      .then(() => {
        if (cancelled) return;
        if (value) iti.setNumber(toE164(value));
        pushValue();
      })
      .catch(() => {
        // Utils failed to load: formatting/validation degrade, but the field
        // still works as a plain input and the form's server-side validation
        // still guards the payload.
      });

    // Typing / country changes always happen after utils are loaded.
    const handleInput = () => pushValue();
    input.addEventListener('input', handleInput);

    return () => {
      cancelled = true;
      input.removeEventListener('input', handleInput);
      iti.destroy();
      itiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  // Keep the plugin in sync when the parent resets/clears the value.
  useEffect(() => {
    const iti = itiRef.current;
    if (!iti || value === undefined) return;
    // getNumber() requires utils; if they aren't loaded yet the mount effect
    // applies the value once iti.promise resolves. So only sync when ready.
    if (!intlTelInput.utils) return;
    const current = iti.getNumber();
    if (toStored(current) !== toStored(value)) {
      iti.setNumber(toE164(value));
    }
  }, [value]);

  return (
    <div className={`fsb-field ${invalid ? 'fsb-field-invalid' : ''}`}>
      <label className="fsb-label" htmlFor="fsb-phone">
        {i18n.t('form.phone')}
      </label>
      {/* The plugin injects its own wrappers around this input; styling lives
          in widget.css under the .iti__ scope. */}
      <input
        ref={inputRef}
        id="fsb-phone"
        className="fsb-input"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-invalid={invalid || undefined}
      />
      {invalid && <p className="fsb-error">{i18n.t('form.errors.phoneInvalid')}</p>}
    </div>
  );
}
