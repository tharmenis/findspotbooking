// Normalize a scheme/trailing-slash-laden string to a bare hostname. Used for
// both stored allowed_domains and incoming Origin headers so that "https://Client-Site.com/"
// typed in WP and "https://client-site.com" sent by the browser compare equal.
export function normalizeHostname(value) {
  if (typeof value !== 'string') return '';
  let out = value.trim().toLowerCase();
  // Strip scheme BEFORE splitting on '/', otherwise 'https://x' becomes 'https:'.
  out = out.replace(/^https?:\/\//, '');
  // Strip any path (Origin headers never carry one; stored domains shouldn't either).
  const slash = out.indexOf('/');
  if (slash !== -1) out = out.slice(0, slash);
  // Strip credentials (user:pass@host) defensively.
  const at = out.lastIndexOf('@');
  if (at !== -1) out = out.slice(at + 1);
  // Strip standard ports; keep non-standard ports (localhost:5173 in dev).
  out = out.replace(/^([^:]+):(\d+)$/, (_, host, port) =>
    port === '80' || port === '443' ? host : `${host}:${port}`
  );
  return out;
}
