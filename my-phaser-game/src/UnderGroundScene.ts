import Phaser from "phaser";
import Player from "./Player";

export default class UnderGroundScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;
  
  private activeInteractZone: string = "";
  private interactZones!: Phaser.Physics.Arcade.StaticGroup;
  private openedChests: Set<string> = new Set();
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
    
    // 8. 加载苍蝇飞行动作帧
    this.load.spritesheet("fly", "assets/fly.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // 加载拳套版玩家纹理（用于获得拳套后切换外观）
    this.load.spritesheet("player_new", "assets/player_new.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet("player_roll", "assets/player_roll.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet("player_roll_new", "assets/player_roll_new.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet("player_attack", "assets/player_attack.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet("player_attack_new", "assets/player_attack_new.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // 【新增】：加载道具获得动作素材
    this.load.spritesheet("player_getitem", "assets/player_getitem.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // 【新增】：加载道具图标素材
    this.load.image("item_fly", "assets/ui/item_fly.png");
    this.load.image("item_gauntlet", "assets/ui/item_gauntlet.png");
    this.load.image("item_hp", "assets/ui/item_hp.png");
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
    const wallsLayer = this.map.createLayer("Walls", tileset);
    
    // 设置图层深度
    if (ground1Layer) ground1Layer.setDepth(0);
    if (ground2Layer) ground2Layer.setDepth(1);
    if (wallsLayer) wallsLayer.setDepth(2);
    
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
    const hasFly = this.scene.settings.data && (this.scene.settings.data as any).hasFly || false;
    
    // 获取玩家血量和最大血量（如果有传递）
    const playerHealth = this.scene.settings.data && (this.scene.settings.data as any).playerHealth || 3;
    const playerMaxHealth = this.scene.settings.data && (this.scene.settings.data as any).playerMaxHealth || 3;
    
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
    
    // Ground2图层不设置碰撞体积
    if (ground2Layer) {
      // 不设置碰撞，让玩家可以自由移动
    }
    
    // 相机跟随
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setZoom(5);
    this.cameras.main.setRoundPixels(true);
    
    // 恢复打开的宝箱状态（必须在Walls图层创建之后）
    if ((this.game as any).globalState && (this.game as any).globalState.openedChests) {
      this.openedChests = new Set((this.game as any).globalState.openedChests);
      console.log("恢复打开的宝箱状态:", Array.from(this.openedChests));
      
      // 直接显示已经打开的宝箱
      if (triggerLayer && triggerLayer.objects) {
        triggerLayer.objects.forEach(obj => {
          if (obj.name.startsWith('chest_') && this.openedChests.has(obj.name)) {
            const wallsLayer = this.map.getLayer('Walls')!.tilemapLayer;
            if (wallsLayer) {
              wallsLayer.putTileAtWorldXY(1958, obj.x! + obj.width! / 2, obj.y! + obj.height! / 2);
            }
          }
        });
      }
    }
    
    // 解析触发器
    this.interactZones = this.physics.add.staticGroup();
    // 使用之前创建的triggerLayer
    if (triggerLayer && triggerLayer.objects) {
      triggerLayer.objects.forEach(obj => {
        const zone = this.add.zone(obj.x! + obj.width! / 2, obj.y! + obj.height! / 2, obj.width!, obj.height!);
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
    
    // 启动UI场景
    this.scene.launch("UIScene");

    // 初始化键盘输入
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as any;
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
    // 宝箱交互逻辑
    else if (this.activeInteractZone.startsWith('chest_') && !this.openedChests.has(this.activeInteractZone)) {
      
      this.openedChests.add(this.activeInteractZone);
      
      // 保存打开状态到全局
      if (!(this.game as any).globalState) {
          (this.game as any).globalState = {};
      }
      (this.game as any).globalState.openedChests = Array.from(this.openedChests);
      console.log("宝箱打开状态已保存到全局");
      
      // 视觉：把宝箱的图块从“关”换成“开”
      const triggerLayer = this.map.getObjectLayer('Triggers');
      if (triggerLayer && triggerLayer.objects) {
          const chestObject = triggerLayer.objects.find(obj => obj.name === this.activeInteractZone);
          if (chestObject) {
              const wallsLayer = this.map.getLayer('Walls')!.tilemapLayer;
              if (wallsLayer) {
                  wallsLayer.putTileAtWorldXY(1958, chestObject.x! + chestObject.width! / 2, chestObject.y! + chestObject.height! / 2);
              }
          }
      }

      if (this.activeInteractZone === 'chest_fly') {
          // 使用新的简化道具获得展示系统
          this.game.events.emit('show-item-get-ui', {
              playerTexture: this.player.getPlayerTexture(),
              itemTexture: 'item_fly',
              name: '襁褓苍蝇',
              description: '教宗巴德万拼死保护的襁褓苍蝇。\n跟随玩家，在第三段攻击命中后，将叠加流血与吸血效果。\n"火之将熄，然位不见王影。"',
              onClose: () => {
                  // UI关闭后应用效果
                  console.log("获得【襁褓苍蝇】！重击附带叠层流血与吸血！");
                  this.player.hasFly = true;
                  // 创建苍蝇
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
          });
      }
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
        hasGauntlet: this.player.hasGauntlet,
        hasFly: this.player.hasFly,
        playerHealth: this.player.health,
        playerMaxHealth: this.player.maxHealth
      });
    });
  }

  update() {
    if (this.player) {
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
          const targetX = this.player.x + (this.isFlyFlipped ? -15 : 15);
          const targetY = this.player.y - 15;
          
          // Lerp (线性插值)：让苍蝇有弹性地平滑跟随
          this.flyPet.x += (targetX - this.flyPet.x) * 0.05;
          this.flyPet.y += (targetY - this.flyPet.y) * 0.05;
          
          // 根据状态设置苍蝇镜像
          this.flyPet.setFlipX(this.isFlyFlipped);
      }
    }
  }
}