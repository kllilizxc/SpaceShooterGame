import Phaser from "phaser"
import { GameRoot } from "./main/GameRoot"
import { mountRoot } from "@realiz3r/react-phaser"

export class MainScene extends Phaser.Scene {

  constructor() { super("MainScene") }

  create() {
    mountRoot(this, GameRoot)
  }
}
