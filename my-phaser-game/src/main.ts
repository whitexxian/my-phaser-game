import Phaser from "phaser";
import GameScene from "./GameScene";
import HouseScene from "./HouseScene";
import TwoFloorScene from "./TwoFloorScene";
import UnderGroundScene from "./UnderGroundScene";
import UIScene from "./UIScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: "#2d2d2d",
  pixelArt: true,
  parent: "app",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false // 保持开启，方便观察碰撞框
    },
  },
  scene: [GameScene, HouseScene, TwoFloorScene, UnderGroundScene, UIScene],
};

new Phaser.Game(config);
