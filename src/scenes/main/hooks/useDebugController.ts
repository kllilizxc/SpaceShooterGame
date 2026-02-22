import Phaser from "phaser"
import { useGameStore } from "../stores/game"
import { usePlayerStore } from "../stores/player"
import { useScene, onMount } from "../../../lib/react-phaser"
import { BulletType } from "../components/Bullet"
import mapConfig from "../../../config/map.json"


interface WaveConfig { startTime: number; spawnInterval: number; enemies: any[] }

export function useDebugController({ playerRef }: { playerRef: { current: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null } }): void {
    const scene = useScene()
    const gameStore = useGameStore()
    const playerStore = usePlayerStore()

    onMount(() => {
        if (!scene.input.keyboard) return
        const kb = scene.input.keyboard

        const showDebugText = (message: string, color: string, fontSize = '24px') => {
            const player = playerRef.current
            if (!player || !player.active) return
            const pos = { x: player.x, y: player.y }
            const text = scene.add.text(pos.x, pos.y - 50, message, { fontSize, color, stroke: '#000000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5)
            scene.tweens.add({ targets: text, alpha: 0, y: text.y - 50, duration: 1000, onComplete: () => text.destroy() })
        }

        const debugSwitchWeapon = (type: BulletType) => {
            playerStore.upgrades.ownedBullets = [type]
            playerStore.upgrades.bulletLevels = { [BulletType.NORMAL]: 0, [BulletType.SPREAD]: 0, [BulletType.LASER]: 0, [BulletType.PIERCE]: 0, [type]: 1 }
            showDebugText(`DEBUG: ${type.toUpperCase()}`, '#ff00ff')
        }

        const debugCycleWeapon = (direction: number) => {
            const types = Object.values(BulletType)
            const current = playerStore.upgrades.ownedBullets[0] || BulletType.NORMAL
            let index = types.indexOf(current) + direction
            if (index < 0) index = types.length - 1
            if (index >= types.length) index = 0
            debugSwitchWeapon(types[index] as BulletType)
        }

        const debugChangeLevel = (delta: number) => {
            const current = playerStore.upgrades.ownedBullets[0] || BulletType.NORMAL
            const newLevel = (playerStore.upgrades.bulletLevels[current] || 0) + delta
            if (newLevel < 0 || newLevel > 5) return
            playerStore.upgrades.bulletLevels[current] = newLevel
            showDebugText(`DEBUG: ${current.toUpperCase()} Lv.${newLevel}`, '#00ffff')
        }

        const debugSwitchWave = (direction: number) => {
            const waves = mapConfig.waves as WaveConfig[]
            const newWave = gameStore.wave + direction
            if (newWave < 1 || newWave > waves.length) return
            gameStore.setWave(newWave)
            gameStore.time = waves[newWave - 1].startTime
            showDebugText(`DEBUG: WAVE ${newWave}`, '#ff6600', '48px')
        }

        const keys = [
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.I).on('down', () => debugCycleWeapon(-1)),
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.K).on('down', () => debugCycleWeapon(1)),
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.J).on('down', () => debugChangeLevel(1)),
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.L).on('down', () => debugChangeLevel(-1)),
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.O).on('down', () => debugSwitchWave(-1)),
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', () => debugSwitchWave(1))
        ];

        [[1, BulletType.NORMAL], [2, BulletType.SPREAD], [3, BulletType.LASER], [4, BulletType.PIERCE]].forEach(([n, t]) => {
            const keyName = n === 1 ? 'ONE' : n === 2 ? 'TWO' : n === 3 ? 'THREE' : 'FOUR'
            keys.push(kb.addKey(Phaser.Input.Keyboard.KeyCodes[keyName as keyof typeof Phaser.Input.Keyboard.KeyCodes]).on('down', () => debugSwitchWeapon(t as BulletType)))
        })

        return () => {
            // cleanup keys
            keys.forEach(k => {
                k.removeAllListeners()
                kb.removeKey(k)
            })
        }
    })
}
