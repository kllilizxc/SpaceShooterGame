import Phaser from "phaser"
import { useScene, onMount, useStore } from "../../../lib/react-phaser"
import { usePlayerStore } from "../stores/player"
import { useGameStore } from "../stores/game"
import { createExplosion } from "../components/HUD"
import { GAME_CONFIG } from "../../../config/GameStats"

interface ActiveBullet extends Phaser.Physics.Arcade.Sprite {
    canHit: (target: Phaser.GameObjects.GameObject, time: number) => boolean;
    getDamage: () => number;
}

interface CollisionProps {
    playerRef: { current: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null }
    bulletsRef: { current: Phaser.Physics.Arcade.Group | null }
    enemiesRef: { current: Phaser.Physics.Arcade.Group | null }
    powerupsRef: { current: Phaser.Physics.Arcade.Group | null }
}

export function useCollisions({ playerRef, bulletsRef, enemiesRef, powerupsRef }: CollisionProps) {
    const scene = useScene()
    const playerStore = useStore(usePlayerStore)
    const isLeveling = useStore(useGameStore, s => s.isLeveling)
    const gameStore = useGameStore()

    const showLevelUp = () => {
        if (isLeveling) return
        gameStore.setPhase("leveling")
    }

    const showGameOver = () => {
        gameStore.setPhase("gameover")
        scene.physics.pause()
        const player = playerRef.current
        if (player) player.setTint(0xff0000)

        scene.time.delayedCall(100, () => {
            scene.input.keyboard?.once('keydown', () => {
                scene.scene.restart()
            })
        })
    }

    const addXP = (amount: number) => {
        if (isLeveling) return
        const leveledUp = playerStore.addXP(amount)
        if (leveledUp) {
            showLevelUp()
        }
    }

    onMount(() => {
        const player = playerRef.current
        const bullets = bulletsRef.current
        const enemies = enemiesRef.current
        const powerups = powerupsRef.current

        // Refs should be assigned in the same commit before layout effects flush.
        if (!player || !bullets || !enemies || !powerups) return

        // Bullets vs Enemies
        const bulletsVsEnemies = scene.physics.add.overlap(bullets, enemies, (bulletObj, enemyObj) => {
            const bullet = bulletObj as ActiveBullet
            const enemy = enemyObj as Phaser.Physics.Arcade.Sprite
            if (!bullet.active || !enemy.active) return
            if (!bullet.canHit(enemy, scene.time.now)) return

            let health = enemy.getData("health") - bullet.getDamage()
            enemy.setData("health", health).setTint(0xff0000)
            scene.time.delayedCall(100, () => {
                if (enemy.active) enemy.clearTint()
            })

            let pierce = (bullet.data.get("pierce") || 1) - 1
            bullet.setData("pierce", pierce)
            if (pierce <= 0) {
                bullet.setActive(false).setVisible(false)
                if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).setEnable(false)
            }

            if (health <= 0) {
                createExplosion(scene, enemy.x, enemy.y)
                enemy.setActive(false).setVisible(false)
                if (enemy.body) (enemy.body as Phaser.Physics.Arcade.Body).setEnable(false)
                addXP(GAME_CONFIG.levelUp.xpFromKill)
                playerStore.addScore(enemy.getData("score") || 100)
            }
        })

        // Player vs Enemies
        const playerVsEnemies = scene.physics.add.overlap(player, enemies, (_p, enemyObj) => {
            const enemy = enemyObj as Phaser.Physics.Arcade.Sprite
            if (!enemy.active || playerStore.invulnerable > 0) return
            const score = enemy.getData("score") || 100

            playerStore.addScore(score)
            addXP(Math.floor(score / 2))
            createExplosion(scene, enemy.x, enemy.y)
            enemy.setActive(false).setVisible(false)
            if (enemy.body) (enemy.body as Phaser.Physics.Arcade.Body).setEnable(false)

            playerStore.takeDamage(enemy.getData("damage") || 5)
            if (playerStore.isDead) showGameOver()
        })

        // Player vs Powerups
        const playerVsPowerups = scene.physics.add.overlap(player, powerups, (_p, _powerup) => {
            console.log('POWERUP COLLISION!', _powerup)
            powerups.clear(true, true)
            showLevelUp() // Powerups trigger level up in this game design
        })

        return () => {
            bulletsVsEnemies.destroy()
            playerVsEnemies.destroy()
            playerVsPowerups.destroy()
        }
    })
}
