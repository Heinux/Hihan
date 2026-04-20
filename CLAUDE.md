# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hihan ("Planisphere Celeste") — an interactive celestial planisphere/sky map built with TypeScript, D3.js, and Vite. Displays a real-time celestial map on an azimuthal equidistant projection with multiple calendar systems (Enoch 364-day, Hebrew, Islamic, Tahitian lunar, Christian), zodiac constellations, navigation stars, deep sky objects, and transit alerts. UI is in French. Deployed on Netlify.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — run tests + type-check + production build (must pass before deploying)
- `npm run test` — run all Vitest tests once
- `npm run test:watch` — run tests in watch mode
- `npx vitest run src/core/__tests__/time.test.ts` — run a single test file
- `npx tsc` — type-check only (no emit)

No linter or formatter is configured. TypeScript strict mode serves as primary static analysis.

## Architecture

### Data Flow

`main.ts` drives a `requestAnimationFrame` loop: advance time → compute JD → `TimeService` produces a `CalendarSnapshot` (all calendars at once, cached) → `astronomy-engine` computes body positions → `RenderPipeline` draws layers to canvas → update Enoch wheel + event panels + SEO meta.

### Layer Structure

- **`src/core/`** — State, events, time/astronomy math, formatters, shared types
  - `AppState` (state.ts) is the central state class extending `EventEmitter` (typed pub/sub via `AppEvents`). Features depend on it through decoupled interfaces in `types.ts` (e.g., `SeasonDeps`, `EnochDeps`, `AlertDeps`).
  - `TimeService` (time-service.ts) caches `CalendarSnapshot` per JD — all calendar modules read from this.
  - `time.ts` — Julian Day conversions, `advanceTime()`, calendar math. `astronomy.ts` — obliquity, precession, GMST, coordinate transforms.
  - `constants.ts` — shared constants, zodiac signs, Enoch months, moon phases, celestial body data. Large file; partial split into `data/celestial-bodies-data.ts` is in progress.

- **`src/rendering/`** — Canvas rendering pipeline
  - `RenderPipeline` (render-pipeline.ts) — composable layer system. Each layer has `name`, `enabled()`, `render()`.
  - `CanvasRenderer` (renderer.ts) — viewport transforms, world map graticule, season arcs, `placeLabel()`.
  - `body-renderer.ts` — planet/sun/moon positions + rendering. `constellation-renderer.ts` — zodiac stick figures, nav stars, city markers.
  - `projections.ts` — strategy pattern for projections (azimuthal, stereographic, orthographic, gnomonic).
  - `wind-layer.ts` — Tahitian wind rose overlay.

- **`src/features/`** — Feature modules (calendar systems, events, alerts)
  - `enoch.ts` (596 lines) — Enoch calendar computation + animated wheel on a dedicated `<canvas>`.
  - `hebrew.ts`, `tahitian.ts`, `christian-feasts.ts`, `islamic-feasts.ts`, `jewish-feasts.ts` — calendar computations.
  - `seasons.ts` — equinox/solstice + event panel. `biblical-events.ts` — Enoch/Hebrew date ↔ scripture correlations.
  - `dso.ts` — Deep Sky Object manager. `alerts.ts` — DSO-landmark transit detection.
  - `og-image.ts`, `seo-meta.ts` — social sharing / meta tags.

- **`src/ui/`** — DOM interaction and controls
  - `interaction.ts` — mouse/touch/keyboard on canvas (pan, zoom, hover).
  - `overlay-controls.ts` (461 lines) — time controls overlay. `ui-panel.ts` (489 lines) — left panel setup.
  - `tz-select.ts`, `tooltip.ts`, `fullscreen.ts`.

- **`src/data/`** — Static catalogs (cities, DSO, nav stars, zodiac, world TopoJSON)

- **`netlify/`** — Serverless infrastructure
  - `functions/og.ts` — OG image generation (satori + resvg-wasm). Contains its own copies of calendar constants (intentionally independent of src/).
  - `edge-functions/og-meta.ts` — injects dynamic `<meta>` tags for all requests.

### Key Conventions

- Path alias: `@/*` maps to `src/*` (configured in tsconfig.json and vitest.config.ts).
- World map TopoJSON is inlined in `index.html` as a `<script>` block (`WORLD_DATA` global), declared in `src/types/global.d.ts`.
- All source comments and JSDoc are in English.
- Tests live in `__tests__/` directories alongside the source they test.