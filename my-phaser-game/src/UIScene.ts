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

  constructor() {
    // 给这个场景起个名字叫 'UIScene'
    super({ key: "UIScene" });
  }

  preload() {
    // 加载你画的三个心形图标
    this.load.image("heart-full", "assets/ui/heart_full.png");
    this.load.image("heart-half", "assets/ui/heart_half.png");
    this.load.image("heart-empty", "assets/ui/heart_empty.png");
  }

  create() {
    this.drawHearts();

    // 监听来自全局游戏管理器的“玩家受伤/回血”事件
    // 这样只要其他场景喊一声 "update-health"，UI就会自动更新
    this.game.events.on("update-health", this.updateHealthUI, this);
    // 【新增】：监听生命上限增加
    this.game.events.on('upgrade-max-health', () => {
      this.maxHealth++;
      this.currentHealth = this.maxHealth; // 升级血量同时回满血
      this.drawHearts(); // 重新画 UI
    });
    
    // 创建Boss血条
    this.bossHealthBar = this.add.graphics();
    this.bossHealthBar.setScrollFactor(0);
    this.bossHealthBar.setVisible(false);
    
    // 监听Boss血条更新事件
    this.game.events.on("update-boss-health", this.updateBossHealthUI, this);
    this.game.events.on("show-boss-health", this.showBossHealthBar, this);
    this.game.events.on("hide-boss-health", this.hideBossHealthBar, this);
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
    // 重新画
    for (let i = 0; i < this.maxHealth; i++) {
      const heart = this.add.image(40 + i * 40, 40, 'heart-full').setScale(2);
      this.hearts.push(heart);
    }
    this.updateHealthUI(this.currentHealth);
  }
  
  // Boss血条相关方法
  private updateBossHealthUI(data: { health: number; maxHealth: number }) {
    this.bossCurrentHealth = data.health;
    this.bossMaxHealth = data.maxHealth;
    
    const width = 400; // 更长
    const height = 20; // 更宽
    const x = this.cameras.main.width / 2 - width / 2;
    const y = this.cameras.main.height - 60;
    
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
    this.bossHealthBar.lineStyle(2, 0xffffff, 1);
    this.bossHealthBar.strokeRect(x, y, width, height);
    
    // 绘制名字 "教宗巴德万"
    const nameText = this.add.text(x + width / 2, y - 20, '教宗巴德万', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#ffffff',
      align: 'center'
    });
    nameText.setOrigin(0.5);
    nameText.setScrollFactor(0);
    nameText.setDepth(1001);
    
    // 保存名字文本引用以便后续销毁
    if (this.bossNameText) {
      this.bossNameText.destroy();
    }
    this.bossNameText = nameText;
  }
  
  private showBossHealthBar() {
    this.bossHealthBar.setVisible(true);
  }
  
  private hideBossHealthBar() {
    this.bossHealthBar.setVisible(false);
    if (this.bossNameText) {
      this.bossNameText.destroy();
    }
  }
}
