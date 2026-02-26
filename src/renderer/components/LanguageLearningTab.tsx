import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, ChevronDown, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import type { SelectionTranslation } from '../../shared/types';

interface LanguageLearningTabProps {
  articleId: string;
  /** 新翻译完成时外部通知刷新 */
  refreshTrigger?: number;
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return '今天';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function LanguageLearningTab({ articleId, refreshTrigger }: LanguageLearningTabProps) {
  const [items, setItems] = useState<SelectionTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const list = await window.electronAPI.selectionTranslationList(articleId);
      setItems(list);
      // 自动展开最新的一条
      if (list.length > 0) {
        setExpandedId(list[0].id);
      }
    } catch (err) {
      console.error('加载划词翻译列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    setLoading(true);
    loadItems();
  }, [articleId, refreshTrigger, loadItems]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.electronAPI.selectionTranslationDelete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error('删除划词翻译失败:', err);
    }
  }, [expandedId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <div className="text-center text-gray-500">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">选中文字并点击翻译按钮</p>
          <p className="text-xs mt-1 text-gray-600">翻译结果将在此处展示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-lg border border-white/5 bg-[#1a1a1a] overflow-hidden"
          >
            {/* 头部 */}
            <button
              onClick={() => toggleExpand(item.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors cursor-pointer group"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              )}
              <span className="flex-1 text-[13px] text-gray-300 truncate">
                &ldquo;{item.sourceText}&rdquo;
              </span>
              <span className="text-[10px] text-gray-600 shrink-0">
                {formatDate(item.createdAt)} {formatTime(item.createdAt)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-500 hover:text-red-400 transition-all cursor-pointer shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </button>

            {/* 详情 */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3">
                {/* 基础翻译 */}
                <AnalysisBlock title="翻译" content={item.translation} />

                {/* LLM 分析模块 */}
                {item.analysis && (
                  <>
                    {item.analysis.sentenceTranslation && (
                      <AnalysisBlock title="整句翻译" content={item.analysis.sentenceTranslation} />
                    )}
                    {item.analysis.grammarStructure && (
                      <AnalysisBlock title="语法结构" content={item.analysis.grammarStructure} />
                    )}
                    {item.analysis.keyVocabulary && item.analysis.keyVocabulary.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">词汇标注</h4>
                        <div className="space-y-1">
                          {item.analysis.keyVocabulary.map((v, i) => (
                            <div key={i} className="flex items-center gap-2 text-[12px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.role === 'main' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                              <span className="text-white font-medium">{v.word}</span>
                              <span className="text-gray-500">({v.partOfSpeech})</span>
                              <span className="text-gray-400">{v.meaning}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.analysis.usageExtension && (
                      <AnalysisBlock title="用法拓展" content={item.analysis.usageExtension} />
                    )}
                    {item.analysis.criticalKnowledge && (
                      <AnalysisBlock title="临界知识" content={item.analysis.criticalKnowledge} />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 分析区块通用组件 */
function AnalysisBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}
