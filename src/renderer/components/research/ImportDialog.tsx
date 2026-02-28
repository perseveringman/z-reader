import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Search, ChevronDown, ChevronLeft, ChevronRight, X, MoreHorizontal } from 'lucide-react';
import type {
  Article,
  ResearchArticleQueryParams,
  ResearchArticleQueryResult,
  ResearchFilterOptions,
  ReadStatus,
  MediaType,
  ArticleSource,
} from '../../../shared/types';

// ==================== 子组件：FilterDropdown ====================

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multi?: boolean;
  searchable?: boolean;
}

function FilterDropdown({ label, options, selected, onChange, multi = false, searchable = false }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const displayLabel = selected.length === 0
    ? label
    : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label ?? label
      : `${label} (${selected.length})`;

  const toggle = (value: string) => {
    if (multi) {
      if (selected.includes(value)) {
        onChange(selected.filter(v => v !== value));
      } else {
        onChange([...selected, value]);
      }
    } else {
      if (selected.includes(value)) {
        onChange([]);
      } else {
        onChange([value]);
      }
      setOpen(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
          selected.length > 0
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
            : 'border-white/10 bg-white/5 text-gray-400 hover:text-gray-300 hover:border-white/20'
        }`}
      >
        <span className="truncate max-w-[100px]">{displayLabel}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#222] border border-white/10 rounded-lg shadow-xl min-w-[180px] max-h-[240px] flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-white/5">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索..."
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none"
                autoFocus
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-500 p-2 text-center">无选项</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-white/5 ${
                    selected.includes(opt.value) ? 'text-blue-300' : 'text-gray-300'
                  }`}
                >
                  {multi ? (
                    <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                      selected.includes(opt.value) ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
                    }`}>
                      {selected.includes(opt.value) && <span className="text-white text-[10px]">{'\u2713'}</span>}
                    </div>
                  ) : (
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      selected.includes(opt.value) ? 'bg-blue-400' : 'bg-transparent'
                    }`} />
                  )}
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 子组件：OverflowFilterBar ====================

interface FilterDef {
  key: string;
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
  searchable?: boolean;
}

/**
 * 自适应筛选栏：所有筛选按钮平铺在一行，
 * 放不下时自动出现"更多"按钮，点击展开溢出的筛选项。
 *
 * 实现方式：用一个不可见的镜像容器做宽度测量，
 * 实际的 FilterDropdown 渲染在正常容器中，避免 overflow:hidden 裁切下拉菜单。
 */
function OverflowFilterBar({ filters }: { filters: FilterDef[] }) {
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const measureItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [overflowIndex, setOverflowIndex] = useState<number>(filters.length);
  const [showMore, setShowMore] = useState(false);

  // 测量哪些放不下
  const measure = useCallback(() => {
    const container = measureContainerRef.current;
    if (!container) return;

    const moreButtonWidth = 60;
    const gap = 8;
    const maxWidth = container.clientWidth;

    let usedWidth = 0;
    let cutoff = filters.length;

    for (let i = 0; i < filters.length; i++) {
      const el = measureItemRefs.current[i];
      if (!el) continue;
      const itemWidth = el.offsetWidth;
      const nextUsed = usedWidth + (i > 0 ? gap : 0) + itemWidth;

      const remainingItems = filters.length - i - 1;
      const needsMoreButton = remainingItems > 0;

      if (nextUsed + (needsMoreButton ? gap + moreButtonWidth : 0) > maxWidth) {
        cutoff = i;
        break;
      }
      usedWidth = nextUsed;
    }

    setOverflowIndex(cutoff);
  }, [filters.length]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const container = measureContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  const visibleFilters = filters.slice(0, overflowIndex);
  const hiddenFilters = filters.slice(overflowIndex);
  const hasOverflow = hiddenFilters.length > 0;
  const hasActiveHidden = hiddenFilters.some(f => f.selected.length > 0);

  return (
    <div className="space-y-2">
      {/* 不可见的镜像容器，仅用于测量每个按钮的宽度 */}
      <div
        ref={measureContainerRef}
        aria-hidden="true"
        className="flex items-center gap-2 pointer-events-none"
        style={{ height: 0, overflow: 'hidden' }}
      >
        {filters.map((f, i) => (
          <div
            key={f.key}
            ref={el => { measureItemRefs.current[i] = el; }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-white/10 shrink-0 whitespace-nowrap"
          >
            <span>{f.selected.length > 0
              ? f.selected.length === 1
                ? f.options.find(o => o.value === f.selected[0])?.label ?? f.label
                : `${f.label} (${f.selected.length})`
              : f.label}</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        ))}
      </div>

      {/* 实际渲染的筛选按钮（正常文档流，下拉菜单不会被裁切） */}
      <div className="flex items-center gap-2 flex-wrap">
        {visibleFilters.map(f => (
          <FilterDropdown
            key={f.key}
            label={f.label}
            options={f.options}
            selected={f.selected}
            onChange={f.onChange}
            multi={f.multi}
            searchable={f.searchable}
          />
        ))}
        {hasOverflow && (
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors shrink-0 ${
              showMore || hasActiveHidden
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                : 'border-white/10 bg-white/5 text-gray-400 hover:text-gray-300 hover:border-white/20'
            }`}
          >
            <MoreHorizontal className="w-3 h-3" />
            <span>更多{hasActiveHidden ? ' ·' : ''}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* 展开的溢出筛选 */}
      {hasOverflow && showMore && (
        <div className="flex items-center gap-2 flex-wrap">
          {hiddenFilters.map(f => (
            <FilterDropdown
              key={f.key}
              label={f.label}
              options={f.options}
              selected={f.selected}
              onChange={f.onChange}
              multi={f.multi}
              searchable={f.searchable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== 主组件：ImportDialog ====================

interface ImportDialogProps {
  spaceId: string;
  existingSourceIds: string[];
  onClose: () => void;
  onImported: () => void;
}

const PAGE_SIZE = 50;

const SOURCE_OPTIONS: FilterOption[] = [
  { value: 'feed', label: 'Feed 订阅' },
  { value: 'library', label: '稍后读' },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'inbox', label: '收件箱' },
  { value: 'later', label: '稍后阅读' },
  { value: 'archive', label: '已归档' },
  { value: 'unseen', label: '未读' },
  { value: 'seen', label: '已读' },
];

const MEDIA_OPTIONS: FilterOption[] = [
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'podcast', label: '播客' },
];

export function ImportDialog({ spaceId, existingSourceIds, onClose, onImported }: ImportDialogProps) {
  // 状态
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const hasLoadedRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // 搜索
  const [searchText, setSearchText] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 筛选
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterMedia, setFilterMedia] = useState<string[]>([]);
  const [filterFeedId, setFilterFeedId] = useState<string[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterLanguage, setFilterLanguage] = useState<string[]>([]);
  const [filterDomain, setFilterDomain] = useState<string[]>([]);

  // 筛选选项数据
  const [filterOptions, setFilterOptions] = useState<ResearchFilterOptions | null>(null);

  // 排序
  const sortBy = 'saved_at';
  const sortOrder = 'desc';

  // 加载筛选选项
  useEffect(() => {
    window.electronAPI.researchFilterOptions().then(setFilterOptions).catch(console.error);
  }, []);

  // 构建查询参数
  const buildQueryParams = useCallback((pageNum: number, searchOverride?: string): ResearchArticleQueryParams => {
    const params: ResearchArticleQueryParams = {
      page: pageNum,
      pageSize: PAGE_SIZE,
      sortBy,
      sortOrder,
      excludeIds: existingSourceIds.length > 0 ? existingSourceIds : undefined,
    };

    const s = (searchOverride ?? searchText).trim();
    if (s) params.search = s;
    if (filterSource.length === 1) params.source = filterSource[0] as ArticleSource;
    if (filterStatus.length > 0) params.readStatus = filterStatus as ReadStatus[];
    if (filterMedia.length > 0) params.mediaType = filterMedia as MediaType[];
    if (filterFeedId.length === 1) params.feedId = filterFeedId[0];
    if (filterTagIds.length > 0) params.tagIds = filterTagIds;
    if (filterLanguage.length === 1) params.language = filterLanguage[0];
    if (filterDomain.length === 1) params.domain = filterDomain[0];

    return params;
  }, [searchText, filterSource, filterStatus, filterMedia, filterFeedId, filterTagIds, filterLanguage, filterDomain, existingSourceIds, sortBy, sortOrder]);

  // 执行查询
  const fetchArticles = useCallback(async (pageNum: number, searchOverride?: string) => {
    // 首次加载用全屏 loading，后续切页/筛选用轻量 fetching（保留旧列表）
    if (!hasLoadedRef.current) setLoading(true);
    setFetching(true);
    try {
      const params = buildQueryParams(pageNum, searchOverride);
      const result: ResearchArticleQueryResult = await window.electronAPI.researchArticleQuery(params);
      setArticles(result.articles);
      setTotal(result.total);
      setPage(result.page);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to query articles:', err);
      setArticles([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [buildQueryParams]);

  // 初始加载
  useEffect(() => {
    fetchArticles(1);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 筛选条件变化时重新查询（重置到第1页）
  useEffect(() => {
    fetchArticles(1);
  }, [filterSource, filterStatus, filterMedia, filterFeedId, filterTagIds, filterLanguage, filterDomain]); // eslint-disable-line react-hooks/exhaustive-deps

  // 搜索防抖
  const handleSearchChange = (value: string) => {
    setSearchText(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchArticles(1, value);
    }, 300);
  };

  // 翻页
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const handlePrevPage = () => { if (page > 1) fetchArticles(page - 1); };
  const handleNextPage = () => { if (page < totalPages) fetchArticles(page + 1); };

  // 选择
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCurrentPage = () => {
    const currentPageIds = articles.map(a => a.id);
    const allSelected = currentPageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        currentPageIds.forEach(id => next.delete(id));
      } else {
        currentPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 导入
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

  // 活跃筛选chips
  const activeFilters: Array<{ label: string; onRemove: () => void }> = [];
  if (filterSource.length > 0) {
    filterSource.forEach(v => {
      const opt = SOURCE_OPTIONS.find(o => o.value === v);
      activeFilters.push({ label: `来源: ${opt?.label ?? v}`, onRemove: () => setFilterSource(filterSource.filter(x => x !== v)) });
    });
  }
  if (filterStatus.length > 0) {
    filterStatus.forEach(v => {
      const opt = STATUS_OPTIONS.find(o => o.value === v);
      activeFilters.push({ label: `状态: ${opt?.label ?? v}`, onRemove: () => setFilterStatus(filterStatus.filter(x => x !== v)) });
    });
  }
  if (filterMedia.length > 0) {
    filterMedia.forEach(v => {
      const opt = MEDIA_OPTIONS.find(o => o.value === v);
      activeFilters.push({ label: `类型: ${opt?.label ?? v}`, onRemove: () => setFilterMedia(filterMedia.filter(x => x !== v)) });
    });
  }
  if (filterFeedId.length > 0) {
    filterFeedId.forEach(v => {
      const feed = filterOptions?.feeds.find(f => f.id === v);
      activeFilters.push({ label: `Feed: ${feed?.title ?? '未知'}`, onRemove: () => setFilterFeedId(filterFeedId.filter(x => x !== v)) });
    });
  }
  if (filterTagIds.length > 0) {
    filterTagIds.forEach(v => {
      const tag = filterOptions?.tags.find(t => t.id === v);
      activeFilters.push({ label: `标签: ${tag?.name ?? '未知'}`, onRemove: () => setFilterTagIds(filterTagIds.filter(x => x !== v)) });
    });
  }
  if (filterLanguage.length > 0) {
    filterLanguage.forEach(v => {
      activeFilters.push({ label: `语言: ${v}`, onRemove: () => setFilterLanguage(filterLanguage.filter(x => x !== v)) });
    });
  }
  if (filterDomain.length > 0) {
    filterDomain.forEach(v => {
      activeFilters.push({ label: `域名: ${v}`, onRemove: () => setFilterDomain(filterDomain.filter(x => x !== v)) });
    });
  }

  const allCurrentPageSelected = articles.length > 0 && articles.every(a => selectedIds.has(a.id));

  // 筛选项定义列表（按优先级排列，放不下的会被收入"更多"）
  const feedOptions: FilterOption[] = useMemo(() =>
    (filterOptions?.feeds ?? []).map(f => ({ value: f.id, label: f.title ?? f.id })),
    [filterOptions?.feeds],
  );
  const tagOptions: FilterOption[] = useMemo(() =>
    (filterOptions?.tags ?? []).map(t => ({ value: t.id, label: t.name })),
    [filterOptions?.tags],
  );
  const languageOptions: FilterOption[] = useMemo(() =>
    (filterOptions?.languages ?? []).map(l => ({ value: l, label: l })),
    [filterOptions?.languages],
  );
  const domainOptions: FilterOption[] = useMemo(() =>
    (filterOptions?.domains ?? []).map(d => ({ value: d, label: d })),
    [filterOptions?.domains],
  );

  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'source', label: '来源', options: SOURCE_OPTIONS, selected: filterSource, onChange: setFilterSource },
    { key: 'status', label: '状态', options: STATUS_OPTIONS, selected: filterStatus, onChange: setFilterStatus, multi: true },
    { key: 'media', label: '媒体', options: MEDIA_OPTIONS, selected: filterMedia, onChange: setFilterMedia, multi: true },
    { key: 'tag', label: '标签', options: tagOptions, selected: filterTagIds, onChange: setFilterTagIds, multi: true, searchable: true },
    { key: 'feed', label: 'Feed 源', options: feedOptions, selected: filterFeedId, onChange: setFilterFeedId, searchable: true },
    { key: 'language', label: '语言', options: languageOptions, selected: filterLanguage, onChange: setFilterLanguage, searchable: true },
    { key: 'domain', label: '域名', options: domainOptions, selected: filterDomain, onChange: setFilterDomain, searchable: true },
  ], [filterSource, filterStatus, filterMedia, filterTagIds, filterFeedId, filterLanguage, filterDomain, tagOptions, feedOptions, languageOptions, domainOptions]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] rounded-xl border border-white/10 w-[640px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部：搜索 + 筛选 */}
        <div className="p-4 border-b border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-gray-200">导入文章</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">{'\u2715'}</button>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={searchText}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="搜索文章标题、作者、内容..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
          </div>

          {/* 自适应筛选栏 */}
          <OverflowFilterBar filters={filterDefs} />

          {/* 已选筛选条件 chips */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeFilters.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-500/10 text-blue-300 rounded-md border border-blue-500/20"
                >
                  {f.label}
                  <button onClick={f.onRemove} className="hover:text-blue-100">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  setFilterSource([]);
                  setFilterStatus([]);
                  setFilterMedia([]);
                  setFilterFeedId([]);
                  setFilterTagIds([]);
                  setFilterLanguage([]);
                  setFilterDomain([]);
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                清除全部
              </button>
            </div>
          )}
        </div>

        {/* 列表头部 */}
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
          <button
            onClick={toggleAllCurrentPage}
            className="text-xs text-blue-400 hover:text-blue-300"
            disabled={articles.length === 0}
          >
            {allCurrentPageSelected ? '取消本页全选' : '全选本页'}
          </button>
          <span className="text-xs text-gray-500">
            共 {total} 篇 · 第 {page}/{totalPages} 页
          </span>
        </div>

        {/* 文章列表 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="ml-2 text-sm text-gray-500">加载中...</span>
            </div>
          ) : articles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">没有可导入的文章</p>
          ) : (
            articles.map(article => (
              <div
                key={article.id}
                onClick={() => toggleSelect(article.id)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-white/[0.03] ${
                  selectedIds.has(article.id) ? 'bg-blue-500/10' : 'hover:bg-white/5'
                } ${fetching ? 'opacity-60 pointer-events-none' : ''}`}
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-600 truncate max-w-[200px]">
                      {article.feedTitle || article.domain || ''}
                    </span>
                    {article.publishedAt && (
                      <span className="text-xs text-gray-600">
                        {new Date(article.publishedAt).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                    {article.mediaType && article.mediaType !== 'article' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">
                        {article.mediaType === 'video' ? '视频' : '播客'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-white/5 flex items-center justify-center gap-3">
            <button
              onClick={handlePrevPage}
              disabled={page <= 1}
              className={`p-1 rounded ${page <= 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={page >= totalPages}
              className={`p-1 rounded ${page >= totalPages ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

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
