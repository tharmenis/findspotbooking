# Data model

## Existing WordPress structures

- **`listing` CPT** — one post per business listing.
- **`reservation` CPT** — one post per reservation. Holds the following fields
  (currently as postmeta):

  | Field | Type | Notes |
  |---|---|---|
  | Arrival date | date (d/m/y) | |
  | Selected hour | H:M | |
  | Guests | integer | |
  | Listing id | int | meta key linking to the `listing` CPT |
  | First name | string | |
  | Last name | string | |
  | Client phone | string | digits only, country code included, no leading `+` (e.g. `306980081107`) |
  | Client email | string | |
  | Listing phone number | string | same phone format as above |

- **Booking model is slot-based, not date-range**: a reservation is a single
  `(listing_id, arrival_date, arrival_hour)` combination, not a check-in/check-out
  range. Slots are **exclusive** — one reservation takes the whole slot, no
  per-slot capacity/guest-count pooling.

- **Existing "booking enabled" flag** on the listing controls display of the
  *on-site* booking form on findspot.net. This is a **separate, independent**
  flag from standalone-booking enablement (see below) — a listing can have
  either, both, or neither.

## New field: standalone booking flag

A new listing meta field, e.g. `standalone_booking_enabled` (bool), independent
from the existing on-site flag. Gates:
- Whether the listing gets a `public_id` / is servable via the standalone
  widget or embed at all.
- The custom REST endpoints (availability, reservation creation) — reject
  even if a valid `public_id` is presented, if this flag is off.
- Behavior when toggled off *after* a client site already has a live embed:
  widget should show a graceful "temporarily unavailable" state (see
  `03-reservation-form-ui.md`), not an error or broken UI. This requires the
  Express-side listings cache to keep serving basic display info (title,
  logo) even when disabled — see below.

## New table: `wp_listing_hours` — bookable slot config per listing

Stores explicit bookable hours (not just open/close windows), so that pauses
within a day (e.g. lunch break) are naturally represented by the *absence* of
rows for that time range — no separate "closed windows" table needed.

```sql
CREATE TABLE wp_listing_hours (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,   -- 0=Sunday..6=Saturday
  start_time TIME NOT NULL,
  slot_length_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  window_label VARCHAR(100) NULL,          -- optional, e.g. "Lunch" / "Dinner"
  KEY idx_listing_day (listing_id, day_of_week)
);
```

- One row per bookable hour (explicit), not generated ranges — simpler
  querying, trivially handles irregular schedules and businesses open up to
  24h.
- `window_label` is nullable. Consecutive slots are grouped into windows
  automatically (a gap of more than N hours between consecutive slots starts
  a new window) for UI purposes (see `03-reservation-form-ui.md` for the
  `<optgroup>` behavior). The label is a cosmetic override on top of that
  automatic grouping — if absent, the UI renders an ungrouped flat list.

## New table: `wp_listing_reservations` — fast slot-lookup sync table

Derived/cache table, always rebuildable from the `reservation` CPT. Exists
because `meta_query` range-filtering on postmeta does not scale for
availability lookups (no usable index on `meta_value` for date ranges).

```sql
CREATE TABLE wp_listing_reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_post_id BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NOT NULL,
  arrival_date DATE NOT NULL,
  arrival_hour TIME NOT NULL,
  guests SMALLINT UNSIGNED NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  client_phone VARCHAR(20) NOT NULL,
  client_email VARCHAR(191) NOT NULL,
  listing_phone VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_slot (listing_id, arrival_date, arrival_hour),
  KEY idx_post (reservation_post_id),
  KEY idx_listing_date (listing_id, arrival_date)
);
```

Deliberate design choices:
- **No status column.** Since slots are exclusive, this table only ever holds
  currently-blocking reservations. Cancellation **deletes** the row (frees the
  slot) rather than marking it cancelled — the CPT remains the full historical
  record including cancellations.
- **Denormalized client fields** so the plugin can answer "who's on this slot"
  without a second postmeta lookup.
- **The `uniq_slot` constraint is the actual double-booking guard** — stronger
  than any "check availability, then insert" application logic, since it
  rejects a concurrent conflicting insert at the DB level. See
  `02-availability-booking.md` for the insert/rollback flow.
- **CPT remains the system of record**; this table is a derived index only,
  and can always be rebuilt from the CPT if it drifts.

## Migration of existing reservations

~200 existing reservation records. Given the low volume:
- A single-pass backfill script (WP-CLI command or one-off admin button) is
  sufficient — no batching, no multi-pass idempotent retry logic needed.
- Should still be upsert-safe (re-runnable) in case of a data issue requiring
  a fix-and-rerun.
- Manual/spot-check reconciliation (not automated tooling) is enough at this
  volume — check for inconsistent status values, missing dates, orphaned
  `listing_id`s, and **pre-existing double-bookings** (same
  listing_id + date + hour appearing more than once), which would violate
  the new unique constraint and need manual resolution before cutover.

## Express-side listings cache

A local table on the Express service, keyed by `public_id`, storing only the
display fields the widget needs on first load (title, logo, contact info) —
**not** availability or reservation data, which always stay live calls to
WordPress.

```sql
CREATE TABLE listings (
  public_id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  logo_url VARCHAR(500),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(191),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Add a `site_id`/`tenant_id` column now (even with only findspot.net as a
  source today) to avoid a painful retrofit once multi-tenant onboarding
  exists.
- Populated by a **push from WordPress**, not pulled by Express — see
  "Listings cache sync" below. `enabled` here mirrors
  `standalone_booking_enabled`, not the on-site booking flag.
- Row is **not deleted** when a listing is disabled — kept so the widget can
  distinguish "never set up for standalone booking" (genuine 404) from
  "exists but currently paused" (graceful unavailable state), and so basic
  branding (title/logo) can still render in the unavailable state.

### Listings cache sync (WordPress → Express)

WordPress hooks into listing save (specifically, changes relevant to the
`standalone_booking_enabled` field or the display fields) and pushes:

```
POST https://book.findspot.net/internal/listings/sync
Headers: X-Sync-Secret: <shared secret>
Body: { public_id, title, logo_url, contact_phone, contact_email, enabled }
```

Express upserts on `public_id`. Triggers to wire up in WP:
- Listing saved with standalone booking enabled → upsert.
- Standalone flag turned off → push `enabled: false` (Express stops serving
  bookings for it, keeps the row).
- Listing deleted → push `enabled: false` as the safe default (or an explicit
  delete call, if hard delete is ever intended).

**Failure handling** (given low traffic, lightweight is enough):
- Log failed pushes on the WP side (e.g. an option/row noting last failed
  sync + timestamp) for visibility.
- A nightly reconciliation cron in WP re-pushes every currently-enabled
  listing, idempotently (safe since it's an upsert) — self-heals any silently
  failed webhook within 24h without needing a retry queue.

## `public_id` design

- Each listing gets an opaque `public_id` (UUID or short random slug),
  generated once, stored as listing postmeta.
- **Do not use the raw WordPress post ID** in any public-facing URL or API
  call — it's sequential/enumerable, which would let someone scrape every
  listing on the platform, including ones never opted into standalone
  booking.
- The BFF (Express) resolves `public_id → internal listing_id` server-side;
  the internal ID is never exposed to the widget or client sites.
