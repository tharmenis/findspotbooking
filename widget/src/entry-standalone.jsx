// Standalone entry point — mounts directly into book.findspot.net's own page.
// The public_id and listing state come from the server-injected shell
// (server/src/templates/standalone-shell.html), filled by routes/standalone.js.
// Language resolution: ?lang= query param -> navigator.language -> fallback.
import { createRoot } from 'react-dom/client';
import './widget.css';
import BookingForm from './BookingForm.jsx';
import { initI18n, resolveLocale } from './i18n/index.js';

// Standalone mode calls the BFF same-origin. Setting this here (instead of an
// inline script in the shell) keeps the page CSP-clean — helmet's default
// script-src 'self' blocks inline scripts.
if (typeof window !== 'undefined') {
  window.FINDSPOT_API_BASE = window.location.origin;
}

const rootEl = document.getElementById('findspot-root');
if (rootEl) {
  const { publicId } = rootEl.dataset;
  const explicitLang = new URLSearchParams(window.location.search).get('lang') || null;

  // initI18n is async (lazy bundle load); avoid top-level await for the
  // ES2020 build target.
  void (async () => {
    const locale = resolveLocale(explicitLang, navigator.language);
    await initI18n(locale);
    const root = createRoot(rootEl);
    root.render(<BookingForm publicId={publicId} lang={locale} />);
  })();
}
