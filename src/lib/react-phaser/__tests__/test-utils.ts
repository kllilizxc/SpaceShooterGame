import Phaser from "phaser";

export class Emitter {
    private listeners = new Map<string, Set<(...args: any[]) => void>>();

    on(event: string, fn: (...args: any[]) => void) {
        const set = this.listeners.get(event) ?? new Set();
        set.add(fn);
        this.listeners.set(event, set);
        return this;
    }

    off(event: string, fn: (...args: any[]) => void) {
        const set = this.listeners.get(event);
        if (!set) return this;
        set.delete(fn);
        if (set.size === 0) this.listeners.delete(event);
        return this;
    }

    once(event: string, fn: (...args: any[]) => void) {
        const wrapper = (...args: any[]) => {
            this.off(event, wrapper);
            fn(...args);
        };
        this.on(event, wrapper);
        return this;
    }

    emit(event: string, ...args: any[]) {
        const set = this.listeners.get(event);
        if (!set) return;
        for (const fn of Array.from(set)) {
            fn(...args);
        }
    }
}

export function createMockScene() {
    const events = new Emitter();

    const add = {
        existing: () => { },
        container: (x: number = 0, y: number = 0) => {
            const obj = new Phaser.GameObjects.Container({} as any, x, y, []);
            obj.x = x;
            obj.y = y;
            return obj;
        },
        text: (x: number = 0, y: number = 0, text: string = "") => {
            const obj = new Phaser.GameObjects.Text({} as any, x, y, text, {});
            obj.x = x;
            obj.y = y;
            obj.setText(text);
            return obj;
        },
        graphics: () => new Phaser.GameObjects.Graphics({} as any),
        sprite: (x: number = 0, y: number = 0, texture?: string, frame?: string | number) => {
            const obj = new Phaser.GameObjects.Sprite({} as any, x, y, texture as any, frame as any);
            obj.x = x;
            obj.y = y;
            if (texture !== undefined) obj.setTexture(texture, frame);
            return obj;
        },
        image: (x: number = 0, y: number = 0, texture?: string, frame?: string | number) => {
            const obj = new Phaser.GameObjects.Image({} as any, x, y, texture as any, frame as any);
            obj.x = x;
            obj.y = y;
            if (texture !== undefined) obj.setTexture(texture, frame);
            return obj;
        },
    };

    const physics = {
        add: {
            sprite: (x: number = 0, y: number = 0, texture?: string, frame?: string | number) => {
                const obj = new Phaser.Physics.Arcade.Sprite({} as any, x, y, texture as any, frame as any);
                obj.x = x;
                obj.y = y;
                if (texture !== undefined) obj.setTexture(texture, frame);
                return obj;
            },
            group: () => new Phaser.Physics.Arcade.Group({} as any, {} as any),
        },
        world: { bounds: { x: 0, y: 0, right: 800, bottom: 600 } },
    };

    return { events, add, physics };
}
