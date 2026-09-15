# Widget embedding and standalone mode

Two mount modes, one shared component:

```
src/
  BookingForm.jsx        <- shared: header, form, success/error states
  entry-standalone.jsx   <- mounts directly into the page (book.findspot.net)
  entry-embed.jsx        <- mounts inside a shadow root (client sites)
```

## Embed mode (client sites)

### Client-facing snippet

Declarative (most client sites):
```html
<div data-findspot-widget data-public-id="a1b2c3" data-lang="el"></div>
<script src="https://book.findspot.net/embed.js" async></script>
```

Imperative (for sites that need JS control, e.g. dynamic public_id, React/Vue
host sites embedding it themselves):
```html
<div id="my-booking-slot"></div>
<script src="https://book.findspot.net/embed.js" async></script>
<script>
  window.FindspotBooking = window.FindspotBooking || { q: [] };
  FindspotBooking.q.push(['init', { selector: '#my-booking-slot', publicId: 'a1b2c3', lang: 'de' }]);
</script>
```

The queue pattern (`.q.push`) exists because `embed.js` loads `async` — the
host page's inline init call may run before the loader script has finished
downloading. Standard pattern (same as Stripe/Intercom/GA): the loader drains
the queue once ready, so call order doesn't matter.

### `embed.js` (the loader)

Stays tiny — every client site pays to download it regardless of whether the
widget is ever scrolled into view.

```js
(function () {
  function mount(el, config) {
    var shadow = el.attachShadow({ mode: 'open' });
    var styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = 'https://book.findspot.net/widget.css';
    shadow.appendChild(styleLink);

    var mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    import('https://book.findspot.net/widget.v4.js').then(function (mod) {
      mod.renderWidget(mountPoint, config);
    });
  }

  document.querySelectorAll('[data-findspot-widget]').forEach(function (el) {
    mount(el, { publicId: el.dataset.publicId, lang: el.dataset.lang });
  });

  window.FindspotBooking = window.FindspotBooking || { q: [] };
  (window.FindspotBooking.q || []).forEach(function (call) {
    if (call[0] === 'init') mount(document.querySelector(call[1].selector), call[1]);
  });
})();
```

Key decisions:
- **Shadow DOM, not iframe.** No `postMessage` height coordination needed
  (content is in-flow on the host page). Tradeoff: widget CSS must be fully
  self-contained (already true, given the card-based design) and cannot
  inherit from the host page.
- **The real bundle (`widget.v4.js`) is dynamically imported**, not bundled
  into `embed.js` — a client site whose widget `div` is below the fold only
  pays for the tiny loader until scrolled into view. Consider gating the
  `import()` behind an `IntersectionObserver` to only load on scroll-into-view,
  for host sites' page-speed scores.
- **Version pinned in `embed.js` itself**, not in the client's snippet — this
  is the update mechanism. Deploying a new `embed.js` pointing at `v5`
  propagates to every existing embed on next page load, with no client site
  changes needed. `embed.js` should have a short CDN cache TTL (fast
  rollout); versioned bundle files can be cached aggressively/immutably.

### Fonts

`@font-face` for Greek/Latin (and any further locales) must be declared
inside `widget.css`, loaded into the shadow root specifically — a font
loaded at the host page's document level is not automatically available
inside a shadow tree (the network fetch is still browser-cached, but the
declaration must be re-scoped).

### Origin / tenant enforcement

Every API call from a mounted widget must originate from a page whose
`Origin` is in that tenant's registered allowlist for its `public_id`. The
BFF should reject (clear, console-visible error) any mismatch — otherwise
anyone could copy a client's embed snippet onto an unrelated page. (Tenant
allowlist mechanics are part of onboarding — see `05-open-items.md`.)

### CSP fallback

Some host sites' CSP blocks third-party `script-src`. Document an iframe
fallback:
```html
<iframe src="https://book.findspot.net/a1b2c3?lang=el" style="border:0;width:100%;height:720px"></iframe>
```
Simpler, but loses in-flow auto-sizing — would need a fixed height or
`postMessage`-based auto-resize for parity.

## Standalone mode (book.findspot.net)

### Express routing

```
GET  /:public_id              -> standalone HTML shell (server-injects meta tags)
GET  /assets/standalone.js    -> standalone bundle
GET  /embed.js                -> the loader (for OTHER sites)
GET  /widget.v4.js            -> the embeddable bundle (for OTHER sites)
GET  /widget.css              -> shared styles
GET  /api/*                   -> BFF routes, shared by both modes
```

Register `/embed.js`, `/widget.v4.js`, `/api/*`, and static asset routes
**before** the `/:public_id` catch-all (or constrain the public_id route to
match the expected ID format) so those paths don't get misrouted as a
lookup for a listing with that literal public_id.

### What's different from embed mode

- No shadow DOM / CSS injection — it's Express's own page, styles load
  normally.
- **Shareable URL** — `book.findspot.net/{public_id}` can be handed out
  directly (social bio, QR code) with no embed needed at all.
- **Language resolution** has no host page to read `data-lang` from — use a
  URL query param (`?lang=`) or `Accept-Language` on first load, with the
  in-widget switcher able to override.
- **No origin/tenant-allowlist check needed** — request originates from
  findspot.net's own domain.

### Server-side meta tag injection

Because this is share-preview surface (social/messaging link previews), meta
tags must be injected server-side into the initial HTML response — a
client-rendered empty shell loses OG data entirely.

Decided approach: **generic findspot.net-branded OG image** for all listings
(no per-listing dynamic image generation), with dynamic **title/description**
text:

```html
<title>Findspot booking engine – {{listing_title}}</title>
<meta name="description" content="Book a table at {{listing_title}} online.">
<meta property="og:title" content="Findspot booking engine – {{listing_title}}">
<meta property="og:description" content="Book a table at {{listing_title}} online.">
<meta property="og:image" content="https://book.findspot.net/assets/og-default.png">
<meta property="og:url" content="https://book.findspot.net/{{public_id}}">
<meta property="og:type" content="website">
```

```js
app.get('/:publicId', async (req, res, next) => {
  if (!isValidPublicId(req.params.publicId)) return next();

  const listing = await db.listings.findByPublicId(req.params.publicId);
  const title = listing ? listing.title : 'Listing not found';

  let html = fs.readFileSync(INDEX_HTML_PATH, 'utf8'); // cache this read in prod
  html = html
    .replace('{{listing_title}}', escapeHtml(title))
    .replace('{{public_id}}', req.params.publicId);

  res.send(html);
});
```

Notes:
- **Escape the injected title** — it's user-controlled data (typed into
  WordPress by a listing owner) being raw-substituted into HTML; unescaped
  `& < > " '` is an XSS vector.
- **Missing/disabled listing**: title should reflect that state ("Listing not
  found" / "Booking currently unavailable") rather than a raw 404 or stale
  cached title — a shared link to a broken/disabled listing should look
  intentionally broken, not silently wrong.
- Plain `.replace()` templating is sufficient at this scope (two
  placeholders) — no templating engine needed.

## Standalone-disabled UX (recap from data model / booking docs)

If `standalone_booking_enabled` is off for a listing already linked/embedded
elsewhere, the widget shows a graceful "temporarily unavailable" state
(basic branding still renders from the Express cache) rather than an error
the client site's developer has to debug.
