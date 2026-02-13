import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollText,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Zap,
  DollarSign,
  Hash,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { AITaskLogItem, AITaskLogDetail } from '../../shared/types';

// ==================== 辅助函数 ====================

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 安全解析 JSON，失败返回 null */
function safeJsonParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** 任务类型颜色 */
const TASK_TYPE_COLORS: Record<string, string> = {
  summarize: 'text-blue-400 bg-blue-900/30',
  translate: 'text-green-400 bg-green-900/30',
  auto_tag: 'text-yellow-400 bg-yellow-900/30',
  extract_topics: 'text-purple-400 bg-purple-900/30',
  chat: 'text-cyan-400 bg-cyan-900/30',
};

/** Trace Step type 颜色 */
const STEP_TYPE_COLORS: Record<string, string> = {
  llm_call: 'text-blue-400 bg-blue-900/30',
  tool_call: 'text-purple-400 bg-purple-900/30',
  error: 'text-red-400 bg-red-900/30',
};

/** 所有已知的任务类型（用于筛选 Tab） */
const TASK_TYPES = ['summarize', 'translate', 'auto_tag', 'extract_topics', 'chat'];

// ==================== 子组件 ====================

/** 可复制 JSON 代码块 */
function JsonBlock({
  data,
  label,
  maxLines = 8,
}: {
  data: unknown;
  label: string;
  maxLines?: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (data === null || data === undefined) return null;

  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const lines = json.split('\n');
  const needsTruncate = lines.length > maxLines;
  const displayJson = expanded || !needsTruncate ? json : lines.slice(0, maxLines).join('\n') + '\n...';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-green-400">{t('ai.copied')}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>{t('ai.copyJson')}</span>
            </>
          )}
        </button>
      </div>
      <pre className="text-[11px] leading-[1.5] bg-black/30 border border-white/5 rounded-md p-2 overflow-x-auto text-gray-400 max-h-64 overflow-y-auto">
        {displayJson}
      </pre>
      {needsTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer"
        >
          {expanded ? t('ai.collapse') : `${t('ai.viewDetails')} (${lines.length} lines)`}
        </button>
      )}
    </div>
  );
}

/** Trace 步骤列表 */
function TraceSteps({
  tracesJson,
}: {
  tracesJson: string | null;
}) {
  const { t } = useTranslation();
  const trace = safeJsonParse(tracesJson) as {
    steps?: Array<{
      type: string;
      input: string;
      output: string;
      durationMs: number;
      tokenCount: number;
      error?: string;
    }>;
    totalTokens?: number;
    totalDurationMs?: number;
  } | null;

  if (!trace || !trace.steps || trace.steps.length === 0) {
    return (
      <p className="text-[11px] text-gray-600 italic mt-2">{t('ai.noTraces')}</p>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] text-gray-500 font-medium">
          {t('ai.traceDetails')} ({trace.steps.length} {t('ai.steps')})
        </span>
        {trace.totalDurationMs != null && (
          <span className="text-[10px] text-gray-600">
            {formatDuration(trace.totalDurationMs)}
          </span>
        )}
      </div>
      {trace.steps.map((step, i) => (
        <div
          key={i}
          className="bg-black/20 border border-white/5 rounded-md p-2"
        >
          <div className="flex items-center gap-2 text-[11px]">
            <span className="shrink-0 text-gray-500 w-4">{i + 1}</span>
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                STEP_TYPE_COLORS[step.type] || 'text-gray-400 bg-gray-800'
              }`}
            >
              {step.type}
            </span>
            <span className="text-gray-500">
              {formatDuration(step.durationMs)}
            </span>
            <span className="text-gray-500">
              {step.tokenCount} tokens
            </span>
          </div>
          {step.error && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="w-3 h-3" />
              <span>{step.error}</span>
            </div>
          )}
          {step.input && (
            <div className="mt-1">
              <pre className="text-[10px] leading-[1.4] text-gray-500 overflow-x-auto max-h-20 overflow-y-auto">
                {step.input.length > 300 ? step.input.slice(0, 300) + '...' : step.input}
              </pre>
            </div>
          )}
          {step.output && (
            <div className="mt-1 border-t border-white/5 pt-1">
              <pre className="text-[10px] leading-[1.4] text-gray-400 overflow-x-auto max-h-20 overflow-y-auto">
                {step.output.length > 300 ? step.output.slice(0, 300) + '...' : step.output}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 单条日志详情展开区 */
function LogDetailExpanded({ logId }: { logId: string }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AITaskLogDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.electronAPI
      .aiTaskLogDetail(logId)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [logId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-[11px]">{t('ai.generating')}</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <p className="text-[11px] text-gray-600 py-2">{t('ai.noTraces')}</p>
    );
  }

  const inputData = safeJsonParse(detail.inputJson);
  const outputData = safeJsonParse(detail.outputJson);

  return (
    <div className="pt-2 pb-1 border-t border-white/5">
      {detail.errorText && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-red-900/20 border border-red-500/20 rounded-md">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-[11px] text-red-400">{detail.errorText}</span>
        </div>
      )}
      {inputData != null ? <JsonBlock data={inputData} label={t('ai.input')} /> : null}
      {outputData != null ? <JsonBlock data={outputData} label={t('ai.output')} /> : null}
      <TraceSteps tracesJson={detail.tracesJson} />
    </div>
  );
}

// ==================== 主组件 ====================

export function AIDebugPanel() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AITaskLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // 加载日志列表
  useEffect(() => {
    setLoading(true);
    window.electronAPI
      .aiTaskLogs(50)
      .then((data) => setLogs(data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  // 统计数据（从本地列表计算）
  const stats = useMemo(() => {
    const totalCalls = logs.length;
    const totalTokens = logs.reduce((sum, log) => sum + log.tokenCount, 0);
    const totalCost = logs.reduce((sum, log) => sum + log.costUsd, 0);
    return { totalCalls, totalTokens, totalCost };
  }, [logs]);

  // 按类型分组统计
  const typeStats = useMemo(() => {
    const map: Record<string, { count: number; tokens: number }> = {};
    for (const log of logs) {
      if (!map[log.taskType]) {
        map[log.taskType] = { count: 0, tokens: 0 };
      }
      map[log.taskType].count++;
      map[log.taskType].tokens += log.tokenCount;
    }
    return map;
  }, [logs]);

  // 可见的任务类型（从实际数据中获取）
  const visibleTypes = useMemo(() => {
    const types = new Set(logs.map((l) => l.taskType));
    return TASK_TYPES.filter((t) => types.has(t));
  }, [logs]);

  // 筛选后的日志
  const filteredLogs = useMemo(() => {
    if (typeFilter === 'all') return logs;
    return logs.filter((l) => l.taskType === typeFilter);
  }, [logs, typeFilter]);

  // 展开/收起
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <ScrollText size={16} className="text-purple-400" />
        <h3 className="text-sm font-medium text-white">{t('ai.debugPanel')}</h3>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#111] border border-white/5 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Hash className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-gray-500">{t('ai.totalCalls')}</span>
          </div>
          <p className="text-lg font-semibold text-white">{stats.totalCalls}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] text-gray-500">{t('ai.totalTokens')}</span>
          </div>
          <p className="text-lg font-semibold text-white">
            {stats.totalTokens.toLocaleString()}
          </p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3 h-3 text-green-400" />
            <span className="text-[10px] text-gray-500">{t('ai.totalCost')}</span>
          </div>
          <p className="text-lg font-semibold text-white">
            ${stats.totalCost.toFixed(4)}
          </p>
        </div>
      </div>

      {/* 按类型分组小标签 */}
      {Object.keys(typeStats).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(typeStats).map(([type, stat]) => (
            <span
              key={type}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                TASK_TYPE_COLORS[type] || 'text-gray-400 bg-gray-800'
              }`}
            >
              {type}
              <span className="opacity-60">x{stat.count}</span>
              <span className="opacity-60">{stat.tokens.toLocaleString()}t</span>
            </span>
          ))}
        </div>
      )}

      {/* 类型筛选 Tab */}
      {visibleTypes.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => setTypeFilter('all')}
            className={`shrink-0 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {t('ai.filterAll')}
          </button>
          {visibleTypes.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`shrink-0 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                typeFilter === type
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* 调用日志列表 */}
      {filteredLogs.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">{t('ai.noLogs')}</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {filteredLogs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <div
                key={log.id}
                className="bg-[#111] border border-white/5 rounded-md overflow-hidden"
              >
                {/* 基本信息行（可点击展开） */}
                <button
                  onClick={() => toggleExpand(log.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
                    )}
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        TASK_TYPE_COLORS[log.taskType] || 'text-gray-400 bg-gray-800'
                      }`}
                    >
                      {log.taskType}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        log.status === 'completed'
                          ? 'bg-green-900/40 text-green-400'
                          : log.status === 'failed'
                            ? 'bg-red-900/40 text-red-400'
                            : 'bg-yellow-900/40 text-yellow-400'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-gray-500">
                    <span>{log.tokenCount} tokens</span>
                    <span>${log.costUsd.toFixed(4)}</span>
                    <span>
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </button>
                {/* 展开详情区 */}
                {isExpanded && (
                  <div className="px-3 pb-3">
                    <LogDetailExpanded logId={log.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
