// Availability helpers (02-availability-booking.md, 03-reservation-form-ui.md).
// The BFF returns grouped windows:
//   { windows: [{ label: "Lunch" | null, slots: ["12:00", "13:00", ...] }, ...] }
// Grouping detection itself is server-side; the widget just renders optgroups
// where a window has a label, and a flat list otherwise.

export function flatSlots(windows) {
  if (!Array.isArray(windows)) return [];
  return windows.flatMap((w) => (Array.isArray(w.slots) ? w.slots : []));
}

export function hasAnySlots(windows) {
  return flatSlots(windows).length > 0;
}

export function formatSlotForCalendar(slot) {
  // "12:00" -> "12:00:00"; "9:00" -> "09:00:00" (ICS needs HH:MM:SS).
  const [h, m] = slot.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m || 0).padStart(2, '0');
  return `${hh}:${mm}:00`;
}
