import type { ComponentInstance } from "./core";

let currentContext: ComponentInstance | null = null;
let currentHookIndex = 0;

export function getCurrentContext(): ComponentInstance | null {
    return currentContext;
}

export function requireCurrentContext(hookName: string): ComponentInstance {
    const ctx = currentContext;
    if (!ctx) throw new Error(`${hookName} must be called inside a component`);
    return ctx;
}

export function setCurrentContext(ctx: ComponentInstance | null) {
    currentContext = ctx;
}

export function getCurrentHookIndex(): number {
    return currentHookIndex;
}

export function setCurrentHookIndex(nextIndex: number) {
    currentHookIndex = nextIndex;
}

export function consumeHookIndex(): number {
    const index = currentHookIndex;
    currentHookIndex++;
    return index;
}

