// GET /api/availability?publicId=<id>&date=YYYY-MM-DD
//
// Returns grouped windows from WP, not a flat slot list — the widget renders
// <optgroup> boundaries from this (06-express-app-structure.md):
//   { "windows": [{ "label": "Lunch", "slots": ["12:00","13:00","14:00"] }, ...] }
// label is null when WP didn't set window_label for that block.
//
// `date` is required (single-day lookup — reservations are slot-based, not a
// date range; the /api/availability contract in the UI doc is a one-day query).
import { Router } from 'express';
import { resolvePublicId } from '../../middleware/resolvePublicId.js';
import { originGate } from '../../middleware/originGate.js';
import { standaloneGate } from '../../middleware/standaloneGate.js';
import { wordpressClient } from '../../services/wordpressClient.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PublicId comes in the query string for this route (GET /api/availability).
// normalizePublicId pulls it into req.params so the shared resolvePublicId ->
// originGate -> standaloneGate chain works unchanged.
function normalizePublicId(req, res, next) {

  const { publicId } = req.query.publicId ? { publicId: req.query.publicId } : req.params;

  if (typeof publicId !== 'string' || publicId.length === 0) {
    return res.status(400).json({
      error: { code: 'missing_public_id', message: 'A publicId query parameter is required.' },
    });
  }
  req.params = { publicId };
  next();
}

router.get('/', normalizePublicId, resolvePublicId, originGate, standaloneGate, async (req, res, next) => {
  const { date } = req.query;
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({
      error: { code: 'invalid_date', message: 'A valid date parameter (YYYY-MM-DD) is required.' },
    });
  }

  try {
    const result = await wordpressClient.getAvailability(req.listing.publicId, date);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
