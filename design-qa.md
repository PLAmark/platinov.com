# Design QA: flowing bottom navigation v270

## Evidence

- Source of truth: `C:\Users\admin\Downloads\IMG_5230.MP4`.
- Reference frame: `qa-reference-telegram-nav.png`.
- Transition study: `..\ref-nav-video\transition-0-1.png`.
- Full implementation view: `qa-implementation-full.png`.
- Focused implementation crop: `qa-implementation-nav.png`.
- Side-by-side comparison: `qa-comparison.png`.
- Tested viewport: approximately 390 x 865 CSS pixels, mobile density as supplied by the in-app browser.
- Tested state: settled home route, plus route changes across every bottom-navigation item.

## Reference mapping

- Typography, icons, item count, labels, and static dock remain the existing PLATINOV design, as requested.
- The Telegram reference contributes the interaction model: one continuous lens moves between equal-width targets and briefly stretches toward the destination.
- The implementation uses the existing neutral glass colors rather than Telegram's black dock colors.

## Interaction and geometry checks

- All five buttons expose a full grid-cell tap target, approximately 72.26 x 47.99 CSS pixels each.
- The moving glass is approximately 72.26 x 46.12 CSS pixels and aligns to the selected button with no meaningful horizontal or width delta after settling.
- Routes verified: `/reviews`, `/giveaway`, `/`, `/support`, and `/profile`.
- Exactly one active navigation item is present on every tested route.
- The glass is a single non-interactive indicator (`pointer-events: none`), so it cannot block taps.
- Movement uses one compositor-friendly `translate3d` transition. The brief liquid stretch uses `scaleX`; no animated blur, backdrop-filter, or heavy shadow is introduced.
- `prefers-reduced-motion: reduce` disables both movement and stretch.
- Hover icon behavior is preserved; pressing a tab does not shrink or scale the glass.

## Comparison history

- P2: the old per-button active backgrounds could only switch abruptly. Fixed by replacing them with one shared moving indicator.
- P2: the mobile performance rule disabled all transitions. Fixed with a tightly scoped transition override on the indicator only.
- P2: the button width initially followed old component sizing and exceeded the lens. Fixed by making each button fill its grid track.
- P3: the reference contains four Telegram tabs while PLATINOV contains five product tabs. This is an intentional product-structure difference, not a fidelity defect.

## Runtime notes

- No bottom-navigation JavaScript errors were observed.
- Local preview logs contain expected warnings from the Telegram WebApp shim and failed remote API fetches because the static local server does not provide the production API. These are unrelated to the navigation implementation.
- `script.js` passes the Node syntax check.

## Final result

passed
