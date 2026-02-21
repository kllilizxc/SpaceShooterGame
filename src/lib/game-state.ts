/**
 * GameState - A Pinia-inspired state management utility for agent-generated games.
 * Provides reactivity, auto-logging, and snapshotting for easy debugging.
 *
 * Subscribe semantics (Pinia-style):
 *   - $subscribe(callback) fires ONCE per action, after the action completes.
 *   - The callback receives a Mutation object describing the action and ALL changes it made.
 *   - Direct property assignments outside of actions do NOT fire subscribers (use actions).
 */

type State = Record<string, any>;
type Getters = Record<string, (state: any) => any>;
type Actions = Record<string, Function>;

interface StoreDescriptor<S extends State, G extends Getters, A extends Actions> {
    state: () => S;
    getters?: G & ThisType<S & G>;
    actions?: A & ThisType<S & G & A & { $reset: () => void; $subscribe: (cb: (mutation: Mutation) => void) => () => void }>;
}

export interface Mutation {
    t: number;
    store: string;
    action: string;
    changes: { key: string; old: any; new: any }[];
}

class GameStateManager {
    private stores: Record<string, any> = {};
    private log: Mutation[] = [];
    private maxLogSize = 1000;

    register(name: string, store: any) {
        this.stores[name] = store;
    }

    addLog(mutation: Mutation) {
        this.log.push(mutation);
        if (this.log.length > this.maxLogSize) {
            this.log.shift();
        }
    }

    getLog() {
        return [...this.log];
    }

    snapshot() {
        const snap: Record<string, any> = {};
        for (const [name, store] of Object.entries(this.stores)) {
            snap[name] = store.$state;
        }
        return snap;
    }

    dump() {
        return JSON.stringify({
            snapshot: this.snapshot(),
            log: this.getLog(),
        }, null, 2);
    }
}

export const GameState = new GameStateManager();

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

    // Track changes during an action — NOT triggered on every set
    let pendingChanges: { key: string; old: any; new: any }[] = [];
    let isRunningAction = false;

    const stateProxy = new Proxy(state, {
        set(target, key: string, value) {
            const oldValue = target[key];
            if (oldValue === value) return true;

            if (isRunningAction) {
                // Collect changes to batch-notify after the action completes
                pendingChanges.push({ key, old: oldValue, new: value });
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
            Object.keys(state).forEach(key => delete (state as any)[key]);
            Object.assign(state, descriptor.state());
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
        for (const [key, action] of Object.entries(descriptor.actions)) {
            store[key] = function (...args: any[]) {
                isRunningAction = true;
                pendingChanges = [];

                try {
                    const result = action.apply(store, args);

                    if (pendingChanges.length > 0) {
                        const mutation: Mutation = {
                            t: Date.now(),
                            store: name,
                            action: key,
                            changes: pendingChanges,
                        };

                        // Log to GameState
                        GameState.addLog(mutation);

                        // Notify action-level subscribers (batched, once per action)
                        actionSubscribers.forEach(cb => cb(mutation));
                    }

                    return result;
                } finally {
                    isRunningAction = false;
                    pendingChanges = [];
                }
            };
        }
    }

    GameState.register(name, store);
    return () => store as any; // Cast returned store since the proxy makes strong typing tricky
}

declare global {
    interface Window {
        GameState: any;
    }
}

window.GameState = GameState;