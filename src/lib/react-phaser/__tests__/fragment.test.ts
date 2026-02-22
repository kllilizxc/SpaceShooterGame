import { describe, expect, it, vi } from "vitest";
import { createMockScene } from "./test-utils";
import { mountRoot } from "../core";
import { createNode } from "../create-node";

describe("fragment reconciler", () => {
    it("destroys removed children and does not double-destroy", () => {
        const scene = createMockScene();
        const a = { destroy: vi.fn() };
        const b = { destroy: vi.fn() };

        function App(props: { showB: boolean }) {
            return createNode("fragment", {},
                createNode(a as any, { key: 1 }),
                props.showB ? createNode(b as any, { key: 2 }) : null
            );
        }

        const root = mountRoot(scene as any, App, { showB: true });
        expect(a.destroy).not.toHaveBeenCalled();
        expect(b.destroy).not.toHaveBeenCalled();

        root.update({ showB: false });
        expect(a.destroy).not.toHaveBeenCalled();
        expect(b.destroy).toHaveBeenCalledTimes(1);

        root.unmount();
        expect(a.destroy).toHaveBeenCalledTimes(1);
        expect(b.destroy).toHaveBeenCalledTimes(1);
    });
});

