Original prompt: bug: the layser cannot hurt enemies

## Notes
- Laser bullets were visible but not damaging enemies; likely a `react-phaser` pooling / physics-body sync issue.

## Changes
- Fixed `react-phaser` physics-group pooling ordering bug that could reuse a pooled sprite and then immediately `killAndHide` it during the same commit (leaving bodies disabled / no debug bounds):
  - `src/lib/react-phaser/src/react-phaser/core.ts`
  - Added regression test: `src/lib/react-phaser/src/react-phaser/__tests__/reconciler.test.ts`
  - Rebuilt library dist: `src/lib/react-phaser/dist/*`

## TODO
- Consider adding declarative props for `active` and physics body enable to reduce imperative `setActive(false)` / `body.setEnable(false)` usage in game code.

## Follow-up (laser collider offset)
- Reported issue: laser bullet collider could drift far on X from the rendered beam.
- Fix applied in `src/scenes/main/components/Bullet.ts`:
  - In the `followOwner` branch, after `sprite.setPosition(...)`, force `body.updateFromGameObject()` each frame.
  - This guarantees the Arcade body tracks the visual beam even if a pooled sprite misses an automatic sync path.
- Validation run:
  - `npx tsc -p tsconfig.json --noEmit` passed.
  - `npm run build` passed.
