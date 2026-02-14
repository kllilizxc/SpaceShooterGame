import Phaser from "phaser"

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private bullets!: Phaser.Physics.Arcade.Group
  private lastFired = 0

  constructor() {
    super("MainScene")
  }

  preload() {
    this.load.setBaseURL('https://labs.phaser.io')
    this.load.image('ship', 'assets/sprites/phaser-dude.png')
    this.load.image('bullet', 'assets/sprites/bullets/bullet5.png')
  }

  create() {
    // Player
    this.player = this.physics.add.sprite(400, 500, 'ship')
    this.player.setCollideWorldBounds(true)

    // Bullets
    this.bullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 10
    })

    // Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
    }

    this.add.text(16, 16, 'Arrow keys to move, Space to shoot', { fontSize: '24px', color: '#ffffff' })
  }

  update(time: number) {
    if (!this.cursors) return

    // Movement
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-300)
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(300)
    } else {
      this.player.setVelocityX(0)
    }

    // Shooting
    if (this.cursors.space.isDown && time > this.lastFired) {
      const bullet = this.bullets.get(this.player.x, this.player.y - 20) as Phaser.Physics.Arcade.Image
      
      if (bullet) {
        bullet.setActive(true)
        bullet.setVisible(true)
        bullet.setVelocityY(-400)
        this.lastFired = time + 200
      }
    }

    // Cleanup bullets
    this.bullets.children.each((b) => {
      const bullet = b as Phaser.Physics.Arcade.Image
      if (bullet.active && bullet.y < 0) {
        bullet.setActive(false)
        bullet.setVisible(false)
      }
      return true
    })
  }
}
