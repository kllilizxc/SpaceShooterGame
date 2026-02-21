# Repository Guidelines

## Project Structure & Module Organization
- `src/main.ts`: Phaser bootstrap and scene registration.
- `src/scenes/PreloaderScene.ts`: loads assets, defines animations, then starts `MainScene`.
- `src/scenes/MainScene.ts`: mounts `GameRoot` (see `src/scenes/main/`).
- `src/lib/`: lightweight “react-phaser” renderer/hooks and shared state helpers.
- `src/config/`: gameplay/balance config (`*.json`) and typed config helpers (`*.ts`).
- `assets/`: game art (mostly in `assets/generated/`), referenced by the preloader.

## Build, Test, and Development Commands
- `npm ci`: install dependencies from `package-lock.json` (reproducible installs).
- `npm run dev`: start the Vite dev server (default `http://localhost:5173/`).
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve `dist/` locally to verify the production build.
- `npx tsc -p tsconfig.json --noEmit`: run TypeScript type-checking (Vite/esbuild does not fully type-check).

## Coding Style & Naming Conventions
- TypeScript with `strict: true`; avoid `any` except at integration boundaries.
- Follow the style of the file you’re editing (this repo currently mixes semicolons/quotes).
- Naming: `PascalCase.ts` for scenes/components (e.g., `MainScene.ts`), `kebab-case.ts` for utilities (e.g., `react-phaser.ts`), `*.json` for tunables in `src/config/`.

## Testing Guidelines
- No automated test framework is configured yet; validate changes by running `npm run dev` and exercising the affected gameplay loop.
- If adding tests, prefer Vitest and colocate as `src/**/__tests__/*.test.ts`.

## Commit & Pull Request Guidelines
- History is minimal (e.g., `Initial commit`, `wip`); prefer short, imperative subjects and avoid `wip` (e.g., `Add laser bullet config`).
- PRs: include a brief description, repro steps, and a screenshot/GIF for visual/gameplay changes; call out modified scenes and any config files touched.
