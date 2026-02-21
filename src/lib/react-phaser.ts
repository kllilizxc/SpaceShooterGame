import Phaser from "phaser";
import { GameState } from "./game-state"; // Needed to interface with stores for useStore

// --- 1. VNode Types & createNode ---

export type VNodeType = 'text' | 'graphics' | 'image' | 'sprite' | 'physics-sprite' | 'physics-group' | 'container' | 'rect' | 'direct' | Function | Phaser.GameObjects.GameObject | Phaser.GameObjects.Group;

export interface VNode {
    type: VNodeType;
    key?: string | number;
    props: Record<string, any>;
    children: VNode[];
}

export function createNode(type: VNodeType, props?: Record<string, any>, ...children: (VNode | null | undefined | false)[]): VNode {
    return {
        type,
        key: props?.key,
        props: props || {},
        children: children.filter(Boolean) as VNode[],
    };
}

// --- 2. Hook Context System ---

let currentContext: ComponentInstance | null = null;
let currentHookIndex = 0;

interface HookState {
    state?: any;
    deps?: any[];
    cleanup?: () => void;
}

// --- 3. Component Instance (reconciler state) ---

class ComponentInstance {
    public hooks: HookState[] = [];
    public renderedVNode: VNode | null = null;
    public unmounted = false;
    public updateCallback?: (time: number, delta: number) => void;

    private unsubs: (() => void)[] = [];
    private pendingEffects: (() => void)[] = [];

    constructor(
        public scene: Phaser.Scene,
        public componentDef: Function,
        public props: any,
        public parentContainer?: Phaser.GameObjects.Container,
        public phaserObject: Phaser.GameObjects.GameObject | ComponentInstance | null = null
    ) { }

    render() {
        if (this.unmounted) return;

        const prevContext = currentContext;
        const prevIndex = currentHookIndex;

        currentContext = this;
        currentHookIndex = 0;

        const newVNode = this.componentDef(this.props) as VNode | null;

        currentContext = prevContext;
        currentHookIndex = prevIndex;

        // Reconcile
        this.phaserObject = reconcile(this.scene, this.parentContainer, this.renderedVNode, newVNode, this.phaserObject);
        this.renderedVNode = newVNode;

        // Propagate props/key to native object for list syncing visibility
        if (this.phaserObject && !(this.phaserObject instanceof ComponentInstance)) {
            (this.phaserObject as any).__v_props = this.props;
        }

        // Run pending effects (onMount/useEffect)
        const effects = this.pendingEffects;
        this.pendingEffects = [];
        effects.forEach(effect => effect());
    }

    addEffect(callback: () => void) {
        this.pendingEffects.push(callback);
    }

    unmount() {
        this.unmounted = true;
        this.unsubs.forEach(unsub => unsub());
        this.unsubs = [];

        // Run hook cleanups
        this.hooks.forEach(h => {
            if (h.cleanup) h.cleanup();
        });

        // Destroy owned phaser objects (and their children)
        if (this.phaserObject instanceof ComponentInstance) {
            this.phaserObject.unmount();
        } else if (this.phaserObject && (this.phaserObject as any).destroy) {
            if (!(this.phaserObject as any).__v_pooled) {
                (this.phaserObject as any).destroy();
            }
        }
        this.phaserObject = null;
    }

    addSubscription(unsub: () => void) {
        this.unsubs.push(unsub);
    }
}

// --- 4. Hooks ---

export function useState<T>(initialValue: T | (() => T)): [T, (val: T | ((prev: T) => T)) => void] {
    if (!currentContext) throw new Error("useState must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    if (!ctx.hooks[index]) {
        const value = typeof initialValue === 'function' ? (initialValue as Function)() : initialValue;
        ctx.hooks[index] = { state: value };
    }

    const state = ctx.hooks[index].state;

    const setState = (newVal: T | ((prev: T) => T)) => {
        if (ctx.unmounted) return;
        const nextState = typeof newVal === 'function' ? (newVal as Function)(ctx.hooks[index].state) : newVal;
        if (nextState !== ctx.hooks[index].state) {
            ctx.hooks[index].state = nextState;
            // Schedule re-render (synchronously for now to keep it simple, or requestAnimationFrame)
            ctx.render();
        }
    };

    return [state, setState];
}

export function useStore<T, U = T>(storeHook: () => T, selector?: (store: T) => U): U {
    if (!currentContext) throw new Error("useStore must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    const store = storeHook() as any;

    if (!ctx.hooks[index]) {
        const initialValue = selector ? selector(store) : store;
        ctx.hooks[index] = { state: initialValue };

        if (store.$subscribe) {
            const unsub = store.$subscribe(() => {
                if (selector) {
                    const nextValue = selector(store);
                    if (nextValue !== ctx.hooks[index].state) {
                        ctx.hooks[index].state = nextValue;
                        ctx.render();
                    }
                } else {
                    // Whole store subscription: must re-render on any mutation
                    // since the store object itself is stable.
                    ctx.render();
                }
            });
            ctx.addSubscription(unsub);
        }
    }

    return ctx.hooks[index].state;
}

export function useAdoptedObject(): Phaser.GameObjects.GameObject | null {
    if (!currentContext) throw new Error("useAdoptedObject must be called inside a component");
    return (currentContext.phaserObject instanceof Phaser.GameObjects.GameObject) ? currentContext.phaserObject : null;
}

export function useScene(): Phaser.Scene {
    if (!currentContext) throw new Error("useScene must be called inside a component");
    return currentContext.scene;
}

export function useRef<T>(initialValue: T): { current: T } {
    if (!currentContext) throw new Error("useRef must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    if (!ctx.hooks[index]) {
        ctx.hooks[index] = { state: { current: initialValue } };
    }

    return ctx.hooks[index].state;
}

export function useUpdate(callback: (time: number, delta: number) => void): void;
export function useUpdate<T>(ref: { current: T | null }, callback: (obj: T, time: number, delta: number) => void): void;
export function useUpdate(arg1: any, arg2?: any) {
    if (!currentContext) throw new Error("useUpdate must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    const ref = typeof arg1 === 'function' ? null : arg1;
    const callback = typeof arg1 === 'function' ? arg1 : arg2;

    if (!ctx.hooks[index]) {
        // Store the callback (and ref) in state
        const state = { callback, ref };
        ctx.hooks[index] = { state };

        const updateWrapper = (time: number, delta: number) => {
            if (ctx.unmounted) return;

            const currentCallback = state.callback;
            const currentRef = state.ref;

            if (currentRef) {
                if (currentRef.current) {
                    currentCallback(currentRef.current, time, delta);
                }
            } else {
                currentCallback(time, delta);
            }
        };
        ctx.scene.events.on('update', updateWrapper);

        ctx.hooks[index].cleanup = () => {
            ctx.scene.events.off('update', updateWrapper);
        };
    } else {
        // Update fresh references
        ctx.hooks[index].state.callback = callback;
        ctx.hooks[index].state.ref = ref;
    }
}

export function onMount(callback: () => void | (() => void)) {
    if (!currentContext) throw new Error("onMount must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    if (!ctx.hooks[index]) {
        ctx.hooks[index] = { state: true };
        ctx.addEffect(() => {
            const cleanup = callback();
            if (typeof cleanup === 'function') {
                ctx.hooks[index].cleanup = cleanup;
            }
        });
    }
}

export function useEffect(callback: () => void | (() => void), deps?: any[]) {
    if (!currentContext) throw new Error("useEffect must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    const oldDeps = ctx.hooks[index]?.deps;
    const hasChanged = !oldDeps || !deps || deps.some((d, i) => d !== oldDeps[i]);

    if (hasChanged) {
        if (!ctx.hooks[index]) {
            ctx.hooks[index] = {};
        }
        ctx.hooks[index].deps = deps;

        ctx.addEffect(() => {
            // Run cleanup of previous effect
            if (ctx.hooks[index].cleanup) {
                ctx.hooks[index].cleanup();
            }
            const cleanup = callback();
            if (typeof cleanup === 'function') {
                ctx.hooks[index].cleanup = cleanup;
            }
        });
    }
}

// --- 5. Reconciler ---

type PhaserNode = Phaser.GameObjects.GameObject;

function reconcile(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container | undefined,
    oldNode: VNode | null,
    newNode: VNode | null,
    existingObj: PhaserNode | ComponentInstance | null
): PhaserNode | ComponentInstance | null {

    // 1. Remove old
    if (!newNode) {
        if (existingObj instanceof ComponentInstance) {
            existingObj.unmount();
            // If the component rendered a Phaser object, remove it from its parent
            if (parent && existingObj.phaserObject) {
                const node = existingObj.phaserObject instanceof ComponentInstance ? null : existingObj.phaserObject;
                if (node) parent.remove(node, true);
            }
        } else if (existingObj) {
            existingObj.destroy();
        }
        return null;
    }

    // 2. Functional Component
    if (typeof newNode.type === 'function') {
        let instance = existingObj as ComponentInstance;

        if (!oldNode || oldNode.type !== newNode.type || !(existingObj instanceof ComponentInstance)) {
            // Teardown old (if it was a different type of component)
            let adoptedObj = (existingObj instanceof ComponentInstance) ? null : existingObj;
            if (existingObj instanceof ComponentInstance) {
                existingObj.unmount();
            } else if (existingObj && !adoptedObj) {
                // If it's a native object and NOT being adopted (e.g. type changed entirely), destroy it
                if (!(existingObj as any).__v_pooled) {
                    existingObj.destroy();
                }
            }

            // Mount new
            instance = new ComponentInstance(scene, newNode.type as Function, newNode.props, parent, adoptedObj);
            instance.render();
            return instance;
        } else {
            // Update existing
            instance.props = newNode.props;
            instance.render();
            return instance;
        }
    }

    // 3. Native Phaser Object
    let phaserObj = existingObj as PhaserNode;

    // Determine if we need a totally new object
    let isNew = !oldNode || oldNode?.type !== newNode.type || existingObj instanceof ComponentInstance;

    // Special Case: "Shelling" or Pooling. 
    // If we have an existing native object and the new type matches it (e.g. Sprite matches 'sprite')
    // and we don't have an old node, we can treat it as an update rather than a new mount.
    if (!oldNode && existingObj && !(existingObj instanceof ComponentInstance)) {
        let typeMatches = false;
        if (newNode.type === 'sprite' && existingObj instanceof Phaser.GameObjects.Sprite) typeMatches = true;
        else if (newNode.type === 'physics-sprite' && existingObj instanceof Phaser.Physics.Arcade.Sprite) typeMatches = true;
        else if (newNode.type === 'image' && existingObj instanceof Phaser.GameObjects.Image) typeMatches = true;
        else if (newNode.type === 'text' && existingObj instanceof Phaser.GameObjects.Text) typeMatches = true;
        else if (newNode.type === 'container' && existingObj instanceof Phaser.GameObjects.Container) typeMatches = true;
        else if (newNode.type === 'physics-group' && existingObj instanceof Phaser.GameObjects.Group) typeMatches = true;
        else if (newNode.type === 'rect' && existingObj instanceof Phaser.GameObjects.Graphics) typeMatches = true;
        else if (newNode.type === existingObj) typeMatches = true; // Direct matching for 'direct' nodes

        if (typeMatches) isNew = false;
    }

    if (isNew) {
        // Teardown old
        if (existingObj instanceof ComponentInstance) {
            existingObj.unmount();
        } else if (existingObj) {
            // NEVER destroy an object that belongs to a pool!
            if (!(existingObj as any).__v_pooled) {
                existingObj.destroy();
            }
        }

        if (typeof newNode.type === 'object' && newNode.type !== null) {
            // Direct Object Node
            phaserObj = newNode.type as any;
            // For Direct Objects, we MUST apply initial props here because createPhaserObject isn't called
            updatePhaserObject(phaserObj, 'direct', newNode.props, {}, true);
        } else {
            phaserObj = createPhaserObject(scene, newNode.type as string, newNode.props);
        }

        if (phaserObj && !(phaserObj instanceof Phaser.GameObjects.Group)) {
            if (parent) {
                parent.add(phaserObj as Phaser.GameObjects.GameObject);
            } else {
                scene.add.existing(phaserObj as Phaser.GameObjects.GameObject);
            }
        }
    } else {
        // Patch props
        updatePhaserObject(phaserObj, newNode.type as string, newNode.props, oldNode?.props || {}, !oldNode);
    }

    // Capture ref
    if (newNode.props.ref && phaserObj) {
        newNode.props.ref.current = phaserObj;
    }

    // 4. Reconcile Children
    if (phaserObj instanceof Phaser.GameObjects.Container || phaserObj instanceof Phaser.Physics.Arcade.Group) {
        const isGroup = phaserObj instanceof Phaser.Physics.Arcade.Group;
        const parentContainer = phaserObj as Phaser.GameObjects.Container | Phaser.Physics.Arcade.Group;

        // We store the reconciled children on the phaser object so we can diff them next time.
        const oldChildrenData: (PhaserNode | ComponentInstance)[] = (parentContainer as any).__v_children || [];
        const newChildrenData: (PhaserNode | ComponentInstance | null)[] = [];

        // Map old children by key for faster/stable lookups
        const oldChildrenMap = new Map<string | number, PhaserNode | ComponentInstance>();
        const oldChildrenUnkeyed: (PhaserNode | ComponentInstance)[] = [];

        for (let i = 0; i < oldChildrenData.length; i++) {
            const childObj = oldChildrenData[i];
            const oldProps = (childObj as any)?.__v_props || oldNode?.children?.[i]?.props;
            const key = oldProps?.key ?? oldNode?.children?.[i]?.key;

            if (key !== undefined) {
                oldChildrenMap.set(key, childObj);
            } else {
                oldChildrenUnkeyed.push(childObj);
            }
        }

        // Reconcile new children
        for (let i = 0; i < newNode.children.length; i++) {
            const newChildVNode = newNode.children[i];
            const key = newChildVNode.props?.key ?? newChildVNode.key;

            let existingChildObj: PhaserNode | ComponentInstance | null = null;
            let oldChildVNode: VNode | null = null;

            if (key !== undefined && oldChildrenMap.has(key)) {
                existingChildObj = oldChildrenMap.get(key)!;
                oldChildrenMap.delete(key);
                // Try to find the matching old VNode (best effort without storing it)
                oldChildVNode = oldNode?.children?.find(c => c.key === key || c.props?.key === key) || null;
            } else if (oldChildrenUnkeyed.length > 0) {
                existingChildObj = oldChildrenUnkeyed.shift()!;
                oldChildVNode = oldNode?.children?.[i] || null;
            }

            // Pool creation logic: If the parent is a group and we don't have an object for this index/key
            if (isGroup && !existingChildObj) {
                const group = parentContainer as Phaser.Physics.Arcade.Group;
                const pooledSprite = group.get() as Phaser.Physics.Arcade.Sprite;
                if (pooledSprite) {
                    pooledSprite.setActive(true).setVisible(true);
                    if (pooledSprite.body) {
                        (pooledSprite.body as Phaser.Physics.Arcade.Body).setEnable(true);
                    }
                    (pooledSprite as any).__v_pooled = true; // Mark it!
                    existingChildObj = pooledSprite;
                    // We leave oldChildVNode as null so reconcile knows it's "mounting" props for the first time
                }
            }

            // Important: We pass the parentContainer down so the child knows it's in a group
            // but we pass undefined if it's a group to prevent recursive .add() calls
            const newChildObj = reconcile(scene, isGroup ? undefined : (parentContainer as Phaser.GameObjects.Container), oldChildVNode, newChildVNode, existingChildObj);

            if (newChildObj) {
                (newChildObj as any).__v_props = newChildVNode.props; // Tag for future key lookups
                newChildrenData.push(newChildObj);
            }
        }

        // Cleanup unmounted children
        oldChildrenMap.forEach((childObj) => {
            if (isGroup) {
                const group = parentContainer as Phaser.Physics.Arcade.Group;
                const cleanupSprite = (sprite: Phaser.Physics.Arcade.Sprite) => {
                    group.killAndHide(sprite);
                    if (sprite.body) {
                        sprite.body.stop();
                        (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
                    }
                };

                if (childObj instanceof ComponentInstance) {
                    const phaserNode = (childObj.phaserObject instanceof ComponentInstance) ? null : childObj.phaserObject;
                    const isPooled = !!(phaserNode as any)?.__v_pooled;
                    childObj.unmount();
                    if (isPooled && phaserNode instanceof Phaser.Physics.Arcade.Sprite) {
                        cleanupSprite(phaserNode);
                    }
                } else {
                    const sprite = childObj as Phaser.Physics.Arcade.Sprite;
                    const isPooled = !!(sprite as any)?.__v_pooled;
                    if (isPooled) {
                        cleanupSprite(sprite);
                    } else {
                        sprite.destroy();
                    }
                }
            } else {
                if (childObj instanceof ComponentInstance) childObj.unmount();
                else if (childObj) (childObj as Phaser.GameObjects.GameObject).destroy();
            }
        });
        oldChildrenUnkeyed.forEach((childObj) => {
            if (isGroup) {
                const group = parentContainer as Phaser.Physics.Arcade.Group;
                const cleanupSprite = (sprite: Phaser.Physics.Arcade.Sprite) => {
                    group.killAndHide(sprite);
                    if (sprite.body) {
                        sprite.body.stop();
                        (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
                    }
                };

                if (childObj instanceof ComponentInstance) {
                    const phaserNode = (childObj.phaserObject instanceof ComponentInstance) ? null : childObj.phaserObject;
                    const isPooled = !!(phaserNode as any)?.__v_pooled;
                    childObj.unmount();
                    if (isPooled && phaserNode instanceof Phaser.Physics.Arcade.Sprite) {
                        cleanupSprite(phaserNode);
                    }
                } else {
                    const sprite = childObj as Phaser.Physics.Arcade.Sprite;
                    const isPooled = !!(sprite as any)?.__v_pooled;
                    if (isPooled) {
                        cleanupSprite(sprite);
                    } else {
                        sprite.destroy();
                    }
                }
            } else {
                if (childObj instanceof ComponentInstance) childObj.unmount();
                else if (childObj) (childObj as Phaser.GameObjects.GameObject).destroy();
            }
        });

        // Save the new children state
        (parentContainer as any).__v_children = newChildrenData.filter(Boolean);
    }

    return phaserObj;
}


// Handlers for specific Phaser object types
function createPhaserObject(scene: Phaser.Scene, type: string, props: any): Phaser.GameObjects.GameObject {
    let obj: any;
    switch (type) {
        case 'container':
            obj = scene.add.container(props.x || 0, props.y || 0);
            break;
        case 'text':
            obj = scene.add.text(props.x || 0, props.y || 0, props.text || '', {
                fontSize: props.fontSize ? (typeof props.fontSize === 'number' ? `${props.fontSize}px` : props.fontSize) : '16px',
                color: props.color || '#ffffff',
                fontStyle: props.fontStyle || 'normal'
            });
            break;
        case 'rect':
            obj = scene.add.graphics();
            break;
        case 'sprite':
            obj = scene.add.sprite(props.x || 0, props.y || 0, props.texture, props.frame);
            break;
        case 'image':
            obj = scene.add.image(props.x || 0, props.y || 0, props.texture, props.frame);
            break;
        case 'physics-sprite':
            obj = scene.physics.add.sprite(props.x || 0, props.y || 0, props.texture, props.frame);
            break;
        case 'physics-group':
            obj = scene.physics.add.group(props.config || {});
            break;
        default:
            throw new Error(`Unknown node type: ${type}`);
    }

    updatePhaserObject(obj, type, props, {}, true); // Apply initial props
    return obj;
}

function updatePhaserObject(obj: any, type: string, newProps: any, oldProps: any, isMount: boolean = false) {
    if (isMount || newProps.x !== oldProps.x) obj.x = newProps.x || 0;
    if (isMount || newProps.y !== oldProps.y) obj.y = newProps.y || 0;
    if (typeof obj.setAlpha === 'function' && (isMount || newProps.alpha !== oldProps.alpha)) obj.setAlpha(newProps.alpha ?? 1);
    if (typeof obj.setVisible === 'function' && (isMount || newProps.visible !== oldProps.visible)) obj.setVisible(newProps.visible ?? true);
    if (typeof obj.setScale === 'function' && (isMount || newProps.scale !== oldProps.scale)) obj.setScale(newProps.scale ?? 1);

    // Origin handling
    if (typeof obj.setOrigin === 'function' && (isMount || newProps.originX !== oldProps.originX || newProps.originY !== oldProps.originY)) {
        if (newProps.originX !== undefined) {
            obj.setOrigin(newProps.originX, newProps.originY ?? newProps.originX);
        } else {
            obj.setOrigin(0.5, 0.5); // Default for most things
        }
    }

    if (typeof obj.setRotation === 'function' && (isMount || newProps.rotation !== oldProps.rotation)) obj.setRotation(newProps.rotation ?? 0);

    // Size (Must be set BEFORE interactive for containers)
    if (newProps.width !== oldProps.width || newProps.height !== oldProps.height) {
        if (typeof obj.setSize === 'function' && newProps.width !== undefined && newProps.height !== undefined) {
            obj.setSize(newProps.width, newProps.height);
        }
    }

    // Interactivity
    if (newProps.interactive !== oldProps.interactive || (newProps.interactive && (newProps.width !== oldProps.width || newProps.height !== oldProps.height))) {
        if (newProps.interactive) {
            if (type === 'rect' && newProps.width !== undefined && newProps.height !== undefined) {
                // Graphics objects do not have a default hit area
                obj.setInteractive(new Phaser.Geom.Rectangle(0, 0, newProps.width, newProps.height), Phaser.Geom.Rectangle.Contains);
            } else {
                obj.setInteractive({ useHandCursor: newProps.useHandCursor ?? (!!newProps.onClick) });
            }
        } else {
            obj.disableInteractive();
        }
    }

    // Event listeners
    // Only attach/detach if interactive and the listener function has changed
    if (obj.input) { // Check if the object supports input
        if (oldProps.onClick !== newProps.onClick) {
            if (oldProps.onClick) obj.off('pointerdown', oldProps.onClick);
            if (newProps.onClick) obj.on('pointerdown', newProps.onClick);
        }
        if (oldProps.onPointerOver !== newProps.onPointerOver) {
            if (oldProps.onPointerOver) obj.off('pointerover', oldProps.onPointerOver);
            if (newProps.onPointerOver) obj.on('pointerover', newProps.onPointerOver);
        }
        if (oldProps.onPointerOut !== newProps.onPointerOut) {
            if (oldProps.onPointerOut) obj.off('pointerout', oldProps.onPointerOut);
            if (newProps.onPointerOut) obj.on('pointerout', newProps.onPointerOut);
        }
    }

    // Type specific props
    let effectiveType = type;
    if (type === 'direct') {
        if (obj instanceof Phaser.Physics.Arcade.Sprite) effectiveType = 'physics-sprite';
        else if (obj instanceof Phaser.GameObjects.Sprite) effectiveType = 'sprite';
        else if (obj instanceof Phaser.GameObjects.Image) effectiveType = 'image';
        else if (obj instanceof Phaser.GameObjects.Text) effectiveType = 'text';
        else if (obj instanceof Phaser.GameObjects.Graphics) effectiveType = 'rect';
    }

    switch (effectiveType) {
        case 'text':
            if (newProps.text !== oldProps.text) obj.setText(newProps.text || '');
            // Add other text properties if needed, e.g., style
            break;
        case 'rect':
            // Only redraw graphics if properties changed
            if (newProps.width !== oldProps.width || newProps.height !== oldProps.height ||
                newProps.fill !== oldProps.fill || newProps.alpha !== oldProps.alpha ||
                newProps.strokeWidth !== oldProps.strokeWidth || newProps.lineColor !== oldProps.lineColor) {

                const g = obj as Phaser.GameObjects.Graphics;
                g.clear();
                if (newProps.fill !== undefined) {
                    g.fillStyle(newProps.fill, newProps.alpha ?? 1);
                    g.fillRect(0, 0, newProps.width || 0, newProps.height || 0);
                }
                if (newProps.strokeWidth && newProps.lineColor !== undefined) {
                    g.lineStyle(newProps.strokeWidth, newProps.lineColor, 1);
                    g.strokeRect(0, 0, newProps.width || 0, newProps.height || 0);
                }
            }
            break;
        case 'sprite':
        case 'image':
            if (isMount || newProps.texture !== oldProps.texture || newProps.frame !== oldProps.frame) {
                obj.setTexture(newProps.texture, newProps.frame);
            }
            if (isMount || newProps.tint !== oldProps.tint) {
                if (newProps.tint !== undefined) obj.setTint(newProps.tint);
                else obj.clearTint();
            }
            if (isMount || newProps.flipX !== oldProps.flipX) obj.setFlipX(newProps.flipX ?? false);
            if (isMount || newProps.flipY !== oldProps.flipY) obj.setFlipY(newProps.flipY ?? false);
            if (isMount || newProps.play !== oldProps.play) {
                if (newProps.play) {
                    obj.play(newProps.play, true);
                } else if (!isMount) { // Only stop if it was actually playing and we aren't just mounting
                    obj.stop();
                }
            }
            break;
        case 'physics-sprite':
            if (isMount || newProps.texture !== oldProps.texture || newProps.frame !== oldProps.frame) {
                obj.setTexture(newProps.texture, newProps.frame);
            }
            if (isMount || newProps.tint !== oldProps.tint) {
                if (newProps.tint !== undefined) obj.setTint(newProps.tint);
                else obj.clearTint();
            }
            if (isMount || newProps.flipX !== oldProps.flipX) obj.setFlipX(newProps.flipX ?? false);
            if (isMount || newProps.flipY !== oldProps.flipY) obj.setFlipY(newProps.flipY ?? false);
            if (isMount || newProps.play !== oldProps.play) {
                if (newProps.play) {
                    obj.play(newProps.play, true);
                } else if (!isMount) {
                    obj.stop();
                }
            }
            // Physics props
            if (isMount || newProps.velocityX !== oldProps.velocityX) obj.setVelocityX(newProps.velocityX ?? 0);
            if (isMount || newProps.velocityY !== oldProps.velocityY) obj.setVelocityY(newProps.velocityY ?? 0);
            if (isMount || newProps.collideWorldBounds !== oldProps.collideWorldBounds) {
                obj.setCollideWorldBounds(newProps.collideWorldBounds ?? false);
            }
            if (isMount || newProps.bounce !== oldProps.bounce) obj.setBounce(newProps.bounce ?? 0);
            if (isMount || newProps.drag !== oldProps.drag) obj.setDrag(newProps.drag ?? 0);
            if (isMount || newProps.gravityY !== oldProps.gravityY) obj.setGravityY(newProps.gravityY ?? 0);
            if (isMount || newProps.immovable !== oldProps.immovable) obj.setImmovable(newProps.immovable ?? false);

            if (isMount || newProps.scale !== oldProps.scale || newProps.bodyWidthRatio !== oldProps.bodyWidthRatio || newProps.bodyHeightRatio !== oldProps.bodyHeightRatio) {
                if (newProps.bodyWidthRatio !== undefined && newProps.bodyHeightRatio !== undefined) {
                    const scale = newProps.scale ?? obj.scaleX ?? 1;
                    const targetW = obj.width * scale * newProps.bodyWidthRatio;
                    const targetH = obj.height * scale * newProps.bodyHeightRatio;

                    if (typeof obj.setBodySize === 'function') {
                        obj.setBodySize(targetW, targetH, true);
                    } else {
                        obj.body.setSize(targetW, targetH, true);
                    }

                    // For rotated or offset sprites, we might need manual offset.
                    // If origin is not 0.5, setSize(..., true) might center it wrong relative to the visual.
                    const originX = newProps.originX ?? obj.originX ?? 0.5;
                    const originY = newProps.originY ?? obj.originY ?? 0.5;
                    if (originX !== 0.5 || originY !== 0.5) {
                        const offX = (0.5 - originX) * obj.displayWidth;
                        const offY = (0.5 - originY) * obj.displayHeight;
                        obj.body.setOffset(offX, offY);
                    }
                }
            }
            if (isMount || newProps.bodyWidth !== oldProps.bodyWidth || newProps.bodyHeight !== oldProps.bodyHeight) {
                if (newProps.bodyWidth !== undefined && newProps.bodyHeight !== undefined) {
                    if (typeof obj.setBodySize === 'function') {
                        obj.setBodySize(newProps.bodyWidth, newProps.bodyHeight, true);
                    } else {
                        obj.body.setSize(newProps.bodyWidth, newProps.bodyHeight, true);
                    }
                }
            }
            if (isMount || newProps.bodyOffsetX !== oldProps.bodyOffsetX || newProps.bodyOffsetY !== oldProps.bodyOffsetY) {
                if (newProps.bodyOffsetX !== undefined || newProps.bodyOffsetY !== undefined) {
                    obj.body.setOffset(newProps.bodyOffsetX ?? 0, newProps.bodyOffsetY ?? 0);
                }
            }
            break;
    }

    // --- Data Manager & Property Sync ---
    // Sync any non-special props into Phaser's Data Manager so obj.getData(key) works.
    // Also try to set directly on the object if the property exists (for custom classes like Bullet)
    const internalProps = ['x', 'y', 'z', 'w', 'h', 'width', 'height', 'alpha', 'visible', 'scale', 'originX', 'originY', 'rotation', 'interactive', 'useHandCursor', 'onClick', 'onPointerOver', 'onPointerOut', 'texture', 'frame', 'tint', 'flipX', 'flipY', 'play', 'velocityX', 'velocityY', 'collideWorldBounds', 'bounce', 'drag', 'gravityY', 'immovable', 'bodyWidth', 'bodyHeight', 'bodyWidthRatio', 'bodyHeightRatio', 'bodyOffsetX', 'bodyOffsetY', 'ref', 'key', 'children'];

    for (const key in newProps) {
        if (!internalProps.includes(key)) {
            if (isMount || newProps[key] !== oldProps[key]) {
                // Try direct property assignment (for custom properties in classes like Bullet)
                if (key in obj && typeof obj[key] !== 'function') {
                    obj[key] = newProps[key];
                }

                // Sync to Data Manager
                if (typeof obj.setData === 'function') {
                    obj.setData(key, newProps[key]);
                }
            }
        }
    }
}

// --- 6. Mount Entry Point ---

export function mountRoot(scene: Phaser.Scene, rootComponent: Function, props: any = {}) {
    const root = new ComponentInstance(scene, rootComponent, props);
    root.render();
    return {
        update: (newProps: any) => {
            root.props = newProps;
            root.render();
        },
        unmount: () => {
            root.unmount();
        }
    };
}
