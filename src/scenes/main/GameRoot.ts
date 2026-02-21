import { createNode, useStore, VNode, useScene, useEffect, useState } from "../../lib/react-phaser"
import { useGameStore } from "./stores/game"
import { HUD } from "./components/HUD"
import { LevelUpPanel } from "./components/LevelUpPanel"
import { usePlayerStore } from "./stores/player"
import { usePlayerController } from "./hooks/usePlayerController"
import { EnemySpawner } from "./components/EnemySpawner"
import { PowerupSpawner } from "./components/PowerupSpawner"
import { useDebugController } from "./hooks/useDebugController"
import { useGameLifecycle } from "./hooks/useGameLifecycle"
import { useCollisions } from "./hooks/useCollisions"
import { BulletManager } from "./components/BulletManager"

function GameOverScreen(): VNode | null {
    const isGameOver = useStore(useGameStore, s => s.isGameOver)
    const game = useStore(useGameStore)
    const player = useStore(usePlayerStore)

    if (!isGameOver) return null

    const totalSeconds = Math.floor(game.time / 1000)
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const secs = (totalSeconds % 60).toString().padStart(2, '0')

    return createNode('container', {},
        createNode('text', { x: 400, y: 300, text: 'GAME OVER', fontSize: 64, color: '#ff0000', fontStyle: 'bold', originX: 0.5, originY: 0.5 }),
        createNode('text', { x: 400, y: 370, text: `Final Level: ${player.level}`, fontSize: 24, color: '#ffffff', originX: 0.5, originY: 0.5 }),
        createNode('text', { x: 400, y: 410, text: `Time Survived: ${mins}:${secs}`, fontSize: 24, color: '#ffffff', originX: 0.5, originY: 0.5 }),
        createNode('text', { x: 400, y: 450, text: 'Press any key to Restart', fontSize: 24, color: '#ffffff', originX: 0.5, originY: 0.5 })
    )
}

function usePhysicsController(): void {
    const scene = useScene()
    const isPlaying = useStore(useGameStore, s => s.isPlaying)

    useEffect(() => {
        if (isPlaying) {
            scene.physics.resume()
        } else {
            scene.physics.pause()
        }
    }, [isPlaying])
}

export function GameRoot(props: any): VNode {
    const scene = useScene()

    // Direct Object Nodes! Goodbye refs! Instantiating without adding to scene yet.
    const [player] = useState(() => {
        const p = new Phaser.Physics.Arcade.Sprite(scene, 400, 500, 'shipIdle') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
        scene.physics.world.enableBody(p, 0) // 0 = DYNAMIC_BODY
        return p
    })
    const [bullets] = useState(() => new Phaser.Physics.Arcade.Group(scene.physics.world, scene, { classType: Phaser.Physics.Arcade.Sprite, maxSize: 100, defaultKey: null }))
    const [enemies] = useState(() => new Phaser.Physics.Arcade.Group(scene.physics.world, scene, { defaultKey: 'enemy', maxSize: 20 }))
    const [powerups] = useState(() => new Phaser.Physics.Arcade.Group(scene.physics.world, scene, { maxSize: 10 }))

    // Effect hooks (Logic only, no rendering)
    usePhysicsController()
    useGameLifecycle()

    const [fireRef] = useState(() => ({ current: null as any }))

    useCollisions({
        player,
        bullets,
        enemies,
        powerups
    })

    usePlayerController({
        player,
        onFire: (data) => fireRef.current?.(data)
    })
    useDebugController({ player })

    return createNode('container', {},
        // Background
        createNode('image', { x: 400, y: 300, texture: 'background' }),

        // Physics Components (Delegated logical management)
        createNode(BulletManager, { bulletsGroup: bullets, onFireRef: fireRef }),
        createNode(EnemySpawner, { enemiesGroup: enemies }),
        createNode(PowerupSpawner, { powerupsGroup: powerups }),

        // The Player Object
        createNode(player, {
            texture: 'shipIdle',
            play: 'flyIdle',
            scale: 0.25,
            collideWorldBounds: true
        }),

        // UI Components
        createNode(HUD, {}),
        createNode(LevelUpPanel, {}),
        createNode(GameOverScreen, {})
    )
}
