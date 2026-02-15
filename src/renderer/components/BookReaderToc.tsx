export interface TocItem {
  id: string;
  label: string;
  href: string;
  level: number;
  children?: TocItem[];
}

interface BookReaderTocProps {
  items: TocItem[];
  onNavigate: (item: TocItem) => void;
  loading?: boolean;
}

export function BookReaderToc({ items, onNavigate, loading }: BookReaderTocProps) {
  function renderItems(list: TocItem[], depth = 0) {
    return list.map((item) => (
      <li key={item.id}>
        <button
          onClick={() => onNavigate(item)}
          className="text-[13px] text-gray-400 hover:text-white hover:bg-white/5 rounded-md px-3 py-1.5 text-left truncate w-full transition-colors cursor-pointer"
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          {item.label}
        </button>
        {item.children && item.children.length > 0 && (
          <ul className="space-y-0.5">{renderItems(item.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {items.length > 0 ? (
        <ul className="space-y-0.5">
          {renderItems(items)}
        </ul>
      ) : (
        <p className="px-3 py-4 text-[13px] text-gray-500">
          {loading ? '加载中…' : '此书籍没有目录'}
        </p>
      )}
    </div>
  );
}
