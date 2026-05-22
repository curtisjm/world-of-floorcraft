---
name: "World of Floorcraft"
description: "A precise atelier product system for ballroom syllabus and competition tools."
colors:
  paper: "#fafaf9"
  light-surface: "#ffffff"
  ink: "#0a0a0a"
  graphite: "#404040"
  light-rule: "#e5e5e5"
  light-layer: "#f4f4f3"
  carbon: "#0a0a0a"
  dark-surface: "#141414"
  dark-layer: "#1c1c1c"
  chalk: "#fafafa"
  mist: "#d4d4d4"
  smoke: "#737373"
  dark-rule: "#262626"
  wine: "#7a2228"
  sage: "#4d6651"
  clay: "#a55a32"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "0"
  body:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0"
rounded:
  none: "0px"
  control: "2px"
  circle: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.light-layer}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  panel:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.none}"
    padding: "24px"
  input:
    backgroundColor: "{colors.dark-layer}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: World of Floorcraft

## 1. Overview

**Creative North Star: "The Atelier Syllabus"**

World of Floorcraft should feel like a working reference manual built for people who care about craft. The interface is quiet, squared, and exact: carbon pages, lighter surface panels, crisp rules, and a typography system that separates editorial ceremony from operational work.

This is a product interface, so consistency and task flow matter more than spectacle. The system rejects beige shadcn stone defaults, decorative gradients, default glass, soft SaaS cards, neon status color, and serif-heavy data views.

**Key Characteristics:**

- Flat panels with visible borders and tonal contrast.
- Square corners for most components, with 2px radius only where a control needs a tactile edge.
- Metals used only when bronze, silver, or gold means something.
- Inter-first UI, Source Serif 4 for display moments, JetBrains Mono for labels and metadata.

## 2. Colors

The palette is black, white, and three tiers of graphite. Semantic color is rare and named as material: wine, sage, and clay.

### Primary

- **Carbon** (#0a0a0a): Dark page background and the anchor for the whole system.
- **Chalk** (#fafafa): Primary type on dark surfaces.
- **Ink** (#0a0a0a): Primary type and action color on light surfaces.

### Secondary

- **Surface** (#141414 dark, #ffffff light): Cards, panels, menus, and framed tools.
- **Layer** (#1c1c1c dark, #f4f4f3 light): Inputs, selected tabs, hover bands, and secondary controls.
- **Rule** (#262626 dark, #e5e5e5 light): Borders, dividers, table rules, and component edges.

### Tertiary

- **Mist** (#d4d4d4): Body and secondary type on dark surfaces.
- **Smoke** (#737373): Meta text, disabled text, focus rings, and low-emphasis marks.
- **Graphite** (#404040): Body and secondary type on light surfaces.

### Semantic

- **Wine** (#7a2228): Destructive actions, errors, withdrawals, and failed live states.
- **Sage** (#4d6651): Confirmed, saved, connected, checked in, and registered states.
- **Clay** (#a55a32): Pending, warning, incomplete, deferred, and attention states.

Use `status-sage`, `status-clay`, and `status-wine` for operational badges, notices, check-in states, and live connection states. These utilities should carry enough tint and border strength to read clearly against carbon and surface panels. Use `placement-gold`, `placement-silver`, and `placement-bronze` for awarded placements only.

### Named Rules

**The Metals Rule.** Bronze, silver, and gold are materials, not decoration. Use them only for syllabus levels, placements, earned status, membership, and comparable domain meaning. They should feel polished and luminous, with clean highlights and visible gleam, not muddy, dusty, or brown.

**The No Stone Rule.** Do not use Tailwind stone, beige, tan, or brown default neutrals for product surfaces.

**The Named Material Rule.** Do not use raw Tailwind blue, green, amber, orange, yellow, red, or emerald status colors in product UI. Map those meanings to sage, clay, wine, and metals.

## 3. Typography

**Display Font:** Source Serif 4 with Georgia fallback.
**Body Font:** Inter with Arial fallback.
**Label/Mono Font:** JetBrains Mono with ui-monospace fallback.

**Character:** The pairing should feel editorial but usable. Source Serif 4 adds ceremony to titles; Inter keeps operational screens readable and consistent; JetBrains Mono gives labels and metadata a quiet reference-manual voice.

### Hierarchy

- **Display** (500, 2rem and up, 1.08): Brand marks, page titles, major content headings, and content titles.
- **Headline** (500 to 600, 1.25rem to 1.75rem, 1.15): Section titles and high-level page grouping.
- **Title** (500 to 600, 1rem to 1.125rem, 1.2): Card titles and compact panel headings.
- **Body** (400, 0.875rem to 1rem, 1.5): Paragraphs, controls, tables, lists, and repeated operational text.
- **Label** (500, 0.6875rem to 0.75rem, 1): Eyebrows, metadata, table headers, badges, and technical identifiers.

### Named Rules

**The Serif Boundary Rule.** Source Serif 4 never appears in tables, buttons, badges, form controls, figure list rows, navigation labels, dense cards, or status elements.

**The Mono Metadata Rule.** JetBrains Mono is for labels and identifiers, not paragraphs.

## 4. Elevation

This system is flat by default. It conveys depth through surface contrast, borders, divider rules, tonal bands, and occasional contextual blur. Shadows are not part of the base vocabulary.

### Shadow Vocabulary

- **None** (`box-shadow: none`): Default for cards, panels, buttons, menus, dialogs, popovers, tables, and graph nodes.
- **Contextual Blur** (`backdrop-filter: blur(...)`): Reserved for sticky navigation and modal/sheet overlays that need to keep page context visible.

### Named Rules

**The Rule-Line Rule.** Use borders and dividers before shadows. If a surface needs separation, increase tonal contrast or add a full border.

**The No Decorative Glass Rule.** Blur is allowed when it solves a layering problem. It should not become a translucent card aesthetic, and menu surfaces must stay opaque enough to block underlying text.

**The Bolder Product Rule.** Increase impact through clearer hierarchy, darker active states, and confident surface contrast. Do not overscale product titles, thicken header rules, add neon, gradients, shadows, or extra decorative color.

## 5. Components

### Buttons

- **Shape:** 2px radius.
- **Primary:** Ink on paper in light mode, chalk on carbon in dark mode.
- **Hover / Focus:** Use tonal background shifts and visible smoke focus rings. Do not add glow.
- **Secondary / Ghost:** Secondary buttons use the layer surface. Ghost buttons become visible on hover with an accent band.

### Chips

- **Style:** 2px radius, mono or compact sans text, full border.
- **State:** Use gold, silver, bronze, wine, sage, or clay only when the domain meaning is explicit.

### Cards / Containers

- **Corner Style:** Square by default.
- **Background:** Use surface against carbon or paper. Use layer for headers and selected states.
- **Shadow Strategy:** No shadows.
- **Border:** Full 1px rule border. Avoid doubled top rules on card or table headers.
- **Internal Padding:** 16px to 24px depending on density.

### Inputs / Fields

- **Style:** 2px radius, input-surface background, input border.
- **Focus:** Smoke ring with border shift.
- **Error / Disabled:** Wine for invalid states; opacity and cursor state for disabled controls.

### Navigation

- **Style:** Top navigation uses a translucent blurred background with a bottom rule. Active dashboard items have a border and accent fill. Dropdowns, popovers, and selects use opaque surfaces with full borders so underlying text never competes with menu text.

### Delight Moments

- **Loading:** Skeletons use a subtle moving rule line instead of a pulse. The motion is short, quiet, and disabled for reduced-motion users.
- **Empty states:** Use the small atelier diamond glyph and specific guidance about what the surface becomes once populated. Avoid generic "nothing here" copy.
- **Brand mark:** The home mark may respond softly on hover or keyboard focus. Do not extend this into decorative logo animation elsewhere.

### Figure Graph

Graph nodes use square surfaces, full borders, and metal borders for syllabus level. The center node gets an outline, not a glow.

## 6. Do's and Don'ts

### Do:

- **Do** use #0a0a0a, #141414, #1c1c1c, #262626, #737373, #d4d4d4, and #fafafa as the core dark palette.
- **Do** keep panels and repeated list items lighter than the page background.
- **Do** use `rounded-none` or `rounded-[2px]` for cards, panels, menus, inputs, and buttons.
- **Do** keep body, table, list, and form text in Inter.
- **Do** reserve Source Serif 4 for true titles and editorial content.
- **Do** map success to sage, warning to clay, and destructive states to wine with enough saturation and border contrast to stay legible on dark surfaces.

### Don't:

- **Don't** use beige or brown shadcn stone defaults.
- **Don't** add decorative gradients, default glassmorphism, or neon dashboards.
- **Don't** use transparent dropdown menus. Menus, popovers, and selects must block underlying text.
- **Don't** use blur on ordinary cards, tables, lists, or panels. Keep it to sticky chrome and modal/sheet overlays.
- **Don't** use side-stripe alert cards.
- **Don't** use shadows as a default separator.
- **Don't** put Source Serif 4 in tables, buttons, badges, form controls, figure list rows, or dense operational lists.
- **Don't** scatter raw blue, green, amber, orange, or red Tailwind status colors through inactive UI.
