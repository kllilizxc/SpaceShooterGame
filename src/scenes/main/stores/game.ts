import { defineGameStore } from "../../../lib/game-state";

export type GamePhase = "playing" | "paused" | "gameover" | "leveling" | "menu";

export const useGameStore = defineGameStore("game", {
    state: () => ({
        time: 0,
        phase: "playing" as GamePhase,
        wave: 1,
    }),

    getters: {
        isPlaying: (state) => state.phase === "playing",
        isGameOver: (state) => state.phase === "gameover",
        isLeveling: (state) => state.phase === "leveling",
    },

    actions: {
        updateTime(delta: number) {
            if (this.phase === "playing") {
                this.time += delta;
            }
        },
        setPhase(phase: GamePhase) {
            this.phase = phase;
        },
        setWave(wave: number) {
            this.wave = wave;
        },
        reset() {
            this.$reset();
        }
    },
});
