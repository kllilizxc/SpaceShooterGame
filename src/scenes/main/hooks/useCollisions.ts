import Phaser from "phaser"
import { useScene, onMount } from "@realiz3r/react-phaser"
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
    enemyProjectilesRef: { current: Phaser.Physics.Arcade.Group | null }
}

export function useCollisions({ playerRef, bulletsRef, enemiesRef, powerupsRef, enemyProjectilesRef }: CollisionProps) {
    const scene = useScene()
    const playerStore = usePlayerStore()
    const gameStore = useGameStore()

    const showLevelUp = () => {
        if (gameStore.isLeveling) return
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
        if (gameStore.isLeveling) return
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
        const enemyProjectiles = enemyProjectilesRef.current

        // Refs should be assigned in the same commit before layout effects flush.
        if (!player || !bullets || !enemies || !powerups || !enemyProjectiles) return

        // Bullets vs Enemies
        const bulletsVsEnemies = scene.physics.add.overlap(bullets, enemies, (bulletObj, enemyObj) => {
            const bullet = bulletObj as ActiveBullet
            const enemy = enemyObj as Phaser.Physics.Arcade.Sprite
            if (!bullet.active || !enemy.active) return
            if (typeof bullet.canHit !== "function" || typeof bullet.getDamage !== "function") return
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
            const powerup = _powerup as Phaser.Physics.Arcade.Sprite
            powerup.setActive(false).setVisible(false)
            if (powerup.body) (powerup.body as Phaser.Physics.Arcade.Body).setEnable(false)
            showLevelUp() // Powerups trigger level up in this game design
        })

        // Player vs Enemy Projectiles
        const playerVsEnemyProjectiles = scene.physics.add.overlap(player, enemyProjectiles, (_player, _proj) => {
            const proj = _proj as Phaser.Physics.Arcade.Sprite
            proj.setActive(false).setVisible(false)
            if (proj.body) (proj.body as Phaser.Physics.Arcade.Body).setEnable(false)
            playerStore.takeDamage(proj.getData("damage") || 10)
            if (playerStore.isDead) showGameOver()
        })

        return () => {
            bulletsVsEnemies.destroy()
            playerVsEnemies.destroy()
            playerVsPowerups.destroy()
            playerVsEnemyProjectiles.destroy()
        }
    })
}
