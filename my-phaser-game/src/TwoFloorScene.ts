import Phaser from "phaser";
import Player from "./Player";

export default class TwoFloorScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;
  private activeInteractZone: string = "";

  constructor() {
    super("TwoFloorScene");
  }

  preload() {
    // 加载玩家图纸
    this.load.spritesheet("player", "assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // 加载 Tiled 需要的资源
    this.load.image("terrian-image", "assets/maps/terrian.png"); // 加载瓦片图
    this.load.tilemapTiledJSON("house-map", "assets/maps/house.json");
    this.load.tilemapTiledJSON("2floor-map", "assets/maps/2floor.json");
  }

  create() {
    // 1. 生成地图和图块集
    this.map = this.make.tilemap({ key: "2floor-map" });

    const tileset = this.map.addTilesetImage("terrian", "terrian-image");

    if (!tileset) {
      console.error("图块集加载失败！");
      return;
    }

    // 2. 批量渲染 Ground 层
    const groundLayers = ["Ground1", "Ground2"];
    groundLayers.forEach((layerName) => {
      this.map.createLayer(layerName, tileset);
    });

    // 3. 批量渲染 Wall 层
    const wallLayerNames = ["Walls"];
    const collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];

    wallLayerNames.forEach((layerName) => {
      const layer = this.map.createLayer(layerName, tileset);
      if (layer) {
        layer.setCollisionByExclusion([-1]);
        collisionLayers.push(layer);
      }
    });

    // 4. 创建玩家
    // 根据spawnPoint设置玩家位置
    let playerX = 400;
    let playerY = 300;
    
    // 从 JSON 地图里，找到我们刚才建的叫 'Triggers' 的对象层
    const triggerLayer = this.map.getObjectLayer("Triggers");
    
    if (this.scene.settings.data && (this.scene.settings.data as any).spawnPoint) {
      const spawnPoint = (this.scene.settings.data as any).spawnPoint;
      
      // 从触发器对象中找到对应的位置
      if (triggerLayer && triggerLayer.objects) {
        const spawnObject = triggerLayer.objects.find(obj => obj.name === spawnPoint);
        if (spawnObject) {
          playerX = spawnObject.x! + spawnObject.width! / 2;
          playerY = spawnObject.y! + spawnObject.height! / 2;
          
          // 添加偏移量，避免玩家出现在地图外
          if (spawnPoint === "ladder_to_house") {
            playerX -= 30; // 向左偏移30像素
          }
        } else {
          console.warn(`Spawn point ${spawnPoint} not found in TwoFloorScene`);
        }
      } else {
        console.warn("No trigger layer found in TwoFloorScene");
      }
    }
    
    this.player = new Player(this, playerX, playerY, "player");

    // 5. 批量渲染 Above 层
    const aboveLayers = ["Above"];
    aboveLayers.forEach((layerName) => {
      const layer = this.map.createLayer(layerName, tileset);
      layer?.setDepth(9999);
    });

    // 6. 激活全图层的物理碰撞
    this.physics.add.collider(this.player, collisionLayers);

    // 7. 设置世界边界和摄像机
    this.physics.world.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.cameras.main.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setZoom(5);
    this.cameras.main.setRoundPixels(true);

    // 8. 解析 Tiled 里的触发器
    const interactZones = this.physics.add.staticGroup();

    if (triggerLayer && triggerLayer.objects) {
      triggerLayer.objects.forEach((obj) => {
        const zone = this.add.zone(
          obj.x! + obj.width! / 2,
          obj.y! + obj.height! / 2,
          obj.width!,
          obj.height!,
        );

        this.physics.add.existing(zone, true);
        zone.name = obj.name;
        interactZones.add(zone);
      });
    }

    // 交互检测
    this.physics.add.overlap(this.player, interactZones, this.onInteractZone, undefined, this);

    // 交互按键
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-F', () => {
        this.handleInteract();
      });
    }

    this.scene.launch("UIScene");
  }

  update() {
    this.player.update();
  }

  // 交互区域检测
  private onInteractZone(_player: any, zone: any) {
    this.activeInteractZone = zone.name;
  }

  // 交互处理
  private handleInteract() {
    // 返回一楼
    if (this.activeInteractZone === "ladder_to_house") {
      this.switchScene("HouseScene", "ladder_to_2floor");
    }
    // 前往三楼（天桥）
    else if (this.activeInteractZone === "ladder_to_3floor") {
      this.switchScene("GameScene", "trigger_on_bridge");
    }
  }

  // 切换场景的通用方法
  private switchScene(targetScene: string, spawnPoint: string) {
    this.player.body!.enable = false;
    this.player.setVelocity(0);

    this.cameras.main.fadeOut(500, 0, 0, 0);

    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        console.log(`正在前往${targetScene}...`);
        this.scene.start(targetScene, {
          spawnPoint: spawnPoint,
          playerHealth: 3,
        });
      },
    );
  }
}
