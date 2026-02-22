import { GameState } from "./manager";

declare global {
    interface Window {
        GameState: any;
    }
}

if (typeof window !== "undefined") {
    window.GameState = GameState;
}

