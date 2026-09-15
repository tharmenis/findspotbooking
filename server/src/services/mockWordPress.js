// In-memory mock of the WordPress plugin's custom REST endpoints, used when
// WP_MOCK_MODE is enabled so the full widget flow works before the WP plugin
// exists (05-open-items.md — "Actual WordPress plugin PHP" is not yet built).
//
// Semantics mirror the real WP contract (02-availability-booking.md):
//   - Availability returns grouped windows ({ label|null, slots[] }).
//   - Reservation creation stores in memory and returns a created reservation.
//   - A deterministic subset of slots simulates the 409 "slot just taken"
//     business outcome so the widget's slot-taken UI path is exercisable.
//   - Status lookup returns a created reservation by id.
//
// State is in-process only — lost on restart, exactly like a mock should be.

const WINDOWS = [
  { label: 'Lunch', slots: ['12:00', '13:00', '14:00'] },
  { label: 'Dinner', slots: ['19:00', '20:00', '21:00', '22:00'] },
];

// Simulate contention: the last slot of each window reads as "just taken" so
// you can exercise the 409 handling without it being every slot.
function isSlotTakenForDemo(date, slot) {
  const lastOfWindow = WINDOWS.some((w) => w.slots[w.slots.length - 1] === slot);
  if (!lastOfWindow) return false;
  // Deterministic per date: alternate which window's tail is taken.
  const day = new Date(`${date}T00:00:00`).getDay();
  const windowIdx = day % WINDOWS.length;
  const takenSlot = WINDOWS[windowIdx].slots[WINDOWS[windowIdx].slots.length - 1];
  return slot === takenSlot;
}

function buildAvailability(date) {
  const windows = WINDOWS.map((w) => ({
    label: w.label,
    slots: w.slots.filter((slot) => !isSlotTakenForDemo(date, slot)),
  })).filter((w) => w.slots.length > 0);
  return { windows };
}

// In-memory store of created reservations (id -> reservation).
const reservations = new Map();
let nextId = 1000;

export const mockWordPress = {
  getAvailability(publicId, date) {
    // Single-day contract: build availability for the requested date.
    return Promise.resolve(buildAvailability(date));
  },

  createReservation(payload) {
    const slot = String(payload.arrival_hour || '');
    if (isSlotTakenForDemo(payload.arrival_date, slot)) {
      return Promise.reject({
        status: 409,
        code: 'slot_taken',
        message: 'This time slot was just booked by someone else.',
      });
    }

    const id = String(nextId++);
    const reservation = {
      id,
      status: 'confirmed',
      arrival_date: payload.arrival_date,
      arrival_hour: payload.arrival_hour,
      guests: payload.guests,
      first_name: payload.first_name,
      last_name: payload.last_name,
      client_phone: payload.client_phone,
      client_email: payload.client_email,
      listing_phone: payload.listing_phone || null,
      created_at: new Date().toISOString(),
    };
    reservations.set(id, reservation);
    return Promise.resolve(reservation);
  },

  getReservationStatus(id) {
    const reservation = reservations.get(String(id));
    if (!reservation) {
      return Promise.reject({
        status: 404,
        code: 'not_found',
        message: 'Reservation not found.',
      });
    }
    return Promise.resolve({ id: reservation.id, status: reservation.status });
  },

  // For tests: reset in-memory state.
  reset() {
    reservations.clear();
    nextId = 1000;
  },

  // Mirrors the WP plugin's GET /listings/{public_id} response. The mock has
  // no in-memory listing store, so the route just hands the publicId back
  // with a hard-coded set of blocked dates for smoke testing.
  getListing(publicId) {
    return Promise.resolve({
      public_id: publicId,
      title: 'Mock Listing',
      blocked_dates: ['2026-08-31', '2026-09-10'],
    });
  },
};
