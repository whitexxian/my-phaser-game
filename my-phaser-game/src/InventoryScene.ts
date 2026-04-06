// ==========================================
// 独立背包场景 - 专门管理背包界面
// ==========================================
import Phaser from "phaser";
import { InventoryManager, type InventoryItem } from "./InventorySystem";
import { BGMManager } from "./BGMManager";

export default class InventoryScene extends Phaser.Scene {
  private inventoryManager: InventoryManager = InventoryManager.getInstance();
  private isInventoryOpen: boolean = false;
  private inventoryContainer: Phaser.GameObjects.Container | null = null;
  private inventoryBg: Phaser.GameObjects.Rectangle | null = null;
  private inventoryItems: Phaser.GameObjects.Container[] = [];
  private selectedItemIndex: number = 0;
  private itemDetailsPanel: Phaser.GameObjects.Container | null = null;
  
  // 按键
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  
  // 防止重复关闭
  private isClosing: boolean = false;

  constructor() {
    super({ key: "InventoryScene" });
  }

  create() {
    console.log('[InventoryScene] create() called');
    
    // 监听打开背包事件
    this.game.events.on('open-inventory', this.openInventory, this);
    this.game.events.on('close-inventory', this.closeInventory, this);
    
    // 初始化按键（但不监听，等打开背包时再监听）
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    
    console.log('[InventoryScene] created and listening for events');
  }

  // 打开背包
  openInventory = () => {
    console.log('[InventoryScene] openInventory called, isInventoryOpen:', this.isInventoryOpen);
    if (this.isInventoryOpen) {
      console.log('[InventoryScene] already open, returning');
      return;
    }

    // 检查是否处于战斗状态
    const bgmManager = BGMManager.getInstance();
    if (bgmManager.isInCombat()) {
      console.log('[InventoryScene] cannot open inventory during combat');
      // 显示提示信息
      this.showCombatWarning();
      return;
    }

    console.log('[InventoryScene] opening inventory...');
    this.isInventoryOpen = true;
    this.isClosing = false;
    this.selectedItemIndex = 0;
    this.inventoryItems = [];

    // 暂停所有游戏场景
    this.pauseGameScenes();
    
    // 设置按键监听
    this.upKey.on('down', this.selectPrevious, this);
    this.downKey.on('down', this.selectNext, this);
    this.enterKey.on('down', this.toggleEquip, this);
    this.escKey.on('down', this.closeInventory, this);

    // 创建UI
    this.createInventoryUI();
    
    console.log('[InventoryScene] inventory opened');
  }

  // 关闭背包
  closeInventory() {
    if (!this.isInventoryOpen || this.isClosing) return;
    
    this.isClosing = true;
    console.log('[InventoryScene] closing inventory...');
    this.isInventoryOpen = false;

    // 移除按键监听
    this.upKey.off('down', this.selectPrevious, this);
    this.downKey.off('down', this.selectNext, this);
    this.enterKey.off('down', this.toggleEquip, this);
    this.escKey.off('down', this.closeInventory, this);

    // 销毁UI
    this.destroyInventoryUI();

    // 恢复游戏场景
    this.resumeGameScenes();
    
    console.log('[InventoryScene] inventory closed');
    this.isClosing = false;
  }

  // 暂停游戏场景
  private pauseGameScenes() {
    const scenes = ['GameScene', 'TwoFloorScene', 'HouseScene', 'UnderGroundScene'];
    scenes.forEach(name => {
      const scene = this.scene.get(name);
      // 检查场景是否存在且正在运行（isActive 表示正在运行）
      if (scene && scene.scene.isActive()) {
        try {
          this.scene.pause(name);
          console.log(`[InventoryScene] paused ${name}`);
        } catch (e) {
          console.log(`[InventoryScene] failed to pause ${name}:`, e);
        }
      } else {
        console.log(`[InventoryScene] skipping ${name}, not active`);
      }
    });
  }

  // 恢复游戏场景
  private resumeGameScenes() {
    const scenes = ['GameScene', 'TwoFloorScene', 'HouseScene', 'UnderGroundScene'];
    scenes.forEach(name => {
      const scene = this.scene.get(name);
      if (scene && scene.scene.isPaused()) {
        try {
          this.scene.resume(name);
          console.log(`[InventoryScene] resumed ${name}`);
        } catch (e) {
          console.log(`[InventoryScene] failed to resume ${name}:`, e);
        }
      }
    });
  }

  // 显示战斗状态警告
  private showCombatWarning() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 创建警告文本（位置靠下，与单向门提示类似，使用白色）
    const warningText = this.add.text(width / 2, height - 100, '战斗中无法打开背包！', {
      fontSize: '35px',
      fontFamily: 'Arial',
      color: '#ffffff',
      align: 'center'
    });
    warningText.setOrigin(0.5);
    warningText.setScrollFactor(0);
    warningText.setDepth(10000);

    // 添加闪烁动画
    this.tweens.add({
      targets: warningText,
      alpha: 0,
      duration: 500,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        warningText.destroy();
      }
    });
  }

  // 创建背包UI
  private createInventoryUI() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 背景
    this.inventoryBg = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.85);
    this.inventoryBg.setScrollFactor(0);
    this.inventoryBg.setDepth(1000);

    // 主容器
    this.inventoryContainer = this.add.container(width/2, height/2);
    this.inventoryContainer.setScrollFactor(0);
    this.inventoryContainer.setDepth(1001);

    // 标题
    const title = this.add.text(0, -280, '背 包', {
      fontSize: '36px',
      fontFamily: 'SimSun, 宋体, serif',
      color: '#ffffff'
    });
    title.setOrigin(0.5);

    // 分隔线
    const line = this.add.rectangle(0, -240, 400, 2, 0x666666);

    // 获取已解锁道具
    const unlockedItems = this.inventoryManager.getUnlockedItems();
    console.log(`[InventoryScene] unlocked items: ${unlockedItems.length}`);

    // 创建道具列表
    if (unlockedItems.length > 0) {
      unlockedItems.forEach((item, index) => {
        const slot = this.createItemSlot(item, index);
        this.inventoryItems.push(slot);
        this.inventoryContainer!.add(slot);
      });
      
      // 选中第一个
      this.selectedItemIndex = 0;
      this.updateSelection();
      
      // 创建详情面板
      this.createDetailsPanel(unlockedItems[0]);
    } else {
      // 空背包提示
      const emptyText = this.add.text(0, 0, '背包是空的', {
        fontSize: '24px',
        color: '#666666'
      });
      emptyText.setOrigin(0.5);
      this.inventoryContainer.add(emptyText);
    }

    // 操作提示
    const hint = this.add.text(0, 280, '↑↓ 选择 | Enter 装备/卸下 | Esc 关闭', {
      fontSize: '16px',
      color: '#888888'
    });
    hint.setOrigin(0.5);

    this.inventoryContainer.add([title, line, hint]);
  }

  // 销毁背包UI
  private destroyInventoryUI() {
    if (this.inventoryContainer) {
      this.inventoryContainer.destroy();
      this.inventoryContainer = null;
    }
    if (this.inventoryBg) {
      this.inventoryBg.destroy();
      this.inventoryBg = null;
    }
    this.inventoryItems = [];
    this.itemDetailsPanel = null;
  }

  // 创建道具槽位
  private createItemSlot(item: InventoryItem, index: number): Phaser.GameObjects.Container {
    console.log(`[InventoryScene] createItemSlot: ${item.id}, equipped: ${item.equipped}`);
    
    const container = this.add.container(0, -180 + index * 70);
    
    // 背景
    const bg = this.add.rectangle(0, 0, 360, 60, 0x2a2a2a, 0.9);
    bg.setStrokeStyle(2, 0x666666);
    (container as any).bg = bg;

    // 图标
    const icon = this.add.image(-140, 0, item.icon);
    icon.setScale(1.2);

    // 名称（根据装备状态显示不同颜色）
    const nameColor = item.equipped ? '#00ff00' : '#ffffff';
    console.log(`[InventoryScene] nameColor for ${item.id}: ${nameColor}`);
    const nameText = this.add.text(-100, -12, item.name, {
      fontSize: '18px',
      color: nameColor
    });

    // 状态
    const statusText = this.add.text(-100, 12, item.equipped ? '[已装备]' : '', {
      fontSize: '12px',
      color: '#00ff00'
    });

    container.add([bg, icon, nameText, statusText]);
    (container as any).itemData = item;
    
    return container;
  }

  // 创建详情面板
  private createDetailsPanel(item: InventoryItem) {
    if (this.itemDetailsPanel) {
      this.itemDetailsPanel.destroy();
    }

    this.itemDetailsPanel = this.add.container(380, 0);

    // 背景 - 大幅增加高度以容纳16px字体的描述
    const bg = this.add.rectangle(0, 0, 320, 500, 0x1a1a1a, 0.95);
    bg.setStrokeStyle(2, 0x444444);

    // 名称
    const nameText = this.add.text(0, -200, item.name, {
      fontSize: '28px',
      color: '#ffd700',
      align: 'center'
    });
    nameText.setOrigin(0.5);

    // 类型
    const typeText = this.add.text(0, -160, this.getTypeLabel(item.type), {
      fontSize: '16px',
      color: '#888888'
    });
    typeText.setOrigin(0.5);

    // 描述 - 保持16px字体，使用固定宽度文本框
    const descText = this.add.text(0, -40, item.description, {
      fontSize: '16px',
      color: '#cccccc',
      align: 'left',
      wordWrap: { width: 260, useAdvancedWrap: true },
      lineSpacing: 6
    });
    descText.setOrigin(0.5, 0.5);
    // 强制更新文本样式
    descText.updateText();

    // 装备状态
    const equipText = this.add.text(0, 180, item.equipped ? '当前已装备' : '当前未装备', {
      fontSize: '18px',
      color: item.equipped ? '#00ff00' : '#666666'
    });
    equipText.setOrigin(0.5);

    this.itemDetailsPanel.add([bg, nameText, typeText, descText, equipText]);
    this.inventoryContainer!.add(this.itemDetailsPanel);
  }

  // 获取类型标签
  private getTypeLabel(type: string): string {
    switch (type) {
      case 'weapon': return '武器';
      case 'pet': return '宠物';
      case 'consumable': return '消耗品';
      default: return '道具';
    }
  }

  // 更新选中状态
  private updateSelection() {
    this.inventoryItems.forEach((item, index) => {
      const bg = (item as any).bg as Phaser.GameObjects.Rectangle;
      if (index === this.selectedItemIndex) {
        bg.setStrokeStyle(3, 0x00ff00);
        bg.setFillStyle(0x3a3a3a, 0.9);
      } else {
        bg.setStrokeStyle(2, 0x666666);
        bg.setFillStyle(0x2a2a2a, 0.9);
      }
    });

    // 更新详情面板
    if (this.inventoryItems[this.selectedItemIndex]) {
      const item = (this.inventoryItems[this.selectedItemIndex] as any).itemData as InventoryItem;
      this.createDetailsPanel(item);
    }
  }

  // 选择上一个
  private selectPrevious() {
    if (this.inventoryItems.length === 0) return;
    this.selectedItemIndex = (this.selectedItemIndex - 1 + this.inventoryItems.length) % this.inventoryItems.length;
    this.updateSelection();
  }

  // 选择下一个
  private selectNext() {
    if (this.inventoryItems.length === 0) return;
    this.selectedItemIndex = (this.selectedItemIndex + 1) % this.inventoryItems.length;
    this.updateSelection();
  }

  // 切换装备状态
  private toggleEquip() {
    if (this.inventoryItems.length === 0) return;
    
    const item = (this.inventoryItems[this.selectedItemIndex] as any).itemData as InventoryItem;
    console.log(`[InventoryScene] toggleEquip called for ${item.id}, current equipped: ${item.equipped}`);
    
    const newState = this.inventoryManager.toggleEquip(item.id);
    console.log(`[InventoryScene] toggleEquip result for ${item.id}: ${newState}`);
    
    // 发送事件到当前暂停的场景（即打开背包前的场景）
    // 通过 scene.manager.scenes 找到当前暂停的场景
    const pausedScenes = this.scene.manager.scenes.filter((s: any) => s.scene.isPaused() && s.player);
    console.log(`[InventoryScene] Found ${pausedScenes.length} paused scenes with player:`, pausedScenes.map((s: any) => s.scene.key));
    const pausedScene = pausedScenes[0];
    
    if (pausedScene) {
      pausedScene.events.emit('update-equipment', {
        itemId: item.id,
        equipped: newState
      });
      console.log(`[InventoryScene] update-equipment event sent to ${pausedScene.scene.key}: ${item.id} = ${newState}`);
    } else {
      // 如果没有找到暂停的场景，使用全局事件
      this.game.events.emit('update-equipment', {
        itemId: item.id,
        equipped: newState
      });
      console.log(`[InventoryScene] update-equipment event sent to global: ${item.id} = ${newState}`);
    }
    
    // 刷新UI
    this.refreshUI();
  }

  // 刷新UI（只刷新内容，不重建）
  private refreshUI() {
    console.log('[InventoryScene] refreshUI called');
    
    // 保存当前选中
    const currentIndex = this.selectedItemIndex;
    const currentItemId = this.inventoryItems[currentIndex] 
      ? (this.inventoryItems[currentIndex] as any).itemData.id 
      : null;
    
    // 销毁旧列表
    this.inventoryItems.forEach(item => item.destroy());
    this.inventoryItems = [];
    
    // 重新创建列表
    const unlockedItems = this.inventoryManager.getUnlockedItems();
    console.log('[InventoryScene] unlockedItems count:', unlockedItems.length);
    unlockedItems.forEach(item => {
      console.log(`[InventoryScene] item: ${item.id}, equipped: ${item.equipped}, _unlocked: ${(item as any)._unlocked}`);
    });
    
    unlockedItems.forEach((item, index) => {
      const slot = this.createItemSlot(item, index);
      this.inventoryItems.push(slot);
      this.inventoryContainer!.add(slot);
    });
    
    // 恢复选中
    if (currentItemId) {
      const newIndex = unlockedItems.findIndex(item => item.id === currentItemId);
      this.selectedItemIndex = newIndex >= 0 ? newIndex : 0;
    } else {
      this.selectedItemIndex = Math.min(currentIndex, this.inventoryItems.length - 1);
    }
    
    this.updateSelection();
    
    // 更新详情面板
    if (this.inventoryItems[this.selectedItemIndex]) {
      const item = (this.inventoryItems[this.selectedItemIndex] as any).itemData as InventoryItem;
      this.createDetailsPanel(item);
    }
  }
}
