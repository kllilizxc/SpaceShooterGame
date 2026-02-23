import Phaser from "phaser"
import { useGameStore } from "../stores/game"
import { useStore, useUpdate, useRef, useState, VNode, createNode } from "@realiz3r/react-phaser"

interface EnemyProjectile {
    id: number
    x: number
    y: number
    damage: number
}

const BOSS_TYPES = new Set(['boss', 'boss_mech', 'boss_mech2'])

export function EnemyProjectileSpawner({
    enemiesRef,
    enemyProjectilesRef
}: {
    enemiesRef: { current: Phaser.Physics.Arcade.Group | null }
    enemyProjectilesRef: { current: Phaser.Physics.Arcade.Group | null }
}): VNode | null {
    const isPlaying = useStore(useGameStore, s => s.isPlaying)
    const lastFireRef = useRef(0)
    const nextIdCounter = useRef(1)
    const [projectiles, setProjectiles] = useState<EnemyProjectile[]>([])

    useUpdate((time, delta) => {
        if (!isPlaying) return
        const enemiesGroup = enemiesRef.current
        const projectilesGroup = enemyProjectilesRef.current
        if (!enemiesGroup || !projectilesGroup) return

        // 1) Sync state with active pooled sprites (cleanup happens here).
        if (projectiles.length > 0) {
            const activeIds = new Set<number>()

            projectilesGroup.children.each((child) => {
                const p = child as Phaser.Physics.Arcade.Sprite
                if (p.active && p.y < 700) {
                    const id = p.getData('id')
                    if (typeof id === 'number') activeIds.add(id)
                } else if (p.y >= 700) {
                    p.setActive(false).setVisible(false)
                    if (p.body) (p.body as Phaser.Physics.Arcade.Body).setEnable(false)
                }
                return true
            })

            setProjectiles(prev => {
                if (prev.length === 0) return prev
                const toKeep = prev.filter(p => activeIds.has(p.id))
                return toKeep.length !== prev.length ? toKeep : prev
            })
        }

        // 2) Spawn logic (after syncing so new projectiles aren't immediately culled).
        if (time > lastFireRef.current + 2000) {
            const spawned: EnemyProjectile[] = []

            enemiesGroup.children.each((child) => {
                const enemy = child as Phaser.Physics.Arcade.Sprite
                if (!enemy.active) return true

                const enemyType = enemy.getData('type') as string | undefined
                if (!enemyType || !BOSS_TYPES.has(enemyType)) return true

                const damage = (enemy.getData('damage') as number | undefined) ?? 10
                spawned.push({
                    id: nextIdCounter.current++,
                    x: enemy.x,
                    y: enemy.y + 50,
                    damage
                })
                return true
            })

            if (spawned.length > 0) {
                setProjectiles(prev => [...prev, ...spawned])
            }
            lastFireRef.current = time
        }
    })

    return createNode('physics-group', {
        ref: enemyProjectilesRef,
        config: { classType: Phaser.Physics.Arcade.Sprite, maxSize: 20, defaultKey: 'fire_ball' }
    },
        ...projectiles.map(p => createNode('physics-sprite', {
            key: p.id,
            id: p.id,
            x: p.x,
            y: p.y,
            texture: 'fire_ball',
            play: 'fireBall',
            scale: 0.3,
            bodyWidthRatio: .8,
            bodyHeightRatio: .8,
            velocityY: 200,
            enable: true,
            damage: p.damage
        }))
    )
}
