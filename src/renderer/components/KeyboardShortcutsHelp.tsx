import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '导航',
    items: [
      { keys: ['j', '↓'], description: '下一篇文章 / 下一段落' },
      { keys: ['k', '↑'], description: '上一篇文章 / 上一段落' },
      { keys: ['Enter'], description: '打开阅读视图' },
      { keys: ['Esc'], description: '返回 / 关闭' },
      { keys: ['O'], description: '在浏览器中打开原文' },
    ],
  },
  {
    title: '文章操作',
    items: [
      { keys: ['E'], description: '归档' },
      { keys: ['L'], description: '稍后阅读' },
      { keys: ['D'], description: '删除' },
      { keys: ['S', 'F'], description: '收藏 / 取消收藏' },
      { keys: ['B'], description: '保存到 Library (Feed 视图)' },
      { keys: ['Z'], description: '撤销' },
      { keys: ['⇧B'], description: '进入批量选择模式' },
      { keys: ['⇧C'], description: '复制原文链接' },
    ],
  },
  {
    title: '阅读视图',
    items: [
      { keys: ['H'], description: '高亮当前段落' },
      { keys: ['N'], description: '为当前高亮添加笔记' },
      { keys: ['T'], description: '为当前高亮添加标签' },
      { keys: ['⇧N'], description: '打开 Notebook 面板' },
      { keys: ['⇧T'], description: '为文档添加标签' },
      { keys: ['⇧R'], description: '重置阅读进度' },
      { keys: ['`'], description: '向前切换侧边栏标签' },
      { keys: ['⇧`'], description: '向后切换侧边栏标签' },
    ],
  },
  {
    title: '排版设置 (阅读视图)',
    items: [
      { keys: ['⌃⇧F'], description: '切换字体' },
      { keys: ['⇧+'], description: '增大字号' },
      { keys: ['⇧-'], description: '减小字号' },
      { keys: ['⇧"'], description: '增大行距' },
      { keys: ['⇧:'], description: '减小行距' },
    ],
  },
  {
    title: '视图切换',
    items: [
      { keys: ['1'], description: 'Inbox / Unseen' },
      { keys: ['2'], description: 'Later / Seen' },
      { keys: ['3'], description: 'Archive' },
    ],
  },
  {
    title: '面板',
    items: [
      { keys: ['['], description: '收折/展开左侧面板' },
      { keys: [']'], description: '收折/展开右侧面板' },
    ],
  },
  {
    title: '全局',
    items: [
      { keys: ['⌘K'], description: '命令面板' },
      { keys: ['/'], description: '搜索' },
      { keys: ['?'], description: '快捷键帮助' },
      { keys: ['⇧A'], description: '添加 RSS 订阅' },
      { keys: ['⇧F'], description: '搜索/过滤文档' },
      { keys: ['⌘⇧S'], description: '保存 URL 到 Library' },
    ],
  },
];

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={panelRef}
        className="w-[480px] max-h-[70vh] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h2 className="text-[14px] font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1 p-5 space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-[13px] text-gray-300">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] text-gray-600">/</span>}
                          <kbd className="px-1.5 py-0.5 text-[11px] font-mono text-gray-300 bg-white/5 border border-white/10 rounded">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
