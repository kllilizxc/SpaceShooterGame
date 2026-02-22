import Phaser from "phaser";
import { devWarnOnce } from "./dev";

const INTERNAL_PROP_KEYS = new Set([
    "x", "y", "z", "depth", "w", "h",
    "width", "height",
    "alpha", "visible", "scale",
    "originX", "originY",
    "rotation",
    "interactive", "useHandCursor", "onClick", "onPointerOver", "onPointerOut",
    "texture", "frame", "tint", "flipX", "flipY", "play",
    "velocityX", "velocityY", "collideWorldBounds", "bounce", "drag", "gravityY", "immovable",
    "bodyWidth", "bodyHeight", "bodyWidthRatio", "bodyHeightRatio", "bodyOffsetX", "bodyOffsetY",
    "text", "fontSize", "color", "fontStyle", "align", "wordWrapWidth", "wordWrapAdvanced",
    "fill", "strokeWidth", "lineColor",
    "config",
    "ref", "key", "children",
]);

export function createPhaserObject(scene: Phaser.Scene, type: string, props: any): Phaser.GameObjects.GameObject | Phaser.GameObjects.Group {
    let obj: any;
    switch (type) {
        case "container":
            obj = scene.add.container(props.x || 0, props.y || 0);
            break;
        case "text":
            obj = scene.add.text(props.x || 0, props.y || 0, props.text || "", {
                fontSize: props.fontSize ? (typeof props.fontSize === "number" ? `${props.fontSize}px` : props.fontSize) : "16px",
                color: props.color || "#ffffff",
                fontStyle: props.fontStyle || "normal",
                align: props.align,
                wordWrap: props.wordWrapWidth !== undefined ? { width: props.wordWrapWidth, useAdvancedWrap: props.wordWrapAdvanced ?? false } : undefined,
            });
            break;
        case "rect":
        case "graphics":
            obj = scene.add.graphics();
            break;
        case "sprite":
            obj = scene.add.sprite(props.x || 0, props.y || 0, props.texture, props.frame);
            break;
        case "image":
            obj = scene.add.image(props.x || 0, props.y || 0, props.texture, props.frame);
            break;
        case "physics-sprite":
            obj = scene.physics.add.sprite(props.x || 0, props.y || 0, props.texture, props.frame);
            break;
        case "physics-group":
            obj = scene.physics.add.group(props.config || {});
            break;
        default:
            throw new Error(`Unknown node type: ${type}`);
    }

    updatePhaserObject(obj, type, props, {}, true); // Apply initial props
    return obj;
}

export function updatePhaserObject(obj: any, type: string, newProps: any, oldProps: any, isMount: boolean = false) {
    const isDirect = type === "direct";
    const applyDefaultsOnMount = isMount && !isDirect;

    if (isMount || newProps.x !== oldProps.x) {
        if (newProps.x !== undefined) obj.x = newProps.x;
        else if (!isDirect && isMount) obj.x = 0;
    }
    if (isMount || newProps.y !== oldProps.y) {
        if (newProps.y !== undefined) obj.y = newProps.y;
        else if (!isDirect && isMount) obj.y = 0;
    }
    if (typeof obj.setAlpha === "function" && (isMount || newProps.alpha !== oldProps.alpha)) {
        if (newProps.alpha !== undefined) obj.setAlpha(newProps.alpha);
        else if (!isDirect) obj.setAlpha(1);
    }
    if (typeof obj.setVisible === "function" && (isMount || newProps.visible !== oldProps.visible)) {
        if (newProps.visible !== undefined) obj.setVisible(newProps.visible);
        else if (!isDirect) obj.setVisible(true);
    }
    if (typeof obj.setScale === "function" && (isMount || newProps.scale !== oldProps.scale)) {
        if (newProps.scale !== undefined) obj.setScale(newProps.scale);
        else if (!isDirect) obj.setScale(1);
    }

    // Origin handling
    if (typeof obj.setOrigin === "function" && (isMount || newProps.originX !== oldProps.originX || newProps.originY !== oldProps.originY)) {
        if (newProps.originX !== undefined) {
            obj.setOrigin(newProps.originX, newProps.originY ?? newProps.originX);
        } else if (!isDirect) {
            obj.setOrigin(0.5, 0.5); // Default for most things
        }
    }

    if (typeof obj.setRotation === "function" && (isMount || newProps.rotation !== oldProps.rotation)) {
        if (newProps.rotation !== undefined) obj.setRotation(newProps.rotation);
        else if (!isDirect) obj.setRotation(0);
    }

    // Depth / layering
    const newDepth = newProps.depth ?? newProps.z;
    const oldDepth = oldProps.depth ?? oldProps.z;
    if (typeof obj.setDepth === "function" && (isMount || newDepth !== oldDepth)) {
        if (newDepth !== undefined) obj.setDepth(newDepth);
        else if (!isDirect) obj.setDepth(0);
    }

    // Size (Must be set BEFORE interactive for containers)
    if (newProps.width !== oldProps.width || newProps.height !== oldProps.height) {
        if (typeof obj.setSize === "function" && newProps.width !== undefined && newProps.height !== undefined) {
            obj.setSize(newProps.width, newProps.height);
        }
    }

    // Interactivity
    if (newProps.interactive !== oldProps.interactive || (newProps.interactive && (newProps.width !== oldProps.width || newProps.height !== oldProps.height))) {
        if (newProps.interactive) {
            if ((type === "rect" || type === "graphics") && (newProps.width === undefined || newProps.height === undefined)) {
                devWarnOnce(
                    "react-phaser:interactive:graphics-missing-size",
                    "react-phaser: 'rect'/'graphics' with interactive=true should specify width and height to create a hit area."
                );
            }
            if (type === "container" && (newProps.width === undefined || newProps.height === undefined)) {
                devWarnOnce(
                    "react-phaser:interactive:container-missing-size",
                    "react-phaser: 'container' with interactive=true should specify width and height (Containers have no intrinsic hit area)."
                );
            }

            if ((type === "rect" || type === "graphics") && newProps.width !== undefined && newProps.height !== undefined) {
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
    // Attach stable internal wrappers once and swap the current handlers to avoid detach/attach churn.
    const hadHandlers = !!(oldProps.onClick || oldProps.onPointerOver || oldProps.onPointerOut);
    const hasHandlers = !!(newProps.onClick || newProps.onPointerOver || newProps.onPointerOut);
    if ((hadHandlers || hasHandlers) && typeof obj.on === "function") {
        type HandlerState = {
            onClick?: (...args: any[]) => void;
            onPointerOver?: (...args: any[]) => void;
            onPointerOut?: (...args: any[]) => void;
            pointerdown?: (...args: any[]) => void;
            pointerover?: (...args: any[]) => void;
            pointerout?: (...args: any[]) => void;
        };

        const state: HandlerState = (obj as any).__v_inputHandlers || ((obj as any).__v_inputHandlers = {});

        state.onClick = (typeof newProps.onClick === "function") ? newProps.onClick : undefined;
        state.onPointerOver = (typeof newProps.onPointerOver === "function") ? newProps.onPointerOver : undefined;
        state.onPointerOut = (typeof newProps.onPointerOut === "function") ? newProps.onPointerOut : undefined;

        if ((oldProps.onClick || newProps.onClick) && !state.pointerdown) {
            state.pointerdown = (...args: any[]) => state.onClick?.apply(obj, args);
            obj.on("pointerdown", state.pointerdown);
        }
        if ((oldProps.onPointerOver || newProps.onPointerOver) && !state.pointerover) {
            state.pointerover = (...args: any[]) => state.onPointerOver?.apply(obj, args);
            obj.on("pointerover", state.pointerover);
        }
        if ((oldProps.onPointerOut || newProps.onPointerOut) && !state.pointerout) {
            state.pointerout = (...args: any[]) => state.onPointerOut?.apply(obj, args);
            obj.on("pointerout", state.pointerout);
        }
    }

    // Type specific props
    let effectiveType = type;
    if (effectiveType === "graphics") effectiveType = "rect";
    if (type === "direct") {
        if (obj instanceof Phaser.Physics.Arcade.Sprite) effectiveType = "physics-sprite";
        else if (obj instanceof Phaser.GameObjects.Sprite) effectiveType = "sprite";
        else if (obj instanceof Phaser.GameObjects.Image) effectiveType = "image";
        else if (obj instanceof Phaser.GameObjects.Text) effectiveType = "text";
        else if (obj instanceof Phaser.GameObjects.Graphics) effectiveType = "rect";
    }

    switch (effectiveType) {
        case "text":
            if (newProps.text !== oldProps.text) obj.setText(newProps.text || "");
            if (applyDefaultsOnMount || newProps.fontSize !== oldProps.fontSize) {
                const fontSize = newProps.fontSize !== undefined
                    ? (typeof newProps.fontSize === "number" ? `${newProps.fontSize}px` : newProps.fontSize)
                    : "16px";
                if (typeof obj.setFontSize === "function") obj.setFontSize(fontSize);
                else if (typeof obj.setStyle === "function") obj.setStyle({ fontSize });
            }
            if (applyDefaultsOnMount || newProps.color !== oldProps.color) {
                const color = newProps.color ?? "#ffffff";
                if (typeof obj.setColor === "function") obj.setColor(color);
                else if (typeof obj.setStyle === "function") obj.setStyle({ color });
            }
            if (applyDefaultsOnMount || newProps.fontStyle !== oldProps.fontStyle) {
                const fontStyle = newProps.fontStyle ?? "normal";
                if (typeof obj.setFontStyle === "function") obj.setFontStyle(fontStyle);
                else if (typeof obj.setStyle === "function") obj.setStyle({ fontStyle });
            }
            if (applyDefaultsOnMount || newProps.align !== oldProps.align) {
                const align = newProps.align ?? "left";
                if (typeof obj.setAlign === "function") obj.setAlign(align);
                else if (typeof obj.setStyle === "function") obj.setStyle({ align });
            }
            if (applyDefaultsOnMount || newProps.wordWrapWidth !== oldProps.wordWrapWidth || newProps.wordWrapAdvanced !== oldProps.wordWrapAdvanced) {
                const width = newProps.wordWrapWidth ?? null;
                const useAdvanced = newProps.wordWrapAdvanced ?? false;
                if (typeof obj.setWordWrapWidth === "function") obj.setWordWrapWidth(width, useAdvanced);
                else if (obj.style && typeof obj.style.setWordWrapWidth === "function") obj.style.setWordWrapWidth(width, useAdvanced);
            }
            break;
        case "rect":
            // Only redraw graphics if properties changed
            if (newProps.width !== oldProps.width || newProps.height !== oldProps.height ||
                newProps.fill !== oldProps.fill ||
                newProps.strokeWidth !== oldProps.strokeWidth || newProps.lineColor !== oldProps.lineColor) {

                const g = obj as Phaser.GameObjects.Graphics;
                g.clear();
                if (newProps.fill !== undefined) {
                    g.fillStyle(newProps.fill, 1);
                    g.fillRect(0, 0, newProps.width || 0, newProps.height || 0);
                }
                if (newProps.strokeWidth && newProps.lineColor !== undefined) {
                    g.lineStyle(newProps.strokeWidth, newProps.lineColor, 1);
                    g.strokeRect(0, 0, newProps.width || 0, newProps.height || 0);
                }
            }
            break;
        case "sprite":
        case "image":
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
                if (newProps.play && typeof obj.play === "function") obj.play(newProps.play, true);
                else if (typeof obj.stop === "function") obj.stop();
            }
            break;
        case "physics-sprite":
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
                if (newProps.play && typeof obj.play === "function") obj.play(newProps.play, true);
                else if (typeof obj.stop === "function") obj.stop();
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

                    if (typeof obj.setBodySize === "function") {
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
                    if (typeof obj.setBodySize === "function") {
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
    const removedDataKeys: string[] = [];
    if (obj.data && typeof obj.data.remove === "function") {
        for (const key in oldProps) {
            if (INTERNAL_PROP_KEYS.has(key)) continue;
            const hasNewValue = Object.prototype.hasOwnProperty.call(newProps, key) && newProps[key] !== undefined;
            if (!hasNewValue) removedDataKeys.push(key);
        }
    }
    if (removedDataKeys.length > 0) {
        obj.data.remove(removedDataKeys);
    }

    for (const key in newProps) {
        if (INTERNAL_PROP_KEYS.has(key)) continue;
        const value = newProps[key];
        if (value === undefined) continue;
        if (isMount || value !== oldProps[key]) {
            if (key in obj && typeof obj[key] !== "function") {
                obj[key] = value;
            }
            if (typeof obj.setData === "function") {
                obj.setData(key, value);
            }
        }
    }
}

