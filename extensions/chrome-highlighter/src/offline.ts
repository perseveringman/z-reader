/**
 * 离线支持模块
 * 使用 IndexedDB 实现本地数据缓存和离线同步
 */

import { toast } from './toast';

const DB_NAME = 'ZReaderOffline';
const DB_VERSION = 1;
const HIGHLIGHTS_STORE = 'highlights';
const PENDING_STORE = 'pending_operations';

interface OfflineHighlight {
  id: string;
  articleId: string;
  text: string;
  note?: string;
  color: string;
  startOffset: number;
  endOffset: number;
  paragraphIndex: number;
  createdAt: number;
  synced: boolean;
}

interface PendingOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retries: number;
}

let db: IDBDatabase | null = null;
let isOnline = navigator.onLine;
let syncInterval: number | null = null;

/**
 * 初始化离线支持
 */
export async function initOfflineSupport(): Promise<void> {
  try {
    db = await openDatabase();
    setupOnlineListener();
    startSyncInterval();
    console.log('[Z-Reader] 离线支持已初始化');
    
    if (!isOnline) {
      toast.info('当前处于离线模式，数据将在联网后同步');
    }
  } catch (error) {
    console.error('[Z-Reader] 初始化离线支持失败:', error);
  }
}

/**
 * 打开数据库
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建高亮存储
      if (!db.objectStoreNames.contains(HIGHLIGHTS_STORE)) {
        const highlightStore = db.createObjectStore(HIGHLIGHTS_STORE, { keyPath: 'id' });
        highlightStore.createIndex('articleId', 'articleId', { unique: false });
        highlightStore.createIndex('synced', 'synced', { unique: false });
      }

      // 创建待同步操作存储
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        const pendingStore = db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
        pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * 设置在线状态监听
 */
function setupOnlineListener(): void {
  window.addEventListener('online', () => {
    isOnline = true;
    toast.success('已恢复网络连接，开始同步数据');
    syncPendingOperations();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    toast.warning('网络已断开，切换到离线模式');
  });
}

/**
 * 启动同步间隔
 */
function startSyncInterval(): void {
  // 每30秒检查一次待同步操作
  syncInterval = window.setInterval(() => {
    if (isOnline) {
      syncPendingOperations();
    }
  }, 30000);
}

/**
 * 保存高亮到本地
 */
export async function saveHighlightOffline(highlight: OfflineHighlight): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([HIGHLIGHTS_STORE], 'readwrite');
    const store = transaction.objectStore(HIGHLIGHTS_STORE);
    
    const request = store.put({
      ...highlight,
      synced: isOnline,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 从本地获取高亮
 */
export async function getHighlightsOffline(articleId: string): Promise<OfflineHighlight[]> {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([HIGHLIGHTS_STORE], 'readonly');
    const store = transaction.objectStore(HIGHLIGHTS_STORE);
    const index = store.index('articleId');
    
    const request = index.getAll(articleId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除本地高亮
 */
export async function deleteHighlightOffline(id: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([HIGHLIGHTS_STORE], 'readwrite');
    const store = transaction.objectStore(HIGHLIGHTS_STORE);
    
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 添加待同步操作
 */
export async function addPendingOperation(
  type: 'create' | 'update' | 'delete',
  data: any
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const operation: PendingOperation = {
    id: `${type}_${data.id || Date.now()}`,
    type,
    data,
    timestamp: Date.now(),
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([PENDING_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_STORE);
    
    const request = store.put(operation);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有待同步操作
 */
async function getPendingOperations(): Promise<PendingOperation[]> {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([PENDING_STORE], 'readonly');
    const store = transaction.objectStore(PENDING_STORE);
    const index = store.index('timestamp');
    
    const request = index.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除已同步操作
 */
async function deletePendingOperation(id: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([PENDING_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_STORE);
    
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 更新操作重试次数
 */
async function updateOperationRetries(operation: PendingOperation): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  operation.retries++;

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([PENDING_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_STORE);
    
    const request = store.put(operation);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 同步待处理操作
 */
export async function syncPendingOperations(): Promise<void> {
  if (!isOnline || !db) return;

  try {
    const operations = await getPendingOperations();
    
    if (operations.length === 0) return;

    console.log(`[Z-Reader] 开始同步 ${operations.length} 个待处理操作`);

    let successCount = 0;
    let failCount = 0;

    for (const operation of operations) {
      try {
        // 最多重试5次
        if (operation.retries >= 5) {
          console.warn(`[Z-Reader] 操作 ${operation.id} 重试次数过多，跳过`);
          await deletePendingOperation(operation.id);
          failCount++;
          continue;
        }

        await executePendingOperation(operation);
        await deletePendingOperation(operation.id);
        successCount++;
      } catch (error) {
        console.error(`[Z-Reader] 同步操作失败:`, operation, error);
        await updateOperationRetries(operation);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`已同步 ${successCount} 个操作`);
    }
    
    if (failCount > 0) {
      toast.warning(`${failCount} 个操作同步失败，将稍后重试`);
    }
  } catch (error) {
    console.error('[Z-Reader] 同步失败:', error);
  }
}

/**
 * 执行待处理操作
 */
async function executePendingOperation(operation: PendingOperation): Promise<void> {
  // 这里应该调用实际的 API 函数
  // 由于依赖注入的复杂性，这里只是示例
  // 实际使用时需要从 api.ts 导入相应函数
  
  const API_BASE = 'http://127.0.0.1:21897/api';
  
  switch (operation.type) {
    case 'create':
      const createResponse = await fetch(`${API_BASE}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation.data),
      });
      if (!createResponse.ok) throw new Error('Create failed');
      break;

    case 'update':
      const updateResponse = await fetch(`${API_BASE}/highlights/${operation.data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation.data),
      });
      if (!updateResponse.ok) throw new Error('Update failed');
      break;

    case 'delete':
      const deleteResponse = await fetch(`${API_BASE}/highlights/${operation.data.id}`, {
        method: 'DELETE',
      });
      if (!deleteResponse.ok) throw new Error('Delete failed');
      break;
  }
}

/**
 * 获取离线状态
 */
export function getOfflineStatus(): {
  isOnline: boolean;
  hasDatabase: boolean;
  pendingCount: number;
} {
  return {
    isOnline,
    hasDatabase: db !== null,
    pendingCount: 0, // 需要异步获取
  };
}

/**
 * 获取待同步操作数量
 */
export async function getPendingCount(): Promise<number> {
  try {
    const operations = await getPendingOperations();
    return operations.length;
  } catch {
    return 0;
  }
}

/**
 * 清除所有离线数据
 */
export async function clearOfflineData(): Promise<void> {
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([HIGHLIGHTS_STORE, PENDING_STORE], 'readwrite');
    
    transaction.objectStore(HIGHLIGHTS_STORE).clear();
    transaction.objectStore(PENDING_STORE).clear();

    transaction.oncomplete = () => {
      toast.success('已清除所有离线数据');
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 销毁离线支持
 */
export function destroyOfflineSupport(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  
  if (db) {
    db.close();
    db = null;
  }
}