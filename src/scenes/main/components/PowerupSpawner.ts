import Phaser from "phaser";
import { useGameStore } from "../stores/game";
import { useStore, useUpdate, useRef, useState, VNode, createNode } from "../../../lib/react-phaser";

interface ActivePowerup {
    id: number;
    x: number;
    y: number;
}

export function PowerupSpawner({ powerupsRef }: { powerupsRef: { current: Phaser.Physics.Arcade.Group | null } }): VNode | null {
    const isPlaying = useStore(useGameStore, s => s.isPlaying);
    const lastSpawnRef = useRef(-60000);
    const [activePowerups, setActivePowerups] = useState<ActivePowerup[]>([]);
    const nextIdCounter = useRef(1);

    useUpdate((time, delta) => {
        if (!isPlaying) return;
        const powerupsGroup = powerupsRef.current
        if (!powerupsGroup) return;

        // Cleanup offscreen powerups
        setActivePowerups(prev => {
            const activeObjectMap = new Map<number, boolean>();
            powerupsGroup.children.each((child) => {
                const s = child as Phaser.Physics.Arcade.Sprite;
                const key = (s as any)?.__v_props?.key;
                if (s.active && s.y <= 650 && key !== undefined) activeObjectMap.set(key, true);
                else if (s.y > 650) s.setActive(false).setVisible(false);
                return true;
            });

            const toKeep = prev.filter(p => activeObjectMap.has(p.id));
            return toKeep.length !== prev.length ? toKeep : prev;
        });

        // Spawn logic (after syncing)
        if (time > lastSpawnRef.current + 5000) {
            const x = Phaser.Math.Between(50, 750);
            setActivePowerups(prev => [...prev, {
                id: nextIdCounter.current++,
                x,
                y: -30
            }]);
            lastSpawnRef.current = time;
        }
    });

    // CRITICAL: Use native 'physics-sprite' VNodes directly inside the group,
    // NOT function components. Sprites must be pool members for collision detection.
    return createNode('physics-group', {
        ref: powerupsRef,
        config: { classType: Phaser.Physics.Arcade.Sprite, maxSize: 10 }
    },
        ...activePowerups.map(p => createNode('physics-sprite', {
            key: p.id,
            x: p.x,
            y: p.y,
            texture: "bullet",
            scale: 0.25,
            tint: 0x00ff00,
            velocityY: 100
        }))
    );
}
