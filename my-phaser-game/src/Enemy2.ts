import Phaser from "phaser";
import Player from "./Player";

export default class Enemy2 extends Phaser.Physics.Arcade.Sprite {
    public health: number = 3;
    private isDead: boolean = false;
    public monsterId: string = "";

    private targetPlayer!: Phaser.Physics.Arcade.Sprite | null;
    private shadow!: Phaser.GameObjects.Ellipse;
    private healthBar!: Phaser.GameObjects.Graphics;
    protected maxHealth: number = 3;

    private attackCooldown: number = 6000;
    private lastAttackTime: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: number) {
        super(scene, x, y, texture, frame);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        this.setScale(0.8);
        this.body?.setSize(24, 28);
        this.body?.setOffset(4, 2);

        this.shadow = scene.add.ellipse(
            this.x,
            this.y + 8,
            16,
            6,
            0x000000,
            0.3
        );
        this.shadow.setDepth(this.y - 0.5);

        this.healthBar = scene.add.graphics();
        this.healthBar.setDepth(100);
        this.updateHealthBar();

        this.createAnimations();
        this.anims.play('enemy2-idle', true);
    }

    private createAnimations() {
        this.anims.create({
            key: 'enemy2-idle',
            frames: this.anims.generateFrameNumbers('enemy2', { start: 0, end: 2 }),
            frameRate: 6,
            repeat: -1
        });
    }

    public setTarget(player: Phaser.Physics.Arcade.Sprite) {
        this.targetPlayer = player;
    }

    public takeDamage(damage: number, _attackerDirection: Phaser.Math.Vector2, _comboCount: number = 1) {
        if (this.isDead) return;

        this.health -= damage;
        console.log(`Enemy2受到 ${damage} 点伤害！剩余血量：${this.health}`);

        if (this.healthBar) {
            this.updateHealthBar();
        }

        this.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            this.clearTint();
        });

        if (this.health <= 0) {
            this.die();
        }
    }

    protected die() {
        this.isDead = true;
        this.setVelocity(0, 0);
        this.setTint(0x444444);
        console.log("Enemy2被击败了！");

        if (this.monsterId) {
            const globalState = (this.scene.game as any).globalState || {};
            globalState.deadMonsters = globalState.deadMonsters || {};
            globalState.deadMonsters[this.monsterId] = true;
            (this.scene.game as any).globalState = globalState;
        }

        this.scene.time.delayedCall(500, () => {
            if (this.shadow) {
                this.shadow.destroy();
            }
            if (this.healthBar) {
                this.healthBar.destroy();
            }
            this.destroy();
        });
    }

    protected updateHealthBar() {
        const width = 20;
        const height = 4;
        const x = this.x - width / 2;
        const y = this.y - 20;

        this.healthBar.clear();

        this.healthBar.fillStyle(0x333333, 1);
        this.healthBar.fillRect(x, y, width, height);

        const healthPercent = this.health / this.maxHealth;
        this.healthBar.fillStyle(0xff0000, 1);
        this.healthBar.fillRect(x, y, width * healthPercent, height);

        this.healthBar.lineStyle(1, 0xffffff, 1);
        this.healthBar.strokeRect(x, y, width, height);
    }

    public update() {
        if (this.isDead || !this.targetPlayer) return;

        this.setDepth(this.y);

        if (this.shadow) {
            this.shadow.setPosition(this.x, this.y + 8);
            this.shadow.setDepth(this.y - 0.5);
        }

        if (this.healthBar) {
            this.updateHealthBar();
        }

        const distanceToPlayer = Phaser.Math.Distance.Between(this.x, this.y, this.targetPlayer.x, this.targetPlayer.y);

        if (distanceToPlayer <= 200) {
            if (this.targetPlayer.x < this.x) {
                this.flipX = false;
            } else {
                this.flipX = true;
            }
            this.anims.play('enemy2-idle', true);

            const now = this.scene.time.now;
            if (now - this.lastAttackTime >= this.attackCooldown) {
                this.fireBullet();
                this.lastAttackTime = now;
            }
        } else {
            this.setVelocity(0, 0);
            this.anims.play('enemy2-idle', true);
        }
    }

    private fireBullet() {
        if (!this.targetPlayer || this.isDead) return;

        const bullet = new Bullet(
            this.scene,
            this.x,
            this.y - 10,
            'bullet',
            this.targetPlayer
        );

        this.scene.events.emit('enemy2-bullet-created', bullet, this.targetPlayer);
    }
}

export class Bullet extends Phaser.Physics.Arcade.Sprite {
    private targetPlayer!: Phaser.Physics.Arcade.Sprite;
    private startX: number = 0;
    private startY: number = 0;
    private readonly MAX_DISTANCE: number = 300;
    private readonly SPEED: number = 250;
    private hasHit: boolean = false;

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string, target: Phaser.Physics.Arcade.Sprite) {
        super(scene, x, y, texture, 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.targetPlayer = target;
        this.startX = x;
        this.startY = y;

        this.setScale(0.8);
        this.body?.setSize(20, 20);
        this.body?.setOffset(6, 6);

        const dir = new Phaser.Math.Vector2(
            this.targetPlayer.x - this.x,
            this.targetPlayer.y - this.y
        ).normalize();

        this.setVelocity(dir.x * this.SPEED, dir.y * this.SPEED);

        if (dir.x > 0) {
            this.flipX = true;
        } else if (dir.x < 0) {
            this.flipX = false;
        }

        this.scene.physics.add.overlap(this, this.targetPlayer, this.onHitPlayer, undefined, this);
    }

    private onHitPlayer() {
        if (this.hasHit) return;
        this.hasHit = true;

        const player = this.targetPlayer as Player;
        if (player && typeof player.takeDamage === 'function') {
            const dir = new Phaser.Math.Vector2(this.targetPlayer.x - this.x, this.targetPlayer.y - this.y).normalize();
            player.takeDamage(0.5, dir.x, dir.y);
        }

        this.setVelocity(0, 0);
        this.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            this.destroy();
        });
    }

    update() {
        if (this.hasHit || !this.active) return;

        const dist = Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y);

        if (dist >= this.MAX_DISTANCE) {
            this.fadeOut();
        }
    }

    private fadeOut() {
        this.setVelocity(0, 0);
        this.hasHit = true;

        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.destroy();
            }
        });
    }
}