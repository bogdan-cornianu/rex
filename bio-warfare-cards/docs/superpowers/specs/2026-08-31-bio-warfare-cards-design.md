# Bio-Warfare Card Game — Design Spec

**Title:** Strain  
**Date:** 2026-08-31  
**Status:** Approved for MVP implementation

## Overview

Browser-based turn-based card battler inspired by Hearthstone pacing with a dark realistic biological warfare theme. Signature mechanic: **contagion spread** between board units.

## Constraints

- MVP: single-player vs AI
- Tech: Vite + Phaser 3 + TypeScript + Vitest
- Architecture: headless `game-core` + Phaser view layer (Option B)
- Separate project folder: `bio-warfare-cards/`
- Board: 5 unit slots per side
- Match length target: 15–20 turns average

## Core Mechanics

### Resources

| Concept | Name | Rules |
|---------|------|-------|
| Mana | Funding | +1 per turn, cap 10 |
| Hero HP | Stability | Starts at 30; reach 0 to lose |
| Minions | Units | Attack / Resilience stats |
| Spells | Operations | One-shot effects |

### Contagion States

`clean` | `exposed` | `infected` | `carrier` | `immune`

### Spread Triggers

1. **Adjacency spread** (Contagion Phase): infected units spread to adjacent units; carriers at 50% rate
2. **Death burst**: infected unit death exposes one random adjacent unit
3. **Zone outbreak**: left/center/right zones accumulate outbreak counters; new units in hot zones start exposed

### Counterplay

- Quarantine: block spread for N turns
- Vaccinate: immune to specific strain
- Decontaminate: cleanse exposed/infected

### Turn Structure

Draw → Funding → Main → Combat → Contagion → End

### Factions

- **Vector Command** (offense, contagion snowball)
- **Containment Directorate** (control, cleansing)

Fixed 20-card decks, no deck builder in MVP.

### AI

Rule-based heuristic with difficulty randomness (easy = 30% suboptimal moves).

## Content Framing

- Content warning on first launch
- Strategic simulation framing, not glorification
- Strain IDs + codenames alongside disease names

## Architecture

```
game-core (pure TS) ← BattleScene (Phaser) reads/writes state
```

## MVP Scope

In: menu, faction select, full AI match, contagion, ~40 cards, tests, placeholder art  
Out: PvP, deck builder, campaign, monetization

## Visual Direction

Muted greens, sickly amber, clinical white, charcoal. Outbreak map board. Infection spread animations.
