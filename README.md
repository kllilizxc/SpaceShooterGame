# Phaser Game (WIP)

Work-in-progress arcade survival shooter built with Phaser 3 + Vite, using react-phaser integration.

## Why this exists

This repo is an experiment for:

- https://github.com/kllilizxc/react-phaser
- https://github.com/kllilizxc/GameMakerAgent

## Running locally

```bash
npm ci
npm run dev
```

Other useful commands:

```bash
npm run build
npm run preview
npx tsc -p tsconfig.json --noEmit
```

## Controls

- Move: move towards mouse cursor 
- Shooting: automatic (depends on unlocked/upgraded bullet types)
- Restart: press any key on the game over screen

## Tuning / config

Most gameplay numbers live in `src/config/`:

- `src/config/game.json`: core player/enemy stats + leveling
- `src/config/map.json`: wave timings + spawn intervals
- `src/config/enemies.json`: enemy types
- `src/config/bullets/*.json`: bullet archetypes + per-level behavior
- `src/config/powerups.json`: power-up / upgrade definitions

## Project layout

- `src/main.ts`: Phaser bootstrap + scene registration
- `src/scenes/PreloaderScene.ts`: asset loading + animation setup
- `src/scenes/MainScene.ts`: mounts `GameRoot`
- `src/scenes/main/GameRoot.ts`: main game composition
- `assets/`: art referenced by the preloader

## Notes

- Balance and content are in flux.
- There is no automated test suite yet; sanity-check changes by running the game.
