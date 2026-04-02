// ==========================================
// 【核心新增：全局BGM管理器 - 独立于场景】
// ==========================================
export class BGMManager {
  private static instance: BGMManager | null = null;
  private scene: Phaser.Scene | null = null;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private isCombat: boolean = false;
  private normalTracks: string[] = ['normal1', 'normal2'];
  private combatTracks: string[] = ['fight1', 'fight2'];
  private currentNormalIndex: number = 0;
  private currentCombatIndex: number = 0;
  private isPlaying: boolean = false;
  private isTransitioning: boolean = false; // 切换中锁
  
  // 敌人组引用
  private enemies: Phaser.Physics.Arcade.Group | null = null;
  private bossesGroup: Phaser.Physics.Arcade.Group | null = null;

  // 单例模式
  public static getInstance(): BGMManager {
    if (!BGMManager.instance) {
      BGMManager.instance = new BGMManager();
    }
    return BGMManager.instance;
  }

  // 私有构造函数
  private constructor() {}

  // 设置当前场景（场景切换时调用）
  public setScene(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // 设置敌人组引用
  public setEnemies(enemies: Phaser.Physics.Arcade.Group, bossesGroup: Phaser.Physics.Arcade.Group) {
    this.enemies = enemies;
    this.bossesGroup = bossesGroup;
  }

  // 清除敌人引用（场景切换时调用）
  public clearEnemies() {
    this.enemies = null;
    this.bossesGroup = null;
  }

  // 更新BGM状态（每帧调用）
  public update() {
    if (!this.scene) return;
    
    const isAnyEnemyChasing = this.checkIfAnyEnemyChasing();
    
    if (isAnyEnemyChasing) {
      // 有敌人在追踪，切换到战斗音乐
      if (!this.isCombat && !this.isTransitioning) {
        this.switchToCombat();
      }
    } else {
      // 没有敌人追踪，切换到平时音乐
      if (this.isCombat && !this.isTransitioning) {
        this.switchToNormal();
      } else if (!this.isPlaying && !this.isTransitioning) {
        // 没有在播放音乐时，开始播放平时音乐
        this.playNextNormalTrack();
      }
    }
  }

  // 检查是否有任何敌人在追踪玩家
  private checkIfAnyEnemyChasing(): boolean {
    // 检查普通敌人
    if (this.enemies) {
      const enemyList = this.enemies.getChildren() as any[];
      for (const enemy of enemyList) {
        if (enemy.active && !enemy.isDead && this.isEnemyChasing(enemy)) {
          return true;
        }
      }
    }

    // 检查Boss
    if (this.bossesGroup) {
      const bossList = this.bossesGroup.getChildren() as any[];
      for (const boss of bossList) {
        if (boss.active && boss.currentState !== 'DEAD' && this.isBossChasing(boss)) {
          return true;
        }
      }
    }

    return false;
  }

  // 检查普通敌人是否在追踪玩家（在仇恨范围内）
  private isEnemyChasing(enemy: any): boolean {
    if (!enemy.targetPlayer) return false;
    
    const distance = Phaser.Math.Distance.Between(
      enemy.x, enemy.y,
      enemy.targetPlayer.x, enemy.targetPlayer.y
    );
    
    // 敌人在仇恨范围内且没有死亡/受伤
    return distance <= enemy.aggroRange;
  }

  // 检查Boss是否在追踪玩家
  private isBossChasing(boss: any): boolean {
    if (!boss.targetPlayer) return false;
    
    const distance = Phaser.Math.Distance.Between(
      boss.x, boss.y,
      boss.targetPlayer.x, boss.targetPlayer.y
    );
    
    // Boss在仇恨范围内
    return distance <= boss.aggroRange;
  }

  // 切换到平时BGM
  private switchToNormal() {
    if (this.isTransitioning) return;
    console.log('[BGM] 切换到平时音乐');
    this.isTransitioning = true;
    this.isCombat = false;
    this.stopCurrentMusic();
    this.scene?.time.delayedCall(100, () => {
      this.isTransitioning = false;
      this.playNextNormalTrack();
    });
  }

  // 切换到战斗BGM
  private switchToCombat() {
    if (this.isTransitioning) return;
    console.log('[BGM] 切换到战斗音乐');
    this.isTransitioning = true;
    this.isCombat = true;
    this.stopCurrentMusic();
    this.scene?.time.delayedCall(100, () => {
      this.isTransitioning = false;
      this.playNextCombatTrack();
    });
  }

  // 开始播放平时BGM（外部调用）
  public startNormalBGM() {
    if (this.isTransitioning) return;
    if (this.isCombat || !this.isPlaying) {
      this.switchToNormal();
    }
  }

  // 停止当前音乐
  private stopCurrentMusic() {
    if (this.currentMusic) {
      // 移除所有事件监听器，防止回调触发
      this.currentMusic.removeAllListeners();
      this.currentMusic.stop();
      this.currentMusic.destroy();
      this.currentMusic = null;
    }
    this.isPlaying = false;
  }

  // 播放下一首平时音乐
  private playNextNormalTrack() {
    if (!this.scene || this.isTransitioning) return;
    if (this.isCombat) return; // 如果已经是战斗状态，不播放平时音乐
    
    const trackKey = this.normalTracks[this.currentNormalIndex];
    this.currentNormalIndex = (this.currentNormalIndex + 1) % this.normalTracks.length;
    console.log(`[BGM] 准备播放平时音乐: ${trackKey}`);
    this.playTrack(trackKey, () => {
      // 只有在仍然是平时状态时才继续播放下一首
      if (!this.isCombat && !this.isTransitioning) {
        this.playNextNormalTrack();
      }
    });
  }

  // 播放下一首战斗音乐
  private playNextCombatTrack() {
    if (!this.scene || this.isTransitioning) return;
    if (!this.isCombat) return; // 如果已经不是战斗状态，不播放战斗音乐
    
    const trackKey = this.combatTracks[this.currentCombatIndex];
    this.currentCombatIndex = (this.currentCombatIndex + 1) % this.combatTracks.length;
    console.log(`[BGM] 准备播放战斗音乐: ${trackKey}`);
    this.playTrack(trackKey, () => {
      // 只有在仍然是战斗状态时才继续播放下一首
      if (this.isCombat && !this.isTransitioning) {
        this.playNextCombatTrack();
      }
    });
  }

  // 播放指定音乐
  private playTrack(key: string, onComplete: () => void) {
    if (!this.scene) return;
    
    // 确保先停止当前音乐
    this.stopCurrentMusic();
    
    this.currentMusic = this.scene.sound.add(key, {
      volume: 0.5,
      loop: false
    });

    this.currentMusic.once('complete', onComplete);
    this.currentMusic.play();
    this.isPlaying = true;
    console.log(`[BGM] 开始播放: ${key} (${this.isCombat ? '战斗' : '平时'})`);
  }

  // 停止所有音乐
  public stop() {
    this.stopCurrentMusic();
    this.isCombat = false;
    this.isTransitioning = false;
  }

  // 强制重置为平时音乐（用于复活时）
  public forceResetToNormal() {
    console.log('[BGM] 强制重置为平时音乐');
    this.isCombat = false;
    this.isTransitioning = false;
    this.stopCurrentMusic();
    this.scene?.time.delayedCall(100, () => {
      this.startNormalBGM();
    });
  }
}
