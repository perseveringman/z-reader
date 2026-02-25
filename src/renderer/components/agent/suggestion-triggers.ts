import type { AgentViewState, AgentSuggestionRule } from '../../../shared/types';

/**
 * 内置建议触发器
 *
 * 每个规则定义：
 * - check: 比较 prev/next viewState，返回 trigger 或 null
 * - generate: 根据 trigger + viewState 生成具体建议
 */
export const builtinSuggestionRules: AgentSuggestionRule[] = [
  {
    id: 'reader-opened',
    check: (prev: AgentViewState | null, next: AgentViewState) => {
      const prevPage = prev?.pageState.page;
      const nextPage = next.pageState.page;
      // 从非 reader 页面切换到 reader 页面
      if (prevPage !== 'reader' && nextPage === 'reader') {
        return { id: 'reader-opened', reason: '打开文章阅读器', priority: 'medium' };
      }
      return null;
    },
    generate: () => ({
      message: '需要我帮你理解这篇文章吗？',
      quickActions: [
        { label: '生成摘要', prompt: '请为我生成这篇文章的摘要' },
        { label: '提取要点', prompt: '请提取这篇文章的关键要点' },
      ],
      autoDismissMs: 10000,
    }),
  },
  {
    id: 'kg-opened',
    check: (prev: AgentViewState | null, next: AgentViewState) => {
      const prevPage = prev?.pageState.page;
      const nextPage = next.pageState.page;
      if (prevPage !== 'knowledge-graph' && nextPage === 'knowledge-graph') {
        return { id: 'kg-opened', reason: '打开知识图谱', priority: 'low' };
      }
      return null;
    },
    generate: () => ({
      message: '需要我帮你探索知识图谱吗？',
      quickActions: [
        { label: '查找相关主题', prompt: '帮我查找知识图谱中的相关主题' },
        { label: '分析连接', prompt: '帮我分析知识图谱中的连接关系' },
      ],
      autoDismissMs: 10000,
    }),
  },
  {
    id: 'feeds-opened',
    check: (prev: AgentViewState | null, next: AgentViewState) => {
      const prevPage = prev?.pageState.page;
      const nextPage = next.pageState.page;
      if (prevPage !== 'feeds' && nextPage === 'feeds') {
        return { id: 'feeds-opened', reason: '打开订阅源', priority: 'low' };
      }
      return null;
    },
    generate: () => ({
      message: '需要我帮你管理订阅吗？',
      quickActions: [
        { label: '查看阅读统计', prompt: '查看我的阅读统计数据' },
        { label: '查看未读', prompt: '帮我查看未读文章' },
      ],
      autoDismissMs: 10000,
    }),
  },
];
