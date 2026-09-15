Findspot standalone booking engine — project overview
Context

findspot.net is a WordPress business listing site. Selected listings currently have booking functionality enabled via a form embedded on the listing's own page on findspot.net.

This project extracts that booking functionality into a standalone, embeddable booking widget that can be:

Embedded on external client sites (other businesses' own websites), as a SaaS-style widget.
Loaded directly as a standalone page on book.findspot.net/{public_id}, shareable as a link (WhatsApp, Instagram bio, QR code, etc.).

WordPress (findspot.net) remains the system of record for listings and reservations. A new Express service acts as the API layer and widget host in front of it.

Architecture at a glance
Client site (embed)  OR  book.findspot.net (standalone)
        |
        v
  React widget (shared component, two entry points)
        |
        v
  Express app (book.findspot.net)
    - serves the widget bundle + standalone shell
    - /api/* routes = BFF layer (auth, tenant scoping, caching)
    - local cache of listing display data (title, logo, contact)
        |
        v
  Custom WordPress REST endpoints (plugin on findspot.net)
    - resolves public_id -> internal listing_id
    - availability, reservation creation, reservation status
        |
        v
  WordPress: `listing` and `reservation` custom post types
    + wp_listing_hours (bookable slots config)
    + wp_listing_reservations (fast slot-lookup sync table)

Key principle throughout: WordPress is the only writer of reservation data. Express never talks to the WordPress database directly — always through the custom REST endpoints. Express's own local listings table is a read cache fed by a push (webhook) from WordPress, not a second source of truth.

Why a BFF layer exists (not direct WP calls from the widget)
No WooCommerce — this is a custom CPT setup, so there's no ready-made public REST API for listings/availability/reservations. Custom endpoints are required either way.
The widget is embedded on third-party sites; it cannot hold server credentials.
Multi-tenant scoping (which listings/domains a given embed is allowed to touch), rate limiting, and response shaping all need a layer that isn't WordPress itself.
Document index
01-data-model.md — CPT fields, sync tables, Express-side listings cache, public_id design.
02-availability-booking.md — slot-based availability logic, exclusive-slot reservation creation, migration/backfill notes.
03-reservation-form-ui.md — form fields, i18n, phone handling, layout (mobile/desktop), success/error states.
04-widget-embedding.md — embed.js loader, shadow DOM widget, standalone mode on book.findspot.net, meta tags.
05-open-items.md — decided-but-not-yet-built pieces, and questions still open.
Current status (as of this doc)

Decided and designed, not yet implemented:

Data model (CPT + two sync tables + Express listings cache)
Availability + reservation creation logic (exclusive slot, unique constraint)
Reservation form UI (fields, i18n approach, responsive layout, success/error states)
Widget embedding (embed.js loader, shadow DOM, standalone subdomain mode, OG tags)

Not yet started:

Tenant/client onboarding (how a client site gets a public_id + embed snippet)
Actual WordPress plugin PHP (route registration, validation)
Express app folder structure / deployment
Backfill script for the ~200 existing reservations (flagged as low-risk, low volume — no batching or complex idempotency needed)

Explicitly deferred (not overkill for current scale, revisit if traffic grows):

Client-side idempotency keys for reservation submission retries
