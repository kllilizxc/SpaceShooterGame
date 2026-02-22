import { describe, expect, it } from "vitest";
import { defineGameStore } from "../define-game-store";
import type { Mutation } from "../types";

describe("game-state defineGameStore", () => {
    it("supports async actions and notifies once after completion", async () => {
        const useStore = defineGameStore("test_async_actions", {
            state: () => ({ n: 0 }),
            actions: {
                async incLater() {
                    this.n++;
                    await Promise.resolve();
                    this.n++;
                },
            },
        });

        const store = useStore() as any;
        const mutations: Mutation[] = [];
        store.$subscribe((m: Mutation) => mutations.push(m));

        await store.incLater();

        expect(store.n).toBe(2);
        expect(mutations).toHaveLength(1);
        expect(mutations[0].action).toBe("incLater");
        expect(mutations[0].changes).toEqual([{ key: "n", old: 0, new: 2 }]);
    });

    it("batches nested action calls into the outermost action", () => {
        const useStore = defineGameStore("test_nested_actions", {
            state: () => ({ n: 0 }),
            actions: {
                inc() {
                    this.n += 1;
                },
                outer() {
                    this.n += 1;
                    this.inc();
                },
            },
        });

        const store = useStore() as any;
        const mutations: Mutation[] = [];
        store.$subscribe((m: Mutation) => mutations.push(m));

        store.outer();

        expect(store.n).toBe(2);
        expect(mutations).toHaveLength(1);
        expect(mutations[0].action).toBe("outer");
        expect(mutations[0].changes).toEqual([{ key: "n", old: 0, new: 2 }]);
    });
});
