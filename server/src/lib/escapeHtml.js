// Escape a string for safe interpolation into HTML. Listing titles come from
// WordPress (user-controlled); unescaped injection is an XSS vector (see
// 04-widget-embedding.md — meta tag injection).
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}
