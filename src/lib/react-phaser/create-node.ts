import type Phaser from "phaser";
import type {
    ComponentType,
    ContainerProps,
    FragmentProps,
    GraphicsProps,
    ImageProps,
    PhysicsGroupProps,
    PhysicsSpriteProps,
    SpriteProps,
    TextProps,
    VChild,
    VNode,
    VNodeType,
} from "./types";

export function createNode(type: "container", props?: ContainerProps, ...children: VChild[]): VNode<"container", ContainerProps>;
export function createNode(type: "text", props?: TextProps, ...children: VChild[]): VNode<"text", TextProps>;
export function createNode(type: "rect" | "graphics", props?: GraphicsProps, ...children: VChild[]): VNode<"rect" | "graphics", GraphicsProps>;
export function createNode(type: "sprite", props?: SpriteProps, ...children: VChild[]): VNode<"sprite", SpriteProps>;
export function createNode(type: "image", props?: ImageProps, ...children: VChild[]): VNode<"image", ImageProps>;
export function createNode(type: "physics-sprite", props?: PhysicsSpriteProps, ...children: VChild[]): VNode<"physics-sprite", PhysicsSpriteProps>;
export function createNode(type: "physics-group", props?: PhysicsGroupProps, ...children: VChild[]): VNode<"physics-group", PhysicsGroupProps>;
export function createNode(type: "fragment", props?: FragmentProps, ...children: VChild[]): VNode<"fragment", FragmentProps>;
export function createNode(type: Phaser.GameObjects.GameObject | Phaser.GameObjects.Group, props?: Record<string, any>, ...children: VChild[]): VNode<Phaser.GameObjects.GameObject | Phaser.GameObjects.Group, Record<string, any>>;
export function createNode<P>(type: ComponentType<P>, props: P, ...children: VChild[]): VNode<ComponentType<P>, P & Record<string, any>>;
export function createNode(type: VNodeType, props?: Record<string, any>, ...children: VChild[]): VNode {
    return {
        type,
        key: props?.key,
        props: props || {},
        children: children.filter(Boolean) as VNode[],
    };
}
