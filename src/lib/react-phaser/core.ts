import Phaser from "phaser";
import { DEV, devWarnOnce } from "./dev";
import { getCurrentContext, getCurrentHookIndex, setCurrentContext, setCurrentHookIndex } from "./hook-runtime";
import { cleanupPooledSpriteDetached, createFragmentInstance, createHostSlot, isFragmentInstance, isHostSlot, resolveHost, resolveParentContainer } from "./host";
import type { FragmentInstance, HostSlot, ParentHandle } from "./host";
import type { PhaserHost, VNode } from "./types";
import { createPhaserObject, updatePhaserObject } from "./phaser-objects";

type InstanceChild = PhaserHost | ComponentInstance | HostSlot<PhaserHost> | FragmentInstance;

type CommitOp = () => void;
interface CommitQueue {
    ops: CommitOp[];
    layoutEffects: (() => void)[];
    effects: (() => void)[];
}

let currentCommitQueue: CommitQueue | null = null;

function clearVNodeRefs(vnode: VNode | null) {
    if (!vnode) return;

    const isHostVNode = (typeof vnode.type === "string") || (typeof vnode.type === "object" && vnode.type !== null);
    if (isHostVNode) {
        const ref = vnode.props?.ref;
        if (ref && typeof ref === "object" && "current" in ref) {
            (ref as any).current = null;
        }
    }

    for (const child of vnode.children) {
        clearVNodeRefs(child);
    }
}

function destroyInstanceChildTree(obj: InstanceChild | null) {
    if (!obj) return;

    if (obj instanceof ComponentInstance) {
        obj.unmount();
        return;
    }

    if (isFragmentInstance(obj)) {
        const children = Array.isArray(obj.__v_children) ? obj.__v_children : [];
        for (const child of children) {
            destroyInstanceChildTree(child as any);
        }
        obj.__v_children = [];
        return;
    }

    if (isHostSlot(obj)) {
        const host = resolveHost(obj as any);
        if (host) destroyInstanceChildTree(host as any);
        obj.current = null;
        return;
    }

    const host: any = resolveHost(obj as any);
    if (!host) return;

    const oldChildren: any[] = host.__v_children;
    if (Array.isArray(oldChildren)) {
        for (const child of oldChildren) {
            destroyInstanceChildTree(child as any);
        }
        host.__v_children = [];
    }

    if (typeof host.destroy === "function") {
        if (host.__v_pooled && host instanceof Phaser.Physics.Arcade.Sprite) {
            cleanupPooledSpriteDetached(host);
        } else if (!host.__v_pooled) {
            host.destroy();
        }
    }
}

// --- 3. Component Instance (reconciler state) ---

interface HookState {
    state?: any;
    deps?: any[];
    cleanup?: () => void;
}

export class ComponentInstance {
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

        const prevContext = getCurrentContext();
        const prevIndex = getCurrentHookIndex();
        const prevQueue = currentCommitQueue;

        setCurrentContext(this);
        setCurrentHookIndex(0);
        currentCommitQueue = commitQueue;

        let newVNode: VNode | null = null;
        try {
            newVNode = this.componentDef(this.props) as VNode | null;
        } finally {
            setCurrentContext(prevContext);
            setCurrentHookIndex(prevIndex);
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

        const oldVNode = this.renderedVNode;
        this.renderedVNode = null;
        clearVNodeRefs(oldVNode);

        // Destroy owned phaser objects (and their children)
        destroyInstanceChildTree(this.phaserObject);
        this.phaserObject = null;
    }

    addSubscription(unsub: () => void) {
        this.unsubs.push(unsub);
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
        commitQueue.ops.push(() => destroyInstanceChildTree(obj));
    };

    // 1. Remove old
    if (!newNode) {
        if (oldNode?.props?.ref && typeof oldNode.props.ref === "object" && "current" in oldNode.props.ref) {
            const ref = oldNode.props.ref;
            commitQueue.ops.push(() => {
                (ref as any).current = null;
            });
        }
        scheduleDestroy(existingObj);
        return null;
    }

    // 2. Functional Component
    if (typeof newNode.type === "function") {
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

    // 3. Native Phaser Object (or Fragment)
    let phaserHandle: PhaserNode | HostSlot<PhaserHost> | FragmentInstance | null = null;

    // Special Case: Fragment (no Phaser object, just an ordered child list)
    if (newNode.type === "fragment") {
        const shouldReuse = !!oldNode && oldNode.type === "fragment" && !!existingObj && isFragmentInstance(existingObj);
        if (!shouldReuse) {
            scheduleDestroy(existingObj);
            phaserHandle = createFragmentInstance();
        } else {
            phaserHandle = existingObj as FragmentInstance;
        }
    } else {
        // Determine if we need a totally new object
        let isNew = !oldNode || oldNode?.type !== newNode.type || existingObj instanceof ComponentInstance || isFragmentInstance(existingObj);

        // Special Case: "Shelling" or Pooling.
        // If we have an existing native object and the new type matches it (e.g. Sprite matches 'sprite')
        // and we don't have an old node, we can treat it as an update rather than a new mount.
        if (!oldNode && existingObj && !(existingObj instanceof ComponentInstance) && !isFragmentInstance(existingObj)) {
            let typeMatches = false;
            if (isHostSlot(existingObj)) {
                typeMatches = typeof newNode.type === "string" && existingObj.expectedType === (newNode.type as string);
            } else {
                const existingHost = existingObj as PhaserHost;
                if (newNode.type === "sprite" && existingHost instanceof Phaser.GameObjects.Sprite) typeMatches = true;
                else if (newNode.type === "physics-sprite" && existingHost instanceof Phaser.Physics.Arcade.Sprite) typeMatches = true;
                else if (newNode.type === "image" && existingHost instanceof Phaser.GameObjects.Image) typeMatches = true;
                else if (newNode.type === "text" && existingHost instanceof Phaser.GameObjects.Text) typeMatches = true;
                else if (newNode.type === "container" && existingHost instanceof Phaser.GameObjects.Container) typeMatches = true;
                else if (newNode.type === "physics-group" && existingHost instanceof Phaser.GameObjects.Group) typeMatches = true;
                else if (newNode.type === "rect" && existingHost instanceof Phaser.GameObjects.Graphics) typeMatches = true;
                else if (newNode.type === "graphics" && existingHost instanceof Phaser.GameObjects.Graphics) typeMatches = true;
                else if (typeof newNode.type === "object" && newNode.type !== null && newNode.type === existingHost) typeMatches = true; // Direct matching for 'direct' nodes
            }

            if (typeMatches) isNew = false;
        }

        // Harden pooled group slots: if we were handed a pooled slot, the new node MUST match.
        if (!oldNode && isHostSlot(existingObj) && existingObj.kind === "pooled") {
            const typeMatches = typeof newNode.type === "string" && existingObj.expectedType === (newNode.type as string);
            if (!typeMatches) {
                if (DEV) {
                    devWarnOnce(
                        "react-phaser:physics-group:invalid-child",
                        "react-phaser: children of 'physics-group' must resolve to a single 'physics-sprite' (fragments/containers/text are not supported)."
                    );
                }

                commitQueue.ops.push(() => {
                    const sprite = resolveHost(existingObj as any);
                    if (sprite && sprite instanceof Phaser.Physics.Arcade.Sprite) {
                        const groupObj = existingObj.group;
                        if (groupObj) groupObj.killAndHide(sprite);
                        else cleanupPooledSpriteDetached(sprite);
                    }
                    (existingObj as any).current = null;
                });
                return null;
            }
        }

        if (isNew) {
            if (oldNode?.props?.ref && oldNode.props.ref !== newNode.props.ref && typeof oldNode.props.ref === "object" && "current" in oldNode.props.ref) {
                const ref = oldNode.props.ref;
                commitQueue.ops.push(() => {
                    (ref as any).current = null;
                });
            }
            // Teardown old
            scheduleDestroy(existingObj);

            if (typeof newNode.type === "object" && newNode.type !== null) {
                // Direct Object Node
                phaserHandle = newNode.type as any;

                commitQueue.ops.push(() => {
                    updatePhaserObject(phaserHandle as any, "direct", newNode.props, {}, true);
                });
            } else {
                const slot = createHostSlot<PhaserHost>("create", newNode.type as string);
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
            const nodeType = (typeof newNode.type === "object" && newNode.type !== null) ? "direct" : (newNode.type as string);
            commitQueue.ops.push(() => {
                const obj = resolveHost(phaserHandle as any);
                if (!obj) return;
                const previousProps = oldNode?.props || (obj as any).__v_props || {};
                updatePhaserObject(obj, nodeType, newNode.props, previousProps, !oldNode);
            });
        }
    }

    if (oldNode?.props?.ref && oldNode.props.ref !== newNode.props.ref && typeof oldNode.props.ref === "object" && "current" in oldNode.props.ref) {
        const ref = oldNode.props.ref;
        commitQueue.ops.push(() => {
            (ref as any).current = null;
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
    const isContainer = (resolvedNow instanceof Phaser.GameObjects.Container) || expectedType === "container";
    const isGroup = (resolvedNow instanceof Phaser.Physics.Arcade.Group) || expectedType === "physics-group";
    const isFragment = isFragmentInstance(phaserHandle);

    if (isContainer || isGroup || isFragment) {
        const parentContainerHandle: any = phaserHandle;
        const childrenOwnerNow = isFragment ? (phaserHandle as FragmentInstance) : (resolvedNow as any);

        // We store the reconciled children on the phaser object so we can diff them next time.
        const oldChildrenData: InstanceChild[] = (childrenOwnerNow as any)?.__v_children || [];
        const newChildrenData: InstanceChild[] = [];

        if (DEV) {
            let keyed = 0;
            let unkeyed = 0;
            for (const childVNode of newNode.children) {
                const key = childVNode.props?.key ?? childVNode.key;
                if (key === undefined) unkeyed++;
                else keyed++;
            }

            if (isGroup && unkeyed > 0 && newNode.children.length > 1) {
                devWarnOnce(
                    "react-phaser:physics-group:missing-keys",
                    "react-phaser: children of 'physics-group' should be keyed for stable pooling/reuse."
                );
            } else if (isContainer && keyed > 0 && unkeyed > 0) {
                devWarnOnce(
                    "react-phaser:container:mixed-keys",
                    "react-phaser: avoid mixing keyed and unkeyed children under a 'container' (key dynamic lists)."
                );
            }
        }

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

            if (isGroup) {
                const isSupportedGroupChild =
                    (newChildVNode.type === "physics-sprite") ||
                    (typeof newChildVNode.type === "function") ||
                    (typeof newChildVNode.type === "object" && newChildVNode.type !== null);

                if (!isSupportedGroupChild) {
                    if (DEV) {
                        devWarnOnce(
                            "react-phaser:physics-group:invalid-child-vnode",
                            "react-phaser: 'physics-group' children must be 'physics-sprite' VNodes (or components that return a single 'physics-sprite')."
                        );
                    }
                    continue;
                }
            }

            // Pool creation logic: If the parent is a group and we don't have an object for this index/key
            if (isGroup && !existingChildObj) {
                const pooledSlot = createHostSlot<Phaser.Physics.Arcade.Sprite>("pooled", "physics-sprite");
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
                    pooledSlot.group = groupObj;
                    pooledSlot.current = pooledSprite;
                });
            }

            // Important: We pass the parentContainer down so the child knows it's in a group
            // but we pass undefined if it's a group to prevent recursive .add() calls
            const childParentHandle = isGroup ? undefined : (isFragment ? parent : (parentContainerHandle as any));
            const newChildObj = reconcile(scene, childParentHandle as any, oldChildVNode, newChildVNode, existingChildObj, commitQueue);

            if (newChildObj) {
                // Tag for future key lookups
                commitQueue.ops.push(() => {
                    if (newChildObj instanceof ComponentInstance || isFragmentInstance(newChildObj)) {
                        (newChildObj as any).__v_props = newChildVNode.props;
                    } else {
                        const host = resolveHost(newChildObj as any);
                        if (host) (host as any).__v_props = newChildVNode.props;
                    }

                    if (isGroup && DEV) {
                        const resolveToHost = (obj: InstanceChild | null): PhaserHost | null => {
                            if (!obj) return null;
                            if (obj instanceof ComponentInstance) return resolveToHost(obj.phaserObject as any);
                            if (isFragmentInstance(obj)) return null;
                            return resolveHost(obj as any);
                        };

                        const host = resolveToHost(newChildObj);
                        const isPooledSprite = !!(host instanceof Phaser.Physics.Arcade.Sprite) && !!(host as any).__v_pooled;
                        if (!isPooledSprite) {
                            devWarnOnce(
                                "react-phaser:physics-group:child-not-pooled-sprite",
                                "react-phaser: a 'physics-group' child did not resolve to a pooled Arcade Sprite. Ensure each child returns a single 'physics-sprite'."
                            );
                        }
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
            const owner: any = isFragment ? parentContainerHandle : host;
            const group = (!isFragment && host instanceof Phaser.Physics.Arcade.Group) ? (host as Phaser.Physics.Arcade.Group) : null;

            const cleanupPooledSprite = (sprite: Phaser.Physics.Arcade.Sprite) => {
                if (!group) return;
                group.killAndHide(sprite);
                if (sprite.body) {
                    sprite.body.stop();
                    (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
                }
            };

            const clearRefs = (obj: InstanceChild | null) => {
                if (!obj) return;

                // ComponentInstance unmount clears VNode refs.
                if (obj instanceof ComponentInstance) return;

                if (isFragmentInstance(obj)) {
                    const children = Array.isArray(obj.__v_children) ? obj.__v_children : [];
                    for (const child of children) clearRefs(child as any);
                    return;
                }

                const resolved = resolveHost(obj as any) as any;
                if (!resolved) return;

                const ref = resolved.__v_props?.ref;
                if (ref && typeof ref === "object" && "current" in ref) {
                    if ((ref as any).current === resolved) {
                        (ref as any).current = null;
                    }
                }
            };

            for (const childObj of removedChildren) {
                clearRefs(childObj);

                if (group) {
                    if (isFragmentInstance(childObj)) {
                        destroyInstanceChildTree(childObj);
                        continue;
                    }

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
                else if (isFragmentInstance(childObj)) destroyInstanceChildTree(childObj);
                else {
                    const childHost = resolveHost(childObj as any) as Phaser.GameObjects.GameObject | null;
                    if (childHost) childHost.destroy();
                }
            }

            // Save the new children state
            if (owner) {
                const resolvedChildren: (PhaserHost | ComponentInstance | FragmentInstance)[] = [];
                for (const child of newChildrenData) {
                    if (child instanceof ComponentInstance) {
                        resolvedChildren.push(child);
                    } else if (isFragmentInstance(child)) {
                        resolvedChildren.push(child);
                    } else {
                        const childHost = resolveHost(child as any);
                        if (childHost) resolvedChildren.push(childHost);
                    }
                }
                (owner as any).__v_children = resolvedChildren;

                // Ensure display order matches VNode order for containers (keyed reorders should reorder visually).
                if (host instanceof Phaser.GameObjects.Container) {
                    const collect = (child: InstanceChild | null): Phaser.GameObjects.GameObject[] => {
                        if (!child) return [];
                        if (child instanceof ComponentInstance) return collect(child.phaserObject as any);
                        if (isFragmentInstance(child)) {
                            const out: Phaser.GameObjects.GameObject[] = [];
                            for (const gc of child.__v_children) {
                                out.push(...collect(gc));
                            }
                            return out;
                        }

                        const resolved = resolveHost(child as any);
                        if (resolved && resolved instanceof Phaser.GameObjects.GameObject) return [resolved];
                        return [];
                    };

                    const desired: Phaser.GameObjects.GameObject[] = [];
                    for (const child of newChildrenData) {
                        desired.push(...collect(child));
                    }

                    for (let i = 0; i < desired.length; i++) {
                        const childObj = desired[i];
                        const currentIndex = host.getIndex(childObj);
                        if (currentIndex !== i && currentIndex !== -1) {
                            host.remove(childObj);
                            host.addAt(childObj, i);
                        }
                    }
                }
            }
        });
    }

    return phaserHandle;
}

// --- 6. Mount Entry Point ---

export function mountRoot(scene: Phaser.Scene, rootComponent: Function, props: any = {}) {
    const root = new ComponentInstance(scene, rootComponent, props);
    let disposed = false;

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        scene.events.off("shutdown", dispose);
        scene.events.off("destroy", dispose);
        root.unmount();
    };

    scene.events.once("shutdown", dispose);
    scene.events.once("destroy", dispose);
    root.render();
    return {
        update: (newProps: any) => {
            if (disposed) return;
            root.props = newProps;
            root.render();
        },
        unmount: () => {
            dispose();
        },
    };
}
