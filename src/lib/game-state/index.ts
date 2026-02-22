/**
 * GameState - A Pinia-inspired state management utility for agent-generated games.
 * Provides reactivity, auto-logging, and snapshotting for easy debugging.
 *
 * Subscribe semantics (Pinia-style):
 *   - $subscribe(callback) fires ONCE per (outermost) action, after it completes (supports async actions).
 *   - Nested action calls are batched into the outermost action's mutation.
 *   - The callback receives a Mutation object describing the action and ALL changes it made (coalesced per key).
 *   - Direct property assignments outside of actions do NOT fire subscribers (use actions).
 */

export type { Mutation } from "./types";
export { GameState, GameStateManager } from "./manager";
export { defineGameStore } from "./define-game-store";

import "./global";
