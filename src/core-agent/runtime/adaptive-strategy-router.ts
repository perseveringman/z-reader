import type {
  AgentTaskRequest,
  ClassificationSignal,
  ForceStrategyMode,
  IStrategyRouter,
  StrategyMode,
} from '../contracts';

const REACT_COMPLEXITY_THRESHOLD = 0.45;
const REACT_RISK_THRESHOLD = 0.4;
const REACT_TOOL_COUNT_THRESHOLD = 2;
const REACT_CONTEXT_TOKEN_THRESHOLD = 1800;

export class AdaptiveStrategyRouter implements IStrategyRouter {
  async classify(request: AgentTaskRequest): Promise<ClassificationSignal> {
    const metadata = request.metadata ?? {};

    const complexity = this.readNumeric(metadata, 'complexityScore', this.estimateComplexity(request.instruction));
    const risk = this.readNumeric(metadata, 'riskScore', 0.2);
    const contextTokens = this.readNumeric(metadata, 'contextTokens', this.estimateTokens(request.instruction));
    const toolCount = this.readNumeric(metadata, 'toolCount', 1);

    return {
      complexity: this.clamp(complexity),
      risk: this.clamp(risk),
      contextTokens: Math.max(0, Math.round(contextTokens)),
      toolCount: Math.max(0, Math.round(toolCount)),
    };
  }

  async chooseMode(request: AgentTaskRequest, signal: ClassificationSignal): Promise<StrategyMode> {
    if (request.forceMode) {
      return this.forceModeToStrategy(request.forceMode);
    }

    const shouldUseReact =
      signal.complexity <= REACT_COMPLEXITY_THRESHOLD &&
      signal.risk <= REACT_RISK_THRESHOLD &&
      signal.toolCount <= REACT_TOOL_COUNT_THRESHOLD &&
      signal.contextTokens <= REACT_CONTEXT_TOKEN_THRESHOLD;

    return shouldUseReact ? 'react' : 'plan_execute';
  }

  private forceModeToStrategy(mode: ForceStrategyMode): StrategyMode {
    return mode;
  }

  private estimateComplexity(instruction: string): number {
    const lengthScore = instruction.length > 120 ? 0.65 : 0.35;
    const hasFlowKeyword = /(然后|接着|最后|步骤|plan|workflow|multi-step)/i.test(instruction);
    return hasFlowKeyword ? Math.max(0.7, lengthScore) : lengthScore;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private readNumeric(source: Record<string, unknown>, key: string, fallback: number): number {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private clamp(value: number): number {
    if (value < 0) {
      return 0;
    }

    if (value > 1) {
      return 1;
    }

    return value;
  }
}
