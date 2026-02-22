import type Phaser from "phaser";
import { scheduleRender } from "./scheduler";
import { consumeHookIndex, requireCurrentContext } from "./hook-runtime";

export function useState<T>(initialValue: T | (() => T)): [T, (val: T | ((prev: T) => T)) => void] {
    const ctx = requireCurrentContext("useState");
    const index = consumeHookIndex();

    if (!ctx.hooks[index]) {
        const value = typeof initialValue === "function" ? (initialValue as Function)() : initialValue;
        ctx.hooks[index] = { state: value };
    }

    const state = ctx.hooks[index].state;

    const setState = (newVal: T | ((prev: T) => T)) => {
        if (ctx.unmounted) return;
        const nextState = typeof newVal === "function" ? (newVal as Function)(ctx.hooks[index].state) : newVal;
        if (nextState !== ctx.hooks[index].state) {
            ctx.hooks[index].state = nextState;
            scheduleRender(ctx);
        }
    };

    return [state, setState];
}

export function useStore<T, U = T>(storeHook: () => T, selector?: (store: T) => U): U {
    const ctx = requireCurrentContext("useStore");
    const index = consumeHookIndex();

    const store = storeHook() as any;

    if (!ctx.hooks[index]) {
        const selected = selector ? selector(store) : store;
        const state = { value: selected as any, store, selector };
        ctx.hooks[index] = { state };

        // Subscribe after commit (avoid side effects during render)
        ctx.addLayoutEffect(() => {
            if (!store.$subscribe) return;

            const unsubscribe = store.$subscribe(() => {
                if (ctx.unmounted) return;
                const { store: latestStore, selector: latestSelector } = ctx.hooks[index].state;
                if (latestSelector) {
                    const nextValue = latestSelector(latestStore);
                    if (nextValue !== ctx.hooks[index].state.value) {
                        ctx.hooks[index].state.value = nextValue;
                        scheduleRender(ctx);
                    }
                } else {
                    scheduleRender(ctx);
                }
            });

            ctx.hooks[index].cleanup = () => unsubscribe();

            // Catch up in case the store changed between render and subscribing
            const { store: latestStore, selector: latestSelector } = ctx.hooks[index].state;
            const nextValue = latestSelector ? latestSelector(latestStore) : latestStore;
            if (nextValue !== ctx.hooks[index].state.value) {
                ctx.hooks[index].state.value = nextValue;
                scheduleRender(ctx);
            }
        });
    }

    // Keep selector/store references fresh and return a render-time snapshot
    const hookState = ctx.hooks[index].state;
    hookState.store = store;
    hookState.selector = selector;
    hookState.value = selector ? selector(store) : store;
    return hookState.value;
}

export function useScene(): Phaser.Scene {
    const ctx = requireCurrentContext("useScene");
    return ctx.scene;
}

export function useRef<T>(initialValue: T): { current: T } {
    const ctx = requireCurrentContext("useRef");
    const index = consumeHookIndex();

    if (!ctx.hooks[index]) {
        ctx.hooks[index] = { state: { current: initialValue } };
    }

    return ctx.hooks[index].state;
}

export function useMemo<T>(factory: () => T, deps?: any[]): T {
    const ctx = requireCurrentContext("useMemo");
    const index = consumeHookIndex();

    const oldDeps = ctx.hooks[index]?.deps;
    const hasChanged = !deps || !oldDeps || deps.length !== oldDeps.length || deps.some((d, i) => d !== oldDeps[i]);

    if (!ctx.hooks[index] || hasChanged) {
        const value = factory();
        ctx.hooks[index] = { state: value, deps };
    }

    return ctx.hooks[index].state;
}

export function useCallback<T extends Function>(callback: T, deps?: any[]): T {
    return useMemo(() => callback, deps);
}

export function useEvent<T extends (...args: any[]) => any>(handler: T): T {
    const ctx = requireCurrentContext("useEvent");
    const index = consumeHookIndex();

    if (!ctx.hooks[index]) {
        const state = {
            handler,
            stable: ((...args: any[]) => {
                if (ctx.unmounted) return;
                return state.handler(...args);
            }) as T,
        };

        ctx.hooks[index] = { state };
        return state.stable;
    }

    ctx.hooks[index].state.handler = handler;
    return ctx.hooks[index].state.stable;
}

export function useUpdate(callback: (time: number, delta: number) => void): void {
    const ctx = requireCurrentContext("useUpdate");
    const index = consumeHookIndex();

    if (!ctx.hooks[index]) {
        // Store the callback in state
        const state = { callback };
        ctx.hooks[index] = { state };

        // Register after commit (avoid side effects during render)
        ctx.addLayoutEffect(() => {
            const updateWrapper = (time: number, delta: number) => {
                if (ctx.unmounted) return;
                state.callback(time, delta);
            };

            ctx.scene.events.on("update", updateWrapper);
            ctx.hooks[index].cleanup = () => {
                ctx.scene.events.off("update", updateWrapper);
            };
        });
    } else {
        // Update fresh references
        ctx.hooks[index].state.callback = callback;
    }
}

export function onMount(callback: () => void | (() => void)) {
    const ctx = requireCurrentContext("onMount");
    const index = consumeHookIndex();

    if (!ctx.hooks[index]) {
        ctx.hooks[index] = { state: true };
        ctx.addLayoutEffect(() => {
            const cleanup = callback();
            if (typeof cleanup === "function") {
                ctx.hooks[index].cleanup = cleanup;
            }
        });
    }
}

export function useLayoutEffect(callback: () => void | (() => void), deps?: any[]) {
    const ctx = requireCurrentContext("useLayoutEffect");
    const index = consumeHookIndex();

    const oldDeps = ctx.hooks[index]?.deps;
    const hasChanged = !deps || !oldDeps || deps.length !== oldDeps.length || deps.some((d, i) => d !== oldDeps[i]);

    if (hasChanged) {
        if (!ctx.hooks[index]) {
            ctx.hooks[index] = {};
        }
        ctx.hooks[index].deps = deps;

        ctx.addLayoutEffect(() => {
            if (ctx.hooks[index].cleanup) {
                ctx.hooks[index].cleanup();
            }
            const cleanup = callback();
            if (typeof cleanup === "function") {
                ctx.hooks[index].cleanup = cleanup;
            }
        });
    }
}

export function useEffect(callback: () => void | (() => void), deps?: any[]) {
    const ctx = requireCurrentContext("useEffect");
    const index = consumeHookIndex();

    const oldDeps = ctx.hooks[index]?.deps;
    const hasChanged = !deps || !oldDeps || deps.length !== oldDeps.length || deps.some((d, i) => d !== oldDeps[i]);

    if (hasChanged) {
        if (!ctx.hooks[index]) {
            ctx.hooks[index] = {};
        }
        ctx.hooks[index].deps = deps;

        ctx.addEffect(() => {
            // Run cleanup of previous effect
            if (ctx.hooks[index].cleanup) {
                ctx.hooks[index].cleanup();
            }
            const cleanup = callback();
            if (typeof cleanup === "function") {
                ctx.hooks[index].cleanup = cleanup;
            }
        });
    }
}

