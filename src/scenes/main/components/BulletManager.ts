import { useUpdate, createNode, VNode, useStore, useState, useEffect } from "../../../lib/react-phaser"
import { useGameStore } from "../stores/game"
import { Bullet, BulletData } from "./Bullet"

export function BulletManager({ bulletsGroup, onFireRef }: { bulletsGroup: Phaser.Physics.Arcade.Group, onFireRef?: { current: ((data: BulletData) => void) | null } }): VNode {
    const isGameOver = useStore(useGameStore, s => s.isGameOver)
    const isLeveling = useStore(useGameStore, s => s.isLeveling)
    const [bullets, setBullets] = useState<BulletData[]>([])

    useEffect(() => {
        if (onFireRef) {
            onFireRef.current = (data) => {
                setBullets(prev => [...prev, data])
            }
        }
    }, [onFireRef])

    useUpdate((time, delta) => {
        if (isGameOver || isLeveling) return

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

    return createNode(bulletsGroup, {},
        ...bullets.map(b => createNode(Bullet, {
            key: b.id,
            ...b
        }))
    )
}
