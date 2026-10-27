# CalAi design system — Master

Source of truth for the ui-ux-pro-max skill. Page files in `pages/` override this. Tokens live in `app/globals.css`.

## Direction
Bento-grid mobile app with editorial display type. Calm mint-cream paper, one dark ink-green "night" hero surface per screen, lime glow as the signature accent. Indian-food identity (thali, katoris, dish names) stays.

Derived from `search.py "fitness nutrition tracker app" --design-system` (palette: healthy green + macro orange) and `--domain style "bento grid"`. Rejected from the generator: Brutalism and the Hero/Testimonials landing pattern (this is a daily-use app, not a marketing page) and Barlow (kept Bricolage Grotesque, using its `wdth` axis for condensed numerals instead).

## Tokens
| Role | Light | Dark / `.night` |
|---|---|---|
| paper | `#eef3ec` | `#050d09` |
| surface | `#ffffff` | `#0d1813` |
| ink | `#0b1a12` | `#ecf4ee` |
| leaf (primary) | `#047857` | `#34d399` |
| lime (accent) | `#a3e635` | `#d9f99d` |
| protein / carbs / fat | `#d03e22` / `#b86f00` / `#7c3aed` | `#ff7a59` / `#fbbf24` / `#b69cff` |
| water | `#0284c7` | `#38bdf8` |

Never put lime text on the light paper (fails contrast). Use the leaf→carbs gradient for accent type in light mode.

## Type
- Display: Bricolage Grotesque, bold–extrabold, tracking `-0.04em`, page titles 40/48/64px, big numbers `font-stretch: 80%`.
- Body: Onest 15–16px.
- `eyebrow` utility: 11px, uppercase, `0.16em` tracking, muted.

## Surfaces
- `card` utility: 28px radius, 88% surface plus blur, hairline border. Use for every card.
- `night` utility: dark hero card (Today's thali). At most one per screen.
- Buttons are pills (`rounded-full`). Primary has a glow shadow and a sheen sweep on hover.

## Motion (motion-effects principles, applied to live UI)
- **One object changing shape:** nav pills morph between tabs (`<ViewTransition name share="nav-pill">`), and the Segmented control's indicator slides.
- **Stagger by a beat:** wrap a page or list in `.stagger` (70ms per child). Never animate everything at once.
- **Keep the hold alive:** ambient aurora backdrop, rolling water waves, floating halo and orb, FAB ping.
- **Masked type:** `MaskedText` / `.mask-line` for headings.
- Numbers count up with expo-out (`useCountUp`). Rings fill over 1.4s.
- Page change: old page leaves fast (160ms), new page rises in (520ms, blur→sharp).
- Easing: `--ease-out` (expo) for arrivals, `--ease-spring` for playful UI (pills, icons). No spring on data tables.
- Entrance animations use `fill-mode: backwards` so hover transforms still work afterwards.
- `prefers-reduced-motion` disables all of it, including view transitions.
