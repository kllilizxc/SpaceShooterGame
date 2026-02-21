import Phaser from "phaser";

// --- 1. VNode Types & createNode ---

export type VNodeType = 'text' | 'graphics' | 'image' | 'sprite' | 'physics-sprite' | 'physics-group' | 'container' | 'rect' | 'direct' | Function | Phaser.GameObjects.GameObject | Phaser.GameObjects.Group;

export interface VNode {
    type: VNodeType;
    key?: string | number;
    props: Record<string, any>;
    children: VNode[];
}

type PhaserHost = Phaser.GameObjects.GameObject | Phaser.GameObjects.Group;

interface HostSlot<T extends PhaserHost = PhaserHost> {
    __v_slot: true;
    kind: 'create' | 'pooled';
    expectedType: string;
    current: T | null;
    group?: Phaser.Physics.Arcade.Group;
}

type ContainerHandle = Phaser.GameObjects.Container | HostSlot<Phaser.GameObjects.Container>;
type ParentHandle = ContainerHandle | undefined;
type InstanceChild = PhaserHost | ComponentInstance | HostSlot<PhaserHost>;

type CommitOp = () => void;
interface CommitQueue {
    ops: CommitOp[];
    layoutEffects: (() => void)[];
    effects: (() => void)[];
}

let currentCommitQueue: CommitQueue | null = null;

function isHostSlot(value: any): value is HostSlot {
    return !!value && typeof value === 'object' && value.__v_slot === true;
}

function resolveHost<T extends PhaserHost>(value: T | HostSlot<T> | null | undefined): T | null {
    if (!value) return null;
    return isHostSlot(value) ? (value.current as T | null) : value;
}

function resolveParentContainer(parent: ParentHandle): Phaser.GameObjects.Container | undefined {
    const resolved = resolveHost(parent as any);
    return resolved ? (resolved as Phaser.GameObjects.Container) : undefined;
}

function createHostSlot<T extends PhaserHost>(kind: HostSlot<T>['kind'], expectedType: string, group?: Phaser.Physics.Arcade.Group): HostSlot<T> {
    return { __v_slot: true, kind, expectedType, current: null, group };
}

const INTERNAL_PROP_KEYS = new Set([
    'x', 'y', 'z', 'w', 'h',
    'width', 'height',
    'alpha', 'visible', 'scale',
    'originX', 'originY',
    'rotation',
    'interactive', 'useHandCursor', 'onClick', 'onPointerOver', 'onPointerOut',
    'texture', 'frame', 'tint', 'flipX', 'flipY', 'play',
    'velocityX', 'velocityY', 'collideWorldBounds', 'bounce', 'drag', 'gravityY', 'immovable',
    'bodyWidth', 'bodyHeight', 'bodyWidthRatio', 'bodyHeightRatio', 'bodyOffsetX', 'bodyOffsetY',
    'ref', 'key', 'children',
]);

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

    private unsubs: (() => void)[] = [];

    constructor(
        public scene: Phaser.Scene,
        public componentDef: Function,
        public props: any,
        public parentContainer?: ParentHandle,
        public phaserObject: InstanceChild | null = null
    ) { }

    render() {
        if (this.unmounted) return;

        const commitQueue: CommitQueue = { ops: [], layoutEffects: [], effects: [] };
        this.renderIntoQueue(commitQueue);

        // Commit
        commitQueue.ops.forEach(op => op());
        // Flush layout effects, then passive effects
        commitQueue.layoutEffects.forEach(effect => effect());
        commitQueue.effects.forEach(effect => effect());
    }

    renderIntoQueue(commitQueue: CommitQueue) {
        if (this.unmounted) return;

        const prevContext = currentContext;
        const prevIndex = currentHookIndex;
        const prevQueue = currentCommitQueue;

        currentContext = this;
        currentHookIndex = 0;
        currentCommitQueue = commitQueue;

        let newVNode: VNode | null = null;
        try {
            newVNode = this.componentDef(this.props) as VNode | null;
        } finally {
            currentContext = prevContext;
            currentHookIndex = prevIndex;
            currentCommitQueue = prevQueue;
        }

        // Reconcile (pure render → patch list)
        const nextChild = reconcile(this.scene, this.parentContainer, this.renderedVNode, newVNode, this.phaserObject, commitQueue);

        // Finalize instance bookkeeping after commit
        commitQueue.ops.push(() => {
            this.renderedVNode = newVNode;

            if (nextChild && isHostSlot(nextChild)) {
                this.phaserObject = nextChild.current;
            } else {
                this.phaserObject = nextChild;
            }

            const childHost = (this.phaserObject instanceof ComponentInstance) ? null : resolveHost(this.phaserObject as any);
            if (childHost) {
                (childHost as any).__v_props = this.props;
            }
        });
    }

    addLayoutEffect(callback: () => void) {
        if (!currentCommitQueue) throw new Error("Effects must be scheduled during a render");
        currentCommitQueue.layoutEffects.push(callback);
    }

    addEffect(callback: () => void) {
        if (!currentCommitQueue) throw new Error("Effects must be scheduled during a render");
        currentCommitQueue.effects.push(callback);
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
        } else if (this.phaserObject) {
            const host = resolveHost(this.phaserObject as any) as any;
            if (host) {
                const children: any[] = host.__v_children;
                if (Array.isArray(children)) {
                    for (const child of children) {
                        if (child instanceof ComponentInstance) child.unmount();
                        else if (child && typeof child.destroy === 'function' && !child.__v_pooled) {
                            child.destroy();
                        }
                    }
                    host.__v_children = [];
                }

                if (typeof host.destroy === 'function' && !host.__v_pooled) {
                    host.destroy();
                }
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
        const selected = selector ? selector(store) : store;
        const state = { value: selected as any, store, selector };
        ctx.hooks[index] = { state };

        // Subscribe after commit (avoid side effects during render)
        ctx.addLayoutEffect(() => {
            if (!store.$subscribe) return;

            const unsubscribe = store.$subscribe(() => {
                if (ctx.unmounted) return;
                const { store: latestStore, selector: latestSelector } = ctx.hooks[index].state;
                if (latestSelector) {
                    const nextValue = latestSelector(latestStore);
                    if (nextValue !== ctx.hooks[index].state.value) {
                        ctx.hooks[index].state.value = nextValue;
                        ctx.render();
                    }
                } else {
                    ctx.render();
                }
            });

            ctx.hooks[index].cleanup = () => unsubscribe();

            // Catch up in case the store changed between render and subscribing
            const { store: latestStore, selector: latestSelector } = ctx.hooks[index].state;
            const nextValue = latestSelector ? latestSelector(latestStore) : latestStore;
            if (nextValue !== ctx.hooks[index].state.value) {
                ctx.hooks[index].state.value = nextValue;
                ctx.render();
            }
        });
    }

    // Keep selector/store references fresh and return a render-time snapshot
    const hookState = ctx.hooks[index].state;
    hookState.store = store;
    hookState.selector = selector;
    hookState.value = selector ? selector(store) : store;
    return hookState.value;
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

export function useUpdate(callback: (time: number, delta: number) => void): void {
    if (!currentContext) throw new Error("useUpdate must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    if (!ctx.hooks[index]) {
        // Store the callback in state
        const state = { callback };
        ctx.hooks[index] = { state };

        // Register after commit (avoid side effects during render)
        ctx.addLayoutEffect(() => {
            const updateWrapper = (time: number, delta: number) => {
                if (ctx.unmounted) return;
                state.callback(time, delta);
            };

            ctx.scene.events.on('update', updateWrapper);
            ctx.hooks[index].cleanup = () => {
                ctx.scene.events.off('update', updateWrapper);
            };
        });
    } else {
        // Update fresh references
        ctx.hooks[index].state.callback = callback;
    }
}

export function onMount(callback: () => void | (() => void)) {
    if (!currentContext) throw new Error("onMount must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    if (!ctx.hooks[index]) {
        ctx.hooks[index] = { state: true };
        ctx.addLayoutEffect(() => {
            const cleanup = callback();
            if (typeof cleanup === 'function') {
                ctx.hooks[index].cleanup = cleanup;
            }
        });
    }
}

export function useLayoutEffect(callback: () => void | (() => void), deps?: any[]) {
    if (!currentContext) throw new Error("useLayoutEffect must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    const oldDeps = ctx.hooks[index]?.deps;
    const hasChanged = !deps || !oldDeps || deps.length !== oldDeps.length || deps.some((d, i) => d !== oldDeps[i]);

    if (hasChanged) {
        if (!ctx.hooks[index]) {
            ctx.hooks[index] = {};
        }
        ctx.hooks[index].deps = deps;

        ctx.addLayoutEffect(() => {
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

export function useEffect(callback: () => void | (() => void), deps?: any[]) {
    if (!currentContext) throw new Error("useEffect must be called inside a component");
    const ctx = currentContext;
    const index = currentHookIndex++;

    const oldDeps = ctx.hooks[index]?.deps;
    const hasChanged = !deps || !oldDeps || deps.length !== oldDeps.length || deps.some((d, i) => d !== oldDeps[i]);

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

type PhaserNode = PhaserHost;

function reconcile(
    scene: Phaser.Scene,
    parent: ParentHandle,
    oldNode: VNode | null,
    newNode: VNode | null,
    existingObj: InstanceChild | null,
    commitQueue: CommitQueue
): InstanceChild | null {

    const scheduleDestroy = (obj: InstanceChild | null) => {
        if (!obj) return;

        if (obj instanceof ComponentInstance) {
            commitQueue.ops.push(() => obj.unmount());
            return;
        }

        commitQueue.ops.push(() => {
            const host = resolveHost(obj as any);
            if (!host) return;

            const oldChildren: any[] = (host as any).__v_children;
            if (Array.isArray(oldChildren)) {
                for (const child of oldChildren) {
                    if (child instanceof ComponentInstance) child.unmount();
                    else if (child && typeof (child as any).destroy === 'function') {
                        if (!(child as any).__v_pooled) {
                            (child as any).destroy();
                        }
                    }
                }
                (host as any).__v_children = [];
            }

            if (typeof (host as any).destroy === 'function' && !(host as any).__v_pooled) {
                (host as any).destroy();
            }
        });
    };

    // 1. Remove old
    if (!newNode) {
        scheduleDestroy(existingObj);
        return null;
    }

    // 2. Functional Component
    if (typeof newNode.type === 'function') {
        const shouldReplace = !oldNode || oldNode.type !== newNode.type || !(existingObj instanceof ComponentInstance);

        if (shouldReplace) {
            if (existingObj instanceof ComponentInstance) {
                scheduleDestroy(existingObj);
            }

            const adoptedObj = (existingObj instanceof ComponentInstance) ? null : existingObj;
            const instance = new ComponentInstance(scene, newNode.type as Function, newNode.props, parent, adoptedObj);

            // Render child subtree into the same commit
            instance.renderIntoQueue(commitQueue);

            return instance;
        }

        const instance = existingObj;
        instance.props = newNode.props;
        instance.parentContainer = parent;

        instance.renderIntoQueue(commitQueue);

        return instance;
    }

    // 3. Native Phaser Object
    let phaserHandle: PhaserNode | HostSlot<PhaserHost> | null = null;

    // Determine if we need a totally new object
    let isNew = !oldNode || oldNode?.type !== newNode.type || existingObj instanceof ComponentInstance;

    // Special Case: "Shelling" or Pooling. 
    // If we have an existing native object and the new type matches it (e.g. Sprite matches 'sprite')
    // and we don't have an old node, we can treat it as an update rather than a new mount.
    if (!oldNode && existingObj && !(existingObj instanceof ComponentInstance)) {
        let typeMatches = false;
        if (isHostSlot(existingObj)) {
            typeMatches = typeof newNode.type === 'string' && existingObj.expectedType === (newNode.type as string);
        } else {
            const existingHost = existingObj as PhaserHost;
            if (newNode.type === 'sprite' && existingHost instanceof Phaser.GameObjects.Sprite) typeMatches = true;
            else if (newNode.type === 'physics-sprite' && existingHost instanceof Phaser.Physics.Arcade.Sprite) typeMatches = true;
            else if (newNode.type === 'image' && existingHost instanceof Phaser.GameObjects.Image) typeMatches = true;
            else if (newNode.type === 'text' && existingHost instanceof Phaser.GameObjects.Text) typeMatches = true;
            else if (newNode.type === 'container' && existingHost instanceof Phaser.GameObjects.Container) typeMatches = true;
            else if (newNode.type === 'physics-group' && existingHost instanceof Phaser.GameObjects.Group) typeMatches = true;
            else if (newNode.type === 'rect' && existingHost instanceof Phaser.GameObjects.Graphics) typeMatches = true;
            else if (newNode.type === 'graphics' && existingHost instanceof Phaser.GameObjects.Graphics) typeMatches = true;
            else if (typeof newNode.type === 'object' && newNode.type !== null && newNode.type === existingHost) typeMatches = true; // Direct matching for 'direct' nodes
        }

        if (typeMatches) isNew = false;
    }

    if (isNew) {
        // Teardown old
        scheduleDestroy(existingObj);

        if (typeof newNode.type === 'object' && newNode.type !== null) {
            // Direct Object Node
            phaserHandle = newNode.type as any;

            commitQueue.ops.push(() => {
                updatePhaserObject(phaserHandle as any, 'direct', newNode.props, {}, true);
            });
        } else {
            const slot = createHostSlot<PhaserHost>('create', newNode.type as string);
            phaserHandle = slot;
            commitQueue.ops.push(() => {
                slot.current = createPhaserObject(scene, newNode.type as string, newNode.props) as any;
            });
        }

        // Attach to parent / scene
        commitQueue.ops.push(() => {
            const obj = resolveHost(phaserHandle as any);
            if (!obj) return;
            if (obj instanceof Phaser.GameObjects.Group) return;

            const parentContainer = resolveParentContainer(parent);
            if (parentContainer) {
                parentContainer.add(obj as Phaser.GameObjects.GameObject);
            } else {
                scene.add.existing(obj as Phaser.GameObjects.GameObject);
            }
        });
    } else {
        // Patch props
        phaserHandle = existingObj as any;
        const nodeType = (typeof newNode.type === 'object' && newNode.type !== null) ? 'direct' : (newNode.type as string);
        commitQueue.ops.push(() => {
            const obj = resolveHost(phaserHandle as any);
            if (!obj) return;
            updatePhaserObject(obj, nodeType, newNode.props, oldNode?.props || {}, !oldNode);
        });
    }

    // Capture ref
    if (newNode.props.ref && phaserHandle) {
        commitQueue.ops.push(() => {
            const obj = resolveHost(phaserHandle as any);
            if (obj) newNode.props.ref.current = obj;
        });
    }

    // 4. Reconcile Children
    const resolvedNow = resolveHost(phaserHandle as any);
    const expectedType = isHostSlot(phaserHandle) ? phaserHandle.expectedType : null;
    const isContainer = (resolvedNow instanceof Phaser.GameObjects.Container) || expectedType === 'container';
    const isGroup = (resolvedNow instanceof Phaser.Physics.Arcade.Group) || expectedType === 'physics-group';

    if (isContainer || isGroup) {
        const parentContainerHandle: any = phaserHandle;
        const parentContainerNow = resolvedNow as any;

        // We store the reconciled children on the phaser object so we can diff them next time.
        const oldChildrenData: InstanceChild[] = (parentContainerNow as any)?.__v_children || [];
        const newChildrenData: InstanceChild[] = [];

        // Map old children by key for faster/stable lookups
        const oldChildrenMap = new Map<string | number, InstanceChild>();
        const oldChildrenUnkeyed: InstanceChild[] = [];
        const oldVNodeByKey = new Map<string | number, VNode>();

        if (oldNode?.children) {
            for (const oldChild of oldNode.children) {
                const key = oldChild.props?.key ?? oldChild.key;
                if (key !== undefined) oldVNodeByKey.set(key, oldChild);
            }
        }

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

            let existingChildObj: InstanceChild | null = null;
            let oldChildVNode: VNode | null = null;

            if (key !== undefined && oldChildrenMap.has(key)) {
                existingChildObj = oldChildrenMap.get(key)!;
                oldChildrenMap.delete(key);
                oldChildVNode = oldVNodeByKey.get(key) || null;
            } else if (oldChildrenUnkeyed.length > 0) {
                existingChildObj = oldChildrenUnkeyed.shift()!;
                oldChildVNode = oldNode?.children?.[i] || null;
            }

            // Pool creation logic: If the parent is a group and we don't have an object for this index/key
            if (isGroup && !existingChildObj) {
                const pooledSlot = createHostSlot<Phaser.Physics.Arcade.Sprite>('pooled', 'physics-sprite');
                existingChildObj = pooledSlot as any;
                commitQueue.ops.push(() => {
                    const groupObj = resolveHost(parentContainerHandle as any) as Phaser.Physics.Arcade.Group | null;
                    if (!groupObj) return;
                    const pooledSprite = groupObj.get() as Phaser.Physics.Arcade.Sprite;
                    if (!pooledSprite) return;

                    pooledSprite.setActive(true).setVisible(true);
                    if (pooledSprite.body) {
                        (pooledSprite.body as Phaser.Physics.Arcade.Body).setEnable(true);
                    }
                    (pooledSprite as any).__v_pooled = true;
                    pooledSlot.current = pooledSprite;
                });
            }

            // Important: We pass the parentContainer down so the child knows it's in a group
            // but we pass undefined if it's a group to prevent recursive .add() calls
            const newChildObj = reconcile(scene, isGroup ? undefined : (parentContainerHandle as any), oldChildVNode, newChildVNode, existingChildObj, commitQueue);

            if (newChildObj) {
                // Tag for future key lookups
                commitQueue.ops.push(() => {
                    if (newChildObj instanceof ComponentInstance) {
                        (newChildObj as any).__v_props = newChildVNode.props;
                    } else {
                        const host = resolveHost(newChildObj as any);
                        if (host) (host as any).__v_props = newChildVNode.props;
                    }
                });
                newChildrenData.push(newChildObj);
            }
        }

        // Cleanup unmounted children
        const removedChildren: InstanceChild[] = [];
        oldChildrenMap.forEach(child => removedChildren.push(child));
        oldChildrenUnkeyed.forEach(child => removedChildren.push(child));

        commitQueue.ops.push(() => {
            const host = resolveHost(parentContainerHandle as any) as any;
            const group = (host instanceof Phaser.Physics.Arcade.Group) ? (host as Phaser.Physics.Arcade.Group) : null;

            const cleanupPooledSprite = (sprite: Phaser.Physics.Arcade.Sprite) => {
                if (!group) return;
                group.killAndHide(sprite);
                if (sprite.body) {
                    sprite.body.stop();
                    (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
                }
            };

            for (const childObj of removedChildren) {
                if (group) {
                    if (childObj instanceof ComponentInstance) {
                        const phaserNode = (childObj.phaserObject instanceof ComponentInstance) ? null : childObj.phaserObject;
                        const isPooled = !!(phaserNode as any)?.__v_pooled;
                        childObj.unmount();
                        if (isPooled && phaserNode instanceof Phaser.Physics.Arcade.Sprite) {
                            cleanupPooledSprite(phaserNode);
                        }
                        continue;
                    }

                    const sprite = resolveHost(childObj as any) as Phaser.Physics.Arcade.Sprite | null;
                    const isPooled = !!(sprite as any)?.__v_pooled;
                    if (sprite) {
                        if (isPooled) cleanupPooledSprite(sprite);
                        else sprite.destroy();
                    }
                    continue;
                }

                // Non-group container cleanup
                if (childObj instanceof ComponentInstance) childObj.unmount();
                else {
                    const childHost = resolveHost(childObj as any) as Phaser.GameObjects.GameObject | null;
                    if (childHost) childHost.destroy();
                }
            }

            // Save the new children state
            if (host) {
                const resolvedChildren: (PhaserHost | ComponentInstance)[] = [];
                for (const child of newChildrenData) {
                    if (child instanceof ComponentInstance) {
                        resolvedChildren.push(child);
                    } else {
                        const childHost = resolveHost(child as any);
                        if (childHost) resolvedChildren.push(childHost);
                    }
                }
                (host as any).__v_children = resolvedChildren;
            }
        });
    }

    return phaserHandle;
}


// Handlers for specific Phaser object types
function createPhaserObject(scene: Phaser.Scene, type: string, props: any): PhaserHost {
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
        case 'graphics':
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
    const isDirect = type === 'direct';
    const applyDefaultsOnMount = isMount && !isDirect;

    if (isMount || newProps.x !== oldProps.x) {
        if (newProps.x !== undefined) obj.x = newProps.x;
        else if (!isDirect && isMount) obj.x = 0;
    }
    if (isMount || newProps.y !== oldProps.y) {
        if (newProps.y !== undefined) obj.y = newProps.y;
        else if (!isDirect && isMount) obj.y = 0;
    }
    if (typeof obj.setAlpha === 'function' && (isMount || newProps.alpha !== oldProps.alpha)) {
        if (newProps.alpha !== undefined) obj.setAlpha(newProps.alpha);
        else if (!isDirect && isMount) obj.setAlpha(1);
    }
    if (typeof obj.setVisible === 'function' && (isMount || newProps.visible !== oldProps.visible)) {
        if (newProps.visible !== undefined) obj.setVisible(newProps.visible);
        else if (!isDirect && isMount) obj.setVisible(true);
    }
    if (typeof obj.setScale === 'function' && (isMount || newProps.scale !== oldProps.scale)) {
        if (newProps.scale !== undefined) obj.setScale(newProps.scale);
        else if (!isDirect && isMount) obj.setScale(1);
    }

    // Origin handling
    if (typeof obj.setOrigin === 'function' && (isMount || newProps.originX !== oldProps.originX || newProps.originY !== oldProps.originY)) {
        if (newProps.originX !== undefined) {
            obj.setOrigin(newProps.originX, newProps.originY ?? newProps.originX);
        } else if (!isDirect && isMount) {
            obj.setOrigin(0.5, 0.5); // Default for most things
        }
    }

    if (typeof obj.setRotation === 'function' && (isMount || newProps.rotation !== oldProps.rotation)) {
        if (newProps.rotation !== undefined) obj.setRotation(newProps.rotation);
        else if (!isDirect && isMount) obj.setRotation(0);
    }

    // Size (Must be set BEFORE interactive for containers)
    if (newProps.width !== oldProps.width || newProps.height !== oldProps.height) {
        if (typeof obj.setSize === 'function' && newProps.width !== undefined && newProps.height !== undefined) {
            obj.setSize(newProps.width, newProps.height);
        }
    }

    // Interactivity
    if (newProps.interactive !== oldProps.interactive || (newProps.interactive && (newProps.width !== oldProps.width || newProps.height !== oldProps.height))) {
        if (newProps.interactive) {
            if ((type === 'rect' || type === 'graphics') && newProps.width !== undefined && newProps.height !== undefined) {
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
    if (effectiveType === 'graphics') effectiveType = 'rect';
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
            if ((applyDefaultsOnMount || newProps.texture !== oldProps.texture || newProps.frame !== oldProps.frame) && newProps.texture !== undefined) {
                obj.setTexture(newProps.texture, newProps.frame);
            }
            if (applyDefaultsOnMount || newProps.tint !== oldProps.tint) {
                if (newProps.tint !== undefined) obj.setTint(newProps.tint);
                else obj.clearTint();
            }
            if (applyDefaultsOnMount || newProps.flipX !== oldProps.flipX) obj.setFlipX(newProps.flipX ?? false);
            if (applyDefaultsOnMount || newProps.flipY !== oldProps.flipY) obj.setFlipY(newProps.flipY ?? false);
            if (applyDefaultsOnMount || newProps.play !== oldProps.play) {
                if (newProps.play) {
                    obj.play(newProps.play, true);
                } else if (!isMount) { // Only stop if it was actually playing and we aren't just mounting
                    obj.stop();
                }
            }
            break;
        case 'physics-sprite':
            if ((applyDefaultsOnMount || newProps.texture !== oldProps.texture || newProps.frame !== oldProps.frame) && newProps.texture !== undefined) {
                obj.setTexture(newProps.texture, newProps.frame);
            }
            if (applyDefaultsOnMount || newProps.tint !== oldProps.tint) {
                if (newProps.tint !== undefined) obj.setTint(newProps.tint);
                else obj.clearTint();
            }
            if (applyDefaultsOnMount || newProps.flipX !== oldProps.flipX) obj.setFlipX(newProps.flipX ?? false);
            if (applyDefaultsOnMount || newProps.flipY !== oldProps.flipY) obj.setFlipY(newProps.flipY ?? false);
            if (applyDefaultsOnMount || newProps.play !== oldProps.play) {
                if (newProps.play) {
                    obj.play(newProps.play, true);
                } else if (!isMount) {
                    obj.stop();
                }
            }
            // Physics props
            if (applyDefaultsOnMount || newProps.velocityX !== oldProps.velocityX) obj.setVelocityX(newProps.velocityX ?? 0);
            if (applyDefaultsOnMount || newProps.velocityY !== oldProps.velocityY) obj.setVelocityY(newProps.velocityY ?? 0);
            if (applyDefaultsOnMount || newProps.collideWorldBounds !== oldProps.collideWorldBounds) {
                obj.setCollideWorldBounds(newProps.collideWorldBounds ?? false);
            }
            if (applyDefaultsOnMount || newProps.bounce !== oldProps.bounce) obj.setBounce(newProps.bounce ?? 0);
            if (applyDefaultsOnMount || newProps.drag !== oldProps.drag) obj.setDrag(newProps.drag ?? 0);
            if (applyDefaultsOnMount || newProps.gravityY !== oldProps.gravityY) obj.setGravityY(newProps.gravityY ?? 0);
            if (applyDefaultsOnMount || newProps.immovable !== oldProps.immovable) obj.setImmovable(newProps.immovable ?? false);

            if (applyDefaultsOnMount || newProps.scale !== oldProps.scale || newProps.bodyWidthRatio !== oldProps.bodyWidthRatio || newProps.bodyHeightRatio !== oldProps.bodyHeightRatio) {
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
            if (applyDefaultsOnMount || newProps.bodyWidth !== oldProps.bodyWidth || newProps.bodyHeight !== oldProps.bodyHeight) {
                if (newProps.bodyWidth !== undefined && newProps.bodyHeight !== undefined) {
                    if (typeof obj.setBodySize === 'function') {
                        obj.setBodySize(newProps.bodyWidth, newProps.bodyHeight, true);
                    } else {
                        obj.body.setSize(newProps.bodyWidth, newProps.bodyHeight, true);
                    }
                }
            }
            if (applyDefaultsOnMount || newProps.bodyOffsetX !== oldProps.bodyOffsetX || newProps.bodyOffsetY !== oldProps.bodyOffsetY) {
                if (newProps.bodyOffsetX !== undefined || newProps.bodyOffsetY !== undefined) {
                    obj.body.setOffset(newProps.bodyOffsetX ?? 0, newProps.bodyOffsetY ?? 0);
                }
            }
            break;
    }

    // --- Data Manager & Property Sync ---
    // Sync any non-special props into Phaser's Data Manager so obj.getData(key) works.
    // Also try to set directly on the object if the property exists (for custom classes like Bullet)
    for (const key in newProps) {
        if (!INTERNAL_PROP_KEYS.has(key)) {
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
