import Phaser from "phaser"
import { BulletType, BULLET_CONFIGS } from "../components/Bullet"
import { GAME_CONFIG } from "../../../config/GameStats"
import { usePlayerStore } from "../stores/player"
import { useGameStore } from "../stores/game"
import { useUpdate, useRef, onMount, useScene } from "@realiz3r/react-phaser"

interface PlayerControllerProps {
  playerRef: { current: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null }
  onFire?: (data: any) => void
}

export function usePlayerController({ playerRef, onFire }: PlayerControllerProps): void {
  const scene = useScene()
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()

  const keysRef = useRef<{ w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key } | null>(null)
  const lastFiredRef = useRef<Record<string, number>>({})
  const bulletIdContainer = useRef(0)

  onMount(() => {
    if (scene.input.keyboard) {
      keysRef.current = {
        w: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      }
    }
  })

  useUpdate((time, delta) => {
    if (!gameStore.isPlaying) return
    const player = playerRef.current
    if (!player || !player.active) return

    // 1. Handle Movement
    let vx = 0, vy = 0
    const speed = GAME_CONFIG.player.moveSpeed
    const keys = keysRef.current

    if (keys) {
      if (keys.w.isDown) vy -= speed
      if (keys.s.isDown) vy += speed
      if (keys.a.isDown) vx -= speed
      if (keys.d.isDown) vx += speed
    }

    if (vx === 0 && vy === 0) {
      const pointer = scene.input.activePointer
      const dist = Phaser.Math.Distance.Between(player.x, player.y, pointer.x, pointer.y)
      if (dist > 10) {
        const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.x, pointer.y)
        vx = Math.cos(angle) * speed
        vy = Math.sin(angle) * speed
      }
    }

    player.setVelocity(vx, vy)

    const isMoving = vx !== 0 || vy !== 0
    const anims = isMoving
      ? (Math.abs(vx) > Math.abs(vy)
        ? ['shipStrafeLeft', 'flyStrafeLeft', vx < 0]
        : [vy < 0 ? 'shipUp' : 'shipDown', vy < 0 ? 'flyUp' : 'flyDown', false])
      : ['shipIdle', 'flyIdle', false]

    if (player.texture.key !== anims[0]) {
      player.setTexture(anims[0] as string).play(anims[1] as string)
    }
    player.setFlipX(anims[2] as boolean)

    // 2. Handle Shooting
    const upgrades = playerStore.upgrades
    for (const type of upgrades.ownedBullets) {
      const level = upgrades.bulletLevels[type]
      if (level <= 0) continue

      const config = BULLET_CONFIGS[type]
      const levelData = config.levels[level.toString()]

      if (onFire && time > (lastFiredRef.current[type] || 0)) {
        const spread = levelData.spread
        const centerOffset = -(spread.count - 1) * spread.angleOffset / 2

        for (let i = 0; i < spread.count; i++) {
          const angleOffset = centerOffset + i * spread.angleOffset
          onFire({
            id: ++bulletIdContainer.current,
            x: player.x,
            y: player.y - 20,
            angleOffset,
            bulletType: type,
            level,
            owner: player
          })
        }
        lastFiredRef.current[type] = time + levelData.fireRate
      }
    }

    // 3. Handle Invulnerability
    player.setAlpha(playerStore.invulnerable > 0 ? 0.5 : 1)
  })
}
