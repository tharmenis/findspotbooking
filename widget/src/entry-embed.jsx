// Embed entry point — mounts inside a shadow root on client sites. Exposes
// renderWidget for the hand-written loader in widget/src/embed.js (copied to
// server/src/public/ by the build).
import { createRoot } from 'react-dom/client';
import './widget.css'; // extracted to widget.css, injected via shadow-root <link>
import BookingForm from './BookingForm.jsx';
import { initI18n, resolveLocale } from './i18n/index.js';

export async function renderWidget(mountPoint, { publicId, lang } = {}) {
  if (!publicId) {
    mountPoint.textContent = 'Missing publicId for Findspot widget.';
    return;
  }

  // Language resolution order (03-reservation-form-ui.md): explicit override
  // (data-lang) -> navigator.language -> fallback default.
  const locale = resolveLocale(lang, navigator.language);
  await initI18n(locale);

  const root = createRoot(mountPoint);
  root.render(<BookingForm publicId={publicId} lang={locale} />);
}
