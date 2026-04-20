# Planisphere Celeste (Hihan)

Interactive celestial planisphere / sky map built with TypeScript, D3.js, and Vite. Displays a real-time azimuthal equidistant projection of the sky with multiple calendar systems (Enoch 364-day, Hebrew, Islamic, Tahitian lunar, Christian), zodiac constellations, navigation stars, deep sky objects, and transit alerts. UI is in French.

## Screenshots

<!-- Add screenshots here: ![screenshot](./docs/screenshot.png) -->

## Features

- Real-time celestial map on azimuthal equidistant projection
- Multiple projections (azimuthal equidistant, stereographic, orthographic, gnomonic)
- Calendar systems: Enoch 364-day, Hebrew, Islamic, Tahitian lunar (Tarena), Christian feasts
- Zodiac constellations and navigation stars
- Deep sky objects with transit alerts
- Animated Enoch wheel
- Wind particles overlay (GFS data)
- Tide curve visualization
- Biblical events and Hebrew feast correlations
- Shareable URLs with date/time/hemisphere parameters

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

This runs tests, type-checks, then builds for production.

## Test

```bash
npm run test
npm run test:watch
```

## Deploy

Built for [Netlify](https://www.netlify.com/). Push to `main` to auto-deploy.

## Tech Stack

- TypeScript (strict mode)
- D3.js (d3-geo projections)
- astronomy-engine (celestial body positions)
- Vite (build tool)
- Vitest (testing)
- Netlify Functions (OG image generation)

## License

MIT — see [LICENSE](./LICENSE).