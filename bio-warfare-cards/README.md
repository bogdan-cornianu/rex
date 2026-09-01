# Strain — Bio-Warfare Card Game

Browser-based turn-based card battler with a contagion-spread mechanic. Built with Vite, Phaser 3, and TypeScript.

## Quick Start

```bash
cd bio-warfare-cards
npm install
npm run dev
```

Open the URL shown in the terminal (typically http://localhost:5173).

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm test` — run Vitest unit tests

## Architecture

Headless `src/core/` game engine (rules, contagion, AI) with Phaser scenes in `src/phaser/` as the view layer.

## MVP Features

- Single-player vs AI
- Two factions: Vector Command & Containment Directorate
- 40 cards, contagion spread mechanics
- Content warning on first launch
