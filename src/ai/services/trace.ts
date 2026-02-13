/**
 * AI 执行追踪服务
 * 用于记录每次 AI 调用的完整 trace，包括 LLM 调用、工具调用、错误等步骤
 */

/** 单个追踪步骤 */
export interface AITraceStep {
  type: 'llm_call' | 'tool_call' | 'error';
  input: string;
  output: string;
  durationMs: number;
  tokenCount: number;
  error?: string;
}

/** 完整的执行追踪记录 */
export interface AIExecutionTrace {
  taskId: string;
  taskType: string;
  steps: AITraceStep[];
  totalTokens: number;
  totalDurationMs: number;
  startedAt: string;
  completedAt: string;
}

/**
 * AI 追踪收集器
 * 在任务执行过程中逐步记录各阶段信息，最终输出完整的追踪记录
 */
export class AITraceCollector {
  private steps: AITraceStep[] = [];
  private startedAt = new Date().toISOString();

  constructor(
    private taskType: string,
    private taskId: string,
  ) {}

  /** 添加一个追踪步骤 */
  addStep(step: AITraceStep) {
    this.steps.push(step);
  }

  /** 结束追踪并返回完整记录 */
  finalize(): AIExecutionTrace {
    return {
      taskId: this.taskId,
      taskType: this.taskType,
      steps: this.steps,
      totalTokens: this.steps.reduce((sum, s) => sum + s.tokenCount, 0),
      totalDurationMs: this.steps.reduce((sum, s) => sum + s.durationMs, 0),
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
