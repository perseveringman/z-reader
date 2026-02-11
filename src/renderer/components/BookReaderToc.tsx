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
  function renderItems(list: TocItem[], depth: number = 0) {
    return list.map((item) => (
      <li key={item.id}>
        <button
          onClick={() => onNavigate(item)}
          className="text-[12px] text-gray-400 hover:text-white text-left truncate w-full transition-colors py-0.5"
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {item.label}
        </button>
        {item.children && item.children.length > 0 && (
          <ul>{renderItems(item.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {items.length > 0 ? (
        <ul className="space-y-0.5">
          {renderItems(items)}
        </ul>
      ) : (
        <p className="text-[12px] text-gray-500">
          {loading ? '加载中…' : '此书籍没有目录'}
        </p>
      )}
    </div>
  );
}
