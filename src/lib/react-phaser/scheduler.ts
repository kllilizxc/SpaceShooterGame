export interface RenderableInstance {
    unmounted: boolean;
    render: () => void;
}

const scheduleMicrotask =
    (typeof queueMicrotask === "function")
        ? queueMicrotask
        : (callback: () => void) => Promise.resolve().then(callback);

const scheduledRenders = new Set<RenderableInstance>();
let renderFlushScheduled = false;

export function scheduleRender(instance: RenderableInstance) {
    if (instance.unmounted) return;
    scheduledRenders.add(instance);
    if (renderFlushScheduled) return;
    renderFlushScheduled = true;

    scheduleMicrotask(() => {
        renderFlushScheduled = false;
        const toRender = Array.from(scheduledRenders);
        scheduledRenders.clear();

        for (const inst of toRender) {
            if (!inst.unmounted) inst.render();
        }
    });
}

