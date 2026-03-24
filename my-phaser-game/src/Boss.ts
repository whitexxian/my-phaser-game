import Phaser from "phaser";
import Enemy from "./Enemy";

// 极其严谨的 Boss 状态机
export const BossState = {
    CHASE: 0,      // 追击玩家
    WINDUP: 1,     // 施法前摇
    SKILL_1: 2,    // 释放技能1 (旋转)
    SKILL_2: 3,    // 释放技能2 (召唤)
    STAGGERED: 4,  // 破防/虚弱状态
    DEAD: 5        // 死亡
} as const;

export type BossState = typeof BossState[keyof typeof BossState];

export default class Boss extends Enemy {
    public health: number = 20;
    private contactDamage: number = 0.5; // 触碰伤害

    public currentState: BossState = BossState.CHASE;
    private currentSkill: number = 0; // 正在放哪个技能 (1 或 2)
    private skillCooldown: number = 10000; // 技能间隔为10秒
    private skillTimer: Phaser.Time.TimerEvent | null = null; // 用于随时打断动作的定时器
    protected aggroRange: number = 250; // Boss的仇恨范围 (250像素内看到玩家就追)

    // 削韧/破防系统
    private poiseDamageTaken: number = 0; // 累计受到的削韧值 (假设玩家每打一拳累计 1 点)
    private readonly POISE_THRESHOLD: number = 3; // 承受 3 拳后破防

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
        // 指定使用第一个帧（帧索引0），避免显示整个精灵图
        super(scene, x, y, texture, 0);

        this.setScale(2); // 放大Boss体型
        this.body?.setSize(32, 32); // 精灵大小是32x32，缩放2倍后碰撞体大小应该匹配
        this.body?.setOffset(0, 0);
        this.speed = 40; // 设置Boss移动速度
        this.maxHealth = 20; // Boss的最大生命值
        this.health = this.maxHealth; // 初始化生命值
        
        // 创建影子
        this.shadow = scene.add.ellipse(
            this.x,
            this.y + 24, // 影子在Boss下方
            50, // 宽度
            15, // 高度
            0x000000, // 黑色
            0.5 // 增加透明度
        );
        this.shadow.setDepth(-1); // 确保影子在最底层
        
        // 【创建所有动作序列 (14张图)】
        // 只在第一次创建时创建动画
        if (!scene.anims.exists('boss-move')) {
            // 0-2: 向左移动帧（第1-3张）
            scene.anims.create({ key: 'boss-move', frames: scene.anims.generateFrameNumbers(texture, { start: 0, end: 2 }), frameRate: 6, repeat: -1 });
            // 3-5: 双技能的前摇动作（第4-6张）
            scene.anims.create({ key: 'boss-windup', frames: scene.anims.generateFrameNumbers(texture, { start: 3, end: 5 }), frameRate: 8, repeat: -1 });
            // 6-9: 技能一的动作（第7-10张）
            scene.anims.create({ key: 'boss-skill1', frames: scene.anims.generateFrameNumbers(texture, { start: 6, end: 9 }), frameRate: 12, repeat: -1 });
            // 10-13: 技能二的动作（第11-14张）
            scene.anims.create({ key: 'boss-skill2', frames: scene.anims.generateFrameNumbers(texture, { start: 10, end: 13 }), frameRate: 8, repeat: -1 });
        }

        this.anims.play('boss-move', true);
    }

    // ==========================================
    // 【核心 1：重写受伤与削韧机制】
    // ==========================================
    public override takeDamage(damage: number, _attackerDirection: Phaser.Math.Vector2, _comboCount: number = 1) {
        if (this.currentState === BossState.DEAD) return;

        // 1. 虚弱期伤害 * 1.2 倍修正！
        let finalDamage = damage;
        if (this.currentState === BossState.STAGGERED) {
            finalDamage *= 1.2;
            console.log(`虚弱暴击！造成 ${finalDamage} 伤害`);
        }

        this.health -= finalDamage;
        this.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => { if (this.currentState !== BossState.STAGGERED && this.currentState !== BossState.DEAD) this.clearTint(); });
        
        // 更新血条
        this.updateHealthBar();

        // 2. 【破防判定】：只有在 技能二 的前摇和召唤期间，才会累积破防值
        if (this.currentSkill === 2 && (this.currentState === BossState.WINDUP || this.currentState === BossState.SKILL_2)) {
            this.poiseDamageTaken += 1; // 假设每挨一拳增加 1 点破防值
            console.log(`Boss 积累破防值: ${this.poiseDamageTaken} / ${this.POISE_THRESHOLD}`);
            
            if (this.poiseDamageTaken >= this.POISE_THRESHOLD) {
                this.triggerStagger(); // 触发破防虚弱！
            }
        }

        if (this.health <= 0) this.die();
    }

    // ==========================================
    // 【核心 2：处决机制 (被主场景右键触发)】
    // ==========================================
    public execute() {
        if (this.currentState !== BossState.STAGGERED || this.health <= 0) return;
        
        console.log("【致命处决】 扣除 5 点真实伤害！");
        this.scene.cameras.main.flash(200, 255, 0, 0); // 屏幕红光一闪
        this.scene.cameras.main.shake(100, 0.003); // 微小震动效果
        
        this.health -= 5;
        if (this.health <= 0) {
            this.die();
        } else {
            // 处决后，1秒后恢复行动，期间无敌
            this.setTint(0xffff00); // 黄色表示无敌状态
            this.scene.time.delayedCall(1000, () => {
                if (this.currentState !== BossState.DEAD) {
                    this.endAction();
                }
            });
        }
    }

    // ==========================================
    // 【核心 3：状态机打断与虚弱 (Stagger)】
    // ==========================================
    private triggerStagger() {
        console.log("Boss 防御被击破！陷入虚弱！");
        this.currentState = BossState.STAGGERED;
        
        // 1. 立即打断当前的任何定时器动作！
        if (this.skillTimer) this.skillTimer.remove();
        
        // 2. 停下动作，变成蓝色暗示虚弱可处决
        this.setVelocity(0, 0);
        this.anims.stop();
        this.setTint(0x0088ff);

        // 3. 虚弱 2 秒后，如果没有被处决，自动恢复
        this.scene.time.delayedCall(2000, () => {
            if (this.currentState === BossState.STAGGERED) {
                this.endAction();
            }
        });
    }

    // ==========================================
    // 【核心 4：AI 与技能流转】
    // ==========================================
    public override update() {
        if (this.currentState === BossState.DEAD || !this.targetPlayer) return;

        // 设置Boss深度（基于y坐标）
        this.setDepth(this.y);
        
        // 更新影子位置
        if (this.shadow) {
            this.shadow.setPosition(this.x, this.y + 24);
            this.shadow.setDepth(-1); // 确保影子在最底层
        }
        
        // 如果处于非追击状态（前摇、放技能、虚弱），原地不动
        if (this.currentState !== BossState.CHASE) {
            this.setVelocity(0, 0);
            return;
        }

        // --- 以下是 CHASE (追击) 状态的逻辑 ---
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetPlayer.x, this.targetPlayer.y);
        
        // 只有在仇恨范围内才移动和攻击
        if (dist <= this.aggroRange) {
            // 减少技能冷却时间
            if (this.skillCooldown > 0) {
                this.skillCooldown -= 16; // 假设60fps，每帧减少16毫秒
            }

            // 靠近玩家且技能冷却完毕，随机释放技能
            if (dist < 120 && this.skillCooldown <= 0) {
                this.startRandomSkill();
                return;
            }

            // 寻路与镜像反转
            const dir = new Phaser.Math.Vector2(this.targetPlayer.x - this.x, this.targetPlayer.y - this.y).normalize();
            this.setVelocity(dir.x * this.speed, dir.y * this.speed);
            
            // 向左移动用原图，向右移动开启镜像 FlipX
            if (dir.x > 0) this.setFlipX(true);
            else if (dir.x < 0) this.setFlipX(false);
            
            this.anims.play('boss-move', true);
        } else {
            // 超出仇恨范围，停止移动
            this.setVelocity(0, 0);
            this.anims.stop();
        }
    }

    private startRandomSkill() {
        this.currentState = BossState.WINDUP;
        this.anims.play('boss-windup', true);
        
        // 技能选择概率：技能一80%，技能二20%
        const random = Phaser.Math.FloatBetween(0, 1);
        this.currentSkill = random < 0.8 ? 1 : 2;
        
        this.poiseDamageTaken = 0; // 重置削韧值

        if (this.currentSkill === 1) {
            // 技能 1：前摇 1秒 -> 旋转 0.5秒
            this.skillTimer = this.scene.time.delayedCall(1000, () => this.executeSkill1());
        } else {
            // 技能 2：前摇 3秒 -> 召唤 1秒
            this.skillTimer = this.scene.time.delayedCall(3000, () => this.executeSkill2());
        }
    }

    private executeSkill1() {
        if (this.currentState !== BossState.WINDUP) return; // 如果被虚弱打断了，直接 return 保护逻辑
        
        this.currentState = BossState.SKILL_1;
        this.anims.play('boss-skill1', true);
        
        // 技能1效果：范围震动伤害
        this.scene.cameras.main.shake(500, 0.001);
        const aoe = this.scene.add.circle(this.x, this.y, 60);
        this.scene.physics.add.existing(aoe);
        this.scene.events.emit('boss-aoe', aoe, 1.0); // 发射给主场景去判定玩家掉血

        this.scene.time.delayedCall(500, () => {
            aoe.destroy();
            this.endAction();
        });
    }

    private executeSkill2() {
        if (this.currentState !== BossState.WINDUP) return;
        
        this.currentState = BossState.SKILL_2;
        this.anims.play('boss-skill2', true);

        // 召唤 2 只小怪
        this.scene.events.emit('boss-summon', this.x, this.y);

        this.scene.time.delayedCall(1000, () => {
            this.endAction();
        });
    }

    private endAction() {
        if (this.currentState === BossState.DEAD) return;
        this.currentState = BossState.CHASE;
        this.clearTint();
        this.skillCooldown = 10000; // 所有动作结束后，进入 10 秒的技能发呆期
    }

    protected die() {
        this.currentState = BossState.DEAD;
        this.setVelocity(0, 0);
        this.setTint(0x333333);
        console.log("【Boss 被击杀！】");
        // 关闭血条
        this.hideHealthBar();
        // 设置为非活跃状态，防止update方法再次显示血条
        this.setActive(false);
        this.scene.time.delayedCall(1000, () => {
            // 销毁影子
            if (this.shadow) {
                this.shadow.destroy();
            }
            this.destroy();
        });
    }

    // 暴露给主场景的接口，用于判定接触伤害和处决距离
    public isStaggered(): boolean { return this.currentState === BossState.STAGGERED; }
    public getContactDamage(): number { return this.contactDamage; }
    
    // 血条相关方法
    public showHealthBar() {
        this.scene.game.events.emit('show-boss-health');
        this.updateHealthBar();
    }
    
    public hideHealthBar() {
        this.scene.game.events.emit('hide-boss-health');
    }
    
    protected updateHealthBar() {
        this.scene.game.events.emit('update-boss-health', {
            health: this.health,
            maxHealth: this.maxHealth
        });
    }
    

}