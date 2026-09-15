// POST /internal/listings/sync — WordPress's push webhook (01-data-model.md,
// 06-express-app-structure.md). Gated by the shared secret only: this is
// WordPress calling Express, not a browser, so there's no origin/tenant check.
// Full replace of allowed_domains on every sync; WP is the source of truth.
import { Router } from 'express';
import { internalAuth } from '../../middleware/internalAuth.js';
import { normalizeHostname } from '../../lib/normalizeHostname.js';
import { listingsCache } from '../../services/listingsCache.js';
import { escapeHtml } from '../../lib/escapeHtml.js';

const router = Router();

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{1,36}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateSyncBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Request body is required.'];

  if (typeof body.public_id !== 'string' || !PUBLIC_ID_RE.test(body.public_id)) {
    errors.push('public_id is required (alphanumeric, up to 36 chars).');
  }

  // title must be present and be either an object (locale->string) or an array
  if (body.title === undefined || body.title === null) {
    errors.push('title is required.');
  } else if (!(Array.isArray(body.title) || typeof body.title === 'object')) {
    errors.push('title must be an object or an array.');
  }

  if (body.logo_url !== undefined && body.logo_url !== null && typeof body.logo_url !== 'string') {
    errors.push('logo_url must be a string.');
  }
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    errors.push('enabled must be a boolean.');
  }
  if (body.blocked_dates !== undefined && body.blocked_dates !== null) {
    if (!Array.isArray(body.blocked_dates)) {
      errors.push('blocked_dates must be an array of YYYY-MM-DD strings.');
    } else if (body.blocked_dates.some((d) => typeof d !== 'string' || !DATE_RE.test(d))) {
      errors.push('blocked_dates must contain only YYYY-MM-DD strings.');
    }
  }
  if (body.allowed_domains !== undefined) {
    if (!Array.isArray(body.allowed_domains)) {
      errors.push('allowed_domains must be an array.');
    } else if (body.allowed_domains.some((d) => typeof d !== 'string' || !d.trim())) {
      errors.push('allowed_domains must contain only non-empty strings.');
    }
  }

  return errors;
}

function normalizeTitle(input) {
  const MAX_TITLE_LEN = 200;
  const MAX_LOCALES = 20;

  if (Array.isArray(input)) {
    const out = [];
    for (const item of input) {
      if (!item || typeof item !== 'object') return { errors: ['each title array item must be an object'] };
      const lang = item.language_code || item.language;
      const t = item.title;
      if (typeof lang !== 'string' || !lang.trim()) return { errors: ['each title item must have a language_code string'] };
      if (typeof t !== 'string') return { errors: [`title for ${lang} must be a string`] };
      const trimmed = t.trim();
      if (!trimmed) return { errors: [`title for ${lang} must not be empty`] };
      if (trimmed.length > MAX_TITLE_LEN) return { errors: [`title for ${lang} too long`] };
      out.push({ language_code: lang, title: escapeHtml(trimmed) });
      if (out.length > MAX_LOCALES) return { errors: ['too many locales in title'] };
    }
    if (out.length === 0) return { errors: ['title must contain at least one locale'] };
    return { value: out };
  }

  if (input && typeof input === 'object') {
    const keys = Object.keys(input);
    if (keys.length === 0) return { errors: ['title must contain at least one locale'] };
    if (keys.length > MAX_LOCALES) return { errors: ['too many locales in title'] };
    const out = [];
    for (const lang of keys) {
      const t = input[lang];
      if (typeof t !== 'string') return { errors: [`title[${lang}] must be a string`] };
      const trimmed = t.trim();
      if (!trimmed) return { errors: [`title[${lang}] must not be empty`] };
      if (trimmed.length > MAX_TITLE_LEN) return { errors: [`title[${lang}] too long`] };
      out.push({ language_code: lang, title: escapeHtml(trimmed) });
    }
    return { value: out };
  }

  return { errors: ['title must be an object or array'] };
}

router.post('/listings/sync', internalAuth, async (req, res, next) => {
    console.log(req.body);
  const errors = validateSyncBody(req.body);
  console.log(errors);
  if (errors.length > 0) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Invalid sync payload.', details: errors },
    });
  }

  const b = req.body;
  const allowedDomains = (b.allowed_domains || []).map(normalizeHostname);

  // normalize and sanitize title into [{language_code, title}]
  const norm = normalizeTitle(b.title);
  if (norm.errors) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Invalid title in sync payload.', details: norm.errors },
    });
  }

  try {
    await listingsCache.upsertListing({
      publicId: b.public_id,
      title: norm.value,
      logoUrl: b.logo_url || null,
      contactPhone: b.contact_phone || null,
      contactEmail: b.contact_email || null,
      enabled: b.enabled !== undefined ? b.enabled : true,
      blockedDates: Array.isArray(b.blocked_dates) ? b.blocked_dates : null,
      allowedDomains,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
