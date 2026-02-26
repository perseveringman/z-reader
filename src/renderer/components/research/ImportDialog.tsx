import { useState, useEffect, useMemo } from 'react';
import type { Article } from '../../../shared/types';

interface ImportDialogProps {
  spaceId: string;
  existingSourceIds: string[];
  onClose: () => void;
  onImported: () => void;
}

export function ImportDialog({ spaceId, existingSourceIds, onClose, onImported }: ImportDialogProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // 加载文章列表
  useEffect(() => {
    const load = async () => {
      try {
        const list = await window.electronAPI.articleList({});
        setArticles(list);
      } catch (err) {
        console.error('Failed to load articles:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // 过滤已导入的和搜索
  const filteredArticles = useMemo(() => {
    return articles
      .filter(a => !existingSourceIds.includes(a.id))
      .filter(a => {
        if (!searchText) return true;
        const s = searchText.toLowerCase();
        return (a.title?.toLowerCase().includes(s)) || (a.feedTitle?.toLowerCase().includes(s)) || (a.domain?.toLowerCase().includes(s));
      });
  }, [articles, existingSourceIds, searchText]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredArticles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredArticles.map(a => a.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setIsImporting(true);
    try {
      for (const sourceId of selectedIds) {
        await window.electronAPI.researchSourceAdd({
          spaceId,
          sourceType: 'article',
          sourceId,
        });
      }
      onImported();
      onClose();
    } catch (err) {
      console.error('Failed to import sources:', err);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] rounded-xl border border-white/10 w-[560px] max-h-[70vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium text-gray-200">导入文章</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">{'\u2715'}</button>
          </div>
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索文章..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            autoFocus
          />
        </div>

        {/* 文章列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">加载中...</p>
          ) : filteredArticles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">没有可导入的文章</p>
          ) : (
            <>
              <div className="px-2 py-1 mb-1">
                <button
                  onClick={toggleAll}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {selectedIds.size === filteredArticles.length ? '取消全选' : '全选'}
                </button>
              </div>
              {filteredArticles.map(article => (
                <div
                  key={article.id}
                  onClick={() => toggleSelect(article.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selectedIds.has(article.id) ? 'bg-blue-500/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                    selectedIds.has(article.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
                  }`}>
                    {selectedIds.has(article.id) && (
                      <span className="text-white text-xs">{'\u2713'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{article.title || '无标题'}</p>
                    <p className="text-xs text-gray-600 truncate">{article.feedTitle || article.domain || ''}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="p-4 border-t border-white/5 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            已选 {selectedIds.size} 篇
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-300 rounded"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={selectedIds.size === 0 || isImporting}
              className={`px-4 py-1.5 text-sm rounded ${
                selectedIds.size === 0 || isImporting
                  ? 'bg-blue-600/30 text-white/30 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}
            >
              {isImporting ? '导入中...' : `导入 ${selectedIds.size} 篇`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
