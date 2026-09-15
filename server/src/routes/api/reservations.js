// POST /api/reservations — create a reservation via WP (which owns the
// overlap-safe insert, 02-availability-booking.md). A clean 409 on
// slot-already-taken must stay distinguishable from generic failures — the
// widget branches its UI on the status code (06-express-app-structure.md).
// The phone arrives already concatenated: country code + national number,
// digits only, no '+'.
//
// GET /api/reservations/:id — reservation status lookup.
import { Router } from 'express';
import { resolvePublicId } from '../../middleware/resolvePublicId.js';
import { originGate } from '../../middleware/originGate.js';
import { standaloneGate } from '../../middleware/standaloneGate.js';
import { wordpressClient } from '../../services/wordpressClient.js';

const router = Router();

const PHONE_RE = /^\d{7,15}$/;

function validateReservationBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Request body is required.'];

  const { arrival_date: arrivalDate, arrival_hour: arrivalHour, guests, first_name: firstName, last_name: lastName, client_phone: clientPhone, client_email: clientEmail } = body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate || '')) errors.push('arrival_date (YYYY-MM-DD) is required.');
  if (!/^\d{2}:\d{2}$/.test(arrivalHour || '')) errors.push('arrival_hour (HH:MM) is required.');
  if (!Number.isInteger(guests) || guests < 1 || guests > 50) errors.push('guests must be an integer between 1 and 50.');
  if (!firstName || !String(firstName).trim()) errors.push('first_name is required.');
  if (!lastName || !String(lastName).trim()) errors.push('last_name is required.');
  if (!PHONE_RE.test(clientPhone || '')) errors.push('client_phone must be digits only, 7-15 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail || '')) errors.push('client_email is invalid.');

  return errors;
}

router.post('/', resolvePublicId, originGate, standaloneGate, async (req, res, next) => {
  const errors = validateReservationBody(req.body);
  if (errors.length > 0) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Invalid reservation data.', details: errors },
    });
  }

  try {
    // The WP plugin needs public_id to associate the reservation with the
    // listing — forward the widget payload as-is (including public_id).
    const created = await wordpressClient.createReservation(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  const { publicId } = req.query;
  if (typeof publicId !== 'string' || publicId.length === 0) {
    return res.status(400).json({
      error: { code: 'missing_public_id', message: 'A publicId query parameter is required.' },
    });
  }
  req.params = { ...req.params, publicId };
  next();
}, resolvePublicId, originGate, standaloneGate, async (req, res, next) => {
  try {
    const status = await wordpressClient.getReservationStatus(req.params.id);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
