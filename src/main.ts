import Phaser from "phaser"
import { MainScene } from "./scenes/MainScene"
import { PreloaderScene } from "./scenes/PreloaderScene"

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#000000",
  dom: {
    createContainer: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: true,
    },
  },
  scene: [PreloaderScene, MainScene],
}

new Phaser.Game(config)

const style = document.createElement("style")
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
  canvas { display: block; }
`
document.head.appendChild(style)
