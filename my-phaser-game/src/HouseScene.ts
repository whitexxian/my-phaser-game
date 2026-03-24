import Phaser from "phaser";
import Player from "./Player";

export default class HouseScene extends Phaser.Scene {
  private player!: Player;
  private map!: Phaser.Tilemaps.Tilemap;

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
  }

  create() {
    // 1. 生成地图和图块集 (保持不变)
    this.map = this.make.tilemap({ key: "house-map" });

    const tileset = this.map.addTilesetImage("terrian", "terrian-image");

    if (!tileset) {
      console.error("图块集加载失败！");
      return;
    }

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
    
    if (this.scene.settings.data && (this.scene.settings.data as any).spawnPoint) {
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
          }
        } else {
          console.warn(`Spawn point ${spawnPoint} not found in HouseScene`);
        }
      } else {
        console.warn("No trigger layer found in HouseScene");
      }
    }
    
    this.player = new Player(this, playerX, playerY, "player");

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

    if (triggerLayer && triggerLayer.objects) {
      // 遍历这个层里的所有对象 (我们刚才画的矩形框)
      triggerLayer.objects.forEach((obj) => {
        // 如果这个矩形的名字叫 'door_to_overworld'
        if (obj.name === "door_to_overworld") {
          // 把 Tiled 里的矩形数据，转换成 Phaser 里的不可见物理盒子
          // 注意 Tiled 对象的坐标基准点在左下角，所以 Y 要加上高度的一半
          const doorZone = this.add.zone(
            obj.x! + obj.width! / 2,
            obj.y! + obj.height! / 2,
            obj.width!,
            obj.height!,
          );

          // 给这个空气盒子加上物理引擎
          this.physics.add.existing(doorZone, true); // true 代表是静态物体

          // 【魔法时刻：设置重叠检测 (Overlap)】
          // 当玩家 (player) 和这个空气盒子 (doorZone) 重叠时，执行 enterHouse 函数！
          this.physics.add.overlap(
            this.player,
            doorZone,
            this.enterHouse,
            undefined,
            this,
          );
        }

        // 处理前往二楼的楼梯
        if (obj.name === "ladder_to_2floor") {
          const ladderZone = this.add.zone(
            obj.x! + obj.width! / 2,
            obj.y! + obj.height! / 2,
            obj.width!,
            obj.height!,
          );

          this.physics.add.existing(ladderZone, true);

          this.physics.add.overlap(
            this.player,
            ladderZone,
            this.goTo2Floor,
            undefined,
            this,
          );
        }
      });
    }

    this.scene.launch("UIScene");

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
    this.player.update();
  }

  // ==========================================
  // 【切场景的特效与逻辑】
  // ==========================================
  private enterHouse() {
    // 防止玩家反复踩门触发多次
    this.player.body!.enable = false; // 暂停玩家的物理系统
    this.player.setVelocity(0); // 让玩家停下

    // 面试加分项：加入一个“淡出 (Fade Out)”的黑屏转场特效！
    this.cameras.main.fadeOut(500, 0, 0, 0); // 500毫秒内，画面变黑

    // 监听淡出完成的事件
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        console.log("正在返回外部世界...");

        // 停止当前房屋场景，启动外部世界场景！
        this.scene.start("GameScene", {
          spawnPoint: "door_to_house",
          playerHealth: 3, // 【重要】把当前的血量传给下一个场景！
        });
      },
    );
  }

  // 前往二楼
  private goTo2Floor() {
    // 防止玩家反复踩楼梯触发多次
    this.player.body!.enable = false; // 暂停玩家的物理系统
    this.player.setVelocity(0); // 让玩家停下

    // 面试加分项：加入一个“淡出 (Fade Out)”的黑屏转场特效！
    this.cameras.main.fadeOut(500, 0, 0, 0); // 500毫秒内，画面变黑

    // 监听淡出完成的事件
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        console.log("正在前往二楼...");

        // 停止当前房屋场景，启动二楼场景！
        this.scene.start("TwoFloorScene", {
          spawnPoint: "ladder_to_house",
          playerHealth: 3, // 【重要】把当前的血量传给下一个场景！
        });
      },
    );
  }
}
