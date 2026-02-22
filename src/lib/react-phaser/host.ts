import type Phaser from "phaser";
import type { PhaserHost } from "./types";

export interface HostSlot<T extends PhaserHost = PhaserHost> {
    __v_slot: true;
    kind: "create" | "pooled";
    expectedType: string;
    current: T | null;
    group?: Phaser.Physics.Arcade.Group;
}

export interface FragmentInstance {
    __v_fragment: true;
    __v_children: any[];
    __v_props?: any;
}

export type ContainerHandle = Phaser.GameObjects.Container | HostSlot<Phaser.GameObjects.Container>;
export type ParentHandle = ContainerHandle | undefined;

export function isHostSlot(value: any): value is HostSlot {
    return !!value && typeof value === "object" && value.__v_slot === true;
}

export function createHostSlot<T extends PhaserHost>(kind: HostSlot<T>["kind"], expectedType: string, group?: Phaser.Physics.Arcade.Group): HostSlot<T> {
    return { __v_slot: true, kind, expectedType, current: null, group };
}

export function isFragmentInstance(value: any): value is FragmentInstance {
    return !!value && typeof value === "object" && value.__v_fragment === true;
}

export function createFragmentInstance(): FragmentInstance {
    return { __v_fragment: true, __v_children: [] };
}

export function resolveHost<T extends PhaserHost>(value: T | HostSlot<T> | FragmentInstance | null | undefined): T | null {
    if (!value) return null;
    if (isHostSlot(value)) return value.current as T | null;
    if (isFragmentInstance(value)) return null;
    return value as T;
}

export function resolveParentContainer(parent: ParentHandle): Phaser.GameObjects.Container | undefined {
    const resolved = resolveHost(parent as any);
    return resolved ? (resolved as Phaser.GameObjects.Container) : undefined;
}

export function cleanupPooledSpriteDetached(sprite: Phaser.Physics.Arcade.Sprite) {
    sprite.setActive(false).setVisible(false);
    if (sprite.body) {
        sprite.body.stop();
        (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
    }
}

