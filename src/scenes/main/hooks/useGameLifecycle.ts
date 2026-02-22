import { onMount, useUpdate } from "../../../lib/react-phaser"
import { useGameStore } from "../stores/game"
import { usePlayerStore } from "../stores/player"
import { Bullet } from "../components/Bullet"
import Phaser from "phaser"
import mapConfig from "../../../config/map.json"

interface WaveEnemy { type: string; weight: number }
interface WaveConfig { startTime: number; spawnInterval: number; enemies: WaveEnemy[] }

export function useGameLifecycle() {
    const gameStore = useGameStore()
    const playerStore = usePlayerStore()

    onMount(() => {
        gameStore.reset()
        playerStore.reset()
    })

    useUpdate((time, delta) => {
        if (gameStore.isGameOver || gameStore.isLeveling) return

        gameStore.updateTime(delta)
        playerStore.updateInvulnerability(delta)

        // Wave progression
        const waves = mapConfig.waves as WaveConfig[]
        let waveNum = 1
        for (let i = 0; i < waves.length; i++) {
            if (gameStore.time >= waves[i].startTime) {
                waveNum = i + 1
            } else break
        }
        if (gameStore.wave !== waveNum) {
            gameStore.setWave(waveNum)
        }
    })
}
