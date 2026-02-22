import Phaser from "phaser"

export class PreloaderScene extends Phaser.Scene {
  constructor() {
    super("PreloaderScene")
  }

  preload() {
    // Background
    this.load.image('background', window.location.origin + '/assets/generated/spritesheet-n60ktt-1024x1024-1x1.png')
    
    // Player ship variations
    this.load.spritesheet('shipIdle', window.location.origin + '/assets/generated/spritesheet-rct9iu-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('shipStrafeLeft', window.location.origin + '/assets/generated/ship_strafe_left-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('shipUp', window.location.origin + '/assets/generated/spritesheet-45q6cd-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('shipDown', window.location.origin + '/assets/generated/spritesheet-f5q11b-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    
    // Combat assets
    this.load.image('bullet_static', window.location.origin + '/assets/generated/spritesheet-7o7ate-1024x1024-4x4.png')
    this.load.spritesheet('bullet', window.location.origin + '/assets/generated/spritesheet-7o7ate-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('bullet_spread', window.location.origin + '/assets/generated/bullet_spread_v2-1024x1024-2x2.png', { frameWidth: 512, frameHeight: 512 })
    this.load.spritesheet('bullet_laser', window.location.origin + '/assets/generated/bullet_laser-1024x1024-2x2.png', { frameWidth: 512, frameHeight: 512 })
    this.load.spritesheet('bullet_pierce', window.location.origin + '/assets/generated/bullet_pierce_v2-1024x1024-2x2.png', { frameWidth: 512, frameHeight: 512 })
    this.load.spritesheet('enemy', window.location.origin + '/assets/generated/spritesheet-91e2mg-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('enemy_fast', window.location.origin + '/assets/generated/enemy_fast-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('enemy_tank', window.location.origin + '/assets/generated/enemy_tank-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('enemy_heavy', window.location.origin + '/assets/generated/enemy_heavy_v3-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('enemy_boss', window.location.origin + '/assets/generated/enemy_boss_v2-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('enemy_boss_mech', window.location.origin + '/assets/generated/enemy_boss_mech-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('enemy_boss_mech2', window.location.origin + '/assets/generated/enemy_boss_mech_v2-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('fire_ball', window.location.origin + '/assets/generated/fire_ball-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    this.load.spritesheet('explosion', window.location.origin + '/assets/generated/spritesheet-o2qwo8-1024x1024-4x4.png', { frameWidth: 256, frameHeight: 256 })
    
    // UI Icons
    this.load.spritesheet('upgrade_icons', window.location.origin + '/assets/generated/upgrade_icons-1024x1024-3x3.png', { frameWidth: 341, frameHeight: 341 })

    // Progress bar
    const width = this.cameras.main.width
    const height = this.cameras.main.height
    const progressBar = this.add.graphics()
    const progressBox = this.add.graphics()
    progressBox.fillStyle(0x222222, 0.8)
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50)

    this.load.on('progress', (value: number) => {
      progressBar.clear()
      progressBar.fillStyle(0xffffff, 1)
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30)
    })

    this.load.on('complete', () => {
      progressBar.destroy()
      progressBox.destroy()
    })
  }

  create() {
    // Create all animations once here
    this.anims.create({
      key: 'flyIdle',
      frames: this.anims.generateFrameNumbers('shipIdle', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'flyStrafeLeft',
      frames: this.anims.generateFrameNumbers('shipStrafeLeft', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'flyUp',
      frames: this.anims.generateFrameNumbers('shipUp', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'flyDown',
      frames: this.anims.generateFrameNumbers('shipDown', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'bulletFire_normal',
      frames: this.anims.generateFrameNumbers('bullet', { start: 0, end: 3 }),
      frameRate: 15,
      repeat: -1
    })

    this.anims.create({
      key: 'bulletFire_spread',
      frames: this.anims.generateFrameNumbers('bullet_spread', { start: 0, end: 3 }),
      frameRate: 15,
      repeat: -1
    })

    this.anims.create({
      key: 'bulletFire_laser',
      frames: this.anims.generateFrameNumbers('bullet_laser', { start: 0, end: 3 }),
      frameRate: 15,
      repeat: -1
    })

    this.anims.create({
      key: 'bulletFire_pierce',
      frames: this.anims.generateFrameNumbers('bullet_pierce', { start: 0, end: 3 }),
      frameRate: 15,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly',
      frames: this.anims.generateFrameNumbers('enemy', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly_fast',
      frames: this.anims.generateFrameNumbers('enemy_fast', { start: 0, end: 3 }),
      frameRate: 15,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly_tank',
      frames: this.anims.generateFrameNumbers('enemy_tank', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly_heavy',
      frames: this.anims.generateFrameNumbers('enemy_heavy', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly_boss',
      frames: this.anims.generateFrameNumbers('enemy_boss', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly_boss_mech',
      frames: this.anims.generateFrameNumbers('enemy_boss_mech', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'enemyFly_boss_mech2',
      frames: this.anims.generateFrameNumbers('enemy_boss_mech2', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    })

    this.anims.create({
      key: 'fireBall',
      frames: this.anims.generateFrameNumbers('fire_ball', { start: 0, end: 3 }),
      frameRate: 15,
      repeat: -1
    })

    this.anims.create({
      key: 'explode',
      frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 15 }),
      frameRate: 15,
      repeat: 0
    })

    this.scene.start('MainScene')
  }
}
