# Express app structure — build handoff

Status: **complete** — closes the gaps flagged in `05-open-items.md` under
"Express app structure / deployment" and "Tenant / client onboarding". The
final section lists items intentionally left to implementer judgment rather
than treated as open design questions.

## Decisions locked in

- **Local database**: a dedicated MySQL database, physically separate from
  WordPress's MySQL instance (separate connection, separate credentials —
  Express never touches the WP DB directly, per `00-overview.md`'s core
  principle anyway).
- **Query layer**: Prisma (schema-first, migrations, typed client).
- **Deployment**: traditional long-running Node process on a VPS/EC2-style
  host (not serverless) — so a persistent DB connection pool and in-process
  timers/crons are both fine to use if needed later.

## Repo layout: monorepo

The React widget (`03-reservation-form-ui.md`, `04-widget-embedding.md`) and
the Express backend live in **one repo**, as two independent packages —
not one build, not one `package.json`. The widget has its own dependency
tree (React, `react-i18next`, `libphonenumber-js`) that the backend has no
reason to carry, and vice versa (Prisma, Express middleware).

```
express-app/
  widget/                     <- React source (03-reservation-form-ui.md, 04-widget-embedding.md)
    src/
      BookingForm.jsx          <- shared: header, form, success/error states
      entry-standalone.jsx     <- mounts directly into the page (book.findspot.net)
      entry-embed.jsx          <- mounts inside a shadow root (client sites)
      i18n/
        locales/
          en.json               <- one bundle per locale, lazy-loaded (see UI doc)
          el.json
    package.json                <- widget's own deps: react, react-i18next, libphonenumber-js
    vite.config.js               <- two entry points -> widget.v4.js (embed) and
                                     standalone.js (standalone shell bundle)
  server/                     <- Express backend (everything below is unchanged
                                  from the original single-package layout)
    prisma/
      schema.prisma            <- listings + listing_domains (see below)
      migrations/
    src/
      server.js                <- entrypoint: creates app, calls .listen()
      app.js                   <- assembles the Express app, mounts routers in order
      config/
        index.js                <- env vars (WP endpoint base, sync secret, port, etc.)
      db/
        client.js               <- Prisma client singleton (one pool, imported everywhere)
      middleware/
        resolvePublicId.js       <- looks up public_id -> cached listing row, 404s cleanly
        originGate.js            <- unified tenant-origin / standalone-origin check (see below)
        standaloneGate.js         <- checks `enabled` on the cached listing row
        internalAuth.js           <- validates X-Sync-Secret on /internal/* routes
        errorHandler.js           <- final error-formatting middleware
      routes/
        api/
          index.js                <- mounts the sub-routers below under /api
          listings.js              <- GET /api/listings/:publicId
          availability.js           <- GET /api/availability
          reservations.js           <- POST /api/reservations, GET /api/reservations/:id
        internal/
          sync.js                   <- POST /internal/listings/sync
        standalone.js              <- GET /:publicId catch-all, meta-tag injection
        assets.js                  <- GET /embed.js, /widget.v4.js, /widget.css, /standalone.js
      services/
        wordpressClient.js         <- thin fetch wrapper around the WP custom REST endpoints
        listingsCache.js            <- reads/writes the local `listings` table via Prisma
        tenantAllowlist.js           <- reads the local tenant/domain allowlist table
      lib/
        escapeHtml.js
        logger.js
      public/                     <- BUILD OUTPUT, not source — gitignored
        embed.js                   <- hand-written loader (see 04-widget-embedding.md),
                                       copied here as-is, not built by Vite
        widget.v4.js                <- Vite build output from widget/src/entry-embed.jsx
        standalone.js                <- Vite build output from widget/src/entry-standalone.jsx
        widget.css
      templates/
        standalone-shell.html        <- the OG-tag HTML shell from 04-widget-embedding.md
  package.json                 <- root: workspace config only (npm/pnpm workspaces),
                                   no runtime deps of its own
```

- **`widget/`'s build output lands in `server/src/public/`.** `routes/assets.js`
  just serves that folder statically (`express.static`) — it doesn't know or
  care that the files were produced by Vite. The build step (`npm run
  build` in `widget/`, configured via `vite.config.js`'s `outDir`) is a
  pre-deploy step, not something Express runs at request time.
- **`embed.js` is hand-written** (it's the small vanilla-JS loader shown
  verbatim in `04-widget-embedding.md`), not part of the Vite build — it
  lives directly in `server/src/public/` (or is copied there by a trivial
  build script) rather than being compiled from `widget/`.
- Root `package.json` only wires up the two workspaces (`widget`, `server`)
  so `npm install` at the repo root installs both — it has no runtime
  dependencies itself.

## Route registration order (in `app.js`)

Mirrors the ordering requirement already called out in `04-widget-embedding.md`
(static/known paths must not be shadowed by the `/:publicId` catch-all):

1. Body parser, security headers (helmet or equivalent).
2. `routes/assets.js` — `/embed.js`, `/widget.v4.js`, `/widget.css`. `embed.js`
   served with a short cache TTL; the versioned bundle and CSS served with a
   long/immutable TTL (per `04-widget-embedding.md`).
3. `routes/api/index.js` mounted at `/api` — each sub-route runs
   `resolvePublicId` → `originGate` → `standaloneGate` before touching
   WordPress (see middleware chain below).
4. `routes/internal/sync.js` mounted at `/internal` — gated by `internalAuth`
   only (no origin/tenant check; this is WordPress calling Express, not a
   browser).
5. `routes/standalone.js` — the `/:publicId` catch-all, registered **last**.

## Middleware chain for `/api/*`

All three `/api` routes (`listings`, `availability`, `reservations`) share the
same three-step chain, so it's written once as middleware rather than
duplicated per route:

1. **`resolvePublicId`** — looks up the `public_id` param against the local
   `listings` cache table (not a live WP call — that's the whole point of the
   cache). Attaches the row to `req.listing`. If no row exists at all, this is
   a genuine 404 ("never set up for standalone booking"), distinct from a row
   that exists but is disabled.
2. **`originGate`** — a single unified check, not two separate code paths for
   embed vs. standalone:
   - If the request's `Origin` header is `https://book.findspot.net` itself
     (or absent, e.g. a same-origin standalone page load), allow — this is
     the "no check needed" standalone case from `04-widget-embedding.md`.
   - Otherwise, look up `req.listing`'s tenant allowlist (via
     `tenantAllowlist.js`) and require the `Origin` to match a registered
     domain for that `public_id`. Reject with a clear, console-visible error
     on mismatch, per the spec.
   - This unification only works once the tenant-allowlist table exists —
     it's the reason tenant onboarding (still open) and this middleware are
     coupled; see "Not yet addressed" below.
3. **`standaloneGate`** — checks `req.listing.enabled`. If `false`, the
   `listings` route returns cached display fields only (title/logo — enough
   for the "temporarily unavailable" UI state); `availability` and
   `reservations` reject outright (explicit `{ available: false }` / 403 and
   a clear creation error, respectively, per `02-availability-booking.md`).

Only after all three pass does the route handler call
`wordpressClient.js` to hit the actual WP custom REST endpoints for live
availability/reservation data.

## API contracts the widget depends on

These are requirements on the `/api/*` responses driven by decisions made in
`03-reservation-form-ui.md` — surfaced here so the backend can be built
correctly without needing the full UI doc:

- **`GET /api/availability` must return grouped windows, not a flat slot
  list**, so the widget can render `<optgroup>` boundaries (e.g. lunch vs.
  dinner) without re-deriving them client-side:
  ```json
  { "windows": [{ "label": "Lunch", "slots": ["12:00","13:00","14:00"] }, ...] }
  ```
  `label` is `null` when `wp_listing_hours.window_label` isn't set for that
  block — the widget renders an ungrouped flat list in that case. Grouping
  boundaries themselves (gaps between consecutive slots) are computed
  server-side, not left to the widget.
- **`POST /api/reservations` receives an already-concatenated phone
  string** — country calling code + national number, digits only, no `+`
  (e.g. `306980081107`). The widget does this concatenation client-side
  before sending; Express does not need to parse or assemble phone parts.
- **Slot-taken vs. transport failure must be distinguishable by status
  code**, since the widget branches its UI behavior on this: a clean `409`
  for slot-already-taken (business outcome — see the insert/rollback flow
  in `02-availability-booking.md`) versus any other error status for
  genuine failures. Don't collapse both into a generic 4xx/5xx shape.

## `wordpressClient.js`

One thin module wrapping calls to the WP plugin's custom REST routes listed
in `05-open-items.md`:
- `getAvailability(listingId, from, to)`
- `createReservation(payload)`
- `getReservationStatus(id)`

Centralizing this here means the WP base URL, auth (if the custom endpoints
require any), and error normalization (mapping WP's `WP_Error` /409 shape
into the API's own error format) live in one place, not scattered across
three route files.

## Tenant / client onboarding

Fully WordPress-driven — no separate dashboard, no manual step in Express.
Resolves the "not yet designed" section of `05-open-items.md`:

- **`public_id` stays 1:1 with a listing.** WP generates it once when the
  standalone-booking flag is set true; there's no second axis (no per-client
  concept in WP) that would justify multiple public_ids for one listing.
- **Allowed embed domains are a separate, one-to-many concern** from the
  public_id itself — one listing's public_id can be embedded on several
  domains (e.g. a client's main site and a booking subdomain).
- **New WP field**: a domains list on the listing (repeater or
  newline/comma-separated textarea — WP-side implementation detail, not
  Express's concern) included in the existing sync payload:

  ```
  POST https://book.findspot.net/internal/listings/sync
  Headers: X-Sync-Secret: <shared secret>
  Body: { public_id, title, logo_url, contact_phone, contact_email, enabled,
          allowed_domains: ["client-site.com", "booking.client-site.com"] }
  ```

- **Sync handler behavior**: full replace, not diff/merge — on every sync,
  Express deletes existing domain rows for that `public_id` and inserts the
  incoming set. WP is the source of truth for the domain list the same way
  it is for title/logo, so there's no need for Express-side add/remove logic.
- **Domain normalization**: strip scheme and trailing slash, lowercase,
  store bare hostname (`client-site.com`, not `https://client-site.com/`).
  `originGate` parses the incoming request's `Origin` header the same way
  (extract hostname only) before comparing — avoids false mismatches from
  scheme or trailing-slash differences between what's typed in WP and what
  the browser sends.
- Empty `allowed_domains` on a listing is valid and expected for a listing
  that's *only* ever accessed via the standalone `book.findspot.net` page and
  never embedded — `originGate`'s self-origin check still lets those through
  since it doesn't consult the domain table at all in that case.

This also finalizes `originGate` from the previous section: it now has a
real table (`listing_domains`) to query instead of an assumed one.

## Local database schema (Prisma models)

Two tables now, both keyed off `public_id`:

```prisma
model Listing {
  publicId      String   @id @map("public_id") @db.VarChar(36)
  title         String   @db.VarChar(200)
  logoUrl       String?  @map("logo_url") @db.VarChar(500)
  contactPhone  String?  @map("contact_phone") @db.VarChar(20)
  contactEmail  String?  @map("contact_email") @db.VarChar(191)
  enabled       Boolean  @default(true)
  updatedAt     DateTime @updatedAt @map("updated_at")

  domains       ListingDomain[]

  @@map("listings")
}

model ListingDomain {
  id        Int      @id @default(autoincrement())
  publicId  String   @map("public_id") @db.VarChar(36)
  domain    String   @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at")

  listing   Listing  @relation(fields: [publicId], references: [publicId], onDelete: Cascade)

  @@unique([publicId, domain])
  @@index([publicId])
  @@map("listing_domains")
}
```

- `onDelete: Cascade` means a full listing-row delete (not just disable)
  cleans up its domains automatically — relevant only if a hard-delete sync
  event is ever sent; the documented default in `01-data-model.md` is
  `enabled: false` on delete, which doesn't touch this table.
- `@@unique([publicId, domain])` makes the sync handler's "delete all, insert
  new set" step safe to re-run without duplicate rows even if a sync is
  retried.
- No `site_id`/tenant table beyond this — since onboarding turned out to be
  fully WP-driven with `public_id` as the only tenant key, the earlier
  placeholder concern about a separate tenant table was solved by this
  domains table alone.

## Left to implementer's judgment

Everything above is decided. These are explicitly *not* open design
questions — just normal build-time calls left to whoever implements this:

- Env var list / secrets management specifics.
- Logging/monitoring approach beyond the placeholder `lib/logger.js`.
- Test setup.
