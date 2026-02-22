import Phaser from "phaser"
import mapConfig from "../../../config/map.json"
import enemyConfig from "../../../config/enemies.json"
import { useGameStore } from "../stores/game"
import { usePlayerStore } from "../stores/player"
import { useStore, useUpdate, useRef, useState, VNode, createNode } from "../../../lib/react-phaser"

interface WaveEnemy { type: string; weight: number }
interface WaveConfig { startTime: number; spawnInterval: number; enemies: WaveEnemy[] }

interface ActiveEnemy {
  id: number;
  x: number;
  y: number;
  type: string;
  stats: any;
}

export function EnemySpawner({ enemiesRef }: { enemiesRef: { current: Phaser.Physics.Arcade.Group | null } }): VNode | null {
  const isPlaying = useStore(useGameStore, s => s.isPlaying)
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const lastSpawnRef = useRef(0)

  const [activeEnemies, setEnemies] = useState<ActiveEnemy[]>([])
  const nextIdCounter = useRef(1)

  useUpdate((time, delta) => {
    if (!isPlaying) return
    const enemiesGroup = enemiesRef.current
    if (!enemiesGroup) return

    // Find current wave config
    const waves = mapConfig.waves as WaveConfig[]
    const currentWave = waves[gameStore.wave - 1] || waves[0]

    // 1. Check for offscreen enemies and apply damage (Side effect)
    let damageToTake = 0
    enemiesGroup.children.each((child) => {
      const phaserSprite = child as Phaser.Physics.Arcade.Sprite
      if (phaserSprite.active && phaserSprite.y > 650) {
        damageToTake += phaserSprite.getData("damage") || 5
        phaserSprite.setActive(false).setVisible(false)
      }
      return true
    })
    if (damageToTake > 0) playerStore.takeDamage(damageToTake)

    // 2. Sync state array to Phaser's active objects
    setEnemies(prev => {
      const activeObjectMap = new Map<number, boolean>()
      enemiesGroup.children.each((child) => {
        const s = child as Phaser.Physics.Arcade.Sprite
        const key = (s as any)?.__v_props?.key
        if (s.active && key !== undefined) activeObjectMap.set(key, true)
        return true
      })

      const toKeep = prev.filter(e => activeObjectMap.has(e.id))
      return toKeep.length !== prev.length ? toKeep : prev
    })

    // 3. Spawn logic (after syncing)
    if (time > lastSpawnRef.current + currentWave.spawnInterval) {
      const type = pickEnemyType(currentWave.enemies)
      const stats = (enemyConfig.types as Record<string, any>)[type]
      const x = Phaser.Math.Between(50, 750)

      setEnemies(prev => [...prev, {
        id: nextIdCounter.current++,
        x,
        y: -50,
        type,
        stats
      }])

      lastSpawnRef.current = time
    }
  })

  // CRITICAL: Use native 'physics-sprite' VNodes directly inside the group,
  // NOT function components. Function components create sprites outside the group,
  // breaking collision detection.
  return createNode('physics-group', {
    ref: enemiesRef,
    config: { classType: Phaser.Physics.Arcade.Sprite, defaultKey: 'enemy', maxSize: 20 }
  },
    ...activeEnemies.map(enemy => {
      const { stats, type } = enemy
      return createNode('physics-sprite', {
        key: enemy.id,
        x: enemy.x,
        y: enemy.y,
        texture: stats.spritePath,
        play: type === 'basic' ? 'enemyFly' : `enemyFly_${type}`,
        velocityY: stats.speed,
        scale: stats.scale,
        rotation: (type === 'tank' || type === 'fast') ? Math.PI / 2 : 0,
        health: stats.health,
        damage: stats.damage,
        score: stats.score
      })
    })
  )
}

function pickEnemyType(enemies: WaveEnemy[]): string {
  const total = enemies.reduce((sum, e) => sum + e.weight, 0)
  let random = Math.random() * total
  for (const e of enemies) {
    random -= e.weight
    if (random <= 0) return e.type
  }
  return enemies[0].type
}
