import { createNode, useStore, VNode, useScene, useEffect, useRef } from "../../lib/react-phaser"
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
    const playerRef = useRef<Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null>(null)
    const bulletsRef = useRef<Phaser.Physics.Arcade.Group | null>(null)
    const enemiesRef = useRef<Phaser.Physics.Arcade.Group | null>(null)
    const powerupsRef = useRef<Phaser.Physics.Arcade.Group | null>(null)

    // Effect hooks (Logic only, no rendering)
    usePhysicsController()
    useGameLifecycle()

    const fireRef = useRef<((data: any) => void) | null>(null)

    useCollisions({
        playerRef,
        bulletsRef,
        enemiesRef,
        powerupsRef
    })

    usePlayerController({
        playerRef,
        onFire: (data) => fireRef.current?.(data)
    })
    useDebugController({ playerRef })

    return createNode('container', {},
        // Background
        createNode('image', { x: 400, y: 300, texture: 'background' }),

        // Physics Components (Delegated logical management)
        createNode(BulletManager, { bulletsRef, onFireRef: fireRef }),
        createNode(EnemySpawner, { enemiesRef }),
        createNode(PowerupSpawner, { powerupsRef }),

        // The Player Object
        createNode('physics-sprite', {
            ref: playerRef,
            x: 400,
            y: 500,
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
