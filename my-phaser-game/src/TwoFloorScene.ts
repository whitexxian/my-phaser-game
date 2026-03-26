import Phaser from "phaser";
import Player from "./Player";

export default class TwoFloorScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;
  private activeInteractZone: string = "";
  private interactZones!: Phaser.Physics.Arcade.StaticGroup;
  private flyPet: Phaser.GameObjects.Sprite | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private isFlyFlipped: boolean = false;

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
    this.load.image("bed-image", "assets/maps/bed.png");
    this.load.tilemapTiledJSON("house-map", "assets/maps/house.json");
    this.load.tilemapTiledJSON("2floor-map", "assets/maps/2floor.json");
    
    // 加载苍蝇飞行动作帧
    this.load.spritesheet("fly", "assets/fly.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create() {
    // 1. 生成地图和图块集
    this.map = this.make.tilemap({ key: "2floor-map" });

    const tileset = this.map.addTilesetImage("terrian", "terrian-image");
    const bedTileset = this.map.addTilesetImage("bed", "bed-image");

    if (!tileset) {
      console.error("图块集加载失败！");
      return;
    }

    // 2. 批量渲染 Ground 层
    const groundLayers = ["Ground1", "Ground2"];
    groundLayers.forEach((layerName) => {
      this.map.createLayer(layerName, tileset);
    });

    // 3. 批量渲染 Wall 层（使用多个tileset）
    const wallLayerNames = ["Walls"];
    const collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];

    wallLayerNames.forEach((layerName) => {
      // 尝试直接使用bed图块集创建层
      if (bedTileset && layerName === "Walls") {
        const layer = this.map.createLayer(layerName, [tileset, bedTileset]);
        if (layer) {
          layer.setCollisionByExclusion([-1]);
          collisionLayers.push(layer);
        }
      } else {
        const layer = this.map.createLayer(layerName, tileset);
        if (layer) {
          layer.setCollisionByExclusion([-1]);
          collisionLayers.push(layer);
        }
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
          
          // 添加偏移量，避免玩家出现在地图外或与物体重叠
          if (spawnPoint === "ladder_to_house") {
            playerX -= 30; // 向左偏移30像素
          } else if (spawnPoint === "bed") {
            playerX += 20; // 在篝火右侧30像素处重生
            playerY += 5;
          }
        } else {
          console.warn(`Spawn point ${spawnPoint} not found in TwoFloorScene`);
        }
      } else {
        console.warn("No trigger layer found in TwoFloorScene");
      }
    }
   // 获取hasGauntlet状态和playerHealth（如果有传递）
    const hasGauntlet = this.scene.settings.data && (this.scene.settings.data as any).hasGauntlet || false;
    const hasFly = this.scene.settings.data && (this.scene.settings.data as any).hasFly || false;
    const playerHealth = this.scene.settings.data && (this.scene.settings.data as any).playerHealth || 3; // 默认3格血
    const playerMaxHealth = this.scene.settings.data && (this.scene.settings.data as any).playerMaxHealth || 3; // 默认3格血
    
    // 创建玩家
    this.player = new Player(this, playerX, playerY, "player", hasGauntlet, playerHealth, playerMaxHealth, hasFly);
    
    // 发送全局事件更新UI血量和最大血量显示
    this.game.events.emit("update-health", this.player.health);
    this.game.events.emit("update-max-health", this.player.maxHealth, this.player.health);
    
    // 创建苍蝇（如果玩家已经有苍蝇）
    if (this.player.hasFly) {
        this.flyPet = this.add.sprite(this.player.x, this.player.y, 'fly').setScale(0.5);
        // 苍蝇动画（2x4网格，8帧）
        this.anims.create({
            key: 'fly-flap',
            frames: this.anims.generateFrameNumbers('fly', { start: 0, end: 7 }),
            frameRate: 10,
            repeat: -1
        });
        this.flyPet.anims.play('fly-flap', true);
        // 设置图层深度高于玩家
        this.flyPet.setDepth(10);
    }
    
    // 创建黑屏覆盖层（初始完全不透明）
    const blackScreen = this.add.rectangle(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        this.cameras.main.width,
        this.cameras.main.height,
        0x000000,
        1
    );
    blackScreen.setDepth(10000);
    
    // 黑屏淡出
    this.tweens.add({
        targets: blackScreen,
        alpha: 0,
        duration: 500,
        onComplete: () => {
            blackScreen.destroy();
        }
    });
    
    // 手动渲染bed图像（因为bed图块集渲染有问题）
    const bedObject = triggerLayer?.objects.find(obj => obj.name === 'bed');
    if (bedObject) {
        const bedImage = this.add.image(
            bedObject.x! + bedObject.width! / 2,
            bedObject.y! + bedObject.height! / 2,
            'bed-image'
        );
        bedImage.setScale(1); // 调整缩放以匹配图块大小
        bedImage.setDepth(1);
    }

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
    this.interactZones = this.physics.add.staticGroup();

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
        this.interactZones.add(zone);
      });
    }

    // 交互检测
    this.physics.add.overlap(this.player, this.interactZones, this.onInteractZone, undefined, this);

    // 交互按键
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-F', () => {
        this.handleInteract();
      });
    }

    this.scene.launch("UIScene");
    
    // 初始化键盘输入
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as any;
  }

  update() {
    // 在每帧开始时重置交互区域
    this.activeInteractZone = "";
    
    // 手动检查玩家是否在交互区域内
    if (this.interactZones) {
        this.interactZones.getChildren().forEach((zone: any) => {
            if (Phaser.Geom.Rectangle.Overlaps(this.player.getBounds(), zone.getBounds())) {
                this.activeInteractZone = zone.name;
            }
        });
    }
    
    this.player.update();
    
    // 苍蝇跟随玩家
    if (this.flyPet) {
        // 只有在键盘状态改变时更新状态
        if (this.cursors.left.isDown || this.wasd.A.isDown) {
            // 输入左时，保持默认（不镜像）
            this.isFlyFlipped = false;
        } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
            // 输入右时，保持镜像
            this.isFlyFlipped = true;
        }
        
        // 苍蝇飞在玩家头顶偏右后方（距离更近）
        const targetX = this.player.x + (this.isFlyFlipped ? -10 : 10);
        const targetY = this.player.y - 15;
        
        // Lerp (线性插值)：让苍蝇有弹性地平滑跟随
        this.flyPet.x += (targetX - this.flyPet.x) * 0.05;
        this.flyPet.y += (targetY - this.flyPet.y) * 0.05;
        
        // 根据状态设置苍蝇镜像
        this.flyPet.setFlipX(this.isFlyFlipped);
    }
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
    // 休息（篝火系统）
    else if (this.activeInteractZone === "bed") {
      this.restAtBed();
    }
  }
  
  // 在bed处休息
  private restAtBed() {
    console.log("在bed处休息...");
    
    // 回满血量（使用最大血量）
    this.player.health = this.player.maxHealth;
    this.game.events.emit('update-health', this.player.health);
    
    // 保存重生点到全局状态
    if (!(this.game as any).globalState) {
      (this.game as any).globalState = {};
    }
    (this.game as any).globalState.lastRestPoint = {
      scene: "TwoFloorScene",
      spawnPoint: "bed"
    };
    
    // 重置死亡记录，这样所有怪物都会刷新
    (this.game as any).globalState.deadMonsters = {
      enemy0: false,
      boss: false
    };
    
    // 刷新所有怪物（通过重启场景实现）
    console.log("刷新所有怪物...");
    
    // 刷新当前场景
    this.scene.restart({
      spawnPoint: "bed",
      hasGauntlet: this.player.hasGauntlet,
      playerHealth: this.player.maxHealth,
      playerMaxHealth: this.player.maxHealth,
      shouldRespawnMonsters: true
    });
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
          playerHealth: this.player.health,
          playerMaxHealth: this.player.maxHealth,
          hasGauntlet: this.player.hasGauntlet,
          hasFly: this.player.hasFly,
        });
      },
    );
  }
}
