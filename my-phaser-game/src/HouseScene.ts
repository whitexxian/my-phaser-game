import Phaser from "phaser";
import Player from "./Player";
import { InventoryManager } from "./InventorySystem";

export default class HouseScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;
  private activeInteractZone: string = "";
  private openedChests = new Set<string>();
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
  
  // 【魂系单向门系统】
  private isDoorOpen: boolean = false; // 门的状态
  private doorSolid!: Phaser.GameObjects.Zone; // 门的物理阻挡体

  constructor() {
    super("HouseScene");
  }

  preload() {
    // 1. 加载玩家图纸
    this.load.spritesheet("player", "assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // 2. 加载 Tiled 需要的资源
    //    'terrain' 是你在 Tiled 里给图块集起的名字
    this.load.image("terrian-image", "assets/maps/terrian.png"); // 加载瓦片图
    this.load.tilemapTiledJSON("map", "assets/maps/level1.json"); // 加载你画的地图
    this.load.tilemapTiledJSON("house-map", "assets/maps/house.json");
    
    // 加载苍蝇飞行动作帧
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
    // 1. 生成地图和图块集 (保持不变)
    this.map = this.make.tilemap({ key: "house-map" });

    const tileset = this.map.addTilesetImage("terrian", "terrian-image");

    if (!tileset) {
      console.error("图块集加载失败！");
      return;
    }

    // 确保全局状态存在，并同步到 window.globalState 供 InventorySystem 使用
    if (!(this.game as any).globalState) {
      (this.game as any).globalState = {};
    }
    (window as any).globalState = (this.game as any).globalState;

    // ==========================================
    // 【核心修改：用数组管理多图层】
    // ==========================================

    // 2. 批量渲染 Ground 层 (不需要碰撞，只需渲染在最底下)
    // 把你在 Tiled 里画的所有地面层名字写进数组里
    const groundLayers = ["Ground1", "Ground2"];
    groundLayers.forEach((layerName) => {
      this.map.createLayer(layerName, tileset);
      // setDepth(0) 确保它们永远在最底层
    });

    // 3. 批量渲染 Wall 层 (需要碰撞，且要在玩家底下或同一层)
    const wallLayerNames = ["Walls"];
    // 准备一个空数组，用来收集所有带有物理碰撞的层
    const collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];

    wallLayerNames.forEach((layerName) => {
      const layer = this.map.createLayer(layerName, tileset);
      if (layer) {
        // 开启这个层里所有非空瓦片的碰撞
        layer.setCollisionByExclusion([-1]);
        // 把这个层推入我们的碰撞集合中
        collisionLayers.push(layer);
        // 墙壁一般在地面之上，玩家之下 (玩家因为2.5D原因 depth 会根据 Y 变化，通常大于 10)
      }
    });

    // 4. 创建玩家 (必须在 Ground 和 Wall 之后，Above 之前)
    // 根据spawnPoint设置玩家位置
    let playerX = 100;
    let playerY = 100;
    
    // 从 JSON 地图里，找到我们刚才建的叫 'Triggers' 的对象层
    const triggerLayer = this.map.getObjectLayer("Triggers");
    
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
              wallsLayer.setCollisionByExclusion([-1]);
            }
          }
        });
      }
    }
    
    // 检查是否有保存的玩家状态（场景重启时）
    const savedState = (this.game as any).globalState?.playerState;
    
    // 优先检查是否有保存的玩家状态（场景重启时）
    if (savedState && savedState.sceneName === "HouseScene") {
      // 如果有保存的玩家状态（场景重启时），恢复玩家位置
      console.log("恢复玩家位置:", savedState.x, savedState.y);
      playerX = savedState.x;
      playerY = savedState.y;
      
      // 销毁位置记录，确保只生效一次
      if ((this.game as any).globalState) {
        delete (this.game as any).globalState.playerState;
        console.log("销毁玩家位置记录，下次将使用正常传送点");
      }
    } else if (this.scene.settings.data && (this.scene.settings.data as any).spawnPoint) {
      // 如果没有保存的状态但有spawnPoint（从其他场景传送过来），使用传送点位置
      const spawnPoint = (this.scene.settings.data as any).spawnPoint;
      
      // 从触发器对象中找到对应的位置
      if (triggerLayer && triggerLayer.objects) {
        const spawnObject = triggerLayer.objects.find(obj => obj.name === spawnPoint);
        if (spawnObject) {
          playerX = spawnObject.x! + spawnObject.width! / 2;
          playerY = spawnObject.y! + spawnObject.height! / 2;
          
          // 添加偏移量，避免玩家直接自动返回
          if (spawnPoint === "door_to_overworld") {
            playerY -= 30; // 向上偏移30像素
          } else if (spawnPoint === "ladder_to_2floor") {
            playerY += 30; // 向下偏移30像素
          } else if (spawnPoint === "ladder_from_underground") {
            playerX -= 16; // 向左偏移16像素
          }
        } else {
          console.warn(`Spawn point ${spawnPoint} not found in HouseScene`);
        }
      } else {
        console.warn("No trigger layer found in HouseScene");
      }
    }
   // 获取hasGauntlet状态（优先从全局状态恢复，其次从场景设置）
    let hasGauntlet = false;
    let hasFly = false;
    let playerHealth = 3;
    let playerMaxHealth = 3;
    
    if (savedState) {
      hasGauntlet = savedState.hasGauntlet || false;
      hasFly = savedState.hasFly || false;
      playerHealth = savedState.health || 3;
      playerMaxHealth = savedState.maxHealth || 3;
    } else {
      hasGauntlet = this.scene.settings.data && (this.scene.settings.data as any).hasGauntlet || false;
      hasFly = this.scene.settings.data && (this.scene.settings.data as any).hasFly || false;
      playerHealth = this.scene.settings.data && (this.scene.settings.data as any).playerHealth || 3;
      playerMaxHealth = this.scene.settings.data && (this.scene.settings.data as any).playerMaxHealth || 3;
    }
    
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

    // ==========================================
    // 【核心新增：监听装备/卸下事件】
    // 注意：使用 this.events（场景级别）而不是 this.game.events（全局）
    // 避免多个场景同时处理同一事件
    // ==========================================
    // 移除之前的监听器（防止重复注册）
    this.events.off('update-equipment');
    
    this.events.on('update-equipment', ({ itemId, equipped }: { itemId: string, equipped: boolean }) => {
        console.log(`[HouseScene] update-equipment: ${itemId} = ${equipped}`);
        
        if (itemId === 'potion') {
            if (equipped) {
                // 装备生命药水：增加最大生命值
                this.player.maxHealth++;
                this.player.health = this.player.maxHealth;
                console.log('[HouseScene] 装备生命药水，最大生命值+1');
            } else {
                // 卸下生命药水：减少最大生命值
                this.player.maxHealth = Math.max(1, this.player.maxHealth - 1);
                // 确保当前生命值不超过最大生命值
                if (this.player.health > this.player.maxHealth) {
                    this.player.health = this.player.maxHealth;
                }
                console.log('[HouseScene] 卸下生命药水，最大生命值-1');
            }
            // 发送事件更新UI
            this.game.events.emit('update-max-health', this.player.maxHealth, this.player.health);
        }
        else if (itemId === 'gauntlet') {
            if (equipped) {
                this.player.hasGauntlet = true;
                this.player.setTexture('player_new');
                this.player.createAnimations();
                console.log('[HouseScene] 装备拳套');
            } else {
                this.player.hasGauntlet = false;
                this.player.setTexture('player');
                this.player.createAnimations();
                console.log('[HouseScene] 卸下拳套');
            }
        }
        else if (itemId === 'fly') {
            if (equipped) {
                this.player.hasFly = true;
                if (!this.flyPet) {
                    this.flyPet = this.add.sprite(this.player.x, this.player.y, 'fly').setScale(0.5);
                    if (!this.anims.exists('fly-flap')) {
                        this.anims.create({
                            key: 'fly-flap',
                            frames: this.anims.generateFrameNumbers('fly', { start: 0, end: 7 }),
                            frameRate: 10,
                            repeat: -1
                        });
                    }
                    this.flyPet.anims.play('fly-flap', true);
                    this.flyPet.setDepth(10);
                }
                console.log('[HouseScene] 装备苍蝇');
            } else {
                this.player.hasFly = false;
                if (this.flyPet) {
                    this.flyPet.destroy();
                    this.flyPet = null;
                }
                console.log('[HouseScene] 卸下苍蝇');
            }
        }
    });

    // 5. 批量渲染 Above 层 (不需要碰撞，但必须遮挡玩家)
    const aboveLayers = ["Above"];
    aboveLayers.forEach((layerName) => {
      const layer = this.map.createLayer(layerName, tileset);
      // setDepth(9999) 确保树冠和屋顶永远在最上层，完美遮挡玩家
      layer?.setDepth(9999);
    });

    // ==========================================
    // 6. 激活全图层的物理碰撞！
    // ==========================================
    // Phaser 超级牛逼的地方：你可以直接把装满图层的数组 collisionLayers 塞给 collider
    this.physics.add.collider(this.player, collisionLayers);

    // 7. 设置世界边界和摄像机 (保持不变)
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

    // ==========================================    
    // 【核心新增：解析 Tiled 里的隐形传送门！】
    // ==========================================
    this.interactZones = this.physics.add.staticGroup();

    if (triggerLayer && triggerLayer.objects) {
      // 遍历这个层里的所有对象 (我们刚才画的矩形框)
      triggerLayer.objects.forEach((obj) => {
        const zone = this.add.zone(
          obj.x! + obj.width! / 2,
          obj.y! + obj.height! / 2,
          obj.width!,
          obj.height!,
        );

        // 给这个空气盒子加上物理引擎
        this.physics.add.existing(zone, true); // true 代表是静态物体
        
        if (obj.name === 'door_solid') {
            // 找到门的阻挡体，存起来
            this.doorSolid = zone;
            
            // 如果从全局状态读取到门已经打开，就直接销毁阻挡体
            if ((this.game as any).globalState && (this.game as any).globalState.houseSceneDoorOpen) {
                this.isDoorOpen = true;
                this.doorSolid.destroy();
            } else {
                // 门未打开，添加物理碰撞
                this.physics.add.collider(this.player, this.doorSolid);
            }
        }
        else if (obj.name === 'zone_locked' || obj.name === 'zone_unlock' || obj.name.startsWith('chest_') || obj.name.startsWith('ladder_') || obj.name.startsWith('door_')) {
            // 把交互区加到组里
            zone.name = obj.name; // 把名字传给物理盒子
            this.interactZones.add(zone);
        }
      });
    }

    // 交互检测
    this.physics.add.overlap(this.player, this.interactZones, this.onInteractZone, undefined, this);

    // 交互按键（仅用于门和其他梯子）
    if (this.input.keyboard) {
      const fKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
      fKey.on('down', () => {
        this.handleInteract();
      });
    }

    // 从全局状态加载已打开的宝箱
    if ((this.game as any).globalState && (this.game as any).globalState.openedChests) {
      this.openedChests = new Set((this.game as any).globalState.openedChests);
      console.log("已加载全局宝箱状态:", Array.from(this.openedChests));
    }

    this.scene.launch("UIScene");

    // 初始化键盘输入
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as any;

    // ==========================================
    // 【测试机制】：按一下键盘的 H 键，模拟掉半格血
    // ==========================================
    let testHealth = 3;
    const hKey = this.input.keyboard!.addKey("H");
    hKey.on("down", () => {
      testHealth -= 0.5; // 扣除 0.5 血
      if (testHealth < 0) testHealth = 3; // 扣光了就回满（测试用）

      // 发射全局信号，告诉 UIScene 血量变了！
      this.game.events.emit("update-health", testHealth);
      console.log("当前血量：", testHealth);
    });
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
    // 返回地面
    if (this.activeInteractZone === "door_to_overworld") {
      this.switchScene("GameScene", "door_to_house");
    }
    // 前往二楼
    else if (this.activeInteractZone === "ladder_to_2floor") {
      this.switchScene("TwoFloorScene", "ladder_to_house");
    }
    // 前往地下
    else if (this.activeInteractZone === "ladder_to_chest") {
      this.switchScene("UnderGroundScene", "ladder_to_chest");
    }
    // 从地下返回
    else if (this.activeInteractZone === "ladder_from_underground") {
      this.switchScene("UnderGroundScene", "ladder_to_chest");
    }
    // 单向门交互 - 错误侧
    else if (this.activeInteractZone === 'zone_locked') {
      // 玩家在错误的一侧按了F键
      if (!this.isDoorOpen) {
          // 显示UI提示
          this.game.events.emit('show-message', '不能从这一侧打开');
      }
    }
    // 单向门交互 - 正确侧
    else if (this.activeInteractZone === 'zone_unlock') {
      // 玩家在正确的一侧按了F键
      if (!this.isDoorOpen) {
          this.isDoorOpen = true;
          
          // 【核心】：门开了！销毁那个物理阻挡体，让玩家能穿过去！
          if (this.doorSolid) {
              this.doorSolid.destroy();
              
              // 保存门的状态到全局对象
              if (!(this.game as any).globalState) {
                  (this.game as any).globalState = {};
              }
              (this.game as any).globalState.houseSceneDoorOpen = true;
              console.log("门的状态已保存到全局对象");
          }
      }
    }
    // 宝箱交互
    else if (this.activeInteractZone.startsWith('chest_') && !this.openedChests.has(this.activeInteractZone)) {
      
      this.openedChests.add(this.activeInteractZone);
      
      // 保存打开状态到全局
      if (!(this.game as any).globalState) {
          (this.game as any).globalState = {};
      }
      (this.game as any).globalState.openedChests = Array.from(this.openedChests);
      console.log("宝箱打开状态已保存到全局");
      
      // 视觉：把宝箱的图块从“关”换成“开”
      if (this.activeInteractZone === 'chest_gauntlet') {
          const triggerLayer = this.map.getObjectLayer('Triggers');
          if (triggerLayer && triggerLayer.objects) {
              const chestObject = triggerLayer.objects.find(obj => obj.name === 'chest_gauntlet');
              if (chestObject) {
                  const walls2Layer = this.map.getLayer('Walls')!.tilemapLayer;
                  if (walls2Layer) {
                      // 确保在Walls层替换图块
                      walls2Layer.putTileAtWorldXY(1958, chestObject.x! + chestObject.width! / 2, chestObject.y! + chestObject.height! / 2);
                      
                      // 重新设置碰撞，确保新放置的图块有碰撞体积
                      walls2Layer.setCollisionByExclusion([-1]);
                  }
              }
          }
      }

      if (this.activeInteractZone === 'chest_gauntlet') {
          // 使用新的简化道具获得展示系统
          this.game.events.emit('show-item-get-ui', {
              playerTexture: this.player.getPlayerTexture(),
              itemTexture: 'item_gauntlet',
              name: '老皮革拳套',
              description: '一副饱经风霜的制式皮革拳套，原主人把他保养的很好。\n翻滚后可直接派生第三段攻击。\n"岩石亦可碎，何况敌骨。"',
              onClose: () => {
                  // UI关闭后应用效果
                  console.log("获得【老皮革拳套】！翻滚后可直接派生重击！");
                  // 使用InventoryManager解锁并自动装备拳套
                  const inventory = InventoryManager.getInstance();
                  inventory.unlockItem('gauntlet');
                  this.player.upgradeToGauntlet();
              }
          });
      }
    }
  }

  // 切换场景的通用方法
  private switchScene(targetScene: string, spawnPoint: string) {
    // 防止玩家反复触发多次
    this.player.body!.enable = false;
    this.player.setVelocity(0);

    // 淡出特效
    this.cameras.main.fadeOut(500, 0, 0, 0);

    // 监听淡出完成的事件
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
