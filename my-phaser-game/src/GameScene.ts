import Phaser from "phaser";
import Player from "./Player";
import Enemy from "./Enemy";
import Boss from "./Boss";

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;
  private walls1Layer!: Phaser.Tilemaps.TilemapLayer;
  private walls2Layer!: Phaser.Tilemaps.TilemapLayer;
  private blockLayer!: Phaser.Tilemaps.TilemapLayer;
  private above2Layer!: Phaser.Tilemaps.TilemapLayer;
  private above3Layer!: Phaser.Tilemaps.TilemapLayer;

  private walls1Collider!: Phaser.Physics.Arcade.Collider;
  private walls2Collider!: Phaser.Physics.Arcade.Collider;
  private blockCollider!: Phaser.Physics.Arcade.Collider;
  private enemyPlayerOverlap!: Phaser.Physics.Arcade.Collider;
  private enemyWallsCollider!: Phaser.Physics.Arcade.Collider;
  private bossWallsCollider!: Phaser.Physics.Arcade.Collider;
  private bossPlayerOverlap!: Phaser.Physics.Arcade.Collider;
  
  // 敌人相关
  private enemies!: Phaser.Physics.Arcade.Group;
  private myBoss!: Boss; // Boss引用
  private bossesGroup!: Phaser.Physics.Arcade.Group;
  
  
  // 【魂系单向门系统】
  private isDoorOpen: boolean = false; // 门的状态
  private doorSolid!: Phaser.GameObjects.Zone; // 门的物理阻挡体
  private activeInteractZone: string = ""; // 当前踩在哪个交互区
  private interactKey!: Phaser.Input.Keyboard.Key; // 交互按键 (F键)
  private kKey!: Phaser.Input.Keyboard.Key; // 处决按键 (K键)
  private interactZones!: Phaser.Physics.Arcade.StaticGroup; // 交互区域组
  
  // 【新增：苍蝇宠物】
  private flyPet: Phaser.GameObjects.Sprite | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private isFlyFlipped: boolean = false;
  // 记录已经开过的宝箱
  private openedChests: Set<string> = new Set();


  constructor() {
    super("GameScene");
  }

  preload() {
    // 1. 加载玩家图纸
    this.load.spritesheet("player", "assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 1.1 加载玩家新形象图纸（拳套版）
    this.load.spritesheet("player_new", "assets/player_new.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 2. 加载翻滚动画图纸
    this.load.spritesheet("player_roll", "assets/player_roll.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 2.1 加载翻滚动画新图纸（拳套版）
    this.load.spritesheet("player_roll_new", "assets/player_roll_new.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 3. 加载攻击动画图纸
    this.load.spritesheet("player_attack", "assets/player_attack.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 3.1 加载攻击动画新图纸（拳套版）
    this.load.spritesheet("player_attack_new", "assets/player_attack_new.png", {
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

    // 3. 加载 Tiled 需要的资源
    //    'terrain' 是你在 Tiled 里给图块集起的名字
    this.load.image("terrian-image", "assets/maps/terrian.png"); // 加载瓦片图
    this.load.tilemapTiledJSON("map", "assets/maps/level1.json"); // 加载你画的地图
    this.load.tilemapTiledJSON("house-map", "assets/maps/house.json");
    
    // 加载苍蝇飞行动作帧
    this.load.spritesheet("fly", "assets/fly.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    
    // 加载粒子纹理
    this.load.image("smoke", "assets/particle.png");
  }

  create() {
    // 1. 生成地图和图块集 (保持不变)
    this.map = this.make.tilemap({ key: "map" });

    const tileset = this.map.addTilesetImage("terrian", "terrian-image");

    if (!tileset) {
      console.error("图块集加载失败！");
      return;
    }

    // 检查全局状态，看看门是否已经被打开
    if ((this.game as any).globalState && (this.game as any).globalState.gameSceneDoorOpen) {
      this.isDoorOpen = true;
      console.log("门已经被打开，保持打开状态");
    }
    


    // ==========================================
    // 【核心修改：用数组管理多图层】
    // ==========================================

    // 2. 批量渲染 Ground 层 (不需要碰撞，只需渲染在最底下)
    // 把你在 Tiled 里画的所有地面层名字写进数组里
    const groundLayers = ["Ground1", "Ground2", "Block"];
    groundLayers.forEach((layerName) => {
      const layer = this.map.createLayer(layerName, tileset);
      if (layer) {
        if (layerName === "Ground1" || layerName === "Ground2") {
          layer.setDepth(0); // 地面层在最底层
          
          // 将区域中id为1959的替换为1960
          if (layerName === "Ground2") {
            layer.forEachTile(tile => {
              if (tile.index === 1959) {
                layer.putTileAt(1960, tile.x, tile.y);
              }
            });
          }
        } else if (layerName === "Block") {
          layer.setDepth(1); // Block图层在地面层之上，玩家之下，确保碰撞检测正常
          this.blockLayer = layer;
          // 开启Block图层的碰撞属性，但默认通过碰撞器关闭碰撞
          this.blockLayer.setCollisionByExclusion([-1]);
          console.log("Block图层初始化完成，开启碰撞属性");
        }
      }
    });

    // 3. 批量渲染 Wall 层 (需要碰撞，且要在玩家底下或同一层)
    const wallLayerNames = ["Walls1", "Walls2"];
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
        if (layerName === "Walls1") {
          this.walls1Layer = layer;
        } else if (layerName === "Walls2") {
          this.walls2Layer = layer;
        }
      }
    });

    // 从 JSON 地图里，找到我们刚才建的叫 'Triggers' 的对象层
    let triggerLayer = this.map.getObjectLayer("Triggers");
    
    // 恢复打开的宝箱状态（必须在Walls2图层创建之后）
    if ((this.game as any).globalState && (this.game as any).globalState.openedChests) {
      this.openedChests = new Set((this.game as any).globalState.openedChests);
      console.log("恢复打开的宝箱状态:", Array.from(this.openedChests));
      
      // 直接显示已经打开的宝箱
      if (triggerLayer && triggerLayer.objects && this.walls2Layer) {
        triggerLayer.objects.forEach(obj => {
          if (obj.name.startsWith('chest_') && this.openedChests.has(obj.name)) {
            this.walls2Layer.putTileAtWorldXY(1958, obj.x! + obj.width! / 2, obj.y! + obj.height! / 2);
            this.walls2Layer.setCollisionByExclusion([-1]);
          }
        });
      }
    }

    // 4. 创建玩家 (必须在 Ground 和 Wall 之后，Above 之前)
    // 根据spawnPoint设置玩家位置
    let playerX = 400;
    let playerY = 300;
    
    if (this.scene.settings.data && (this.scene.settings.data as any).spawnPoint) {
      const spawnPoint = (this.scene.settings.data as any).spawnPoint;
      
      // 从触发器对象中找到对应的位置
      if (triggerLayer && triggerLayer.objects) {
        const spawnObject = triggerLayer.objects.find(obj => obj.name === spawnPoint);
        if (spawnObject) {
          playerX = spawnObject.x! + spawnObject.width! / 2;
          playerY = spawnObject.y! + spawnObject.height! / 2;
          
          // 添加偏移量，避免玩家直接自动返回
          if (spawnPoint === "door_to_house") {
            playerY += 30; // 向下偏移30像素
          }
        } else {
          console.warn(`Spawn point ${spawnPoint} not found in GameScene`);
        }
      } else {
        console.warn("No trigger layer found in GameScene");
      }
    }
    
    // 获取hasGauntlet状态（如果有传递）
    const hasGauntlet = this.scene.settings.data && (this.scene.settings.data as any).hasGauntlet || false;
    const hasFly = this.scene.settings.data && (this.scene.settings.data as any).hasFly || false;
    
    // 获取玩家血量和最大血量（如果有传递）
    const playerHealth = this.scene.settings.data && (this.scene.settings.data as any).playerHealth || 3;
    const playerMaxHealth = this.scene.settings.data && (this.scene.settings.data as any).playerMaxHealth || 3;
    
    // 获取是否需要刷新怪物（默认不刷新，只有从bed休息或死亡传送时才刷新）
    const shouldRespawnMonsters = this.scene.settings.data && (this.scene.settings.data as any).shouldRespawnMonsters || false;
    
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
    
    // ==========================================
    // 【新增 1：全局吸血监听】
    // 怪物流血时会发送 'heal-player' 事件
    // ==========================================
    this.game.events.on('heal-player', (amount: number) => {
        if (this.player.health < this.player.maxHealth) {
            this.player.health += amount;
            console.log(`吸血触发！回复 ${amount} 血量`);
            this.game.events.emit('update-health', this.player.health);
            
            // 给玩家身上爆一个绿色的回血数字特效
            const healText = this.add.text(this.player.x, this.player.y - 20, `+${amount}`, { color: '#00ff00', fontSize: '16px' });
            this.tweens.add({ targets: healText, y: '-=30', alpha: 0, duration: 1000, onComplete: () => healText.destroy() });
        }
    });
    
    // 创建敌人组
    this.enemies = this.physics.add.group({ runChildUpdate: true });
    // 提前创建boss组，避免后续访问时出现问题
    this.bossesGroup = this.physics.add.group({ runChildUpdate: true });
    
    // 【篝火系统】：怪物刷新逻辑（基于编号的存活区/死亡区机制）
    // 1. 给每个怪物分配唯一标识：场景名_怪物类型_编号
    // 2. 存活区：未死亡的怪物，每次进出场景刷新
    // 3. 死亡区：已死亡的怪物，每次进出场景不刷新
    // 4. 坐火/死亡复活：刷新所有怪物
    const hasSpawnPoint = this.scene.settings.data && (this.scene.settings.data as any).spawnPoint;
    
    // 获取全局状态中的怪物死亡记录
    const globalState = (this.game as any).globalState || {};
    globalState.deadMonsters = globalState.deadMonsters || {};
    
    // 定义怪物配置（带有唯一标识）
    const monsterConfigs = [
        { id: "GameScene_enemy0_0", type: "enemy0", x: playerX + 50, y: playerY + 50 },
        { id: "GameScene_boss_0", type: "boss", x: playerX + 200, y: playerY + 200 }
    ];
    
    // 创建怪物（根据存活区/死亡区逻辑）
    monsterConfigs.forEach(config => {
        const isDead = globalState.deadMonsters[config.id] || false;
        
        // 坐火/死亡复活时强制刷新所有怪物
        if (shouldRespawnMonsters) {
            console.log(`强制刷新怪物: ${config.id}`);
            if (config.type === "boss") {
                // 创建Boss
                this.myBoss = new Boss(this, config.x, config.y, "enemy1");
                this.myBoss.setTarget(this.player);
                this.myBoss.monsterId = config.id; // 设置唯一标识
                this.bossesGroup = this.physics.add.group({ runChildUpdate: true });
                this.bossesGroup.add(this.myBoss);
                this.bossWallsCollider = this.physics.add.collider(this.bossesGroup, [this.walls1Layer, this.walls2Layer]);
            } else {
                // 创建普通敌人
                const enemy = new Enemy(this, config.x, config.y, config.type);
                enemy.setTarget(this.player);
                enemy.monsterId = config.id; // 设置唯一标识
                this.enemies.add(enemy);
            }
        }
        // 从其他场景回来时
        else {
            // 初始进入场景，创建所有怪物
            if (!hasSpawnPoint) {
                console.log(`初始创建怪物: ${config.id}`);
                if (config.type === "boss") {
                    // 创建Boss
                    this.myBoss = new Boss(this, config.x, config.y, "enemy1");
                    this.myBoss.setTarget(this.player);
                    this.myBoss.monsterId = config.id; // 设置唯一标识
                    this.bossesGroup = this.physics.add.group({ runChildUpdate: true });
                    this.bossesGroup.add(this.myBoss);
                    this.bossWallsCollider = this.physics.add.collider(this.bossesGroup, [this.walls1Layer, this.walls2Layer]);
                } else {
                    // 创建普通敌人
                    const enemy = new Enemy(this, config.x, config.y, config.type);
                    enemy.setTarget(this.player);
                    enemy.monsterId = config.id; // 设置唯一标识
                    this.enemies.add(enemy);
                }
            }
            // 存活区的怪物（未死亡），每次进出场景刷新
            else if (!isDead) {
                console.log(`刷新存活区怪物: ${config.id}`);
                if (config.type === "boss") {
                    // 创建Boss
                    this.myBoss = new Boss(this, config.x, config.y, "enemy1");
                    this.myBoss.setTarget(this.player);
                    this.myBoss.monsterId = config.id; // 设置唯一标识
                    this.bossesGroup = this.physics.add.group({ runChildUpdate: true });
                    this.bossesGroup.add(this.myBoss);
                    this.bossWallsCollider = this.physics.add.collider(this.bossesGroup, [this.walls1Layer, this.walls2Layer]);
                } else {
                    // 创建普通敌人
                    const enemy = new Enemy(this, config.x, config.y, config.type);
                    enemy.setTarget(this.player);
                    enemy.monsterId = config.id; // 设置唯一标识
                    this.enemies.add(enemy);
                }
            }
            // 死亡区的怪物（已死亡），不刷新
            else {
                console.log(`跳过死亡区怪物: ${config.id}`);
            }
        }
    });
    
    // 只有在创建了敌人时才添加碰撞器
    if (this.enemies.getChildren().length > 0) {
        // 构建有效的碰撞图层数组
        const validWallLayers = [];
        if (this.walls1Layer) validWallLayers.push(this.walls1Layer);
        if (this.walls2Layer) validWallLayers.push(this.walls2Layer);
        
        // 为敌人设置与地面的碰撞
        if (validWallLayers.length > 0) {
            this.enemyWallsCollider = this.physics.add.collider(this.enemies, validWallLayers);
        }
        
        // 【核心新增：处理小怪碰触玩家的伤害判定】
        // 不要用 collider (那会像推箱子)，要用 overlap 配合专用的击退逻辑
        this.enemyPlayerOverlap = this.physics.add.overlap(this.player, this.enemies, (p, e) => {
            const enemy = e as any;
            const player = p as any;
            
            // 如果小怪还活着，并且玩家没在无敌状态，就造成伤害
            // 这里我们简化：小怪每次碰触固定造成 0.5 伤害
            player.takeDamage(0.5, enemy.x, enemy.y);
        });
    }
    
    // 【极其重要】：屏蔽浏览器的右键菜单，否则一按右键就弹出网页选项！
    this.input.mouse!.disableContextMenu();
    
    // 只有在创建了Boss时才添加Boss相关的逻辑
    if (this.myBoss) {
        // Boss 触碰伤害 (0.5格血)
        if (this.bossesGroup && this.bossesGroup.getChildren().length > 0) {
            this.bossPlayerOverlap = this.physics.add.overlap(this.player, this.bossesGroup, (p, b) => {
                const boss = b as Boss;
                if (!boss.isStaggered()) { // 虚弱时碰它不掉血
                    (p as Player).takeDamage(boss.getContactDamage(), boss.x, boss.y);
                }
            });
        }
        
        // 监听 Boss 的 AOE 技能 1
        this.events.removeAllListeners('boss-aoe');
        this.events.on('boss-aoe', (zone: any, damage: number) => {
            this.physics.overlap(this.player, zone, () => {
                this.player.takeDamage(damage, zone.x, zone.y);
            });
        });
    }
    
    // 只有在创建了Boss时才添加Boss相关的监听器
    if (this.myBoss) {
        // 监听 Boss 的召唤技能 2
        this.events.removeAllListeners('boss-summon');
        this.events.on('boss-summon', (bx: number, by: number) => {
            console.log("Boss 召唤了小怪！");
            // 在 Boss 身边刷两只普通 Enemy
            for(let i=-1; i<=1; i+=2) {
                const slime = new Enemy(this, bx + i*40, by + 40, "enemy0");
                slime.setTarget(this.player);
                this.enemies.add(slime);
            }
        });
        
        // ==========================================
        // 【史诗机制：鼠标右键/K键处决！】
        // ==========================================
        const executeBoss = () => {
            if (this.myBoss && this.myBoss.active) {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.myBoss.x, this.myBoss.y);
                
                // 处决条件：必须靠得很近 (80像素内) + Boss必须在虚弱状态
                if (dist < 80 && this.myBoss.isStaggered()) {
                    this.myBoss.execute(); // 执行处决！
                }
            }
        };
        
        // 右键处决
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // 判断是否是点击了鼠标右键
            if (pointer.rightButtonDown()) {
                executeBoss();
            }
        });
        
        // K键处决（在键盘初始化后设置）
        // 注意：这里暂时不设置，在create方法的键盘初始化部分统一设置
    }

    // 5. 批量渲染 Above 层 (不需要碰撞，但必须遮挡玩家)
    const aboveLayers = ["Above1", "Above2", "Above3"];
    aboveLayers.forEach((layerName) => {
      const layer = this.map.createLayer(layerName, tileset);
      // setDepth(9999) 确保树冠和屋顶永远在最上层，完美遮挡玩家
      layer?.setDepth(9999);
      if (layerName === "Above2") {
        this.above2Layer = layer!;
      } else if (layerName === "Above3") {
        this.above3Layer = layer!;
      }
    });

    // ==========================================
    // 6. 激活全图层的物理碰撞！
    // ==========================================
    // 为Walls1和Walls2层分别创建碰撞检测，并保存引用
    if (this.walls1Layer) {
      this.walls1Collider = this.physics.add.collider(this.player, this.walls1Layer);
    }
    if (this.walls2Layer) {
      this.walls2Collider = this.physics.add.collider(this.player, this.walls2Layer);
    }

    // 为Block图层创建碰撞检测，并保存引用
    if (this.blockLayer) {
      this.blockCollider = this.physics.add.collider(this.player, this.blockLayer);
      this.blockCollider.active = false; // 默认关闭Block图层的碰撞
    }

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

    if (triggerLayer && triggerLayer.objects) {
      // 遍历这个层里的所有对象 (我们刚才画的矩形框)
      triggerLayer.objects.forEach((obj) => {
        // door_to_house 现在由交互系统处理

        // 处理天桥上的触发器
        if (obj.name === "trigger_on_bridge") {
          const bridgeZone = this.add.zone(
            obj.x! + obj.width! / 2,
            obj.y! + obj.height! / 2,
            obj.width!,
            obj.height!,
          );

          this.physics.add.existing(bridgeZone, true);

          this.physics.add.overlap(
            this.player,
            bridgeZone,
            this.onBridge,
            undefined,
            this,
          );
        }

        // 处理桥下的触发器
        if (obj.name === "trigger_under_bridge") {
          const underBridgeZone = this.add.zone(
            obj.x! + obj.width! / 2,
            obj.y! + obj.height! / 2,
            obj.width!,
            obj.height!,
          );

          this.physics.add.existing(underBridgeZone, true);

          this.physics.add.overlap(
            this.player,
            underBridgeZone,
            this.underBridge,
            undefined,
            this,
          );
        }
      });
    }

    // 1. 注册交互按键 (F键)
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);



    // 3. 解析 Tiled 的对象层
    this.interactZones = this.physics.add.staticGroup(); // 把所有交互区装在一起

    if (triggerLayer && triggerLayer.objects) {
        triggerLayer.objects.forEach(obj => {
            const zone = this.add.zone(obj.x! + obj.width! / 2, obj.y! + obj.height! / 2, obj.width!, obj.height!);
            this.physics.add.existing(zone, true);

            if (obj.name === 'door_solid') {
                // 找到门的阻挡体，存起来
                this.doorSolid = zone;
                
                // 如果门已经被打开，不创建物理碰撞，直接显示开门的图案
                if (!this.isDoorOpen) {
                    // 开启它和玩家的物理碰撞！
                    this.physics.add.collider(this.player, this.doorSolid);
                } else {
                    // 门已经被打开，直接显示开门的图案
                    const ground2Layer = this.map.getLayer('Ground2')!.tilemapLayer;
                    const openDoorID = 303;
                    if (ground2Layer) {
                        // 替换两个地块的ID（假设是上下两个地块）
                        ground2Layer.putTileAtWorldXY(openDoorID, this.doorSolid.x, this.doorSolid.y);
                        ground2Layer.putTileAtWorldXY(openDoorID, this.doorSolid.x + 16, this.doorSolid.y);
                        console.log("门已经被打开，直接显示开门的图案");
                    }
                    // 销毁物理阻挡体
                    this.doorSolid.destroy();
                }
            }
            else if (obj.name === 'zone_locked' || obj.name === 'zone_unlock' || obj.name.startsWith('chest_') || obj.name.startsWith('ladder_') || obj.name.startsWith('door_') || obj.name.startsWith('trigger_')) {
                // 把交互区加到组里
                zone.name = obj.name; // 把名字传给物理盒子
                this.interactZones.add(zone);
            }
        });
    }

    // 4. 设置持续重叠检测 (类似梯子的做法)
    this.physics.add.overlap(this.player, this.interactZones, this.onInteractZone, undefined, this);

    this.scene.launch("UIScene");
    
    // 初始化键盘输入
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as any;
    
    // 初始化K键（处决键）
    this.kKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    
    // 设置K键处决事件（只有在有Boss的时候才生效）
    const executeBoss = () => {
        if (this.myBoss && this.myBoss.active) {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.myBoss.x, this.myBoss.y);
            
            // 处决条件：必须靠得很近 (80像素内) + Boss必须在虚弱状态
            if (dist < 80 && this.myBoss.isStaggered()) {
                this.myBoss.execute(); // 执行处决！
            }
        }
    };
    
    this.kKey.on('down', () => {
        executeBoss();
    });

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
    
    // ==========================================
    // 【核心新增：充当攻击裁判】
    // 监听玩家发出的 'player-attack' 信号
    // ==========================================
    console.log("添加player-attack事件监听器");
    // 强制清理所有旧的监听器，确保每次只添加一个
    this.events.removeAllListeners('player-attack');
    this.events.on('player-attack', (hitbox: any, damage: number, dir: any, comboCount: number, hasFly: boolean) => {
        console.log(`player-attack事件触发，伤害: ${damage}`);
        
        const hitEnemy = (enemy: any) => {
            console.log(`命中敌人: ${enemy.id}, 伤害: ${damage}`);
            enemy.takeDamage(damage, dir, comboCount);
            
            // 【苍蝇特技】：如果是第三段攻击命中，且有苍蝇，挂流血！
            if (comboCount === 3 && hasFly) {
                // 我们给 Enemy 动态注入一个 applyBleed 方法 (详情见下方 Enemy 修改)
                if(typeof enemy.applyBleed === 'function') {
                    enemy.applyBleed(this);
                }
            }
        };

        // 只有在创建了怪物的情况下才进行重叠检测
        if (this.enemies && this.enemies.getChildren().length > 0) {
            this.physics.overlap(hitbox, this.enemies, (_box, e) => hitEnemy(e));
        }
        if (this.myBoss && this.myBoss.active) {
            this.physics.overlap(hitbox, this.myBoss, (_box, b) => hitEnemy(b));
        }
    });
  }

  // 场景关闭时清理资源，避免重复添加
  shutdown() {
    console.log("GameScene关闭，开始清理资源");
    
    // 清理事件监听器
    console.log("清理事件监听器");
    this.game.events.off('heal-player');
    this.events.off('boss-aoe');
    this.events.off('boss-summon');
    this.events.off('player-attack');
    
    // 强制清理所有事件监听器
    this.events.removeAllListeners('boss-aoe');
    this.events.removeAllListeners('boss-summon');
    this.events.removeAllListeners('player-attack');
    
    // 清理游戏事件
    this.game.events.removeAllListeners('heal-player');
    console.log("事件监听器清理完成");
    
    // 清理Boss实例
    if (this.myBoss) {
      console.log("销毁Boss实例");
      this.myBoss.destroy();
      this.myBoss = null!;
    }
    
    // 清理所有可能的物理体
    console.log("清理所有物理体");
    
    // 清理敌人组
    if (this.enemies) {
      console.log("清理敌人组，当前数量:", this.enemies.getChildren().length);
      this.enemies.clear(true, true);
      // 不要设置为null，避免物理碰撞器引用错误
    }
    
    // 清理Boss组
    if (this.bossesGroup) {
      console.log("清理Boss组，当前数量:", this.bossesGroup.getChildren().length);
      this.bossesGroup.clear(true, true);
      // 不要设置为null，避免物理碰撞器引用错误
    }
    
    // 清理物理碰撞器
    if (this.walls1Collider) {
      this.walls1Collider.destroy();
      this.walls1Collider = null!;
    }
    if (this.walls2Collider) {
      this.walls2Collider.destroy();
      this.walls2Collider = null!;
    }
    if (this.blockCollider) {
      this.blockCollider.destroy();
      this.blockCollider = null!;
    }
    if (this.enemyPlayerOverlap) {
      this.enemyPlayerOverlap.destroy();
      this.enemyPlayerOverlap = null!;
    }
    if (this.enemyWallsCollider) {
      this.enemyWallsCollider.destroy();
      this.enemyWallsCollider = null!;
    }
    if (this.bossWallsCollider) {
      this.bossWallsCollider.destroy();
      this.bossWallsCollider = null!;
    }
    if (this.bossPlayerOverlap) {
      this.bossPlayerOverlap.destroy();
      this.bossPlayerOverlap = null!;
    }
    
    // 清理所有可能的物理组
    if (this.enemies) {
      this.enemies.clear(true, true);
      this.enemies = null!;
    }
    if (this.bossesGroup) {
      this.bossesGroup.clear(true, true);
      this.bossesGroup = null!;
    }
    
    // 清理玩家
    if (this.player) {
      this.player.destroy();
      this.player = null!;
    }
    
    // 清理所有物理体
    this.physics.world.bodies.clear();
    
    console.log("GameScene资源清理完成");
  }

  update() {
    if (!this.player) return;

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
    
    this.player.update(); // 更新玩家
    
    // ==========================================
    // 【新增 3：苍蝇宠物平滑跟随算法】
    // ==========================================
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
    
    // 检测Boss是否在相机视野内
    if (this.myBoss && this.myBoss.active) {
        const camera = this.cameras.main;
        
        // 检查Boss是否在相机视野内
        if (camera.worldView.contains(this.myBoss.x, this.myBoss.y)) {
            this.myBoss.showHealthBar();
        } else {
            this.myBoss.hideHealthBar();
        }
    }

    // ==========================================
    // 【魂系单向门判定逻辑】
    // ==========================================
    
    // Phaser.Input.Keyboard.JustDown 确保按住F键时只触发一次
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        
        // ==========================================
        // 【修改 4：宝箱交互逻辑】
        // ==========================================
        if (this.activeInteractZone.startsWith('chest_') && !this.openedChests.has(this.activeInteractZone)) {
            
            this.openedChests.add(this.activeInteractZone);
            
            // 保存打开状态到全局
            if (!(this.game as any).globalState) {
                (this.game as any).globalState = {};
            }
            (this.game as any).globalState.openedChests = Array.from(this.openedChests);
            console.log("宝箱打开状态已保存到全局");
            
            // 视觉：把宝箱的图块从“关”换成“开”
            if (this.activeInteractZone === 'chest_hp') {
                const triggerLayer = this.map.getObjectLayer('Triggers');
                if (triggerLayer && triggerLayer.objects) {
                    const chestObject = triggerLayer.objects.find(obj => obj.name === 'chest_hp');
                    if (chestObject) {
                        const walls2Layer = this.map.getLayer('Walls2')!.tilemapLayer;
                        if (walls2Layer) {
                            // 确保在Walls2层替换图块
                            walls2Layer.putTileAtWorldXY(1958, chestObject.x! + chestObject.width! / 2, chestObject.y! + chestObject.height! / 2);
                            
                            // 重新设置碰撞，确保新放置的图块有碰撞体积
                            walls2Layer.setCollisionByExclusion([-1]);
                            
                            // 确保Walls2层的碰撞始终开启
                            if (this.walls2Collider) {
                                this.walls2Collider.active = true;
                            }
                        }
                    }
                }
            }

            if (this.activeInteractZone === 'chest_hp') {
                this.player.maxHealth++;
                this.player.health = this.player.maxHealth; // 升级血量同时回满血
                // 发送新的事件，直接传递新的最大值和当前值
                this.game.events.emit('update-max-health', this.player.maxHealth, this.player.health);
            }
            else if (this.activeInteractZone === 'chest_gauntlet') {
                console.log("获得【破岩拳套】！翻滚后可直接派生重击！");
                this.player.upgradeToGauntlet();
            }
            else if (this.activeInteractZone === 'chest_fly') {
                console.log("获得【嗜血魔蝇】！重击附带叠层流血与吸血！");
                this.player.hasFly = true;
                // 生成苍蝇宠物实体
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
        }
        else if (this.activeInteractZone === 'zone_locked') {
            // 玩家在错误的一侧按了F键
            if (!this.isDoorOpen) {
                // 显示UI提示
                this.game.events.emit('show-message', '不能从这一侧打开');
            }
        }
        else if (this.activeInteractZone === 'zone_unlock') {
            // 玩家在正确的一侧按了F键
            if (!this.isDoorOpen) {
                this.isDoorOpen = true;
                // 不需要显示消息
                
                // 【核心】：门开了！销毁那个物理阻挡体，让玩家能穿过去！
                if (this.doorSolid) {
                    this.doorSolid.destroy();
                    
                    // 保存门的状态到全局对象
                    if (!(this.game as any).globalState) {
                        (this.game as any).globalState = {};
                    }
                    (this.game as any).globalState.gameSceneDoorOpen = true;
                    console.log("门的状态已保存到全局对象");
                    
                    // ==========================================
                    // 【核心新增：动态替换地图图案】
                    // ==========================================
                    
                    // 门画在 'Ground2' 层
                    const ground2Layer = this.map.getLayer('Ground2')!.tilemapLayer;

                    // 开门的 ID 是 302
                    const openDoorID = 303;

                    // 我们怎么知道门画在哪里？
                    // 我们刚才存了门周围的触发区 (doorSolid) 的坐标！
                    // 我们把这个物理坐标 (World XY) 转换成地图格子坐标 (Tile XY)，
                    // 然后在那个格子上，放上“开门”的图案！

                    if (ground2Layer) {
                        // Phaser 的神级 API：直接在这个世界坐标上放置一个新的图块
                        // 参数：(新图块的ID, 世界X坐标, 世界Y坐标)
                        // 替换两个地块的ID（水平方向的两个地块）
                        ground2Layer.putTileAtWorldXY(openDoorID, this.doorSolid.x, this.doorSolid.y);
                        ground2Layer.putTileAtWorldXY(openDoorID, this.doorSolid.x + 16, this.doorSolid.y);
                    }
                }
            }
        }
        // 进入房子
        else if (this.activeInteractZone === 'door_to_house') {
            this.switchScene("HouseScene", "door_to_overworld", -30);
        }
        // 从地面进入地下
        else if (this.activeInteractZone === 'ladder_to_underground') {
            this.switchScene("UnderGroundScene", "ladder_from_overworld", -16);
        }
    }
  }

  // 重叠回调函数：只要踩在区域上，就会把区域的名字记下来
  private onInteractZone(_player: any, zone: any) {
    this.activeInteractZone = zone.name;
  }
  
  // 切换场景的通用方法
  private switchScene(targetScene: string, spawnPoint: string, offsetX: number) {
    this.player.body!.enable = false;
    this.player.setVelocity(0);
    
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(targetScene, { 
        spawnPoint: spawnPoint, 
        offsetX: offsetX,
        hasGauntlet: this.player.hasGauntlet,
        hasFly: this.player.hasFly,
        playerHealth: this.player.health,
        playerMaxHealth: this.player.maxHealth
      });
    });
  }


  // 当玩家在天桥上时
  private onBridge() {
    console.log("玩家在天桥上");
    // 让天桥降到地上
    if (this.above2Layer) {
      this.above2Layer.setDepth(0); // 设置天桥的深度，使其在地面层
      console.log("天桥2降到地上，深度设置为0");
    }
    if (this.above3Layer) {
      this.above3Layer.setDepth(0); // 设置天桥的深度，使其在地面层
      console.log("天桥3降到地上，深度设置为0");
    }
    
    // 关闭Walls1和Walls2的碰撞，让玩家在天桥上自由行走
    if (this.walls1Collider) {
      this.walls1Collider.active = false; // 关闭Walls1层的碰撞
      console.log("关闭Walls1层的碰撞");
    }
    if (this.walls2Collider) {
      this.walls2Collider.active = false; // 关闭Walls2层的碰撞
      console.log("关闭Walls2层的碰撞");
    }
    
    // 开启Block图层的碰撞，实现边缘碰撞体积
    if (this.blockCollider) {
      this.blockCollider.active = true; // 开启Block层的碰撞
      console.log("开启Block层的碰撞");
    } else {
      console.error("Block图层未初始化");
    }
    
    // 碰撞框大小减半
    this.player.body?.setSize(12, 14);
    this.player.body?.setOffset(10, 14);
  }

  // 当玩家在桥下时
  private underBridge() {
    console.log("玩家在桥下");
    // 让天桥升到天上
    if (this.above2Layer) {
      this.above2Layer.setDepth(9999); // 增加天桥的深度，使其在天上
      console.log("天桥2升到天上，深度设置为9999");
    }
    if (this.above3Layer) {
      this.above3Layer.setDepth(9999); // 增加天桥的深度，使其在天上
      console.log("天桥3升到天上，深度设置为9999");
    }
    
    // 恢复所有walls的默认碰撞状态
    if (this.walls1Collider) {
      this.walls1Collider.active = true; // 开启Walls1层的碰撞
      console.log("开启Walls1层的碰撞");
    }
    if (this.walls2Collider) {
      this.walls2Collider.active = true; // 开启Walls2层的碰撞
      console.log("开启Walls2层的碰撞");
    }
    
    // 关闭Block图层的碰撞，恢复到默认状态
    if (this.blockCollider) {
      this.blockCollider.active = false; // 关闭Block层的碰撞
      console.log("关闭Block层的碰撞");
    } else {
      console.error("Block图层未初始化");
    }
    
    // 恢复原碰撞框大小
    this.player.body?.setSize(16, 20);
    this.player.body?.setOffset(8, 9);
  }
}
