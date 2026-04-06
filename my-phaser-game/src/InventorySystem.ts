// ==========================================
// 【核心新增：背包/装备系统】
// ==========================================

// 道具类型定义
export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  equipped: boolean;
  type: 'weapon' | 'pet' | 'consumable';
}

// 背包管理器
export class InventoryManager {
  private static instance: InventoryManager | null = null;
  private items: Map<string, InventoryItem> = new Map();
  private listeners: ((items: InventoryItem[]) => void)[] = [];

  // 单例模式
  public static getInstance(): InventoryManager {
    if (!InventoryManager.instance) {
      InventoryManager.instance = new InventoryManager();
    }
    return InventoryManager.instance;
  }

  private constructor() {
    // 初始化道具数据
    this.initializeItems();
  }

  // 初始化道具（只在物品不存在时创建，保留已有状态）
  private initializeItems() {
    // 拳套
    if (!this.items.has('gauntlet')) {
      this.items.set('gauntlet', {
        id: 'gauntlet',
        name: '老皮革拳套',
        description: '一副饱经风霜的制式皮革拳套，原主人把他保养的很好。\n翻滚后可直接派生第三段攻击。\n"岩石亦可碎，何况敌骨。"',
        icon: 'item_gauntlet',
        equipped: false,
        type: 'weapon'
      });
    }

    // 苍蝇宠物
    if (!this.items.has('fly')) {
      this.items.set('fly', {
        id: 'fly',
        name: '襁褓苍蝇',
        description: '教宗巴德万拼死保护的襁褓苍蝇。\n跟随玩家，在第三段攻击命中后，将叠加流血与吸血效果。\n"火之将熄，然位不见王影。"',
        icon: 'item_fly',
        equipped: false,
        type: 'pet'
      });
    }

    // 生命药水（苹果种子）
    if (!this.items.has('potion')) {
      this.items.set('potion', {
        id: 'potion',
        name: '苹果种子',
        description: '一颗苹果的种子，蕴含着澎湃坚韧的灵魂能量。\n提升生命上限，并且回满生命值。',
        icon: 'item_hp',
        equipped: false,
        type: 'consumable'
      });
    }
  }

  // 获取所有道具
  public getAllItems(): InventoryItem[] {
    return Array.from(this.items.values());
  }

  // 获取已获得的道具（已解锁的）
  public getUnlockedItems(): InventoryItem[] {
    return this.getAllItems().filter(item => this.isUnlocked(item.id));
  }

  // 获取全局状态（从window获取，由GameScene设置）
  private getGlobalState(): any {
    // 尝试从window获取（GameScene会设置这个）
    const windowState = (window as any).globalState;
    if (windowState) {
      return windowState;
    }
    // 否则返回null，让调用者处理
    return null;
  }

  // 检查道具是否已解锁
  public isUnlocked(itemId: string): boolean {
    const globalState = this.getGlobalState();
    console.log('[InventorySystem] isUnlocked check:', itemId, 'globalState exists:', !!globalState);
    
    if (!globalState) {
      // 如果没有全局状态，检查本地items的解锁标记
      const item = this.items.get(itemId);
      const unlocked = item ? (item as any)._unlocked === true : false;
      console.log('[InventorySystem] checking local _unlocked:', unlocked);
      return unlocked;
    }
    
    let result = false;
    switch (itemId) {
      case 'gauntlet':
        result = globalState.hasGauntlet === true;
        break;
      case 'fly':
        result = globalState.hasFly === true;
        break;
      case 'potion':
        result = globalState.hasPotion === true;
        break;
      default:
        result = false;
    }
    console.log(`[InventorySystem] isUnlocked result for ${itemId}: ${result}, globalState.${itemId}:`, (globalState as any)[`has${itemId.charAt(0).toUpperCase() + itemId.slice(1)}`]);
    return result;
  }

  // 解锁道具
  public unlockItem(itemId: string) {
    console.log('[InventorySystem] unlockItem called:', itemId);
    const globalState = this.getGlobalState();
    console.log('[InventorySystem] globalState exists:', !!globalState);

    // 标记为已解锁（本地）
    const item = this.items.get(itemId);
    if (item) {
      (item as any)._unlocked = true;
      console.log('[InventorySystem] marked as _unlocked locally');
    } else {
      console.log('[InventorySystem] ERROR: item not found:', itemId);
    }

    // 同时更新全局状态（如果存在）- 必须先设置全局状态，再装备
    if (globalState) {
      switch (itemId) {
        case 'gauntlet':
          globalState.hasGauntlet = true;
          break;
        case 'fly':
          globalState.hasFly = true;
          break;
        case 'potion':
          globalState.hasPotion = true;
          break;
      }
      console.log('[InventorySystem] updated globalState:', globalState);
    }
    
    // 自动装备新获得的道具（直接设置equipped，不调用equipItem避免isUnlocked检查）
    if (item) {
      item.equipped = true;
      this.notifyListeners();
      console.log('[InventorySystem] auto-equipped item:', itemId);
    }
  }

  // 装备道具
  public equipItem(itemId: string): boolean {
    const item = this.items.get(itemId);
    if (!item || !this.isUnlocked(itemId)) return false;

    item.equipped = true;
    this.notifyListeners();
    return true;
  }

  // 取下道具
  public unequipItem(itemId: string): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    item.equipped = false;
    this.notifyListeners();
    return true;
  }

  // 切换装备状态
  public toggleEquip(itemId: string): boolean {
    console.log(`[InventorySystem] toggleEquip called: ${itemId}`);
    const item = this.items.get(itemId);
    if (!item) {
      console.log(`[InventorySystem] toggleEquip: item ${itemId} not found`);
      return false;
    }
    const unlocked = this.isUnlocked(itemId);
    console.log(`[InventorySystem] toggleEquip: ${itemId} unlocked = ${unlocked}`);
    if (!unlocked) {
      console.log(`[InventorySystem] toggleEquip: ${itemId} is not unlocked, returning false`);
      return false;
    }

    item.equipped = !item.equipped;
    console.log(`[InventorySystem] toggleEquip: ${itemId} equipped changed to ${item.equipped}`);
    this.notifyListeners();
    return item.equipped;
  }

  // 检查道具是否装备
  public isEquipped(itemId: string): boolean {
    const item = this.items.get(itemId);
    return item ? item.equipped : false;
  }

  // 获取装备状态（用于Player类）
  public getEquippedState(): { hasGauntlet: boolean; hasFly: boolean } {
    return {
      hasGauntlet: this.isEquipped('gauntlet'),
      hasFly: this.isEquipped('fly')
    };
  }

  // 添加监听器
  public addListener(callback: (items: InventoryItem[]) => void) {
    this.listeners.push(callback);
  }

  // 移除监听器
  public removeListener(callback: (items: InventoryItem[]) => void) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  // 通知所有监听器
  private notifyListeners() {
    const items = this.getAllItems();
    this.listeners.forEach(callback => callback(items));
  }
}
