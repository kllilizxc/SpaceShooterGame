import { vi } from "vitest";

vi.mock("phaser", () => {
    type Listener = (...args: any[]) => void;

    class GameObject {
        active = true;
        visible = true;
        __v_children?: any[];
        __v_props?: any;

        x = 0;
        y = 0;
        alpha = 1;
        scaleX = 1;
        scaleY = 1;
        originX = 0.5;
        originY = 0.5;
        rotation = 0;
        depth = 0;

        width = 1;
        height = 1;
        displayWidth = 1;
        displayHeight = 1;

        private __listeners = new Map<string, Set<Listener>>();
        private __data = new Map<string, any>();

        data = {
            remove: (keys: string[]) => {
                for (const key of keys) this.__data.delete(key);
            },
        };

        destroy() { }

        on(event: string, fn: Listener) {
            const set = this.__listeners.get(event) ?? new Set();
            set.add(fn);
            this.__listeners.set(event, set);
            return this;
        }

        off(event: string, fn: Listener) {
            const set = this.__listeners.get(event);
            if (!set) return this;
            set.delete(fn);
            if (set.size === 0) this.__listeners.delete(event);
            return this;
        }

        emit(event: string, ...args: any[]) {
            const set = this.__listeners.get(event);
            if (!set) return;
            for (const fn of Array.from(set)) fn(...args);
        }

        setAlpha(val: number) { this.alpha = val; return this; }
        setVisible(val: boolean) { this.visible = val; return this; }
        setScale(val: number) { this.scaleX = val; this.scaleY = val; return this; }
        setOrigin(x: number, y: number = x) { this.originX = x; this.originY = y; return this; }
        setRotation(val: number) { this.rotation = val; return this; }
        setDepth(val: number) { this.depth = val; return this; }
        setSize(width: number, height: number) { this.width = width; this.height = height; return this; }

        setInteractive() { return this; }
        disableInteractive() { return this; }

        setData(key: string, value: any) {
            this.__data.set(key, value);
            return this;
        }
        getData(key: string) {
            return this.__data.get(key);
        }
    }

    class Group extends GameObject { }
    class Container extends GameObject {
        private __children: GameObject[] = [];

        add(child: GameObject) {
            this.__children.push(child);
            return this;
        }
        addAt(child: GameObject, index: number) {
            this.__children.splice(index, 0, child);
            return this;
        }
        remove(child: GameObject) {
            const idx = this.__children.indexOf(child);
            if (idx !== -1) this.__children.splice(idx, 1);
            return this;
        }
        getIndex(child: GameObject) {
            return this.__children.indexOf(child);
        }
    }
    class Text extends GameObject {
        text = "";
        style = {
            setWordWrapWidth: (_width: any, _useAdvanced: boolean = false) => { },
        };

        setText(val: string) { this.text = val; return this; }
        setFontSize(_val: any) { return this; }
        setColor(_val: any) { return this; }
        setFontStyle(_val: any) { return this; }
        setAlign(_val: any) { return this; }
        setStyle(_val: any) { return this; }
        setWordWrapWidth(_width: any, _useAdvanced: boolean = false) { return this; }
    }
    class Graphics extends GameObject {
        clear() { return this; }
        fillStyle() { return this; }
        fillRect() { return this; }
        lineStyle() { return this; }
        strokeRect() { return this; }
    }
    class Sprite extends GameObject {
        texture?: string;
        frame?: string | number;
        tint?: number;
        flipX = false;
        flipY = false;

        setTexture(texture?: string, frame?: string | number) {
            this.texture = texture;
            this.frame = frame;
            return this;
        }
        setTint(tint: number) { this.tint = tint; return this; }
        clearTint() { this.tint = undefined; return this; }
        setFlipX(val: boolean) { this.flipX = val; return this; }
        setFlipY(val: boolean) { this.flipY = val; return this; }
        play() { return this; }
        stop() { return this; }
    }
    class Image extends Sprite { }

    class ArcadeBody {
        stop = vi.fn();
        setEnable = vi.fn();
        setSize = vi.fn();
        setOffset = vi.fn();
    }

    class ArcadeSprite extends Sprite {
        body: ArcadeBody = new ArcadeBody();

        setActive(val: boolean) { this.active = val; return this; }
        setVisible(val: boolean) { this.visible = val; return this; }

        setVelocityX() { return this; }
        setVelocityY() { return this; }
        setCollideWorldBounds() { return this; }
        setBounce() { return this; }
        setDrag() { return this; }
        setGravityY() { return this; }
        setImmovable() { return this; }
        setBodySize(width: number, height: number, _center: boolean = true) {
            this.body.setSize(width, height, _center);
            return this;
        }
        setOffset(x: number, y: number) {
            this.body.setOffset(x, y);
            return this;
        }
    }

    class ArcadeGroup extends Group {
        get = vi.fn(() => new ArcadeSprite());
        killAndHide = vi.fn((sprite: ArcadeSprite) => {
            sprite.active = false;
            sprite.visible = false;
        });
    }

    class Rectangle {
        static Contains() { return true; }
        constructor(public x: number, public y: number, public width: number, public height: number) { }
    }

    const Phaser = {
        Geom: {
            Rectangle,
        },
        GameObjects: {
            GameObject,
            Group,
            Container,
            Text,
            Graphics,
            Sprite,
            Image,
        },
        Physics: {
            Arcade: {
                Body: ArcadeBody,
                Sprite: ArcadeSprite,
                Group: ArcadeGroup,
            },
        },
    };

    return { default: Phaser };
});
