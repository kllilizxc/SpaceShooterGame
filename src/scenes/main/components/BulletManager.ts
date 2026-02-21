import Phaser from "phaser"
import { useUpdate, createNode, VNode, useStore, useState, useLayoutEffect } from "../../../lib/react-phaser"
import { useGameStore } from "../stores/game"
import { Bullet, BulletData } from "./Bullet"

export function BulletManager({ bulletsRef, onFireRef }: { bulletsRef: { current: Phaser.Physics.Arcade.Group | null }, onFireRef?: { current: ((data: BulletData) => void) | null } }): VNode {
    const isGameOver = useStore(useGameStore, s => s.isGameOver)
    const isLeveling = useStore(useGameStore, s => s.isLeveling)
    const [bullets, setBullets] = useState<BulletData[]>([])

    useLayoutEffect(() => {
        if (onFireRef) {
            onFireRef.current = (data) => {
                setBullets(prev => [...prev, data])
            }
        }
    }, [onFireRef])

    useUpdate((time, delta) => {
        if (isGameOver || isLeveling) return
        const bulletsGroup = bulletsRef.current
        if (!bulletsGroup) return

        // Sync: If a bullet was deactivated by its own logic (lifespan/boundaries),
        // we should remove it from our state array.
        const activeIds = new Map<number, boolean>()
        bulletsGroup.children.each((child) => {
            const s = child as Phaser.Physics.Arcade.Sprite
            const key = (s as any)?.__v_props?.key
            if (s.active && key !== undefined) activeIds.set(key, true)
            return true
        })

        if (bullets.length > 0) {
            const toKeep = bullets.filter(b => activeIds.has(b.id))
            if (toKeep.length !== bullets.length) {
                setBullets(toKeep)
            }
        }
    })

    return createNode('physics-group', {
        ref: bulletsRef,
        config: { classType: Phaser.Physics.Arcade.Sprite, maxSize: 100, defaultKey: null }
    },
        ...bullets.map(b => createNode(Bullet, {
            key: b.id,
            ...b
        }))
    )
}
