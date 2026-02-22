import type Phaser from "phaser";

export type Key = string | number;

export type RefObject<T> = { current: T };

export type HostVNodeType =
    | "text"
    | "graphics"
    | "image"
    | "sprite"
    | "physics-sprite"
    | "physics-group"
    | "container"
    | "fragment"
    | "rect"
    | "direct";

export type ComponentType<P = any> = (props: P) => VNode | null;

export type VNodeType = HostVNodeType | ComponentType<any> | Phaser.GameObjects.GameObject | Phaser.GameObjects.Group;

export interface BaseProps {
    key?: Key;
    ref?: RefObject<any>;
    x?: number;
    y?: number;
    z?: number;
    depth?: number;
    w?: number;
    h?: number;
    width?: number;
    height?: number;
    alpha?: number;
    visible?: boolean;
    scale?: number;
    originX?: number;
    originY?: number;
    rotation?: number;
    interactive?: boolean;
    useHandCursor?: boolean;
    onClick?: (...args: any[]) => void;
    onPointerOver?: (...args: any[]) => void;
    onPointerOut?: (...args: any[]) => void;
    [key: string]: any;
}

export interface ContainerProps extends BaseProps {
    ref?: RefObject<Phaser.GameObjects.Container | null>;
}

export interface TextProps extends BaseProps {
    ref?: RefObject<Phaser.GameObjects.Text | null>;
    text?: string;
    fontSize?: string | number;
    color?: string;
    fontStyle?: string;
    align?: string;
    wordWrapWidth?: number;
    wordWrapAdvanced?: boolean;
}

export interface GraphicsProps extends BaseProps {
    ref?: RefObject<Phaser.GameObjects.Graphics | null>;
    fill?: number;
    strokeWidth?: number;
    lineColor?: number;
}

export interface SpriteProps extends BaseProps {
    ref?: RefObject<Phaser.GameObjects.Sprite | null>;
    texture?: string;
    frame?: string | number;
    tint?: number;
    flipX?: boolean;
    flipY?: boolean;
    play?: string;
}

export interface ImageProps extends BaseProps {
    ref?: RefObject<Phaser.GameObjects.Image | null>;
    texture?: string;
    frame?: string | number;
    tint?: number;
    flipX?: boolean;
    flipY?: boolean;
}

export interface PhysicsSpriteProps extends SpriteProps {
    ref?: RefObject<Phaser.Physics.Arcade.Sprite | null>;
    velocityX?: number;
    velocityY?: number;
    collideWorldBounds?: boolean;
    bounce?: number;
    drag?: number;
    gravityY?: number;
    immovable?: boolean;
    bodyWidth?: number;
    bodyHeight?: number;
    bodyWidthRatio?: number;
    bodyHeightRatio?: number;
    bodyOffsetX?: number;
    bodyOffsetY?: number;
}

export interface PhysicsGroupProps extends BaseProps {
    ref?: RefObject<Phaser.Physics.Arcade.Group | null>;
    config?: Phaser.Types.Physics.Arcade.PhysicsGroupConfig;
}

export interface FragmentProps {
    key?: Key;
}

export interface VNode<TType extends VNodeType = VNodeType, TProps extends Record<string, any> = Record<string, any>> {
    type: TType;
    key?: Key;
    props: TProps;
    children: VNode[];
}

export type VChild = VNode | null | undefined | false;

export type PhaserHost = Phaser.GameObjects.GameObject | Phaser.GameObjects.Group;

