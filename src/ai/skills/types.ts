import type { ZodSchema } from 'zod';
import type { LanguageModel } from 'ai';

/** AI 上下文，传递给每个 Skill */
export interface AIContext {
  /** 获取模型实例，按任务类型选择 */
  getModel: (task: 'fast' | 'smart' | 'cheap') => LanguageModel;
  /** 获取文章全文（通过注入的回调） */
  getArticleContent?: (articleId: string) => Promise<string | null>;
}

/** AI Skill 标准接口 */
export interface AISkill<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  execute: (input: TInput, ctx: AIContext) => Promise<TOutput>;
}

/** AI 任务状态 */
export type AITaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/** AI 任务日志记录 */
export interface AITaskLog {
  id: string;
  taskType: string;
  status: AITaskStatus;
  inputJson: string;
  outputJson: string | null;
  tracesJson: string | null;
  tokenCount: number;
  costUsd: number;
  errorText: string | null;
  metadataJson: string | null;
  createdAt: string;
}
