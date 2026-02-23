import Phaser from "phaser";
import { useGameStore } from "../stores/game";
import { useEffect, useStore, useUpdate, useRef, useState, VNode, createNode } from "@realiz3r/react-phaser";

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

    // When leaving the playing phase (level-up/gameover), clear state so the reconciler
    // can properly deactivate pooled sprites (avoid mutating the group directly elsewhere).
    useEffect(() => {
        if (isPlaying) return
        setActivePowerups(prev => (prev.length > 0 ? [] : prev))
    }, [isPlaying])

    useUpdate((time, delta) => {
        if (!isPlaying) return;
        const powerupsGroup = powerupsRef.current
        if (!powerupsGroup) return;

        // Cleanup offscreen powerups
        setActivePowerups(prev => {
            const activeObjectMap = new Map<number, boolean>();
            powerupsGroup.children.each((child) => {
                const s = child as Phaser.Physics.Arcade.Sprite;
                const id = s.getData("id") as number | undefined;
                if (s.active && s.y <= 650 && id !== undefined) activeObjectMap.set(id, true);
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

    // Children must resolve to a single 'physics-sprite' so the group can pool/reuse sprites.
    return createNode('physics-group', {
        ref: powerupsRef,
        config: { classType: Phaser.Physics.Arcade.Sprite, maxSize: 10 }
    },
        ...activePowerups.map(p => createNode('physics-sprite', {
            key: p.id,
            id: p.id,
            x: p.x,
            y: p.y,
            texture: "powerup",
            play: "powerupPulse",
            scale: 0.28,
            velocityY: 100
        }))
    );
}
