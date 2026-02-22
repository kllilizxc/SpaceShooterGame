import Phaser from "phaser"
import { usePlayerStore } from "../stores/player"
import { useGameStore } from "../stores/game"
import { createNode, useEffect, useRef, useState, useStore, useUpdate, VNode } from "../../../lib/react-phaser"

export function HUD(): VNode {
  const player = useStore(usePlayerStore)
  const game = useStore(useGameStore)

  const healthWidth = Math.max(0, player.healthPercent * 200)
  const xpWidth = Math.min(136, player.xpPercent * 136)

  const totalSeconds = Math.floor(game.time / 1000)
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const secs = (totalSeconds % 60).toString().padStart(2, '0')

  // Damage flash overlay (short animation when health decreases)
  const prevHealthRef = useRef(player.health)
  const flashTimeRef = useRef(0)
  const flashPeakRef = useRef(0)
  const [flashAlpha, setFlashAlpha] = useState(0)

  useEffect(() => {
    const prev = prevHealthRef.current
    const next = player.health

    if (next < prev) {
      const damage = prev - next
      const intensity = Math.max(0, Math.min(1, damage / Math.max(1, player.maxHealth)))
      const peak = Math.min(0.85, 0.45 + intensity * 0.4)

      flashPeakRef.current = Math.max(flashPeakRef.current, peak)
      flashTimeRef.current = 0
      setFlashAlpha(flashPeakRef.current)
    }

    prevHealthRef.current = next
  }, [player.health, player.maxHealth])

  useUpdate((_time, delta) => {
    if (flashPeakRef.current <= 0) return

    const durationMs = 220
    flashTimeRef.current += delta
    const t = flashTimeRef.current / durationMs

    if (t >= 1) {
      flashPeakRef.current = 0
      flashTimeRef.current = 0
      setFlashAlpha(0)
      return
    }

    const eased = 1 - t
    const alpha = flashPeakRef.current * eased * eased
    setFlashAlpha(alpha)
  })

  return createNode('container', {},
    // Damage Overlay
    createNode('rect', {
      width: 800, height: 600,
      fill: 0xff0000, alpha: flashAlpha
    }),

    // Top Right: Score
    createNode('text', {
      x: 784, y: 16,
      text: `Score: ${player.score}`,
      fontSize: 24, originX: 1
    }),

    // Top Center: Time & Wave
    createNode('text', { x: 400, y: 16, text: `${mins}:${secs}`, fontSize: 24, originX: 0.5 }),
    createNode('text', { x: 400, y: 44, text: `Wave ${game.wave}`, fontSize: 16, color: '#ff6600', originX: 0.5 }),

    // Top Left: Level & XP
    createNode('text', { x: 16, y: 16, text: `Lv.${player.level}`, fontSize: 24, color: '#ffd700', fontStyle: 'bold' }),
    createNode('text', { x: 80, y: 22, text: `${player.xp}/${player.xpRequired}`, fontSize: 16 }),

    // XP Bar Background
    createNode('rect', { x: 80, y: 45, width: 136, height: 10, fill: 0x444444, strokeWidth: 1, lineColor: 0xffffff }),
    // XP Bar Fill
    createNode('rect', { x: 80, y: 45, width: xpWidth, height: 10, fill: 0xffd700 }),

    // Health Bar Background
    createNode('rect', { x: 16, y: 50, width: 200, height: 20, fill: 0x000000, strokeWidth: 2, lineColor: 0xffffff }),
    // Health Bar Fill
    createNode('rect', { x: 16, y: 50, width: healthWidth, height: 20, fill: 0x00ff00 })
  )
}

// Keep the ephemeral effect function here to be imported by scenes
export function createExplosion(scene: Phaser.Scene, x: number, y: number) {
  const explosion = scene.add.sprite(x, y, 'explosion').setScale(0.2).play('explode')
  explosion.on('animationcomplete', () => explosion.destroy())
}
