# Reservation form UI
 
## Layout: separate cards, not one packed card
 
Three independent pieces, stacked with spacing, not crammed into a single
card:
 
1. **Listing header card** — logo/avatar, title, location, open-hours summary,
   language switcher.
2. **Reservation form card** — the actual booking form.
3. **Attribution notice** — plain text below the form (see "Attribution").
Rationale: the header only depends on the initial listing fetch and never
needs to re-render on form interaction (date/time/guest state changes), so
splitting keeps re-render scope narrow and keeps components independently
reusable (e.g. the header could stay static while the form re-renders).
 
### Responsive behavior
 
- Single component with a breakpoint, not two separate implementations.
- Prefer a **container query** over a viewport media query — the widget's
  actual available width depends on where it's placed on the host page
  (could be a narrow sidebar on a wide desktop page), not the browser
  viewport. A media query can't see that; a container query can.
- Mobile (narrow): single column, stacked fields.
- Desktop (wide) / standalone on book.findspot.net: two-column layout inside
  the form card is optional depending on available space — when space is
  ample (e.g. the form sits in its own browser window/tab on
  book.findspot.net), don't force-pack fields; roomier padding and spacing
  are preferable to a fixed max-width squeeze.
## Form fields
 
| Field | Control | Notes |
|---|---|---|
| Arrival date | native date input | |
| Time | `<select>` with optional `<optgroup>` | see "Time slot selection" below |
| Guests | stepper (+/- buttons), not free text | avoids invalid input (0, negative, absurd values) at the UI layer |
| First name | text input | |
| Last name | text input | |
| Phone | country-code `<select>` + national number input | see "Phone handling" |
| Email | email input | |
 
### Time slot selection
 
- **`<select>`, not a pill/button grid** — chosen specifically because some
  listings are open up to ~24h/day; a grid of that many pills is unusable.
- **Grouped by `<optgroup>`** when the listing has multiple separate windows
  (e.g. lunch/dinner), so a schedule pause within the day is visible as
  structure rather than an unexplained gap in the list.
- **Grouping is optional** — `window_label` on `wp_listing_hours` is
  nullable; if absent, render an ungrouped flat list. Grouping detection
  itself (where one continuous block ends and another begins) is automatic
  from gaps between slots regardless of whether a label is set.
- Availability response needs to carry the grouping, not just a flat list,
  e.g.: `{ windows: [{ label: "Lunch"|null, slots: ["12:00","13:00","14:00"] }, ...] }`.
### Phone handling
 
- Store format: digits only, country calling code included, no `+`
  (matches existing data, e.g. `306980081107`).
- UI: country-code dropdown (flags) + national-number input, validated
  against the selected country — do not ask visitors to type the calling
  code manually.
- Suggested library: `libphonenumber-js`. Concatenate calling code + national
  number (stripped of `+`) client-side before sending to the API.
## Multilingual support (i18n)
 
- **Library**: `react-i18next`, with per-locale JSON translation bundles,
  loaded lazily (don't ship every language to every visitor).
- **Language resolution order**:
  1. Explicit override from the embedding context — `data-lang` attribute in
     embed mode, `?lang=` query param / initial resolution in standalone mode.
  2. Browser `navigator.language` / `Accept-Language`.
  3. Fallback default (e.g. English).
  4. In-widget switcher lets the visitor override manually at any point.
- **Language state lives above both the header and form components** (app
  shell / context), not inside the form's local state — switching language
  must not clear whatever the visitor has already typed.
- **Static UI text** (labels, buttons, errors) → translation bundles.
  **Dynamic listing content** (title, extra fields) → comes from WordPress;
  translating listing content itself is a separate WPML/Polylang-level
  question, not solved by the widget's i18n layer.
- **Dates/times**: use `Intl.DateTimeFormat` keyed to the active locale
  rather than hand-rolled formatting.
## Attribution
 
- A quiet footer line below the form card (not a banner): "Booking provided
  by findspot.net", with `findspot.net` as a real link (referral value, not
  just branding).
- Baked into the component itself, not a client-configurable/removable prop —
  functions as a term of use for the embed.
- Styled at muted/small text size — reads as standard SaaS-widget
  attribution (e.g. "Powered by Stripe"), not competing with listing
  branding.
## Success state
 
- **Replaces the form in place** (unmounts the form fields entirely, not just
  visually hidden) — no redirect, since the widget may be embedded inside
  another site's page and navigating away breaks that context. Unmounting
  (not just hiding) also prevents a stale submit button from firing a second
  POST via back-forward-cache restore.
- Shows a confirmation summary: listing, date, time, guests.
- "Add to calendar" generates a client-side `.ics` file — no server round
  trip or OAuth needed.
- Accessibility: the form→confirmation swap needs an `aria-live="polite"`
  region announcing the confirmation, since it's a silent DOM replacement
  otherwise.
## Error states — two distinct cases, handled differently
 
### 1. Slot taken (`409` from reservation creation)
 
A business-logic outcome, not a failure:
- Re-fetch availability immediately (don't just grey out the one slot
  client-side — other slots may also be stale).
- Keep every other field as typed (name, phone, email, guests, date) — only
  the time selection resets.
- Inline warning near the time field specifically, not a generic top-of-form
  banner.
### 2. Network / server error
 
A transport failure, not a business outcome:
- **Never clear the form** — this is the case most likely to frustrate a
  visitor if they had to retype everything.
- Retry button resubmits the exact same payload.
- Genuine server-side validation errors (e.g. malformed input that slipped
  past client-side checks) should surface as field-level errors near the
  specific input, not this generic banner.
### Explicitly deferred
 
- Client-side idempotency keys (to prevent a duplicate reservation if a
  retried submit's first attempt actually succeeded server-side) — flagged
  as a real edge case given exclusive slots, but deferred as overkill at
  current scale. Revisit if traffic/volume grows.
