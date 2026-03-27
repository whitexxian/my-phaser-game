import Phaser from "phaser";
import Enemy from "./Enemy";

// 极其严谨的 Boss 状态机
export const BossState = {
    CHASE: 0,      // 追击玩家
    WINDUP: 1,     // 施法前摇
    SKILL_1: 2,    // 释放技能1 (旋转)
    SKILL_2: 3,    // 释放技能2 (召唤)
    SKILL_3: 4,    // 释放技能3 (冲刺)
    STAGGERED: 5,  // 破防/虚弱状态
    DEAD: 6        // 死亡
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
    
    // 累计伤害统计（用于调试）
    private totalDamageTaken: number = 0;
    private hasPhaseTransitioned: boolean = false; // 标记是否已经转阶段
    private isPhaseTransitionInvincible: boolean = false; // 标记是否在转阶段无敌状态
    private clearTintTimer: Phaser.Time.TimerEvent | null = null; // 用于清除tint的定时器
    private windupPlayerPosition: Phaser.Math.Vector2 | null = null; // 记录前摇开始时的玩家位置
    private isExecutedThisStagger: boolean = false; // 标记当前虚弱期间是否已被处决

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
        // 指定使用第一个帧（帧索引0），避免显示整个精灵图
        super(scene, x, y, texture, 0);
        console.log("Boss构造函数被调用");

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
        
        // 【创建所有动作序列 (18张图)】
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
            // 14-17: 技能三的动作（第15-18张）
            scene.anims.create({ key: 'boss-skill3', frames: scene.anims.generateFrameNumbers(texture, { start: 14, end: 17 }), frameRate: 12, repeat: -1 });
        }

        this.anims.play('boss-move', true);
    }

    // ==========================================
    // 【核心 1：重写受伤与削韧机制】
    // ==========================================
    public override takeDamage(damage: number, _attackerDirection: Phaser.Math.Vector2, _comboCount: number = 1) {
        // 如果在转阶段无敌，则免疫伤害
        if (this.currentState === BossState.DEAD || this.isPhaseTransitionInvincible) return;

        console.log(`Boss受到伤害: ${damage}, 当前状态: ${this.currentState}`);

        // 1. 虚弱期伤害 * 1.2 倍修正！
        let finalDamage = damage;
        if (this.currentState === BossState.STAGGERED) {
            finalDamage *= 1.2;
            console.log(`虚弱暴击！造成 ${finalDamage} 伤害`);
        }

        // 累计伤害（用于调试）
        this.totalDamageTaken += finalDamage;
        
        this.health -= finalDamage;
        this.setTint(0xff0000);
        this.clearTintTimer = this.scene.time.delayedCall(100, () => { 
            if (this.currentState !== BossState.STAGGERED && this.currentState !== BossState.DEAD) {
                this.clearTint();
                this.clearTintTimer = null;
            }
        });
        
        // 更新血条
        this.updateHealthBar();

        // 2. 【半血转阶段判定】
        if (!this.hasPhaseTransitioned && this.health <= this.maxHealth / 2) {
            this.triggerPhaseTransition();
            return;
        }

        // 3. 【破防判定】：只有在 技能二 的前摇和召唤期间，才会累积破防值
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
    // 【核心 1.5：半血转阶段机制】
    // ==========================================
    private triggerPhaseTransition() {
        this.hasPhaseTransitioned = true;
        this.isPhaseTransitionInvincible = true; // 开启转阶段无敌
        console.log("Boss半血转阶段！");
        
        // 立即打断当前的任何定时器动作！
        if (this.skillTimer) this.skillTimer.remove();
        
        // 清除可能存在的清除tint定时器，防止它清除我们的金色tint
        if (this.clearTintTimer) {
            this.clearTintTimer.remove();
            this.clearTintTimer = null;
        }
        
        // 停止移动
        this.setVelocity(0, 0);
        
        // 设置为技能2，前摇过程无敌
        this.currentSkill = 2;
        this.currentState = BossState.WINDUP;
        this.anims.play('boss-windup', true);
        this.setTint(0xffd700); // 金色表示无敌状态
        
        // 技能2前摇3秒（前摇过程无敌）
        console.log("转阶段：启动技能二定时器，延迟3000ms（前摇无敌）");
        this.skillTimer = this.scene.time.delayedCall(3000, () => {
            console.log("转阶段：技能二定时器触发，调用executeSkill2");
            this.executeSkill2PhaseTransition();
        });
    }
    
    private executeSkill2PhaseTransition() {
        if (this.currentState !== BossState.WINDUP) return;

        this.currentState = BossState.SKILL_2;
        this.anims.play('boss-skill2', true);
        this.clearTint(); // 解除无敌视觉效果
        this.isPhaseTransitionInvincible = false; // 解除转阶段无敌

        this.scene.events.emit('boss-summon', this.x, this.y);

        this.scene.time.delayedCall(1000, () => {
            this.endActionPhaseTransition();
        });
    }

    private endActionPhaseTransition() {
        if (this.currentState === BossState.DEAD) return;

        // 只有在SKILL_2状态下才执行转阶段结束逻辑
        if (this.currentState !== BossState.SKILL_2) return;

        this.currentState = BossState.CHASE;
        this.clearTint();
        this.isPhaseTransitionInvincible = false; // 确保清除转阶段无敌标记
        this.skillCooldown = 8000;
        console.log("转阶段结束，技能CD设为8秒");
    }

    // ==========================================
    // 【核心 2：处决机制 (被主场景右键触发)】
    // ==========================================
    public execute() {
        if (this.currentState !== BossState.STAGGERED || this.health <= 0) return;
        if (this.isExecutedThisStagger) return; // 防止当前虚弱期间多次处决
        
        console.log("【致命处决】 扣除 5 点真实伤害！");
        this.scene.cameras.main.flash(200, 255, 0, 0); // 屏幕红光一闪
        this.scene.cameras.main.shake(100, 0.003); // 微小震动效果
        
        this.isExecutedThisStagger = true; // 标记当前虚弱期间已被处决
        this.health -= 5;
        if (this.health <= 0) {
            this.die();
        } else {
            // 处决后，1秒后恢复行动，期间无敌
            this.setTint(0xffd700); // 金色表示无敌状态
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
        this.isExecutedThisStagger = false; // 重置处决标记，允许新的处决
        
        // 立即打断当前的任何定时器动作！
        if (this.skillTimer) this.skillTimer.remove();
        
        // 清除转阶段无敌标记
        this.isPhaseTransitionInvincible = false;
        
        // 停下动作，变成蓝色暗示虚弱可处决
        this.setVelocity(0, 0);
        this.anims.stop();
        this.setTint(0x0088ff);

        // 虚弱 2 秒后，如果没有被处决，自动恢复
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
        
        // 只有技能三（冲刺）可以移动，其他状态都原地不动
        if (this.currentState !== BossState.CHASE && this.currentState !== BossState.SKILL_3) {
            this.setVelocity(0, 0);
            return;
        }

        // --- 以下是 CHASE (追击) 状态的逻辑 ---
        // SKILL_3状态下不执行CHASE逻辑，避免中断冲刺动画
        if (this.currentState === BossState.CHASE) {
            // 设置追击形态的判定框
            this.body?.setSize(20, 28); // 追击形态：宽度24，高度28
            // 根据镜像状态设置偏移，确保判定框始终在Boss前方
            if (this.flipX) {
                this.body?.setOffset(8, 2); // 向右移动时的偏移（前方在右侧）
            } else {
                this.body?.setOffset(4, 2); // 向左移动时的偏移（前方在左侧）
            }
            
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetPlayer.x, this.targetPlayer.y);
            
            // 只有在仇恨范围内才移动和攻击
            if (dist <= this.aggroRange) {
                // 减少技能冷却时间
                if (this.skillCooldown > 0) {
                    this.skillCooldown -= 16; // 假设60fps，每帧减少16毫秒
                }

                // 技能冷却完毕后的处理
                if (this.skillCooldown <= 0) {
                    if (dist < 120) {
                        // 靠近玩家时，随机释放技能
                        this.startRandomSkill();
                        return;
                    } else {
                        // 追击过程中CD转好，立即释放三技能冲刺
                        // 恢复原来的判定框（技能形态使用）
                        this.body?.setSize(32, 32); // 技能形态：宽度32，高度32
                        this.body?.setOffset(0, 0);
                        
                        // 记录前摇开始时的玩家位置
                        if (this.targetPlayer) {
                            this.windupPlayerPosition = new Phaser.Math.Vector2(this.targetPlayer.x, this.targetPlayer.y);
                        }
                        
                        this.currentSkill = 3;
                        this.currentState = BossState.WINDUP;
                        console.log("启动技能三定时器，延迟600ms（追击过程中CD转好）");
                        this.skillTimer = this.scene.time.delayedCall(600, () => {
                            console.log("技能三定时器触发，调用executeSkill3（追击过程中CD转好）");
                            this.executeSkill3();
                        });
                        return;
                    }
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
    }

    private startRandomSkill() {
        // 恢复原来的判定框（前摇和技能形态使用）
        this.body?.setSize(32, 32); // 前摇和技能形态：宽度32，高度32
        this.body?.setOffset(0, 0);
        
        // 记录前摇开始时的玩家位置
        if (this.targetPlayer) {
            this.windupPlayerPosition = new Phaser.Math.Vector2(this.targetPlayer.x, this.targetPlayer.y);
        }
        
        this.currentState = BossState.WINDUP;
        this.anims.play('boss-windup', true);
        
        // 根据血量调整技能概率
        const isHalfHealth = this.health > this.maxHealth / 2;
        const random = Phaser.Math.FloatBetween(0, 1);
        
        if (isHalfHealth) {
            // 半血以上：技能一35%，技能二25%，技能三40%
            if (random < 0.35) {
                this.currentSkill = 1;
            } else if (random < 0.6) {
                this.currentSkill = 2;
            } else {
                this.currentSkill = 3;
            }
        } else {
            // 半血以下：技能一0%，技能二25%，技能三75%
            if (random < 0.25) {
                this.currentSkill = 2;
            } else {
                this.currentSkill = 3;
            }
        }
        
        console.log(`Boss选择技能: ${this.currentSkill}, 随机值: ${random}, 当前状态: ${this.currentState}`);
        this.poiseDamageTaken = 0; // 重置削韧值

        // 技能一：前摇1秒，技能二：前摇3秒，技能三：前摇0.2秒
        if (this.currentSkill === 1) {
            // 技能 1：前摇 1秒 -> 旋转 0.5秒
            console.log("启动技能一定时器，延迟1000ms");
            this.skillTimer = this.scene.time.delayedCall(1000, () => {
                console.log("技能一定时器触发，调用executeSkill1");
                this.executeSkill1();
            });
        } else if (this.currentSkill === 2) {
            // 技能 2：前摇 3秒 -> 召唤 1秒
            console.log("启动技能二定时器，延迟3000ms");
            this.skillTimer = this.scene.time.delayedCall(3000, () => {
                console.log("技能二定时器触发，调用executeSkill2");
                this.executeSkill2();
            });
        } else {
            // 技能 3：前摇 0.4秒 -> 冲刺 0.8秒
            console.log("启动技能三定时器，延迟600ms");
            this.skillTimer = this.scene.time.delayedCall(600, () => {
                console.log("技能三定时器触发，调用executeSkill3");
                this.executeSkill3();
            });
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
        
        // 添加攻击范围特效：烟雾爆炸效果
        const particles = this.scene.add.particles(0, 0, 'smoke', {
            x: this.x,
            y: this.y,
            speed: { min: 50, max: 100 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.5, end: 1.5 },
            alpha: { start: 0.8, end: 0 },
            blendMode: 'NORMAL',
            lifespan: 500,
            quantity: 30,
            gravityY: -80,
            maxParticles: 30
        });
        
        this.scene.time.delayedCall(500, () => {
            aoe.destroy();
            particles.destroy();
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

    private executeSkill3() {
        console.log(`executeSkill3被调用，当前状态: ${this.currentState}, 当前技能: ${this.currentSkill}`);
        
        if (this.currentState !== BossState.WINDUP) {
            console.log(`executeSkill3被调用，但当前状态不是WINDUP: ${this.currentState}`);
            return;
        }
        
        console.log("开始播放技能三动画");
        console.log(`播放动画前的当前动画: ${this.anims.currentAnim?.key}`);
        this.currentState = BossState.SKILL_3; // 使用SKILL_3状态
        this.anims.play('boss-skill3', true);
        console.log(`播放动画后的当前动画: ${this.anims.currentAnim?.key}`);

        // 计算向前摇开始时玩家方向的冲刺方向
        if (this.windupPlayerPosition) {
            const dir = new Phaser.Math.Vector2(this.windupPlayerPosition.x - this.x, this.windupPlayerPosition.y - this.y).normalize();
            
            // 设置冲刺速度
            this.setVelocity(dir.x * 300, dir.y * 300);
            
            // 根据方向设置镜像
            if (dir.x > 0) this.setFlipX(true);
            else if (dir.x < 0) this.setFlipX(false);
        }

        // 冲刺持续0.8秒
        this.scene.time.delayedCall(500, () => {
            this.setVelocity(0, 0);
            this.endAction(true); // 传入true表示是技能三结束
        });
    }

    private endAction(isSkill3End: boolean = false) {
        if (this.currentState === BossState.DEAD) return;

        if (isSkill3End) {
            const isHalfHealth = this.health > this.maxHealth / 2;
            let shouldTriggerSkill1 = false;

            if (isHalfHealth) {
                shouldTriggerSkill1 = Phaser.Math.FloatBetween(0, 1) < 0.25;
            } else {
                shouldTriggerSkill1 = true;
            }

            if (shouldTriggerSkill1) {
                this.currentState = BossState.SKILL_1;
                this.anims.play('boss-skill1', true);

                this.scene.cameras.main.shake(500, 0.001);
                const aoe = this.scene.add.circle(this.x, this.y, 60);
                this.scene.physics.add.existing(aoe);
                this.scene.events.emit('boss-aoe', aoe, 1.0);

                const particles = this.scene.add.particles(0, 0, 'smoke', {
                    x: this.x,
                    y: this.y,
                    speed: { min: 50, max: 100 },
                    angle: { min: 0, max: 360 },
                    scale: { start: 0.5, end: 1.5 },
                    alpha: { start: 0.8, end: 0 },
                    blendMode: 'NORMAL',
                    lifespan: 500,
                    quantity: 30,
                    gravityY: -80,
                    maxParticles: 30
                });

                this.scene.time.delayedCall(500, () => {
                    aoe.destroy();
                    particles.destroy();
                    this.currentState = BossState.CHASE;
                    this.clearTint();
                    this.isPhaseTransitionInvincible = false;
                    const isHalfHealth = this.health > this.maxHealth / 2;
                    this.skillCooldown = isHalfHealth ? 10000 : 8000;
                });
                return;
            }
        }

        this.currentState = BossState.CHASE;
        this.clearTint();
        this.isPhaseTransitionInvincible = false;
        const isHalfHealth = this.health > this.maxHealth / 2;
        this.skillCooldown = isHalfHealth ? 10000 : 8000;
    }

    protected die() {
        // 首先调用父类die方法，设置isDead = true
        super.die();
        
        this.currentState = BossState.DEAD;
        this.setTint(0x333333);
        console.log("【Boss 被击杀！】");
        
        // 重置流血状态，防止复活后自带流血
        (this as any).bleedStacks = 0;
        (this as any).bleedStartTimes = [];
        
        // 设置为非活跃状态，防止update方法再次显示血条
        this.setActive(false);
        
        // 关闭血条（会同时清除流血图标）
        this.hideHealthBar();
        
        // 更新全局状态中的死亡记录
        if (this.monsterId) {
            const globalState = (this.scene.game as any).globalState || {};
            globalState.deadMonsters = globalState.deadMonsters || {};
            globalState.deadMonsters[this.monsterId] = true;
            (this.scene.game as any).globalState = globalState;
            console.log(`怪物 ${this.monsterId} 已标记为死亡`);
        }
        
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
        // 更新流血状态UI，确保流血图标正确显示
        (this as any).updateBleedUI();
    }
    
    public hideHealthBar() {
        this.scene.game.events.emit('hide-boss-health');
    }
    
    protected updateHealthBar() {
        this.scene.game.events.emit('update-boss-health', {
            health: this.health,
            maxHealth: this.maxHealth,
            totalDamageTaken: this.totalDamageTaken
        });
    }
    

}