# Findspot standalone booking engine

Standalone, embeddable booking widget for findspot.net listings. See the
design docs in the repo root:

- `overview.md` — architecture at a glance (WordPress = system of record, Express = BFF)
- `01-data-model.md` — CPT fields, sync tables, listings cache, public_id design
- `02-availability-booking.md` — slot-based availability and reservation creation
- `03-reservation-form-ui.md` — form fields, i18n, phone handling, layout
- `04-widget-embedding.md` — embed.js loader, shadow DOM widget, standalone mode
- `05-open-items.md` — decided-but-not-yet-built pieces and open questions
- `06-express-app-structure.md` — this repo's layout, middleware chain, API contracts

## Repo layout

```
express-app/
  widget/     React widget (BookingForm, entry-standalone, entry-embed) — own deps
  server/     Express BFF (Prisma, MySQL listings cache, WP client) — own deps
```

The widget's Vite build output lands in `server/src/public/` (a pre-deploy
step, served statically by Express). `embed.js` is hand-written, not built.

## Getting started

Prerequisites: a MySQL database named `findspot_booking` (provision it yourself —
Prisma is configured to **never create the database**, only apply migrations to
an existing one).

```sh
npm install            # installs both workspaces
npm run build          # builds the widget into server/src/public/
cd server
cp .env.example .env   # fill in WP_BASE_URL, SYNC_SECRET, DATABASE_URL, PORT
npx prisma migrate deploy   # applies migrations to the existing DB (never creates it)
npx prisma db seed          # inserts mock listings (dev convenience)
npm run dev            # starts the Express server
```

### Working with migrations

- **Apply** existing migrations to an already-provisioned DB:
  `npx prisma migrate deploy`
- **Create a new migration** without touching the DB or creating anything:
  `npx prisma migrate dev --create-only --name <name>`
- **Mock data** (local dev): `npx prisma db seed` — upserts the listings in
  `server/prisma/seed.js` (a Taverna, a Greek café, and a disabled listing).
  Safe to re-run.

### Testing locally

With the server running and the seed applied, open:

- **Standalone:** `http://localhost:3000/test123` (or `?lang=el` for Greek,
  `/disabled-demo` for the paused state)

**Mock WordPress endpoints:** set `WP_MOCK_MODE=true` in `server/.env` (on by
default in `.env.example`). This short-circuits the availability, reservation
creation and status calls to an in-memory mock so the entire booking flow works
before the WP plugin exists:

- Availability returns Lunch (12:00–14:00) and Dinner (19:00–22:00) windows.
- The last slot of each window alternates as "just taken" per day — submitting
  it exercises the widget's 409 slot-taken handling.
- Created reservations are stored in memory and can be looked up by id.
- Flip `WP_MOCK_MODE=false` to proxy to the real WordPress endpoints instead.

## API surface (BFF)

| Route | Purpose |
|---|---|
| `GET /api/listings/:publicId` | cached listing display fields (gated) |
| `GET /api/availability?publicId=&date=` | grouped windows from WP |
| `POST /api/reservations` | create reservation via WP (409 on slot taken) |
| `GET /api/reservations/:id` | reservation status |
| `POST /internal/listings/sync` | WordPress push webhook (`X-Sync-Secret`) |
| `GET /:publicId` | standalone HTML shell with server-injected OG tags |
| `GET /embed.js`, `/widget.v4.js`, `/widget.css`, `/standalone.js` | widget assets |
