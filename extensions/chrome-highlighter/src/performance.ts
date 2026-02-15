/**
 * 性能优化模块
 * 提供虚拟滚动、节流防抖、懒加载等性能优化功能
 */

/**
 * 节流函数
 * 限制函数在指定时间内只能执行一次
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: number | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func.apply(this, args);
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * 防抖函数
 * 延迟执行函数，如果在延迟期间再次调用则重置计时器
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    
    timeoutId = window.setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * 请求动画帧节流
 * 使用 requestAnimationFrame 实现的节流
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (rafId !== null) return;

    rafId = requestAnimationFrame(() => {
      func.apply(this, args);
      rafId = null;
    });
  };
}

/**
 * 批量处理器
 * 将多个操作合并成一次批量处理
 */
export class BatchProcessor<T> {
  private queue: T[] = [];
  private timeoutId: number | null = null;
  private processFn: (items: T[]) => void;
  private delay: number;

  constructor(processFn: (items: T[]) => void, delay = 100) {
    this.processFn = processFn;
    this.delay = delay;
  }

  add(item: T): void {
    this.queue.push(item);
    
    if (this.timeoutId) clearTimeout(this.timeoutId);
    
    this.timeoutId = window.setTimeout(() => {
      this.flush();
    }, this.delay);
  }

  flush(): void {
    if (this.queue.length === 0) return;

    const items = [...this.queue];
    this.queue = [];
    this.timeoutId = null;

    this.processFn(items);
  }
}

/**
 * 虚拟滚动容器
 * 只渲染可见区域的元素，提升大列表性能
 */
export class VirtualScroller {
  private container: HTMLElement;
  private items: any[];
  private itemHeight: number;
  private visibleCount: number;
  private renderFn: (item: any, index: number) => HTMLElement;
  private scrollHandler: () => void;
  private startIndex = 0;
  private endIndex = 0;

  constructor(
    container: HTMLElement,
    items: any[],
    itemHeight: number,
    renderFn: (item: any, index: number) => HTMLElement
  ) {
    this.container = container;
    this.items = items;
    this.itemHeight = itemHeight;
    this.renderFn = renderFn;
    this.visibleCount = Math.ceil(container.clientHeight / itemHeight) + 2;

    this.scrollHandler = throttle(() => this.render(), 16);
    this.container.addEventListener('scroll', this.scrollHandler);

    this.render();
  }

  setItems(items: any[]): void {
    this.items = items;
    this.render();
  }

  private render(): void {
    const scrollTop = this.container.scrollTop;
    this.startIndex = Math.floor(scrollTop / this.itemHeight);
    this.endIndex = Math.min(this.startIndex + this.visibleCount, this.items.length);

    // 清空容器
    this.container.innerHTML = '';

    // 创建占位容器
    const totalHeight = this.items.length * this.itemHeight;
    const placeholder = document.createElement('div');
    placeholder.style.height = `${totalHeight}px`;
    placeholder.style.position = 'relative';

    // 渲染可见元素
    for (let i = this.startIndex; i < this.endIndex; i++) {
      const element = this.renderFn(this.items[i], i);
      element.style.position = 'absolute';
      element.style.top = `${i * this.itemHeight}px`;
      element.style.left = '0';
      element.style.right = '0';
      element.style.height = `${this.itemHeight}px`;
      placeholder.appendChild(element);
    }

    this.container.appendChild(placeholder);
  }

  destroy(): void {
    this.container.removeEventListener('scroll', this.scrollHandler);
  }
}

/**
 * 懒加载观察器
 * 使用 IntersectionObserver 实现元素懒加载
 */
export class LazyLoader {
  private observer: IntersectionObserver;
  private loadFn: (element: HTMLElement) => void;

  constructor(loadFn: (element: HTMLElement) => void, options?: IntersectionObserverInit) {
    this.loadFn = loadFn;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          this.loadFn(element);
          this.observer.unobserve(element);
        }
      });
    }, options || { rootMargin: '50px' });
  }

  observe(element: HTMLElement): void {
    this.observer.observe(element);
  }

  unobserve(element: HTMLElement): void {
    this.observer.unobserve(element);
  }

  destroy(): void {
    this.observer.disconnect();
  }
}

/**
 * 内存优化的对象池
 * 复用对象减少 GC 压力
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn?: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn?: (obj: T) => void, maxSize = 100) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    if (this.pool.length >= this.maxSize) return;

    if (this.resetFn) {
      this.resetFn(obj);
    }

    this.pool.push(obj);
  }

  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

/**
 * DOM 操作批处理器
 * 使用 DocumentFragment 批量插入 DOM
 */
export function batchDOMInsert(
  container: HTMLElement,
  elements: HTMLElement[]
): void {
  const fragment = document.createDocumentFragment();
  elements.forEach((el) => fragment.appendChild(el));
  container.appendChild(fragment);
}

/**
 * 性能监控器
 * 监控函数执行时间和性能指标
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
    }
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
    }
  }

  private recordMetric(name: string, duration: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(duration);
  }

  getStats(name: string): { avg: number; min: number; max: number; count: number } | null {
    const durations = this.metrics.get(name);
    if (!durations || durations.length === 0) return null;

    const sum = durations.reduce((a, b) => a + b, 0);
    return {
      avg: sum / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      count: durations.length,
    };
  }

  clear(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }

  report(): void {
    console.group('📊 Performance Report');
    this.metrics.forEach((_, name) => {
      const stats = this.getStats(name);
      if (stats) {
        console.log(
          `${name}: avg=${stats.avg.toFixed(2)}ms, min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms, count=${stats.count}`
        );
      }
    });
    console.groupEnd();
  }
}

/**
 * 内存使用监控
 */
export function getMemoryUsage(): {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
} | null {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  }
  return null;
}

/**
 * 帧率监控
 */
export class FPSMonitor {
  private lastTime = performance.now();
  private frames = 0;
  private fps = 0;
  private running = false;
  private rafId: number | null = null;
  private callback?: (fps: number) => void;

  start(callback?: (fps: number) => void): void {
    this.callback = callback;
    this.running = true;
    this.lastTime = performance.now();
    this.frames = 0;
    this.tick();
  }

  private tick = (): void => {
    if (!this.running) return;

    this.frames++;
    const currentTime = performance.now();
    
    if (currentTime >= this.lastTime + 1000) {
      this.fps = Math.round((this.frames * 1000) / (currentTime - this.lastTime));
      this.frames = 0;
      this.lastTime = currentTime;

      if (this.callback) {
        this.callback(this.fps);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  get currentFPS(): number {
    return this.fps;
  }
}

/**
 * 全局性能监控实例
 */
export const perfMonitor = new PerformanceMonitor();

/**
 * 优化的事件监听器管理
 */
export class EventManager {
  private listeners: Map<string, Set<EventListener>> = new Map();

  on(
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): () => void {
    element.addEventListener(event, handler, options);

    const key = `${event}_${(element as any).id || 'unknown'}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(handler);

    // 返回移除函数
    return () => {
      element.removeEventListener(event, handler, options);
      this.listeners.get(key)?.delete(handler);
    };
  }

  off(element: EventTarget, event: string, handler: EventListener): void {
    element.removeEventListener(event, handler);
    const key = `${event}_${(element as any).id || 'unknown'}`;
    this.listeners.get(key)?.delete(handler);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * 全局事件管理器实例
 */
export const eventManager = new EventManager();