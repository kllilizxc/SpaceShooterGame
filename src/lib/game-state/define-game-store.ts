import { GameState } from "./manager";
import type { Actions, Getters, State, StoreDescriptor, Mutation } from "./types";

export function defineGameStore<
    S extends State,
    G extends Record<string, (state: S) => any>,
    A extends Actions
>(
    name: string,
    descriptor: StoreDescriptor<S, G, A>
) {
    const initialState = descriptor.state();
    const state: S = { ...initialState };

    type PendingChange = { key: string; old: any; new: any };

    const isPromiseLike = (value: any): value is Promise<unknown> =>
        !!value && (typeof value === "object" || typeof value === "function") && typeof (value as any).then === "function";

    // Track changes during the *current* action batch (supports async actions).
    // Semantics: nested action calls are batched into the outermost action.
    let actionDepth = 0;
    let currentActionName: string | null = null;
    let pendingChanges: PendingChange[] = [];
    let pendingIndexByKey = new Map<string, number>();

    const stateProxy = new Proxy(state, {
        set(target, key: string | symbol, value) {
            if (typeof key !== "string") {
                (target as any)[key] = value;
                return true;
            }

            const oldValue = (target as any)[key];
            if (oldValue === value) return true;

            if (actionDepth > 0) {
                // Collect and coalesce changes (1 entry per key, per action batch).
                const existingIndex = pendingIndexByKey.get(key);
                if (existingIndex === undefined) {
                    pendingIndexByKey.set(key, pendingChanges.length);
                    pendingChanges.push({ key, old: oldValue, new: value });
                } else {
                    pendingChanges[existingIndex] = { ...pendingChanges[existingIndex], new: value };
                }
            }

            (target as any)[key] = value;
            return true;
        }
    });

    // Action-level subscribers: fire once per action with a full Mutation
    const actionSubscribers: ((mutation: Mutation) => void)[] = [];

    const store: any = {
        $state: stateProxy,

        $reset: () => {
            const next = descriptor.state();
            for (const key of Object.keys(state)) {
                if (!Object.prototype.hasOwnProperty.call(next, key)) {
                    delete (state as any)[key];
                }
            }
            for (const [key, value] of Object.entries(next)) {
                (stateProxy as any)[key] = value;
            }
        },

        /**
         * Fires once per action, after it completes, with the full Mutation.
         * Returns an unsubscribe function.
         */
        $subscribe: (cb: (mutation: Mutation) => void): (() => void) => {
            actionSubscribers.push(cb);
            return () => {
                const idx = actionSubscribers.indexOf(cb);
                if (idx !== -1) actionSubscribers.splice(idx, 1);
            };
        },
    };

    // Add getters
    if (descriptor.getters) {
        for (const [key, getter] of Object.entries(descriptor.getters)) {
            Object.defineProperty(store, key, {
                get: () => getter(stateProxy),
                enumerable: true
            });
        }
    }

    // Add state properties directly to store for easy access
    for (const key of Object.keys(initialState)) {
        Object.defineProperty(store, key, {
            get: () => stateProxy[key],
            set: (val) => ((stateProxy as any)[key] = val),
            enumerable: true
        });
    }

    // Add actions with batched subscriber notification and auto-logging
    if (descriptor.actions) {
        const flushMutationIfReady = () => {
            if (actionDepth !== 0) return;

            const action = currentActionName;
            const changes = pendingChanges;

            currentActionName = null;
            pendingChanges = [];
            pendingIndexByKey = new Map();

            if (!action || changes.length === 0) return;

            const mutation: Mutation = {
                t: Date.now(),
                store: name,
                action,
                changes,
            };

            GameState.addLog(mutation);
            actionSubscribers.forEach(cb => cb(mutation));
        };

        for (const [key, action] of Object.entries(descriptor.actions)) {
            store[key] = function (...args: any[]) {
                const isOutermost = actionDepth === 0;
                actionDepth++;
                if (isOutermost) {
                    currentActionName = key;
                    pendingChanges = [];
                    pendingIndexByKey = new Map();
                }

                try {
                    const result = action.apply(store, args);
                    if (!isPromiseLike(result)) {
                        actionDepth--;
                        flushMutationIfReady();
                        return result;
                    }

                    return Promise.resolve(result).finally(() => {
                        actionDepth--;
                        flushMutationIfReady();
                    });
                } catch (err) {
                    actionDepth--;
                    flushMutationIfReady();
                    throw err;
                }
            };
        }
    }

    GameState.register(name, store);
    return () => store as any; // Cast returned store since the proxy makes strong typing tricky
}
