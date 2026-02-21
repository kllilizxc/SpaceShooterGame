import gameConfig from "../config/game.json"
import { BulletType, BULLET_CONFIGS } from "../scenes/main/components/Bullet"

export interface PowerupDefinition {
  type: string
  name: string
  description: string
  maxLevel: number
  iconFrame: number
}

export interface PlayerUpgrades {
  ownedBullets: BulletType[]
  bulletLevels: Record<string, number>
  healthRegen: number
  maxHealthBonus: number
}

export const GAME_CONFIG = {
  player: {
    maxHealth: gameConfig.player.maxHealth,
    invulnerabilityDuration: gameConfig.player.invulnerabilityDuration,
    damageFromCollision: gameConfig.player.damageFromCollision,
    damageFromMissedEnemy: gameConfig.player.damageFromMissedEnemy,
    moveSpeed: gameConfig.player.moveSpeed
  },
  enemy: {
    spawnInterval: gameConfig.enemy.spawnInterval,
    maxHealth: gameConfig.enemy.maxHealth,
    moveSpeed: gameConfig.enemy.moveSpeed,
    scoreOnKill: gameConfig.enemy.scoreOnKill
  },
  powerup: {
    spawnInterval: gameConfig.powerup.spawnInterval,
    duration: gameConfig.powerup.duration
  },
  levelUp: {
    baseXP: gameConfig.levelUp.baseXP,
    xpScalePerLevel: gameConfig.levelUp.xpScalePerLevel,
    xpFromKill: gameConfig.levelUp.xpFromKill
  }
}

export function getXPForLevel(level: number): number {
  return Math.floor(GAME_CONFIG.levelUp.baseXP * Math.pow(GAME_CONFIG.levelUp.xpScalePerLevel, level - 1))
}

export function getDefaultUpgrades(): PlayerUpgrades {
  return {
    ownedBullets: [BulletType.NORMAL],
    bulletLevels: {
      [BulletType.NORMAL]: 1,
      [BulletType.SPREAD]: 0,
      [BulletType.LASER]: 0,
      [BulletType.PIERCE]: 0
    },
    healthRegen: 0,
    maxHealthBonus: 0
  }
}

export function getAvailablePowerups(upgrades: PlayerUpgrades): PowerupDefinition[] {
  const choices: PowerupDefinition[] = []

  const iconMap: Record<string, number> = {
    [BulletType.NORMAL]: 0,
    [BulletType.SPREAD]: 1,
    [BulletType.LASER]: 2,
    [BulletType.PIERCE]: 3
  }

  // Bullet unlocks (if < 5 kinds total and not owned)
  if (upgrades.ownedBullets.length < 5) {
    for (const type of Object.values(BulletType)) {
      if (!upgrades.ownedBullets.includes(type)) {
        const config = BULLET_CONFIGS[type]
        choices.push({
          type: `unlock_${type}`,
          name: `GET ${config.name} BULLET`,
          description: config.levels["1"].description,
          maxLevel: 1,
          iconFrame: iconMap[type]
        })
      }
    }
  }

  // Bullet upgrades (if owned and level < 5)
  for (const type of upgrades.ownedBullets) {
    const level = upgrades.bulletLevels[type] || 0
    if (level < 5) {
      const config = BULLET_CONFIGS[type]
      const nextLevel = (level + 1).toString()
      choices.push({
        type: `upgrade_${type}`,
        name: `UPGRADE ${config.name} BULLET`,
        description: config.levels[nextLevel].description,
        maxLevel: 5,
        iconFrame: iconMap[type]
      })
    }
  }

  // Misc upgrades
  choices.push({
    type: 'health_regen',
    name: 'HEAL',
    description: 'Restore 25 HP',
    maxLevel: 10,
    iconFrame: 4
  })

  choices.push({
    type: 'max_health_up',
    name: 'MAX HP UP',
    description: '+20 Max HP',
    maxLevel: 5,
    iconFrame: 5
  })

  return choices
}

export function applyUpgrade(upgrades: PlayerUpgrades, powerupType: string): PlayerUpgrades {
  const newUpgrades = { ...upgrades }

  if (powerupType === 'health_regen') {
    newUpgrades.healthRegen += 25
    return newUpgrades
  }

  if (powerupType === 'max_health_up') {
    newUpgrades.maxHealthBonus += 20
    return newUpgrades
  }

  if (powerupType.startsWith('unlock_')) {
    const type = powerupType.replace('unlock_', '') as BulletType
    if (!newUpgrades.ownedBullets.includes(type)) {
      newUpgrades.ownedBullets = [...newUpgrades.ownedBullets, type]
    }
    newUpgrades.bulletLevels[type] = 1
  } else if (powerupType.startsWith('upgrade_')) {
    const type = powerupType.replace('upgrade_', '') as BulletType
    newUpgrades.bulletLevels[type] = Math.min(5, (newUpgrades.bulletLevels[type] || 0) + 1)
  }

  return newUpgrades
}
