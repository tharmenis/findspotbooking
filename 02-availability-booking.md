# Availability and reservation creation

Reservations are per **time slot** (`listing_id`, `arrival_date`,
`arrival_hour`), not a date range. Slots are **exclusive** — one reservation
takes the whole slot, no capacity pooling.

## Availability query

Bookable hours for a listing on a given day, minus already-taken hours:

```sql
SELECT start_time FROM wp_listing_hours
WHERE listing_id = %d AND day_of_week = %d
AND start_time NOT IN (
  SELECT arrival_hour FROM wp_listing_reservations
  WHERE listing_id = %d AND arrival_date = %s
)
```

Fast indexed lookup — this is the query the postmeta-based sync table exists
to make possible (see `01-data-model.md`).

Grouping into windows (e.g. "Lunch" / "Dinner") for the UI: infer boundaries
from gaps between consecutive `wp_listing_hours` slots; use `window_label`
where set, otherwise present ungrouped.

## Reservation creation (overlap-safe insert)

The `uniq_slot` unique constraint on `wp_listing_reservations` is the actual
concurrency guard — two simultaneous requests for the same slot will have one
succeed and one fail at the DB level, which is stronger than any
check-then-insert application logic (which has a race window between the
check and the write).

Flow:
1. Create the `reservation` CPT post first (system of record).
2. Attempt the insert into `wp_listing_reservations`.
3. If the insert fails on the unique constraint (duplicate key), the slot was
   taken between the client's availability check and this request — **roll
   back** the CPT post (delete it) and return a `409` to the caller.

```php
function create_reservation( $listing_id, $arrival_date, $arrival_hour, $guests, $first, $last, $phone, $email, $listing_phone ) {
    global $wpdb;

    $post_id = wp_insert_post( [
        'post_type'   => 'reservation',
        'post_status' => 'publish',
        'meta_input'  => [
            'listing_id'    => $listing_id,
            'arrival_date'  => $arrival_date,
            'arrival_hour'  => $arrival_hour,
            'guests'        => $guests,
            'first_name'    => $first,
            'last_name'     => $last,
            'client_phone'  => $phone,
            'client_email'  => $email,
            'listing_phone' => $listing_phone,
        ],
    ] );

    $inserted = $wpdb->query( $wpdb->prepare(
        "INSERT INTO {$wpdb->prefix}listing_reservations
         (reservation_post_id, listing_id, arrival_date, arrival_hour, guests, first_name, last_name, client_phone, client_email, listing_phone)
         VALUES (%d, %d, %s, %s, %d, %s, %s, %s, %s, %s)",
        $post_id, $listing_id, $arrival_date, $arrival_hour, $guests, $first, $last, $phone, $email, $listing_phone
    ) );

    if ( false === $inserted ) {
        wp_delete_post( $post_id, true ); // slot wasn't actually free — roll back
        return new WP_Error( 'slot_taken', 'This time slot was just booked by someone else.', [ 'status' => 409 ] );
    }

    return $post_id;
}
```

Implication for the widget: the client-side availability check before
submission is **advisory only**, not authoritative. The reservation-creation
endpoint must be ready to return a clean `409`, and the widget must handle it
specifically (see `03-reservation-form-ui.md` — error states).

## Cancellation

```php
function cancel_reservation( $post_id ) {
    global $wpdb;
    wp_update_post( [ 'ID' => $post_id, 'post_status' => 'cancelled' ] ); // keep in CPT history
    $wpdb->delete( $wpdb->prefix . 'listing_reservations', [ 'reservation_post_id' => $post_id ] ); // free the slot
}
```

## Standalone-booking flag gating

Both the availability endpoint and the reservation-creation endpoint must
check `standalone_booking_enabled` (or resolve the `enabled` state) before
doing anything else:
- Availability: return an explicit `{ "available": false }` / 403, not an
  empty slot list — an empty list reads as "fully booked today," which is a
  different and misleading message.
- Reservation creation: reject with a clear error if disabled, as a
  server-side backstop even though the UI shouldn't let a user reach
  submission in this state.

## Migration / backfill (low volume: ~200 records)

- Single-pass script (not batched, not multi-pass idempotent), but should
  still be safe to re-run (upsert on `reservation_post_id`, not blind
  insert).
- Manual reconciliation before cutover: check for missing/inconsistent
  date fields, and specifically for **pre-existing double-bookings** (same
  listing_id + date + hour more than once) — these will fail against the new
  unique constraint and need a decision (contact the client, pick one as
  canonical) before the backfill can complete cleanly.
- Cut the availability endpoint over to reading from `wp_listing_reservations`
  only after reconciliation passes.
