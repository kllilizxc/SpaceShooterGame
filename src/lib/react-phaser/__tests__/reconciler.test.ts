import Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { mountRoot } from "../core";
import { createNode } from "../create-node";
import { createMockScene } from "./test-utils";

describe("react-phaser reconciler", () => {
    it("sets and clears refs across updates/removals", () => {
        const scene = createMockScene();

        const ref1 = { current: null as Phaser.GameObjects.Sprite | null };
        const ref2 = { current: null as Phaser.GameObjects.Sprite | null };

        function App(props: { show: boolean; useSecondRef: boolean }) {
            if (!props.show) return null;
            return createNode("sprite", { ref: props.useSecondRef ? ref2 : ref1, texture: "t" });
        }

        const root = mountRoot(scene as any, App, { show: true, useSecondRef: false });
        const sprite = ref1.current;
        expect(sprite).toBeTruthy();
        expect(ref2.current).toBeNull();

        root.update({ show: true, useSecondRef: true });
        expect(ref1.current).toBeNull();
        expect(ref2.current).toBe(sprite);

        const destroySpy = vi.spyOn(sprite as any, "destroy");
        root.update({ show: false, useSecondRef: true });
        expect(ref2.current).toBeNull();
        expect(destroySpy).toHaveBeenCalledTimes(1);

        root.unmount();
        expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("reorders keyed children under a container to match VNode order", () => {
        const scene = createMockScene();
        const containerRef = { current: null as Phaser.GameObjects.Container | null };

        const a = scene.add.sprite(0, 0);
        const b = scene.add.sprite(0, 0);

        function App(props: { order: ("a" | "b")[] }) {
            const children = props.order.map((id) => createNode(id === "a" ? a : b, { key: id }));
            return createNode("container", { ref: containerRef }, ...children);
        }

        const root = mountRoot(scene as any, App, { order: ["a", "b"] });
        const container = containerRef.current!;

        expect(container.getIndex(a)).toBe(0);
        expect(container.getIndex(b)).toBe(1);

        root.update({ order: ["b", "a"] });

        expect(container.getIndex(b)).toBe(0);
        expect(container.getIndex(a)).toBe(1);
        root.unmount();
    });

    it("uses physics-group pooling and killAndHide on removed children", () => {
        const scene = createMockScene();

        const groupRef = { current: null as Phaser.Physics.Arcade.Group | null };
        const aRef = { current: null as Phaser.Physics.Arcade.Sprite | null };
        const bRef = { current: null as Phaser.Physics.Arcade.Sprite | null };

        function App(props: { showB: boolean }) {
            return createNode(
                "physics-group",
                { ref: groupRef, config: {} },
                createNode("physics-sprite", { key: "a", ref: aRef, texture: "t" }),
                props.showB ? createNode("physics-sprite", { key: "b", ref: bRef, texture: "t" }) : null
            );
        }

        const root = mountRoot(scene as any, App, { showB: true });
        const group = groupRef.current as any;

        expect(group).toBeTruthy();
        expect(group.get).toHaveBeenCalledTimes(2);
        expect(group.killAndHide).not.toHaveBeenCalled();

        const spriteB = bRef.current as any;
        expect(spriteB).toBeTruthy();
        const destroySpy = vi.spyOn(spriteB, "destroy");

        root.update({ showB: false });

        expect(bRef.current).toBeNull();
        expect(group.killAndHide).toHaveBeenCalledWith(spriteB);
        expect(destroySpy).not.toHaveBeenCalled();
        expect(spriteB.body.stop).toHaveBeenCalled();
        expect(spriteB.body.setEnable).toHaveBeenCalledWith(false);
        root.unmount();
    });
});
