import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, PenTool, Copy, Check, Sparkles, FileText, Tag, Highlighter, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAgentContext } from '../hooks/useAgentContext';
import type { WritingAssistSearchResult, WritingAssistStreamChunk, AISettingsData } from '../../shared/types';

/**
 * 写作辅助独立页面
 * 左右分栏: 左侧检索结果 | 右侧生成内容
 */
export function WritingAssistPage() {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('');
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchResults, setSearchResults] = useState<WritingAssistSearchResult | null>(null);
  const [generatedText, setGeneratedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const generatedRef = useRef<HTMLDivElement>(null);
  const { reportContext } = useAgentContext();

  useEffect(() => {
    reportContext({
      common: { currentPage: 'writing-assist', readerMode: false, selectedText: null },
      pageState: {
        page: 'writing-assist',
        currentDocId: null,
        wordCount: generatedText.length,
      },
    });
  }, [generatedText, reportContext]);

  // 检查 API Key 是否配置
  useEffect(() => {
    window.electronAPI.aiSettingsGet().then((settings: AISettingsData) => {
      setHasApiKey(!!settings.apiKey);
    }).catch(() => setHasApiKey(false));
  }, []);

  // 搜索材料
  const handleSearch = useCallback(async () => {
    if (!topic.trim() || searching) return;
    setSearching(true);
    setSearchResults(null);
    setGeneratedText('');

    try {
      const results = await window.electronAPI.writingAssistSearch({ topic: topic.trim() });
      setSearchResults(results);
    } catch (error) {
      console.error('Writing assist search failed:', error);
    } finally {
      setSearching(false);
    }
  }, [topic, searching]);

  // 生成写作素材
  const handleGenerate = useCallback(() => {
    if (!searchResults || generating) return;
    setGenerating(true);
    setGeneratedText('');

    const cleanup = window.electronAPI.writingAssistOnStream((chunk: WritingAssistStreamChunk) => {
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        setGeneratedText(prev => prev + chunk.textDelta);
        // 自动滚动
        if (generatedRef.current) {
          generatedRef.current.scrollTop = generatedRef.current.scrollHeight;
        }
      } else if (chunk.type === 'done') {
        setGenerating(false);
        if (chunk.fullText) {
          setGeneratedText(chunk.fullText);
        }
      } else if (chunk.type === 'error') {
        setGenerating(false);
        console.error('Writing assist generation error:', chunk.error);
      }
    });

    window.electronAPI.writingAssistGenerate({
      topic: topic.trim(),
      searchResults,
    });

    // 清理函数会在组件卸载时调用
    return cleanup;
  }, [searchResults, generating, topic]);

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    if (!generatedText) return;
    await navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedText]);

  // Enter 键触发搜索
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  // 未配置 API Key 的提示
  if (hasApiKey === false) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <PenTool size={48} className="mx-auto text-gray-500" />
          <h2 className="text-lg font-medium text-gray-200">{t('writingAssist.title')}</h2>
          <p className="text-sm text-gray-400">{t('writingAssist.noApiKey')}</p>
          <button
            onClick={() => {
              // 触发设置对话框
              const event = new CustomEvent('open-preferences');
              window.dispatchEvent(event);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
          >
            {t('writingAssist.configureAI')}
          </button>
        </div>
      </div>
    );
  }

  const totalResults =
    (searchResults?.articles.length ?? 0) +
    (searchResults?.entities.length ?? 0) +
    (searchResults?.highlights.length ?? 0);

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* 左侧: 搜索 + 检索结果 */}
      <div className="w-[40%] min-w-[320px] border-r border-white/[0.06] flex flex-col">
        {/* 搜索栏 */}
        <div className="p-4 border-b border-white/[0.06]">
          <h2 className="text-base font-medium text-gray-200 mb-3 flex items-center gap-2">
            <PenTool size={18} />
            {t('writingAssist.title')}
          </h2>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('writingAssist.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!topic.trim() || searching}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : t('writingAssist.search')}
            </button>
          </div>
        </div>

        {/* 检索结果 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {searching && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 size={24} className="animate-spin mr-2" />
              <span className="text-sm">{t('writingAssist.search')}...</span>
            </div>
          )}

          {searchResults && !searching && totalResults === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              {t('writingAssist.noResults')}
            </div>
          )}

          {/* 相关文章 */}
          {searchResults && searchResults.articles.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={14} />
                {t('writingAssist.relatedArticles')} ({searchResults.articles.length})
              </h3>
              <div className="space-y-2">
                {searchResults.articles.map((article) => (
                  <div
                    key={article.id}
                    className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-gray-200 font-medium">{article.title || 'Untitled'}</span>
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                        {article.relevance}
                      </span>
                    </div>
                    {article.snippets.length > 0 && (
                      <p className="mt-1.5 text-[12px] text-gray-500 line-clamp-2">
                        {article.snippets[0]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 相关实体 */}
          {searchResults && searchResults.entities.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tag size={14} />
                {t('writingAssist.relatedEntities')} ({searchResults.entities.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {searchResults.entities.map((entity, idx) => (
                  <span
                    key={idx}
                    title={entity.description || undefined}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white/[0.05] border border-white/[0.08] rounded-full text-xs text-gray-300"
                  >
                    <Sparkles size={10} className="text-amber-400" />
                    {entity.name}
                    <span className="text-gray-500 text-[10px]">({entity.type})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 相关高亮 */}
          {searchResults && searchResults.highlights.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Highlighter size={14} />
                {t('writingAssist.relatedHighlights')} ({searchResults.highlights.length})
              </h3>
              <div className="space-y-2">
                {searchResults.highlights.map((hl, idx) => (
                  <div
                    key={idx}
                    className="p-2 border-l-2 border-yellow-500/50 bg-white/[0.02] rounded-r"
                  >
                    <p className="text-[12px] text-gray-300 italic">"{hl.text}"</p>
                    {hl.articleTitle && (
                      <p className="mt-1 text-[11px] text-gray-500">—— {hl.articleTitle}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧: 生成内容 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <button
            onClick={handleGenerate}
            disabled={!searchResults || totalResults === 0 || generating}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('writingAssist.generating')}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {t('writingAssist.generate')}
              </>
            )}
          </button>

          {generatedText && (
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? t('writingAssist.copied') : t('writingAssist.copy')}
            </button>
          )}
        </div>

        {/* 生成内容区 */}
        <div
          ref={generatedRef}
          className="flex-1 overflow-y-auto p-6"
        >
          {!generatedText && !generating && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500 space-y-2">
                <PenTool size={32} className="mx-auto" />
                <p className="text-sm">
                  {searchResults
                    ? t('writingAssist.generate')
                    : t('writingAssist.searchPlaceholder')}
                </p>
              </div>
            </div>
          )}

          {(generatedText || generating) && (
            <div className="prose prose-invert prose-sm max-w-none">
              <div
                className="text-gray-300 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: '' }}
                ref={(el) => {
                  if (el) el.textContent = generatedText;
                }}
              />
              {generating && (
                <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
