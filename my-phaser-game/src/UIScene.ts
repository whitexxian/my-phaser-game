// src/UIScene.ts
import Phaser from "phaser";

export default class UIScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];
  private maxHealth: number = 3; // 最大血量 3 颗心
  private currentHealth: number = 3;
  
  // Boss血条相关
  private bossHealthBar!: Phaser.GameObjects.Graphics;
  private bossMaxHealth: number = 20;
  private bossCurrentHealth: number = 20;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossDamageText!: Phaser.GameObjects.Text;
  
  // 流血层数相关
  private bossBleedIcons: Phaser.GameObjects.Image[] = [];
  private bossCurrentBleedStacks: number = 0;
  
  // 提示消息相关
  private messageText!: Phaser.GameObjects.Text;
  private messageTween!: Phaser.Tweens.Tween;
  
  // 背包按钮
  private bagIcon: Phaser.GameObjects.Image | null = null;
  private inventoryKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    // 给这个场景起个名字叫 'UIScene'
    super({ key: "UIScene" });
  }

  preload() {
    // 加载你画的三个心形图标
    this.load.image("heart-full", "assets/ui/heart_full.png");
    this.load.image("heart-half", "assets/ui/heart_half.png");
    this.load.image("heart-empty", "assets/ui/heart_empty.png");
    
    // 加载流血层数图标
    this.load.spritesheet("bleed-icons", "assets/ui/icon_bleeding.png", {
      frameWidth: 32,
      frameHeight: 32,
      startFrame: 0,
      endFrame: 2
    });
    
    // 加载背包按钮图标
    this.load.image("icon_bag", "assets/ui/icon_bag.png");
  }

  create() {
    this.drawHearts();

    // 监听来自全局游戏管理器的“玩家受伤/回血”事件
    // 这样只要其他场景喊一声 "update-health"，UI就会自动更新
    this.game.events.on("update-health", this.updateHealthUI, this);
    // 监听生命上限增加事件
    this.game.events.on('update-max-health', (newMaxHealth: number, newCurrentHealth: number) => {
      this.maxHealth = newMaxHealth;
      this.currentHealth = newCurrentHealth;
      this.drawHearts();
    });
    
    // 创建Boss血条
    this.bossHealthBar = this.add.graphics();
    this.bossHealthBar.setScrollFactor(0);
    this.bossHealthBar.setVisible(false);
    
    // 监听Boss血条更新事件
    this.game.events.on("update-boss-health", this.updateBossHealthUI, this);
    this.game.events.on("show-boss-health", this.showBossHealthBar, this);
    this.game.events.on("hide-boss-health", this.hideBossHealthBar, this);
    
    // 监听Boss流血层数更新事件
    this.game.events.on("update-boss-bleed", this.updateBossBleedUI, this);
    
    // 监听提示消息事件
    this.game.events.on("show-message", this.showMessage, this);

    // 【新增】：监听道具获得UI事件
    this.game.events.on("show-item-get-ui", this.showItemGetUI, this);

    // 【新增】：监听死亡画面事件
    this.game.events.on("show-death-screen", this.showDeathScreen, this);

    // 【新增】：监听成就展示事件
    this.game.events.on("show-achievement", this.showAchievement, this);

    // 创建提示消息文本
    this.messageText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height - 100,
      '',
      {
        fontSize: '35px',
        fontFamily: 'Arial',
        color: '#ffffff',
        align: 'center'
      }
    );
    this.messageText.setOrigin(0.5);
    this.messageText.setScrollFactor(0);
    this.messageText.setDepth(1002);
    this.messageText.alpha = 0;
    
    this.messageText.alpha = 0;

    // ==========================================
    // 【核心新增：背包按钮和B键监听】
    // 只负责触发打开背包事件，实际背包UI在InventoryScene中管理
    // ==========================================
    this.createBagButton();
    
    // B键打开背包（发送事件给InventoryScene）
    this.inventoryKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.inventoryKey.on('down', () => {
      console.log('[UIScene] B key pressed, emitting open-inventory event');
      this.game.events.emit('open-inventory');
    });

    // 启动 InventoryScene（让它监听事件）
    this.scene.launch('InventoryScene');
    console.log('[UIScene] launched InventoryScene');
  }

  // 【新增】：显示死亡画面
  private showDeathScreen = (data: { text: string; color: string; duration: number; onComplete: () => void }) => {
    console.log('[UIScene] 显示死亡画面:', data.text, '持续时间:', data.duration);

    // 创建黑屏覆盖层（初始alpha为0，完全透明）
    const blackScreen = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width,
      this.cameras.main.height,
      0x000000
    );
    blackScreen.setAlpha(0);
    blackScreen.setScrollFactor(0);
    blackScreen.setDepth(10000);

    // 创建巨大的死亡文字（初始透明，保持正常大小）
    const deathLabel = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      data.text,
      {
        fontFamily: "SimSun, 宋体, serif",
        fontSize: "200px",
        fontStyle: "bold",
        color: data.color,
        stroke: data.color,
        strokeThickness: 8
      }
    );
    deathLabel.setOrigin(0.5);
    deathLabel.setScrollFactor(0);
    deathLabel.setDepth(10001);
    deathLabel.setAlpha(0);
    // 保持正常大小，不缩放

    console.log('[UIScene] 开始淡入动画，场景活跃:', this.scene.isActive());

    // 第一阶段：屏幕渐暗和文字淡入同时进行（3秒）
    this.tweens.add({
      targets: blackScreen,
      alpha: 1,
      duration: 3000,
      ease: "Linear",
      onStart: () => {
        console.log('[UIScene] 黑屏淡入开始');
      },
      onComplete: () => {
        console.log('[UIScene] 黑屏淡入完成');
      }
    });

    // 文字同时淡入
    this.tweens.add({
      targets: deathLabel,
      alpha: 1,
      duration: 3000,
      ease: "Linear",
      onStart: () => {
        console.log('[UIScene] 文字淡入开始');
      },
      onComplete: () => {
        console.log('[UIScene] 文字淡入完成');
      }
    });

    // 第二阶段：持续显示3秒后，淡出文字，然后执行回调
    this.time.delayedCall(3000 + data.duration, () => {
      console.log('[UIScene] 开始淡出');
      // 文字淡出
      this.tweens.add({
        targets: deathLabel,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          // 清理死亡画面元素
          blackScreen.destroy();
          deathLabel.destroy();
          
          // 执行回调（复活）
          data.onComplete();
        }
      });
    });
  }

  // 更新 UI 的核心逻辑
  private updateHealthUI(newHealth: number) {
    this.currentHealth = newHealth;

    for (let i = 0; i < this.maxHealth; i++) {
      const heartValue = this.currentHealth - i;

      if (heartValue >= 1) {
        // 剩余血量 >= 1，这颗心是满的
        this.hearts[i].setTexture("heart-full");
      } else if (heartValue > 0 && heartValue < 1) {
        // 剩余血量是个小数 (比如 0.5)，这颗心是半血
        this.hearts[i].setTexture("heart-half");
      } else {
        // 剩余血量 <= 0，这颗心是空的
        this.hearts[i].setTexture("heart-empty");
      }
    }
  }
  
  // 【新增】：把画心形封装成方法，方便重绘
  private drawHearts() {
    // 先清空旧的
    this.hearts.forEach(h => h.destroy());
    this.hearts = [];
    // 重新画 - 增大心形显示（从scale 2 改为 2.5，位置也相应调整）
    for (let i = 0; i < this.maxHealth; i++) {
      const heart = this.add.image(50 + i * 50, 50, 'heart-full').setScale(2.5);
      this.hearts.push(heart);
    }
    this.updateHealthUI(this.currentHealth);
  }
  
  // Boss血条相关方法
  private updateBossHealthUI(data: { health: number; maxHealth: number; totalDamageTaken?: number }) {
    this.bossCurrentHealth = data.health;
    this.bossMaxHealth = data.maxHealth;
    
    const width = 600; // 更长，类似艾尔登法环
    const height = 12; // 更细
    const x = this.cameras.main.width / 2 - width / 2;
    const y = this.cameras.main.height - 50;
    
    // 清空之前的绘制
    this.bossHealthBar.clear();
    
    // 绘制背景
    this.bossHealthBar.fillStyle(0x333333, 1);
    this.bossHealthBar.fillRect(x, y, width, height);
    
    // 绘制当前血量
    const healthPercent = this.bossCurrentHealth / this.bossMaxHealth;
    this.bossHealthBar.fillStyle(0xff0000, 1);
    this.bossHealthBar.fillRect(x, y, width * healthPercent, height);
    
    // 绘制边框
    this.bossHealthBar.lineStyle(1, 0xffffff, 1);
    this.bossHealthBar.strokeRect(x, y, width, height);
    
    // 绘制名字 "教宗巴德万" - 加粗，与血条左端对齐，在血条上方
    const nameText = this.add.text(x, y - 25, '教宗巴德万', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#ffffff',
      align: 'left',
      stroke: '#000000',
      strokeThickness: 2
    });
    nameText.setOrigin(0, 0);
    nameText.setScrollFactor(0);
    nameText.setDepth(1001);
    
    // 绘制累计伤害文本 - 与血条右端对齐，在血条下方
    const damageText = this.add.text(x + width, y + 15, `累计伤害: ${data.totalDamageTaken?.toFixed(1) || 0}`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#ffff00',
      align: 'right'
    });
    damageText.setOrigin(1, 0);
    damageText.setScrollFactor(0);
    damageText.setDepth(1001);
    
    // 保存文本引用以便后续销毁
    if (this.bossNameText) {
      this.bossNameText.destroy();
    }
    this.bossNameText = nameText;
    
    if (this.bossDamageText) {
      this.bossDamageText.destroy();
    }
    this.bossDamageText = damageText;
    
    // 更新流血层数UI
    this.updateBossBleedUI(this.bossCurrentBleedStacks);
  }
  
  // 更新Boss流血层数UI
  private updateBossBleedUI(stacks: number) {
    this.bossCurrentBleedStacks = stacks;
    
    // 清空旧的图标
    this.bossBleedIcons.forEach(icon => icon.destroy());
    this.bossBleedIcons = [];
    
    if (stacks <= 0) {
      return;
    }
    
    const width = 600; // 与血条宽度一致
    const x = this.cameras.main.width / 2 + width / 2; // 血条右端
    const y = this.cameras.main.height - 80; // 在血条上方
    
    // 创建流血层数图标（只显示一个，根据层数设置对应的帧）
    const icon = this.add.image(x, y, 'bleed-icons');
    icon.setFrame(stacks - 1); // 1层流血显示帧0，2层显示帧1，3层显示帧2
    icon.setScale(1.5);
    icon.setOrigin(1, 0.5); // 与血条右端对齐
    icon.setScrollFactor(0);
    icon.setDepth(1001);
    this.bossBleedIcons.push(icon);
  }
  
  private showBossHealthBar() {
    this.bossHealthBar.setVisible(true);
  }
  
  private hideBossHealthBar() {
    this.bossHealthBar.setVisible(false);
    if (this.bossNameText) {
      this.bossNameText.destroy();
    }
    if (this.bossDamageText) {
      this.bossDamageText.destroy();
    }
    // 清理流血图标并重置流血状态
    this.updateBossBleedUI(0);
  }
  
  // 显示提示消息
  private showMessage(message: string) {
    // 如果有正在运行的tween，先停止它
    if (this.messageTween && this.messageTween.isPlaying()) {
      this.messageTween.stop();
    }
    
    // 设置消息文本
    this.messageText.setText(message);
    
    // 淡入动画
    this.messageTween = this.tweens.add({
      targets: this.messageText,
      alpha: 1,
      duration: 1000,
      ease: 'Power1.easeOut',
      yoyo: true,
      repeat: 2,
      repeatDelay: 500,
      onComplete: () => {
        this.messageText.alpha = 0;
      }
    });
  }

  // ==========================================
  // 【核心新增：道具获得展示系统 - 简化版】
  // ==========================================
  private itemGetContainer: Phaser.GameObjects.Container | null = null;
  private itemGetBg: Phaser.GameObjects.Rectangle | null = null;
  private isItemUIShowing: boolean = false;
  private escKey: Phaser.Input.Keyboard.Key | null = null;
  private onUICloseCallback: (() => void) | null = null;

  // 显示道具获得UI - 简化版
  private showItemGetUI(data: { 
    playerTexture: string;
    itemTexture: string; 
    name: string; 
    description: string;
    onClose?: () => void;
  }) {
    if (this.isItemUIShowing) return;
    this.isItemUIShowing = true;
    this.onUICloseCallback = data.onClose || null;

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // 创建全屏黑色背景
    this.itemGetBg = this.add.rectangle(
      centerX, centerY,
      this.cameras.main.width,
      this.cameras.main.height,
      0x000000, 0.85
    );
    this.itemGetBg.setScrollFactor(0);
    this.itemGetBg.setDepth(10000);

    // 创建容器
    this.itemGetContainer = this.add.container(centerX, centerY);
    this.itemGetContainer.setScrollFactor(0);
    this.itemGetContainer.setDepth(10001);

    // 1. 创建玩家获得道具的动画（使用 player_getitem.png）
    const playerSprite = this.add.sprite(0, -40, 'player_getitem');
    playerSprite.setScale(6);
    
    // 2. 创建道具图标（在玩家头顶）
    const itemIcon = this.add.sprite(0, -160, data.itemTexture);
    itemIcon.setScale(4);

    // 3. 创建道具名称
    const nameText = this.add.text(0, 60, data.name, {
      fontSize: '36px',
      fontFamily: 'Arial',
      color: '#ffd700',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4
    });
    nameText.setOrigin(0.5);

    // 4. 创建道具描述
    const descText = this.add.text(0, 130, data.description, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 450 },
      lineSpacing: 8
    });
    descText.setOrigin(0.5);

    // 5. 创建退出提示
    const exitText = this.add.text(0, 200, '按 [Esc] 关闭', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#888888',
      align: 'center'
    });
    exitText.setOrigin(0.5);

    // 添加到容器
    this.itemGetContainer.add([playerSprite, itemIcon, nameText, descText, exitText]);

    // 给道具图标添加浮动动画
    this.tweens.add({
      targets: itemIcon,
      y: '-=8',
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 给退出提示添加闪烁动画
    this.tweens.add({
      targets: exitText,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 监听 Esc 键关闭
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', this.closeItemGetUI, this);
  }

  // 关闭道具获得UI
  private closeItemGetUI() {
    if (!this.isItemUIShowing) return;

    // 移除按键监听
    if (this.escKey) {
      this.escKey.removeAllListeners();
      this.escKey = null;
    }

    // 销毁UI元素
    if (this.itemGetContainer) {
      this.itemGetContainer.destroy();
      this.itemGetContainer = null;
    }
    if (this.itemGetBg) {
      this.itemGetBg.destroy();
      this.itemGetBg = null;
    }

    this.isItemUIShowing = false;

    // 执行回调（应用道具效果）
    if (this.onUICloseCallback) {
      this.onUICloseCallback();
      this.onUICloseCallback = null;
    }
  }

  // ==========================================
  // 【核心新增：成就展示系统】
  // ==========================================
  private achievementContainer: Phaser.GameObjects.Container | null = null;
  private achievementBg: Phaser.GameObjects.Rectangle | null = null;
  private isAchievementShowing: boolean = false;

  // 显示成就UI
  private showAchievement = (data: { title: string; description: string; latin: string }) => {
    console.log('[UIScene] 显示成就:', data.title);
    
    if (this.isAchievementShowing) return;
    this.isAchievementShowing = true;

    // 暂停游戏物理（只暂停正在运行的场景）
    const scenes = ['GameScene', 'TwoFloorScene', 'HouseScene', 'UnderGroundScene'];
    scenes.forEach(name => {
      const scene = this.scene.get(name);
      if (scene && scene.scene.isActive()) {
        try {
          this.scene.pause(name);
          console.log(`[UIScene] paused ${name}`);
        } catch (e) {
          console.log(`[UIScene] failed to pause ${name}:`, e);
        }
      }
    });

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // 创建黑屏背景
    this.achievementBg = this.add.rectangle(
      centerX, centerY,
      this.cameras.main.width,
      this.cameras.main.height,
      0x000000,
      0.85
    );
    this.achievementBg.setScrollFactor(0);
    this.achievementBg.setDepth(10000);

    // 创建容器
    this.achievementContainer = this.add.container(centerX, centerY);
    this.achievementContainer.setScrollFactor(0);
    this.achievementContainer.setDepth(10001);

    // 1. 创建奖杯图标（带闪闪发光特效）
    const trophyIcon = this.add.sprite(0, -80, 'achievement_trophy');
    trophyIcon.setScale(6);

    // 创建闪光粒子效果
    const particles = this.add.particles(0, 0, 'achievement_trophy', {
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      speed: { min: 50, max: 100 },
      lifespan: 1000,
      quantity: 2,
      frequency: 200,
      emitZone: { type: 'edge', source: new Phaser.Geom.Circle(0, -80, 60), quantity: 20 }
    });
    particles.setDepth(10002);
    this.achievementContainer.add(particles);

    // 奖杯旋转发光动画
    this.tweens.add({
      targets: trophyIcon,
      angle: 360,
      duration: 8000,
      repeat: -1,
      ease: 'Linear'
    });

    // 奖杯缩放脉冲动画
    this.tweens.add({
      targets: trophyIcon,
      scale: 6.5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 2. 创建标题
    const titleText = this.add.text(0, 20, data.title, {
      fontSize: '42px',
      fontFamily: 'SimSun, 宋体, serif',
      color: '#ffd700',
      align: 'center',
      stroke: '#8b4513',
      strokeThickness: 6
    });
    titleText.setOrigin(0.5);

    // 3. 创建描述
    const descText = this.add.text(0, 90, data.description, {
      fontSize: '20px',
      fontFamily: 'SimSun, 宋体, serif',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 500 },
      lineSpacing: 6
    });
    descText.setOrigin(0.5);

    // 4. 创建彩虹浮动拉丁文
    const latinText = this.add.text(0, 160, data.latin, {
      fontSize: '28px',
      fontFamily: 'Times New Roman, serif',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'italic'
    });
    latinText.setOrigin(0.5);

    // 彩虹颜色数组
    const rainbowColors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
    let colorIndex = 0;

    // 彩虹颜色变化
    this.time.addEvent({
      delay: 200,
      callback: () => {
        if (latinText.active) {
          latinText.setColor(rainbowColors[colorIndex]);
          colorIndex = (colorIndex + 1) % rainbowColors.length;
        }
      },
      loop: true
    });

    // 浮动动画
    this.tweens.add({
      targets: latinText,
      y: 160 + 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 5. 创建退出提示
    const exitText = this.add.text(0, 240, '按 [Esc] 继续游戏', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#888888',
      align: 'center'
    });
    exitText.setOrigin(0.5);

    // 退出提示闪烁
    this.tweens.add({
      targets: exitText,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 添加到容器
    this.achievementContainer.add([trophyIcon, titleText, descText, latinText, exitText]);

    // 整体淡入动画
    this.achievementContainer.setAlpha(0);
    this.tweens.add({
      targets: this.achievementContainer,
      alpha: 1,
      duration: 1000,
      ease: 'Power2'
    });

    // 监听 Esc 键关闭
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', this.closeAchievementUI, this);
  }

  // 关闭成就UI
  private closeAchievementUI() {
    if (!this.isAchievementShowing) return;

    // 移除按键监听
    if (this.escKey) {
      this.escKey.removeAllListeners();
      this.escKey = null;
    }

    // 销毁UI元素
    if (this.achievementContainer) {
      this.achievementContainer.destroy();
      this.achievementContainer = null;
    }
    if (this.achievementBg) {
      this.achievementBg.destroy();
      this.achievementBg = null;
    }

    this.isAchievementShowing = false;

    // 恢复游戏场景（只恢复被暂停的场景）
    const scenes = ['GameScene', 'TwoFloorScene', 'HouseScene', 'UnderGroundScene'];
    scenes.forEach(name => {
      const scene = this.scene.get(name);
      if (scene && scene.scene.isPaused()) {
        try {
          this.scene.resume(name);
          console.log(`[UIScene] resumed ${name}`);
        } catch (e) {
          console.log(`[UIScene] failed to resume ${name}:`, e);
        }
      }
    });
  }

  // ==========================================
  // 背包按钮（只负责触发事件）
  // ==========================================

  private createBagButton() {
    const screenWidth = this.cameras.main.width;

    // 创建背包图标
    this.bagIcon = this.add.image(screenWidth - 50, 50, 'icon_bag');
    this.bagIcon.setScale(3);
    this.bagIcon.setScrollFactor(0);
    this.bagIcon.setDepth(100);
    this.bagIcon.setInteractive({ useHandCursor: true });

    // 点击打开背包
    this.bagIcon.on('pointerdown', () => {
      this.game.events.emit('open-inventory');
    });

    // 悬停效果
    this.bagIcon.on('pointerover', () => {
      this.bagIcon!.setScale(3.3);
    });
    this.bagIcon.on('pointerout', () => {
      this.bagIcon!.setScale(3);
    });

    // 提示文字
    const hintText = this.add.text(screenWidth - 50, 100, '[B]打开', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#ffffff'
    });
    hintText.setOrigin(0.5);
    hintText.setScrollFactor(0);
    hintText.setDepth(100);
  }
}
