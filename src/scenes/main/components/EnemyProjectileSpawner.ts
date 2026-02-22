import Phaser from "phaser"
import { useGameStore } from "../stores/game"
import { useStore, useUpdate, useRef, useState, VNode, createNode } from "@realiz3r/react-phaser"

interface EnemyProjectile {
    id: number
    x: number
    y: number
    damage: number
}

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

        // Find boss enemies and fire
        if (time > lastFireRef.current + 2000) {
            const bossTypes = ['boss', 'boss_mech', 'boss_mech2']
            enemiesGroup.children.each((child) => {
                const enemy = child as Phaser.Physics.Arcade.Sprite
                const enemyType = enemy.getData('type') as string
                if (enemy.active && bossTypes.includes(enemyType)) {
                    console.log('FIRE from', enemyType)
                    setProjectiles(prev => [...prev, {
                        id: nextIdCounter.current++,
                        x: enemy.x,
                        y: enemy.y + 50,
                        damage: enemy.getData('damage') || 10
                    }])
                }
                return true
            })
            lastFireRef.current = time
        }

        console.log('PROJ_STATE:', projectiles.length)

        // Cleanup offscreen projectiles
        setProjectiles((prev: EnemyProjectile[]) => {
            const activeMap = new Map<number, boolean>()
            projectilesGroup.children.each((child) => {
                const p = child as Phaser.Physics.Arcade.Sprite
                const id = p.getData('id') as number | undefined
                if (p.active && p.y < 700 && id !== undefined) activeMap.set(id, true)
                else if (p.y >= 700) p.setActive(false).setVisible(false)
                return true
            })
            return prev.filter(p => activeMap.has(p.id))
        })
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
            velocityY: 200,
            enable: true,
            damage: p.damage
        }))
    )
}
