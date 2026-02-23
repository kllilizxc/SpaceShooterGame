# Phaser Survival Shooter (WIP)

Work-in-progress arcade survival shooter built with Phaser 3, Vite, and
[`@realiz3r/react-phaser`](https://www.npmjs.com/package/@realiz3r/react-phaser).

## Overview

- Survive continuously escalating enemy waves.
- Auto-fire and level up by picking upgrades from 3 random cards.
- Unlock and upgrade bullet archetypes (`normal`, `spread`, `laser`, `pierce`).
- Fight elite enemies and bosses that can fire projectiles back at the player.

## Why This Exists

This repo is an experiment for:

- https://github.com/kllilizxc/react-phaser
- https://github.com/kllilizxc/GameMakerAgent

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

### Install and Run

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/` in your browser.

## Commands

- `npm run dev`: start Vite dev server
- `npm run build`: create production build in `dist/`
- `npm run preview`: preview the production build locally
- `npx tsc -p tsconfig.json --noEmit`: run full TypeScript type checking

## Controls

### Gameplay

- Move: `W`, `A`, `S`, `D`
- Movement fallback: ship auto-moves toward mouse cursor when no WASD key is held
- Shooting: automatic (depends on unlocked/upgraded bullet types)
- Restart after game over: press any keyboard key

### Debug Keys (Development)

- `1` / `2` / `3` / `4`: switch weapon to normal/spread/laser/pierce
- `I` / `K`: cycle weapon backward/forward
- `J` / `L`: increase/decrease current weapon level
- `O` / `P`: previous/next wave

## Gameplay Loop

1. Start with a basic weapon and survive incoming waves.
2. Gain XP from defeating enemies.
3. Enter level-up phase when XP threshold is reached, then choose one upgrade card.
4. Collect falling powerups to trigger additional upgrade selections.
5. Survive as long as possible; on death, the scene pauses and can be restarted.

## Configuration Guide

Most balancing and spawn behavior is tuned in `src/config/`:

- `src/config/game.json`: base player/enemy/leveling values
- `src/config/map.json`: wave timings, spawn intervals, weighted enemy mixes
- `src/config/enemies.json`: enemy stats, damage, speed, score values
- `src/config/bullets/normal.json`: normal bullet levels
- `src/config/bullets/spread.json`: spread bullet levels
- `src/config/bullets/laser.json`: laser bullet levels
- `src/config/bullets/pierce.json`: pierce bullet levels
- `src/config/GameStats.ts`: typed config access + runtime upgrade logic

Currently present but not wired into active runtime flow:

- `src/config/bullets/rapid.json`
- `src/config/powerups.json`

## Project Structure

- `src/main.ts`: Phaser bootstrap and scene registration
- `src/scenes/PreloaderScene.ts`: asset loading + animation registration
- `src/scenes/MainScene.ts`: scene entry that mounts `GameRoot`
- `src/scenes/main/GameRoot.ts`: top-level game composition
- `src/scenes/main/components/`: gameplay entities/spawners/HUD/level-up UI
- `src/scenes/main/hooks/`: lifecycle, controls, collision handling
- `src/scenes/main/stores/`: player/game state stores
- `assets/`: game art (mostly generated spritesheets)

## Development Notes

- Canvas/game world is currently fixed at `800x600`.
- Arcade physics debug rendering is enabled in `src/main.ts`.
- No automated tests are configured yet.
- Validate changes by running `npm run dev` and exercising the gameplay loop.
