import Phaser from "phaser";
import Player from "./Player";

export default class UnderGroundScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;
  
  private activeInteractZone: string = "";

  constructor() {
    super("UnderGroundScene");
  }

  preload() {
    // 1. 加载玩家图纸
    this.load.spritesheet("player", "assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 2. 加载翻滚动画图纸
    this.load.spritesheet("player_roll", "assets/player_roll.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 3. 加载攻击动画图纸
    this.load.spritesheet("player_attack", "assets/player_attack.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 4. 加载敌人图像
    this.load.spritesheet("enemy0", "assets/enemy0.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 5. 加载Boss图像（2列7行，每个32x32）
    this.load.spritesheet("enemy1", "assets/enemy1.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 6. 加载地图资源
    this.load.tilemapTiledJSON("underground", "assets/maps/underground.json");
    this.load.image("terrian-image", "assets/maps/terrian.png");
    
    // 7. 加载UI资源
    this.load.image("heart-full", "assets/ui/heart_full.png");
    this.load.image("heart-half", "assets/ui/heart_half.png");
    this.load.image("heart-empty", "assets/ui/heart_empty.png");
  }

  create() {
    // 创建地图
    this.map = this.make.tilemap({ key: "underground" });
    const tileset = this.map.addTilesetImage("terrian", "terrian-image");
    
    if (!tileset) {
      console.error("图块集加载失败！");
      return;
    }
    
    // 创建地图图层（使用地图中实际存在的图层名称）
    const ground1Layer = this.map.createLayer("Ground1", tileset);
    const ground2Layer = this.map.createLayer("Ground2", tileset);
    
    // 设置图层深度
    if (ground1Layer) ground1Layer.setDepth(0);
    if (ground2Layer) ground2Layer.setDepth(1);
    
    // 创建玩家（根据spawnPoint设置玩家位置）
    let playerX = 400;
    let playerY = 300;
    
    // 从 JSON 地图里，找到对象层 'Triggers'
    const triggerLayer = this.map.getObjectLayer("Triggers");
    
    if (this.scene.settings.data && (this.scene.settings.data as any).spawnPoint) {
      const spawnPoint = (this.scene.settings.data as any).spawnPoint;
      
      // 从触发器对象中找到对应的位置
      if (triggerLayer && triggerLayer.objects) {
        const spawnObject = triggerLayer.objects.find(obj => obj.name === spawnPoint);
        if (spawnObject) {
          playerX = spawnObject.x! + spawnObject.width! / 2;
          playerY = spawnObject.y! + spawnObject.height! / 2;
        }
      }
    }
    
    // 获取hasGauntlet状态（如果有传递）
    const hasGauntlet = this.scene.settings.data && (this.scene.settings.data as any).hasGauntlet || false;
    
    // 创建玩家
    this.player = new Player(this, playerX, playerY, "player", hasGauntlet);
    
    // Ground2图层不设置碰撞体积
    if (ground2Layer) {
      // 不设置碰撞，让玩家可以自由移动
    }
    
    // 相机跟随
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setZoom(5);
    this.cameras.main.setRoundPixels(true);
    
    // 解析触发器
    const interactZones = this.physics.add.staticGroup();
    // 使用之前创建的triggerLayer
    if (triggerLayer && triggerLayer.objects) {
      triggerLayer.objects.forEach(obj => {
        const zone = this.add.zone(obj.x! + obj.width! / 2, obj.y! + obj.height! / 2, obj.width!, obj.height!);
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
    
    // 启动UI场景
    this.scene.launch("UIScene");
  }

  private onInteractZone(_player: any, zone: any) {
    this.activeInteractZone = zone.name;
  }

  private handleInteract() {
    // 从地下到地面
    if (this.activeInteractZone === "ladder_from_overworld") {
      this.switchScene("GameScene", "ladder_to_underground", -16);
    }
    // 从地下到房子
    else if (this.activeInteractZone === "ladder_to_chest") {
      this.switchScene("HouseScene", "ladder_from_underground", -16);
    }
  }

  private switchScene(targetScene: string, spawnPointName: string, offsetX: number) {
    this.player.body!.enable = false;
    this.player.setVelocity(0);
    
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(targetScene, { 
        spawnPoint: spawnPointName, 
        offsetX: offsetX,
        hasGauntlet: this.player.hasGauntlet
      });
    });
  }

  update() {
    if (this.player) {
      this.player.update();
    }
  }
}