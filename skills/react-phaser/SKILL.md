---
name: react-phaser
description: Use when working with this repo’s custom React-style Phaser renderer in src/lib/react-phaser.ts, including creating/updating VNodes with createNode(), mounting a root component with mountRoot(), using hooks (useStore/useUpdate/useEffect/useLayoutEffect/useRef/useScene/useState/onMount), working with physics groups and pooled sprites, wiring refs and interactivity, and syncing gameplay metadata via props/Data Manager.
---

# React Phaser

## Quick start (this repo)

- Mount the UI/game tree from a Phaser scene with `mountRoot(scene, GameRoot)` (see `src/scenes/MainScene.ts`).
- Build the scene graph by returning `VNode`s from function components (see `src/scenes/main/GameRoot.ts`).
- Use hooks for side effects and per-frame logic; keep component render output pure.

## Render primitives (VNode types)

Create nodes with:

```ts
createNode(type, props, ...children)
```

Supported built-in `type` strings and common props (see `src/lib/react-phaser.ts`):

- `container`: group children; supports `x`, `y`, `width`, `height`, `interactive`, pointer handlers.
- `text`: `x`, `y`, `text`, `fontSize`, `color`, `fontStyle`, `originX`, `originY`.
- `rect` (graphics-backed rectangle): `x`, `y`, `width`, `height`, `fill`, `alpha`, `strokeWidth`, `lineColor`, `interactive`.
- `image` / `sprite`: `x`, `y`, `texture`, `frame`, `scale`, `tint`, `flipX`, `flipY`, `play`.
- `physics-sprite`: sprite props plus `velocityX`, `velocityY`, `collideWorldBounds`, `bounce`, `drag`, `gravityY`, `immovable`, body sizing (`bodyWidthRatio/bodyHeightRatio` or `bodyWidth/bodyHeight`, `bodyOffsetX/bodyOffsetY`).
- `physics-group`: pooled `Arcade.Sprite` group; pass `{ config }` and render `physics-sprite` children.

Also supported:

- Function components: `createNode(MyComponent, props)`.
- Direct nodes: pass an existing Phaser object as the `type` and keep it stable (store it in a `useRef`); the renderer updates it via “direct” mode.

## Keys, pooling, and physics groups

- Provide `key` for list children to get stable identity across renders.
- For `physics-group`, the reconciler allocates sprites from the group pool via `group.get()` when a keyed child is added.
- Do not wrap `physics-group` children in function components unless you know exactly how the pooled-object adoption works; simplest/most reliable is to inline `createNode('physics-sprite', { key: id, ... })` per item (see `src/scenes/main/components/EnemySpawner.ts` and `src/scenes/main/components/PowerupSpawner.ts`).
- When syncing state from live pooled sprites, read the stored `key` from `(sprite as any).__v_props?.key` (see `BulletManager`/`EnemySpawner`).

## Refs (imperative access)

- Create refs with `useRef<T | null>(null)` and pass as `ref` prop to a node: `createNode('physics-sprite', { ref: playerRef, ... })`.
- Assume `ref.current` is populated after commit; use `useLayoutEffect`/`useEffect`/`onMount` to act on it.

## Hooks (lifecycle and logic)

- `useState`: trigger a re-render when state changes; avoid calling setters during render.
- `useStore(storeHook, selector?)`: subscribe to a Pinia-like store (see `src/lib/game-state.ts` and `src/scenes/main/stores/*`); pass a selector to reduce rerenders.
- `useUpdate(cb)`: run code every Phaser `update` event; use it for movement, timers, despawn logic (see `Bullet.ts`, `EnemySpawner.ts`).
- `useEffect` / `useLayoutEffect`: attach/detach listeners, set methods on sprites, subscribe to stores, etc.
- `useScene`: access the current `Phaser.Scene` from inside a component.
- `onMount`: run once after first commit; return cleanup if needed (see `LevelUpPanel.ts`).

## Interactivity and pointer events

- Set `interactive: true` to enable input.
- Optional props: `useHandCursor`, `onClick`, `onPointerOver`, `onPointerOut`.
- For `rect`/`graphics`, always provide `width` and `height` so a hit area can be created.
- For `container`, set `width`/`height` if you need a sized hit area.

## Passing gameplay metadata to Phaser objects

- Any prop not treated as an internal rendering/physics prop is synced into Phaser’s Data Manager (`obj.setData(key, value)`).
- Read metadata later with `sprite.getData('damage')`, `sprite.getData('health')`, etc. (see `EnemySpawner.ts`).

## Debugging / validation

- Start the game: `npm run dev`, then reproduce the loop you changed.
- Type-check: `npx tsc -p tsconfig.json --noEmit`.
