# Open items

## Decided (design-complete), not yet built

- **WordPress plugin**: custom REST route registration + PHP for:
  - `GET /listings/{public_id}` — public-safe listing fields
  - `GET /availability?listing_id=&from=&to=` — grouped open slots
  - `POST /reservations` — overlap-safe creation (see `02-availability-booking.md`)
  - `GET /reservations/{id}` — status check
  - Internal listings-sync push on listing save (see `01-data-model.md`)
- **`wp_listing_hours` and `wp_listing_reservations` tables** — need actual
  migration/creation.
- **Backfill script** for the ~200 existing reservations, single-pass,
  upsert-safe (see `02-availability-booking.md`).
- **Express app**: folder structure, deployment target, the actual route
  handlers described in `04-widget-embedding.md` and the BFF logic described
  in `01-data-model.md` / `02-availability-booking.md`.
- **React components**: `BookingForm`, listing header, success/error states,
  i18n wiring, phone input, `entry-standalone` / `entry-embed` entry points.

## Not yet designed

### Tenant / client onboarding

How a client site actually gets a `public_id` + embed snippet in the first
place. Needs:
- A way for you (or the listing owner) to register a client site — domain(s)
  allowed, which listing(s) it's scoped to.
- Storage for the tenant/domain allowlist that the BFF's origin check
  (`04-widget-embedding.md`) enforces against.
- Decide whether `public_id` is 1:1 with a listing regardless of tenant, or
  whether a listing could map to multiple tenant-scoped identifiers (e.g. if
  the same listing is embedded on more than one external site with different
  permissions).
- Whether this is self-serve (a dashboard) or manually issued by you at this
  stage — reasonable to start manual given current scale, but worth deciding
  explicitly rather than by default.

### Express app structure / deployment

- Concrete folder layout, framework choices beyond "Express" (e.g. router
  organization, ORM/query builder for the local Postgres/MySQL tables).
- Hosting/deployment target for the Express service.
- Whether Express owns its own database engine choice independent of
  WordPress's MySQL (the local `listings` cache table and any tenant tables
  don't have to live in the same database as WordPress).

## Explicitly deferred (not undecided — deliberately postponed)

- **Client-side idempotency keys** for reservation submission retries, to
  guard against a duplicate reservation when a retry's original request
  actually succeeded server-side. Flagged as a real edge case (exclusive
  slots make a duplicate especially confusing) but deferred as unnecessary
  overkill at current scale. Revisit if reservation volume or embed count
  grows meaningfully.
