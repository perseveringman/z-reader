import { Rss, Radio, Route, X } from 'lucide-react';
import type { DiscoverSearchResult } from '../../../shared/types';

interface SearchResultsProps {
  results: DiscoverSearchResult[];
  loading: boolean;
  onSubscribe: (result: DiscoverSearchResult) => void;
  onClear: () => void;
}

const typeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  podcast: { label: '播客', icon: <Radio size={14} />, color: 'text-purple-400' },
  rss: { label: 'RSS', icon: <Rss size={14} />, color: 'text-orange-400' },
  rsshub: { label: 'RSSHub', icon: <Route size={14} />, color: 'text-green-400' },
};

export function SearchResults({ results, loading, onSubscribe, onClear }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-600 border-t-blue-500" />
        <span className="ml-2 text-sm text-gray-500">搜索中...</span>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500 mb-2">未找到结果</p>
        <p className="text-xs text-gray-600">试试其他关键词或直接输入网站 URL</p>
        <button
          onClick={onClear}
          className="mt-4 text-xs text-blue-500 hover:text-blue-400 cursor-pointer"
        >
          清除搜索
        </button>
      </div>
    );
  }

  // 按类型分组
  const grouped = results.reduce<Record<string, DiscoverSearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">
          找到 {results.length} 个结果
        </span>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
        >
          <X size={14} />
          清除
        </button>
      </div>

      {Object.entries(grouped).map(([type, items]) => {
        const meta = typeLabels[type] || { label: type, icon: <Rss size={14} />, color: 'text-gray-400' };
        return (
          <div key={type} className="mb-6">
            <div className={`flex items-center gap-1.5 mb-3 text-xs font-medium ${meta.color}`}>
              {meta.icon}
              <span>{meta.label}</span>
              <span className="text-gray-600 ml-1">({items.length})</span>
            </div>

            <div className="flex flex-col gap-1">
              {items.map((result, i) => (
                <button
                  key={`${type}-${i}`}
                  onClick={() => onSubscribe(result)}
                  className="flex items-center gap-3 p-3 rounded-md hover:bg-white/5 transition-colors text-left cursor-pointer w-full"
                >
                  {result.image ? (
                    <img
                      src={result.image}
                      alt=""
                      className="w-10 h-10 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center shrink-0">
                      {meta.icon}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{result.title}</div>
                    {result.description && (
                      <div className="text-xs text-gray-500 truncate">{result.description}</div>
                    )}
                  </div>

                  <span className="text-xs text-blue-500 shrink-0">
                    {result.feedUrl ? '预览' : '配置'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
