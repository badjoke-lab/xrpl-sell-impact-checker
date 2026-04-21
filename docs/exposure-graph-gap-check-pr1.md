# XSIC Exposure Graph — Implementation Gap Check (PR1 planning)

## 1) Summary

The current Exposure Graph app is a placeholder shell with a single card and a UI-kit demo error mount, while the Flow Alert page provides the target XSIC page-shell and interaction baseline. The standalone Exposure Graph mock already defines a full PR1-ready structure (hero, controls, signal card, metric grid, tabs, exposure panel, risk panel, and debug card) with lightweight static SVG-driven visuals and basic tab interaction.

PR1 should copy the Flow Alert shell conventions (header/footer/nav wiring, `console-page` sizing, `aria-live` main region, debug-force style) and implement the mock structure with static/demo data only.

## 2) Diff vs current `apps/exposure-graph`

### A. Missing HTML sections to add

Current app has only:
- Hero placeholder card (`Exposure Graph`, “Coming soon…”)
- Shared UI mount card used for demo error state

Missing sections for mock parity:
- Hero intro section (eyebrow + title + subtitle)
- Controls card (issuer preset, issuer address, currency code, graph mode, refresh, updated status)
- Signal card (status pill, top concentration value, why, context chips)
- Metrics grid (8 metric cards)
- Tabs shell (`Exposure`, `Risk`) with tab copy helper line
- Exposure tab panel:
  - Main Viz card (graph stage with inline SVG + legend + selection overlay)
  - Selected entity detail side panel
  - Concentration list card
  - Activity/watchlist card
- Risk tab panel:
  - Issuer control radar card (SVG radar)
  - Root cause summary card
  - Evidence list card
- Debug/notes card with force buttons

### B. JS behaviors required for parity with mock

- Boot/init pattern matching Flow Alert (`boot()` + `init(refs)` with early-return safety)
- DOM refs map for controls, status elements, tabs, panel containers, and optional debug nodes
- Tab switching behavior:
  - Toggle `.is-active`
  - Update `aria-selected`
  - Show/hide `.tab-panel`
- Static state model for PR1 (no live fetch):
  - `activeTab`, `graphMode`, `preset`, `issuer`, `currency`, `updatedAt`, optional `forcedMode`
- Lightweight force-state debug actions (`ok|empty|error` minimum)
- Optional localStorage persistence for form controls and selected tab (same ergonomics as Flow Alert)
- Placeholder render functions:
  - `renderHeaderMeta()`
  - `renderTabState()`
  - `renderExposurePanel()` (DOM/SVG labels + selected entity text)
  - `renderRiskPanel()` (radar labels + evidence badges)
  - `renderModeOverlays()` for loading/empty/error blocks
- Mobile-safe behavior:
  - Avoid animation loops and graph physics
  - Use only event-driven updates (click/change)

### C. CSS work required

Recommendation: **add app-specific stylesheet** (`apps/exposure-graph/exposure-graph.css`) and keep `styles.css` edits minimal.

Reasoning:
- `styles.css` already contains a large, stable `.flow-*` block aligned to Flow Alert.
- Mock uses generic class names (`.card`, `.controls-card`, `.tabs`, `.tab`, `.metric-card`, etc.) that can collide globally.
- Exposure Graph should be namespaced to avoid regressions in existing pages.

Minimal `styles.css` changes:
- None preferred for PR1, except optional shared token additions if strictly needed.

### D. Class naming collision risks + strategy

Collision risks from mock generic names:
- `.controls-card`, `.signal-card`, `.metrics-grid`, `.tabs`, `.tab`, `.mainviz-card`, `.list-card`, `.debug-card`, `.section-title`

Recommended strategy:
- Scope all selectors under `.exposure-graph-page` and/or `.exposure-graph` root class.
- Prefer `eg-` prefix for new component classes:
  - `eg-controls-card`, `eg-signal-card`, `eg-metrics-grid`, `eg-tabs`, `eg-tab`, `eg-mainviz-card`, `eg-list-card`, `eg-debug-card`
- Use app-specific data attributes for JS hooks:
  - `data-eg-tab-target`, `data-eg-state`, `data-eg-signal`, etc.

### E. Lightweight rendering strategy (graph/radar)

PR1 rendering approach (static/demo, browser-safe):
- Use inline SVG for both visuals.
- Exposure graph:
  - Fixed positions + weighted curved paths (stroke width encodes exposure)
  - Small, bounded node count (<= 15 visible nodes)
  - No force-layout engine, no canvas animation loop
- Radar:
  - Static polygon + axes + labels in SVG
  - Data-to-points mapping in small helper function only when values change
- Interaction:
  - Click node to update side detail panel (class toggle + text update)
  - Optional simple hover styling only
- Performance guardrails:
  - No `requestAnimationFrame` loops
  - No heavy libraries in PR1
  - Re-render only on input/tab changes

### F. Exact file-level change plan

#### `apps/exposure-graph/index.html`
- Replace placeholder body content with full mock-aligned app structure.
- Keep Flow Alert shell conventions:
  - same header/footer/nav mount usage
  - `main` with `aria-live="polite"`
- Add app root classes:
  - `flow-shell-compatible exposure-graph-page`
  - `page__content exposure-graph`
- Wire script tags:
  - `defer` nav script
  - new `defer` app script (`/apps/exposure-graph/exposure-graph.js`)
  - remove temporary `XSICUiKit.renderErrorState(...)` inline script
- Include app CSS link (`/apps/exposure-graph/exposure-graph.css`) after `/styles.css`

#### `apps/exposure-graph/exposure-graph.js` (new)
- Create module IIFE similar to Flow Alert architecture:
  - `boot()` -> collect refs
  - `init(refs)` -> bind events + initial render
- Implement tab switch and control change handling.
- Provide static mock payload object for PR1.
- Implement small render pipeline:
  - `renderAll()` orchestrator
  - panel-specific render helpers
  - debug force-state support
- Accessibility:
  - maintain `aria-selected`
  - optionally update `aria-hidden` on inactive panels

#### `apps/exposure-graph/exposure-graph.css` (new, preferred)
- Port necessary mock styles with `eg-` prefix and `.exposure-graph-page` scoping.
- Keep spacing/radius/typography aligned with Flow Alert visual direction.
- Add responsive breakpoints mirroring Flow Alert thresholds (`600/900/1200`).
- Add tab active states, panel hide/show states, card variants, and lightweight SVG container styles.

#### `styles.css` (optional, minimal)
- Avoid major edits in PR1.
- Only add shared utility/token adjustments if truly reusable and low-risk.

### G. Recommended implementation order for PR1

1. **Shell migration in HTML**
   - Replace placeholder with full semantic section skeleton using namespaced classes.
2. **Scoped CSS pass**
   - Establish layout + responsive behavior for hero/controls/signal/metrics/tabs.
3. **Tab and static render JS**
   - Implement boot/init, tab switching, control echo, status/meta updates.
4. **Exposure panel static SVG + side details**
   - Add fixed graph SVG and selected-entity panel updates.
5. **Risk panel static radar + evidence cards**
   - Add radar SVG and evidence list rendering.
6. **Debug and state overlays**
   - Add force buttons for empty/error (and loading if desired) with visual verification.
7. **Polish + mobile QA**
   - Ensure no overflow breaks on small screens and no heavy loops.

## 3) Risks / blockers

- If mock class names are copied directly, style collisions are likely across the global stylesheet surface.
- Inline base64/logo content from mock should not be copied; use existing XSIC assets and shared nav/footer mounts.
- Without strict PR1 limits, graph scope can expand into force-layout/data modeling too early.
- Accessibility drift risk if tab semantics (`role`, `aria-selected`, panel activation) are only visual.

## 4) PR1 execution plan (deliverable framing)

- PR1 objective: **static, mobile-safe, mock-parity UI shell** for Exposure Graph using Flow Alert conventions, with demo-only state and lightweight SVG.
- Non-goals for PR1:
  - live API calls
  - graph layout engines
  - high-frequency rendering
- Acceptance checks:
  - page visually matches XSIC direction
  - Exposure/Risk tabs work with correct ARIA toggling
  - graph and radar render consistently on mobile/desktop
  - empty/error debug modes show stable overlays
  - no regressions in Flow Alert or other app pages due to CSS collisions
