import type { ComponentType } from 'react';

/** 支持的内容类型 */
export type ContentType = 'article' | 'video' | 'podcast' | 'book' | 'note';

/** 所有阅读器组件的统一 Props 接口 */
export interface ReaderComponentProps {
  /** 内容 ID（articleId / bookId 等） */
  contentId: string;
  /** 返回/关闭回调 */
  onClose: () => void;
  /** 是否嵌入模式（区别于全屏模式） */
  embedded?: boolean;
}

/** 内容类型 → 阅读器组件 的注册表 */
const registry = new Map<ContentType, ComponentType<ReaderComponentProps>>();

/** 注册一个阅读器组件 */
export function registerReader(type: ContentType, component: ComponentType<ReaderComponentProps>) {
  registry.set(type, component);
}

/** 获取指定类型的阅读器组件，未注册则返回 undefined */
export function getReader(type: ContentType): ComponentType<ReaderComponentProps> | undefined {
  return registry.get(type);
}
