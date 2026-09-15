// Middleware 3 of the /api/* chain: gate on the cached listing's `enabled`
// flag. Marking the listing disabled pauses bookings but keeps the row (and
// its branding) servable — the distinction is handled per route, since the
// listings route may still return cached display fields for the "temporarily
// unavailable" UI state (01-data-model.md / 04-widget-embedding.md).
export function standaloneGate(req, res, next) {
  if (req.listing.enabled === false) {
    return res.status(403).json({
      error: {
        code: 'listing_disabled',
        message: 'Booking is currently unavailable for this listing.',
      },
    });
  }
  next();
}
