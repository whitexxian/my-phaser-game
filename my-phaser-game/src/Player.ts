import Phaser from "phaser";

// 【核心新增：定义玩家的所有可能状态】
// 玩家在同一时刻，只能处于其中一种状态！
const PlayerState = {
    IDLE: 0,       // 站立/发呆
    WALK: 1,       // 走路
    RUN: 2,        // 跑步 (按住Shift)
    ROLL: 3,       // 翻滚中 (无敌状态，不可被操作打断)
    ATTACKING: 4,  // 正在攻击中 (硬直状态)
    HURT: 5,       // 受伤硬直
    DEAD: 6        // 死亡
} as const;

type PlayerState = typeof PlayerState[keyof typeof PlayerState];

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // 【新增战斗与移动参数】
  private walkSpeed: number = 70;
  private runSpeed: number = 140;
  private rollSpeed: number = 250; // 翻滚速度极快
  
  // 【核心新增：状态机变量】
  private currentState: PlayerState = PlayerState.IDLE;
  
  // 记录翻滚时的方向向量，保证翻滚途中不能拐弯
  private rollDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 1);
  
  // 记录玩家当前朝向
  private currentDirection: string = "down"; // down, left, right, up
  
  // 记录最后面朝的方向向量
  private lastFacingDir: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 1); // 默认朝下
  
  // 【核心新增：无敌帧标志】
  public isInvincible: boolean = false;
  private isHurtInvincible: boolean = false; // 单独标记受击无敌状态
  
  // 【新增属性】
  public health: number = 3; // 玩家有 3 颗心
  public maxHealth: number = 3; // 最大生命值
  private isHurt: boolean = false; // 受伤硬直标志
  
  // 影子
  private shadow!: Phaser.GameObjects.Ellipse;
  
  // 【新增】：声明 Shift 按键
  private shiftKey: Phaser.Input.Keyboard.Key;
  
  // 交互按键 (空格键用于翻滚和交互)
  private spaceKey!: Phaser.Input.Keyboard.Key;
  
  // 攻击按键 (J键)
  private jKey!: Phaser.Input.Keyboard.Key;
  
  // 【核心新增：连击系统变量】
  private comboCount: number = 0; // 当前打到了第几段 (0, 1, 2, 3)
  private comboTimer: Phaser.Time.TimerEvent | null = null; // 连击判定窗口倒计时
  private mouseLeftDown: boolean = false; // 鼠标左键按下状态
  
  // 【核心新增：攻击伤害配置】
  private attackDamage: number[] = [0, 0.2, 0.3, 1.0]; // 第0段无，第1段0.2，第2段0.3，第3段1.0
  
  // 【新增：道具状态】
  public hasGauntlet: boolean = false;
  public hasFly: boolean = false;
  
  // 【新增：翻滚派生攻击标志】
  private canDashAttack: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, hasGauntlet: boolean = false, playerHealth: number = 3, playerMaxHealth: number = 3, hasFly: boolean = false) {
    // 根据是否有拳套设置初始纹理
    const initialTexture = hasGauntlet ? 'player_new' : texture;
    super(scene, x, y, initialTexture);
    
    // 设置拳套状态
    this.hasGauntlet = hasGauntlet;
    
    // 设置苍蝇状态
    this.hasFly = hasFly;
    
    // 设置初始血量和最大血量
    this.health = playerHealth;
    this.maxHealth = playerMaxHealth;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setScale(0.8); // 保留你设置的 0.8 倍缩放

    // 保留你调整好的碰撞框
    this.body?.setSize(16, 20);
    this.body?.setOffset(8, 9);
    
    // 创建影子
    this.shadow = scene.add.ellipse(
        this.x,
        this.y + 8, // 影子在角色下方（调整位置）
        16, // 宽度
        8, // 高度
        0x000000, // 黑色
        0.3 // 透明度
    );
    this.shadow.setDepth(this.y - 0.5); // 影子在角色下方

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = scene.input.keyboard!.addKeys("W,A,S,D") as any;

    // 【新增】：初始化监听键盘上的 Shift 键
    this.shiftKey = scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    );
    
    // 初始化空格键
    this.spaceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    
    // 初始化J键（攻击键）
    this.jKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);

    // 初始化鼠标左键监听
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.mouseLeftDown = true;
      }
    });
    
    scene.input.on('pointerup', () => {
      this.mouseLeftDown = false;
    });

    this.createAnimations();
  }

  private createAnimations() {
    // 根据当前纹理创建动画
    this.createWalkAnimations();
    this.createRollAnimations();
    this.createAttackAnimations();
  }
  
  private createWalkAnimations() {
    // 这里的 frameRate: 8 是动画的“默认基础播放速度”
    this.anims.create({
      key: "walk-down",
      frames: this.anims.generateFrameNumbers(this.texture.key, {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-left",
      frames: this.anims.generateFrameNumbers(this.texture.key, {
        start: 4,
        end: 7,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-right",
      frames: this.anims.generateFrameNumbers(this.texture.key, {
        start: 8,
        end: 11,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-up",
      frames: this.anims.generateFrameNumbers(this.texture.key, {
        start: 12,
        end: 15,
      }),
      frameRate: 8,
      repeat: -1,
    });
  }
  
  private createRollAnimations() {
    const rollTexture = this.hasGauntlet ? "player_roll_new" : "player_roll";
    
    this.anims.create({
      key: "roll-up",
      frames: this.anims.generateFrameNumbers(rollTexture, {
        start: 0,
        end: 3,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "roll-right",
      frames: this.anims.generateFrameNumbers(rollTexture, {
        start: 4,
        end: 7,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "roll-left",
      frames: this.anims.generateFrameNumbers(rollTexture, {
        start: 8,
        end: 11,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "roll-down",
      frames: this.anims.generateFrameNumbers(rollTexture, {
        start: 12,
        end: 15,
      }),
      frameRate: 15,
      repeat: 0,
    });
  }
  
  private createAttackAnimations() {
    const attackTexture = this.hasGauntlet ? "player_attack_new" : "player_attack";
    
    // 向下攻击（第一行）
    this.anims.create({
      key: "attack_down_1",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 0,
        end: 1,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_down_2",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 2,
        end: 3,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_down_3",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 4,
        end: 6,
      }),
      frameRate: 15,
      repeat: 0,
    });
    
    // 向左攻击（第二行）
    this.anims.create({
      key: "attack_left_1",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 7,
        end: 8,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_left_2",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 9,
        end: 10,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_left_3",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 11,
        end: 13,
      }),
      frameRate: 15,
      repeat: 0,
    });
    
    // 向右攻击（第三行）
    this.anims.create({
      key: "attack_right_1",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 14,
        end: 15,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_right_2",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 16,
        end: 17,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_right_3",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 18,
        end: 20,
      }),
      frameRate: 15,
      repeat: 0,
    });
    
    // 向上攻击（第四行）
    this.anims.create({
      key: "attack_up_1",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 21,
        end: 22,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_up_2",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 23,
        end: 24,
      }),
      frameRate: 15,
      repeat: 0,
    });
    this.anims.create({
      key: "attack_up_3",
      frames: this.anims.generateFrameNumbers(attackTexture, {
        start: 25,
        end: 27,
      }),
      frameRate: 15,
      repeat: 0,
    });

    // 不需要监听animationcomplete事件，使用delayedCall来结束翻滚
  }

  // ==========================================
  // 【核心架构：状态机的主循环】
  // ==========================================
  update() {
    if (!this.body) return;
    this.setDepth(this.y);
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    
    // 更新影子位置
    if (this.shadow) {
        this.shadow.setPosition(this.x, this.y + 8);
        this.shadow.setDepth(this.y - 0.5);
    }

    // 无论当前是什么状态，我们总是先获取玩家的输入意图
    let inputX = 0;
    let inputY = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) inputX = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) inputX = 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) inputY = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) inputY = 1;

    const isMoving = (inputX !== 0 || inputY !== 0);

    // ==========================================
    // 根据当前状态，执行不同的逻辑 (状态分配器)
    // ==========================================
    switch (this.currentState) {
        case PlayerState.IDLE:
        case PlayerState.WALK:
        case PlayerState.RUN:
            // 如果是正常的移动状态，调用统一的移动处理函数
            this.handleMovement(inputX, inputY, isMoving);
            
            // 1. 翻滚判定 (依然用空格)
            if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
                this.startRoll(inputX, inputY);
            }
            
            // 2. 【新增：攻击判定】
            // 只有在正常状态下，才能起手攻击！
            if (this.mouseLeftDown || Phaser.Input.Keyboard.JustDown(this.jKey)) {
                this.performAttack();
                this.mouseLeftDown = false; // 防止连续触发
            }
            break;

        case PlayerState.ROLL:
            // 如果正在翻滚，什么都不做，完全锁死玩家的输入！
            // (翻滚的移动交给了物理引擎的 velocity，动画播完后会通过事件切回 IDLE)
            break;

        case PlayerState.ATTACKING:
            // 【核心：攻击硬直】
            // 攻击时不允许移动，速度强制归零！
            this.setVelocity(0, 0);
            
            // 【新增：允许翻滚打断攻击，但只能打断第一拳】
            if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && this.comboCount === 1) {
                // 传递(0, 0)让startRoll方法使用相反方向逻辑
                this.startRoll(0, 0);
            }
            
            // 【连招输入缓存机制 (Input Buffering)】
            // 即使玩家还在上一拳的硬直动画里，只要他提前按下了鼠标左键或J键，
            // 我们就允许他"预输入"下一拳，动画结束后自动接上！
            // 这在动作游戏里极大地提升了手感。
            if ((this.mouseLeftDown || Phaser.Input.Keyboard.JustDown(this.jKey)) && this.comboCount < 3) {
                // 把按键缓存起来，等当前动画播完立刻执行下一段
                this.scene.time.delayedCall(50, () => {
                    // 这是一个简化的缓冲，真实项目会更复杂。我们先用最直接的方式：
                    // 只要按了，我们就把连击倒计时重置，准备接下一招
                });
                this.mouseLeftDown = false; // 防止连续触发
            }
            break;
    }
  }

  // ==========================================
  // 【状态处理函数：正常移动】
  // ==========================================
  private handleMovement(inputX: number, inputY: number, isMoving: boolean) {
    if (!isMoving) {
        // 没有输入，进入 IDLE 状态
        this.currentState = PlayerState.IDLE;
        this.setVelocity(0, 0);
        this.anims.stop();
        const currentAnim = this.anims.currentAnim?.key;
        if (currentAnim) {
            if (currentAnim === "walk-down") this.setFrame(0);
            else if (currentAnim === "walk-left") this.setFrame(4);
            else if (currentAnim === "walk-right") this.setFrame(8);
            else if (currentAnim === "walk-up") this.setFrame(12);
        }
        return;
    }

    // 有输入，判断是跑还是走
    const isRunning = this.shiftKey.isDown;
    this.currentState = isRunning ? PlayerState.RUN : PlayerState.WALK;
    const currentSpeed = isRunning ? this.runSpeed : this.walkSpeed;

    // 应用速度
    const velocity = new Phaser.Math.Vector2(inputX, inputY).normalize().scale(currentSpeed);
    this.setVelocity(velocity.x, velocity.y);
    
    // 【新增】：只要玩家有移动输入，就更新面朝方向
    if (inputX !== 0 || inputY !== 0) {
        this.lastFacingDir.set(inputX, inputY).normalize();

        // 播放动画 (保持你之前的逻辑)
        const currentFrameRate = isRunning ? 14 : 8;
        let animKey = "";
        if (inputX < 0) {
            animKey = "walk-left";
            this.currentDirection = "left";
        } else if (inputX > 0) {
            animKey = "walk-right";
            this.currentDirection = "right";
        } else if (inputY < 0) {
            animKey = "walk-up";
            this.currentDirection = "up";
        } else if (inputY > 0) {
            animKey = "walk-down";
            this.currentDirection = "down";
        }
        this.anims.play({ key: animKey, frameRate: currentFrameRate }, true);
        
        // 【极其关键】：随时记录玩家最后一次面朝的方向！
        // 因为如果玩家站着不动按空格，我们要知道他该往哪个方向翻滚！
        this.rollDirection.set(inputX, inputY).normalize();
    }
  }

  // ==========================================
  // 【状态处理函数：启动翻滚 (无敌帧开始)】
  // ==========================================
  private startRoll(inputX: number, inputY: number) {
      // 重置连击数
      this.comboCount = 0;
      if (this.comboTimer) {
          this.comboTimer.remove();
      }
      
      // 1. 切换状态：锁死一切输入！
      this.currentState = PlayerState.ROLL;
      
      // 2. 开启无敌帧！
      this.isInvincible = true;
      // (可选：让角色变半透明，暗示无敌状态)
      this.setAlpha(0.8);

      // 3. 确定翻滚方向
      // 如果按着方向键翻滚，就往按键方向滚；如果没按，就往当前站姿的相反方向滚
      let rollDir = new Phaser.Math.Vector2(inputX, inputY).normalize();
      if (rollDir.length() === 0) {
          // 根据当前站姿计算相反方向
          if (this.currentDirection === "down") rollDir = new Phaser.Math.Vector2(0, -1); // 向上翻滚
          else if (this.currentDirection === "left") rollDir = new Phaser.Math.Vector2(1, 0); // 向右翻滚
          else if (this.currentDirection === "right") rollDir = new Phaser.Math.Vector2(-1, 0); // 向左翻滚
          else if (this.currentDirection === "up") rollDir = new Phaser.Math.Vector2(0, 1); // 向下翻滚
          else rollDir = this.rollDirection; // 备用方案
      }

      // 4. 先归零之前的速度，再赋予极高的翻滚初速度 (瞬间冲刺)
      this.setVelocity(0, 0);
      const velocity = rollDir.scale(this.rollSpeed);
      this.setVelocity(velocity.x, velocity.y);

      // 5. 播放翻滚动画
      let animKey = "";
      if (rollDir.x < 0) animKey = "roll-left";
      else if (rollDir.x > 0) animKey = "roll-right";
      else if (rollDir.y < 0) animKey = "roll-up";
      else if (rollDir.y > 0) animKey = "roll-down";
      this.anims.play({ key: animKey, frameRate: 15 }, true);

      // 6. 【核心机制】：翻滚的结束判定
      // 方法 A：用物理减速 (阻力)，等速度降为 0 结束。
      // 方法 B (推荐)：用时间。假设翻滚持续 0.4 秒 (400毫秒)。
      this.scene.time.delayedCall(187.5, () => {
          this.endRoll();
      });
  }

  // ==========================================
  // 【状态处理函数：结束翻滚 (无敌帧结束)】
  // ==========================================
  private endRoll() {
      // 安全检查：防止在其他状态被误调用
      if (this.currentState !== PlayerState.ROLL) return;

      // 1. 恢复正常状态
      this.currentState = PlayerState.IDLE;
      
      // 2. 解除无敌帧（只有在不在受击无敌状态时才解除）
      if (!this.isHurtInvincible) {
          this.isInvincible = false;
          this.setAlpha(1); // 恢复不透明
      }
      
      // 2. 切换回对应的spritesheet并设置默认站姿
      this.setTexture(this.hasGauntlet ? "player_new" : "player");
      this.anims.stop();
      if (this.currentDirection === "down") this.setFrame(0);
      else if (this.currentDirection === "left") this.setFrame(4);
      else if (this.currentDirection === "right") this.setFrame(8);
      else if (this.currentDirection === "up") this.setFrame(12);

      // 4. 速度归零
      this.setVelocity(0, 0);
      
      // 如果拥有拳套，翻滚结束后给予 0.3 秒的“派生重击”判定窗口！
      if (this.hasGauntlet) {
        this.canDashAttack = true;
        this.scene.time.delayedCall(300, () => {
          this.canDashAttack = false;
        });
      }
  }

  // ==========================================
  // 【连击逻辑：执行攻击】
  // ==========================================
  private performAttack() {
      // 1. 切换为攻击状态 (硬直开始)
      this.currentState = PlayerState.ATTACKING;
      this.setVelocity(0, 0); // 停下脚步

      // 【核心派生逻辑】：如果在翻滚后的 0.3 秒内按下攻击，直接跳到第 3 段！
      if (this.hasGauntlet && this.canDashAttack) {
        this.comboCount = 3;
        this.canDashAttack = false; // 消耗掉派生状态
        console.log("翻滚派生！直接打出第三段重击！");
      } else {
        // 2. 增加连击段数
        this.comboCount++;
        
        // 如果打出了第4拳，强制重置为第1拳
        if (this.comboCount > 3) {
            this.comboCount = 1;
        }
      }

      console.log(`挥出了第 ${this.comboCount} 拳！伤害：${this.attackDamage[this.comboCount]}`);

      // 3. 取消上一次的"连击断档"倒计时
      if (this.comboTimer) {
          this.comboTimer.remove();
      }

      // 4. 播放对应的攻击动画和特效
      let attackDuration = 300; // 默认前两拳耗时 0.3 秒
      
      // 根据当前朝向和连击段数播放对应的攻击动画
      const animKey = `attack_${this.currentDirection}_${this.comboCount}`;
      this.anims.play({ key: animKey, frameRate: 15 }, true);
      
      if (this.comboCount === 3) {
          attackDuration = 500; // 第三拳后摇极大，耗时 0.6 秒！
      }

      // 5. 【核心】：生成攻击判定区 (Hitbox)
      // 真正的游戏是在挥拳的特定一帧生成伤害框，我们这里简化为攻击开始就造成伤害。
      this.createHitbox(this.attackDamage[this.comboCount]);

      // 6. 结束当前攻击动作 (解除硬直)
      this.scene.time.delayedCall(attackDuration, () => {
          this.endAttack();
      });
  }

  // ==========================================
  // 【核心新增：外观与招式热重载】
  // ==========================================
  public upgradeToGauntlet() {
    this.hasGauntlet = true;
    console.log("获得拳套！外观改变，解锁翻滚派生重击！");
    
    // 保存当前玩家状态
    const playerState = {
      x: this.x,
      y: this.y,
      direction: this.currentDirection,
      sceneName: this.scene.sys.config,
      hasGauntlet: this.hasGauntlet,
      hasFly: this.hasFly,
      health: this.health,
      maxHealth: this.maxHealth
    };
    
    // 保存状态到全局
    if (!(this.scene.game as any).globalState) {
      (this.scene.game as any).globalState = {};
    }
    (this.scene.game as any).globalState.playerState = playerState;
    
    // 刷新当前场景以确保立即生效
    console.log("刷新场景以应用拳套外观...");
    this.scene.scene.restart({
      spawnPoint: playerState.direction,
      hasGauntlet: this.hasGauntlet,
      hasFly: this.hasFly,
      playerHealth: this.health,
      playerMaxHealth: this.maxHealth
    });
  }

  // ==========================================
  // 【连击逻辑：结束单次攻击】
  // ==========================================
  private endAttack() {
      if (this.currentState !== PlayerState.ATTACKING) return;

      // 恢复正常状态
      this.currentState = PlayerState.IDLE;
      
      // 切换回对应的spritesheet
      this.setTexture(this.hasGauntlet ? "player_new" : "player");
      
      // 攻击结束后回到对应方向的默认站姿（走路动画的第一帧）
      this.anims.stop();
      if (this.currentDirection === "down") this.setFrame(0);
      else if (this.currentDirection === "left") this.setFrame(4);
      else if (this.currentDirection === "right") this.setFrame(8);
      else if (this.currentDirection === "up") this.setFrame(12);

      // 【最核心的连招判定窗口】：
      // 这一拳打完了，我给你 0.5 秒的时间按下一次鼠标左键。
      // 如果 0.5 秒内你没按，连招就断了，必须从第 1 拳重新开始打。
      this.comboTimer = this.scene.time.delayedCall(500, () => {
          console.log("连击判定时间结束，Combo 断了！");
          this.comboCount = 0;
      });
  }

  // ==========================================
  // 【核心新增：生成短暂的攻击判定框 (Hitbox)】
  // ==========================================
  private createHitbox(damage: number) {
      // 1. 拳头应该出现在玩家面前多远？
      let attackRange = 24; // 距离玩家中心 24 像素
      if (this.comboCount === 3){
        attackRange = 35
      }

      // 根据玩家面朝的方向，计算拳头生成的世界坐标
      const hitboxX = this.x + this.lastFacingDir.x * attackRange;
      const hitboxY = this.y + this.lastFacingDir.y * attackRange;

      // 2. 第 3 拳 (下砸) 的判定范围更大！
      let hitboxSize = 20;
      if (this.comboCount === 3) {
          hitboxSize = 40; // 大招范围翻倍！
      }

      // 3. 在场景中创建一个不可见的空气方块
      const hitbox = this.scene.add.zone(hitboxX, hitboxY, hitboxSize, hitboxSize);
      this.scene.physics.add.existing(hitbox);

      // (为了调试，如果你开启了 debug: true，你能看到这个拳头框)

      // 4. 【灵魂机制】：我们要告诉主场景 (GameScene)，我打出了一拳！
      // 请主场景去帮我检查，这个 hitbox 有没有碰到任何怪物！
      this.scene.events.emit('player-attack', hitbox, damage, this.lastFacingDir, this.comboCount, this.hasFly);

      // 5. 拳头不能一直存在，0.1 秒后瞬间销毁它！(这就是动作游戏的“判定帧”)
      this.scene.time.delayedCall(100, () => {
          hitbox.destroy();
      });
  }
  
  // ==========================================
  // 【新增：玩家挨打逻辑】
  // ==========================================
  public takeDamage(damage: number, attackerX: number, attackerY: number) {
      // 1. 无敌判定：如果玩家在翻滚无敌帧，或者正在挨打的硬直无敌帧，直接免疫！
      if (this.isInvincible || this.isHurt || this.currentState === PlayerState.DEAD) return;

      this.health -= damage;
      this.currentState = PlayerState.HURT;
      this.isHurt = true;
      this.isInvincible = true; // 挨打后获得短暂无敌帧，防止被连续碰瓷秒杀
      this.isHurtInvincible = true; // 标记受击无敌状态

      console.log(`勇者挨揍了！剩余血量: ${this.health}`);
      
      // 【关键】：发送全局事件，通知 UIScene 掉血啦！
      this.scene.game.events.emit('update-health', this.health);

      // 2. 视觉反馈：变红闪烁
      this.setTint(0xff0000);

      // 3. 物理击退反馈：被怪物弹开
      // 计算从怪物指向玩家的方向
      const knockbackDir = new Phaser.Math.Vector2(this.x - attackerX, this.y - attackerY).normalize();
      this.setVelocity(knockbackDir.x * 200, knockbackDir.y * 200);

      // 4. 死亡判定
      if (this.health <= 0) {
          this.die();
          return;
      }

      // 5. 解除受伤硬直 (0.3秒后可移动，但依然闪烁无敌)
      this.scene.time.delayedCall(300, () => {
          this.currentState = PlayerState.IDLE;
          this.isHurt = false;
          this.clearTint();
          
          // 开启受击无敌闪烁特效 (持续 1 秒)
          this.scene.tweens.add({
              targets: this,
              alpha: 0.2, // 半透明
              yoyo: true,
              repeat: 5,  // 闪烁 5 次
              duration: 100, // 每次 0.1 秒
              onComplete: () => {
                  this.isInvincible = false; // 1秒后，彻底解除无敌帧
                  this.isHurtInvincible = false; // 解除受击无敌标记
                  this.setAlpha(1);
              }
          });
      });
  }

  private die() {
      this.currentState = PlayerState.DEAD;
      this.setVelocity(0, 0);
      this.setTint(0x555555);
      this.setAngle(90); // 倒下
      
      // 销毁影子
      if (this.shadow) {
          this.shadow.destroy();
      }
      
      console.log("死亡！传送回bed区域...");
      
      // 获取上次休息的重生点
      const globalState = (this.scene.game as any).globalState;
      const lastRestPoint = globalState?.lastRestPoint || { scene: "TwoFloorScene", spawnPoint: "bed" };
      
      // 创建黑屏覆盖层
      const blackScreen = this.scene.add.rectangle(
          this.scene.cameras.main.width / 2,
          this.scene.cameras.main.height / 2,
          this.scene.cameras.main.width,
          this.scene.cameras.main.height,
          0x000000,
          0
      );
      blackScreen.setDepth(10000);
      
      // 延迟一下再传送，让死亡动画播放一下
      this.scene.time.delayedCall(1000, () => {
          // 黑屏淡入
          this.scene.tweens.add({
              targets: blackScreen,
              alpha: 1,
              duration: 500,
              onComplete: () => {
                  // 重启场景并传送到bed区域
                  this.scene.scene.start(lastRestPoint.scene, {
                      spawnPoint: lastRestPoint.spawnPoint,
                      playerHealth: this.maxHealth, // 回满最大血量
                      playerMaxHealth: this.maxHealth, // 传递最大血量
                      hasGauntlet: this.hasGauntlet,
                      hasFly: this.hasFly,
                      shouldRespawnMonsters: true // 死亡时刷新所有怪物
                  });
              }
          });
      });
  }
}
