# Checkup — Findspot booking widget (ReservationForm)

Date: 2026-08-20
Scope: `widget/src/ReservationForm.jsx` and its shared `widget/src/widget.css` + `PhoneInput.jsx`. Surface reviewed as it renders in the standalone page at `http://localhost:3000/test123`.

## Verdict

**Needs changes** — the form's structure is sound and the core booking task works, but there are real accessibility and mobile-quality gaps. No HIGH escalation triggers that block the task entirely, but the sub-16px inputs and single-column name row are user-visible defects worth fixing before polish.

## Scores

| # | Vital | Score | Status | Key finding |
|---|-------|-------|--------|-------------|
| 1 | Intentionality | 7/10 | Watch | Clean, purposeful card layout; generic blue accent and stock spacing |
| 2 | Readability | 8/10 | Healthy | Clear type hierarchy; muted grays work; 0.875rem labels are small but OK |
| 3 | Usability | 8/10 | Healthy | Core flow (date → time → guests → contact → submit) is logical; stepper + select are right controls |
| 4 | Responsiveness | 6/10 | Watch | Sub-16px inputs on iOS zoom on focus; name row never goes 2-col; `2fr/3fr` phone grid squeezes in narrow embeds |
| 5 | Speed | 9/10 | Healthy | Lazy i18n, tiny widget, no layout shift observed |
| 6 | Accessibility | 6/10 | Watch | Keyboard path works; focus visible; some risk of color-meaning (banner) and disabled-submit discovery |

**Total: 44/60**

## Priority issues

1. **HIGH · Accessibility / Responsive — sub-16px inputs cause iOS zoom-on-focus**
   - Location: `widget/src/widget.css:150` (`.fsb-label` 0.875rem), plus `.fsb-input` / `.fsb-phone-country` inheriting a 0.875rem+ base.
   - Evidence: all form controls (date, time, phone, email) render below 16px on small screens; iOS Safari auto-zooms into the field on focus, breaking layout mid-form.
   - Fix: set `font-size: 1rem` on all `input`, `select`, `textarea` at widths below 640px (or unconditionally on form controls); keep labels at 0.875rem.

2. **MEDIUM · Responsive — name row never goes two-column**
   - Location: `widget/src/widget.css:189` (`.fsb-row` has no column template; only the 560px container query adds one, and `.fsb-row` isn't in that query).
   - Evidence: first/last name stays stacked even on wide standalone; the spec's optional 2-col layout is never used for names.
   - Fix: at `@container (min-width: 560px)` add `.fsb-row { grid-template-columns: 1fr 1fr }` so names (and phone) sit side by side.

3. **MEDIUM · Responsive — phone grid `2fr/3fr` squeezes in narrow embeds**
   - Location: `widget/src/widget.css:189-192` (`.fsb-phone-row`).
   - Evidence: in a narrow embed, the country select gets ~40% of a ~300px field, truncating "United Kingdom (+44)".
   - Fix: use `minmax(0,1fr) minmax(0,2.5fr)` and allow the label to truncate; or stack on the narrowest widths.

4. **LOW · Accessibility — color carries the error state on the banner**
   - Location: `widget/src/ReservationForm.jsx:294` (`fsb-banner-error`) and `widget.css:247-262`.
   - Evidence: the network-error banner is red-fill + red title text with no icon; the distinction is hue-only.
   - Fix: add a small warning icon (or bold "!" marker) and ensure the title carries the meaning without color.

5. **LOW · Interaction — submit disabled while submitting with no progress affordance**
   - Location: `widget/src/ReservationForm.jsx:303`.
   - Evidence: button text swaps to "Booking…" but stays full-width and static; no spinner.
   - Fix: keep it enabled-and-labeled or add a lightweight inline spinner; ensure `aria-busy` is set on the form during submit.

## What's working

- Form controls match the spec exactly (native date, optgroup'd select, stepper, phone split, email).
- Two distinct error cases handled correctly: 409 slot-taken keeps fields + inline time warning; network error keeps everything + retry.
- 422 server details map to field-level messages.
- Language state lives above the form; switching doesn't clear typed data.
- Container-query responsive already in place; widget is fully self-contained for the shadow DOM.

## Verification

Checked: served `/widget.css` matches `widget/src/widget.css`; standalone shell renders `#findspot-root` with `data-public-id="test123"`; API returns listing + Lunch/Dinner windows; i18n en/el bundles present; `.fsb-shell * { max-width:720px }` verified as the constraint that keeps cards centered.

Not verified in a real browser: iOS zoom behavior (inferred from spec + font-size), 320px reflow (inferred), colorblind contrast (checked by eye only).

## Considered but rejected

- Adding a datepicker library — spec mandates native date input.
- Replacing the guests stepper with a select — spec mandates stepper.
- Making the form a single packed card — spec mandates three separate cards.
- Adding a full color-system redesign — this is a checkup; polish belongs in a `recolor`/`refine` pass.
