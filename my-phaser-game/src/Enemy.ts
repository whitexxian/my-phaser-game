import Phaser from "phaser";

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
    public health: number = 3; // 史莱姆有 3 格血
    private isDead: boolean = false;
    private isHurt: boolean = false; // 受伤硬直状态
    public monsterId: string = ""; // 怪物唯一标识
    
    // 【新增：AI 属性】
    protected speed: number = 50; // 小怪通常比玩家慢很多
    protected aggroRange: number = 150; // 仇恨范围 (150像素内看到玩家就追)

    // 存储玩家的引用，方便怪物知道玩家在哪
    protected targetPlayer!: Phaser.Physics.Arcade.Sprite | null;
    
    // 影子
    protected shadow!: Phaser.GameObjects.Ellipse;
    
    // 血条
    private healthBar!: Phaser.GameObjects.Graphics;
    protected maxHealth: number = 3;
    
    // 【新增：DOT系统】
    private bleedStacks: number = 0; // 流血层数
    protected bleedTimer: Phaser.Time.TimerEvent | null = null;

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: number) {
        super(scene, x, y, texture, frame);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        // 假设史莱姆比较小
        this.setScale(0.8);
        this.body?.setSize(20, 28);
        this.body?.setOffset(6, 2);
        
        // 创建影子
        this.shadow = scene.add.ellipse(
            this.x,
            this.y + 8, // 影子在敌人下方（调整位置）
            16, // 宽度
            6, // 高度
            0x000000, // 黑色
            0.3 // 透明度
        );
        this.shadow.setDepth(this.y - 0.5); // 影子在敌人下方
        
        // 创建血条
        this.healthBar = scene.add.graphics();
        this.healthBar.setDepth(100);
        this.updateHealthBar();

        // 创建敌人动画
        this.createAnimations();
        
        // 默认播放闲置动画
        this.anims.play('enemy-idle', true);
    }
    
    // 创建敌人动画
    private createAnimations() {
        // 闲置动画
        this.anims.create({
            key: 'enemy-idle',
            frames: [{ key: 'enemy0', frame: 0 }],
            frameRate: 1
        });
        
        // 向左移动动画
        this.anims.create({
            key: 'enemy-walk-left',
            frames: this.anims.generateFrameNumbers('enemy0', { start: 0, end: 2 }),
            frameRate: 8,
            repeat: -1
        });
        
        // 向右移动动画（水平翻转）
        // 向右移动时使用向左的动画，但水平翻转
    }
    
    // 提供一个方法，让主场景把玩家传给怪物
    public setTarget(player: Phaser.Physics.Arcade.Sprite) {
        this.targetPlayer = player;
    }

    // ==========================================
  // 【核心：受伤与击退逻辑】
  // ==========================================
  public takeDamage(damage: number, attackerDirection: Phaser.Math.Vector2, comboCount: number = 1) {
      if (this.isDead || this.isHurt) return; // 如果死了或者正在挨打，就不重复受伤

      this.health -= damage;
      this.isHurt = true; // 进入受伤硬直

      console.log(`史莱姆受到 ${damage} 点伤害！剩余血量：${this.health}`);
      
      // 更新血条
      if (this.healthBar) {
          this.updateHealthBar();
      }

      // 1. 视觉反馈：闪白/变红
      this.setTint(0xff0000);

      // 2. 物理反馈：被击退 (Knockback)
      // 根据连击段数设置不同的击退力度
      let knockbackForce = 10; // 第一拳击退力度10
      if (comboCount === 2) knockbackForce = 20; // 第二拳击退力度20
      else if (comboCount === 3) knockbackForce = 70; // 第三拳击退力度70
      
      this.setVelocity(attackerDirection.x * knockbackForce, attackerDirection.y * knockbackForce);

        // 3. 死亡判定
        if (this.health <= 0) {
            this.die();
            return;
        }

        // 4. 受伤硬直恢复 (0.2 秒后)
        this.scene.time.delayedCall(200, () => {
            this.clearTint(); // 恢复颜色
            this.setVelocity(0, 0); // 停止击退滑动
            this.isHurt = false; // 解除硬直
        });
    }

    protected die() {
        this.isDead = true;
        this.setVelocity(0, 0);
        this.setTint(0x444444); // 变成灰色尸体
        console.log("史莱姆被击败了！");
        
        // 清理流血计时器，防止游戏卡死
        if (this.bleedTimer) {
            this.bleedTimer.remove();
            this.bleedTimer = null;
        }
        
        // 更新全局状态中的死亡记录
        if (this.monsterId) {
            const globalState = (this.scene.game as any).globalState || {};
            globalState.deadMonsters = globalState.deadMonsters || {};
            globalState.deadMonsters[this.monsterId] = true;
            (this.scene.game as any).globalState = globalState;
            console.log(`怪物 ${this.monsterId} 已标记为死亡`);
        }

        // 播放死亡动画，然后销毁
        this.scene.time.delayedCall(500, () => {
            // 销毁影子和血条
            if (this.shadow) {
                this.shadow.destroy();
            }
            if (this.healthBar) {
                this.healthBar.destroy();
            }
            this.destroy(); // 从内存中彻底抹除
        });
    }
    
    protected updateHealthBar() {
        const width = 20; // 更短的小细条宽度
        const height = 4; // 小细条高度
        const x = this.x - width / 2;
        const y = this.y - 20; // 在头顶显示
        
        // 清空之前的绘制
        this.healthBar.clear();
        
        // 绘制背景
        this.healthBar.fillStyle(0x333333, 1);
        this.healthBar.fillRect(x, y, width, height);
        
        // 绘制当前血量
        const healthPercent = this.health / this.maxHealth;
        this.healthBar.fillStyle(0xff0000, 1);
        this.healthBar.fillRect(x, y, width * healthPercent, height);
        
        // 绘制边框
        this.healthBar.lineStyle(1, 0xffffff, 1);
        this.healthBar.strokeRect(x, y, width, height);
    }
    
    // 【新增：DOT系统 - 流血效果】
    public applyBleed(scene: Phaser.Scene) {
        if (this.isDead) return;
        
        // 增加流血层数
        this.bleedStacks++;
        console.log(`怪物流血层数: ${this.bleedStacks}`);
        
        // 如果还没有流血计时器，就启动一个
        if (!this.bleedTimer) {
            this.bleedTimer = scene.time.addEvent({
                delay: 1000, // 每秒触发一次
                callback: this.onBleedTick,
                callbackScope: this,
                repeat: -1 // 无限重复
            });
        }
    }
    
    // 【新增：流血每Tick的伤害计算】
    private onBleedTick() {
        if (this.isDead || this.bleedStacks <= 0) {
            if (this.bleedTimer) {
                this.bleedTimer.remove();
                this.bleedTimer = null;
            }
            return;
        }
        
        // 每层流血每秒造成0.5点伤害
        const bleedDamage = 0.5 * this.bleedStacks;
        this.health -= bleedDamage;
        
        // 更新血条
        this.updateHealthBar();
        
        // 发送吸血事件
        this.scene.game.events.emit('heal-player', bleedDamage * 0.5); // 50%的伤害转化为吸血
        
        // 视觉效果：轻微变红闪烁
        this.setTint(0xff6666);
        this.scene.time.delayedCall(200, () => {
            if (!this.isDead) {
                this.clearTint();
            }
        });
        
        // 死亡判定
        if (this.health <= 0) {
            this.die();
        }
    }

    update() {
        if (this.isDead || this.isHurt || !this.targetPlayer) return;
        
        // 设置敌人的depth（和player一样）
        this.setDepth(this.y);
        
        // 更新影子位置
        if (this.shadow) {
            this.shadow.setPosition(this.x, this.y + 8);
            this.shadow.setDepth(this.y - 0.5); // 影子在敌人下方
        }
        
        // 更新血条位置
        if (this.healthBar) {
            this.updateHealthBar();
        }

        // 1. 计算怪物和玩家之间的距离
        const distanceToPlayer = Phaser.Math.Distance.Between(this.x, this.y, this.targetPlayer.x, this.targetPlayer.y);

        if (distanceToPlayer <= this.aggroRange) {
            // 2. 玩家进入了仇恨范围！开始追击！
            
            // 如果离玩家太近 (比如重叠了)，就停下，否则会一直鬼畜推挤玩家
            if (distanceToPlayer < 20) {
                this.setVelocity(0, 0);
                return;
            }

            // 计算从怪物指向玩家的方向向量，并施加速缩度
            const direction = new Phaser.Math.Vector2(this.targetPlayer.x - this.x, this.targetPlayer.y - this.y).normalize();
            this.setVelocity(direction.x * this.speed, direction.y * this.speed);
            
            // 根据移动方向播放动画
            if (direction.x < 0) {
                // 向左移动
                this.flipX = false;
                this.anims.play('enemy-walk-left', true);
            } else if (direction.x > 0) {
                // 向右移动（水平翻转）
                this.flipX = true;
                this.anims.play('enemy-walk-left', true);
            } else {
                // 垂直移动，保持朝向
                this.anims.play('enemy-walk-left', true);
            }

        } else {
            // 3. 玩家跑远了，丢失仇恨，停在原地 (或者你可以写个随机巡逻逻辑)
            this.setVelocity(0, 0);
            this.anims.play('enemy-idle', true);
        }
    }
}