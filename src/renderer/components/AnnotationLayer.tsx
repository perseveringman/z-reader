import { useState, useEffect, useRef, useCallback } from 'react';
import type { Highlight, Tag } from '../../shared/types';
import { HighlightTagPicker } from './HighlightTagPicker';

// ==================== 类型定义 ====================

export interface EditingAnnotation {
  highlightId: string;
  type: 'note' | 'tag';
}

interface AnnotationItem {
  highlightId: string;
  top: number;
  note: string | null;
  tags: Tag[];
}

interface AnnotationLayerProps {
  highlights: Highlight[];
  highlightTagsMap: Record<string, Tag[]>;
  editingAnnotation: EditingAnnotation | null;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onSaveNote: (highlightId: string, note: string) => void;
  onCancelEdit: () => void;
  onTagAdd: (highlightId: string, tagId: string) => void;
  onTagRemove: (highlightId: string, tagId: string) => void;
  onTagCreate: (highlightId: string, name: string) => void;
  onStartEditNote: (highlightId: string) => void;
  onStartEditTag: (highlightId: string) => void;
}

// ==================== 位置计算 ====================

function getMarkTop(contentEl: HTMLDivElement, highlightId: string): number | null {
  const mark = contentEl.querySelector(`mark[data-highlight-id="${highlightId}"]`);
  if (!mark) return null;
  // 使用 offsetTop 相对于 offsetParent（scrollable 容器内的 relative 父元素）
  const el = mark as HTMLElement;
  // 递归计算相对于 contentEl 的 top
  let top = 0;
  let current: HTMLElement | null = el;
  while (current && current !== contentEl) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

function computeAnnotationPositions(
  highlights: Highlight[],
  highlightTagsMap: Record<string, Tag[]>,
  contentEl: HTMLDivElement | null,
): AnnotationItem[] {
  if (!contentEl) return [];

  const items: AnnotationItem[] = [];

  for (const hl of highlights) {
    const hasNote = hl.note && hl.note.trim().length > 0;
    const hasTags = (highlightTagsMap[hl.id] || []).length > 0;

    if (!hasNote && !hasTags) continue;

    const top = getMarkTop(contentEl, hl.id);
    if (top === null) continue;

    items.push({
      highlightId: hl.id,
      top,
      note: hl.note,
      tags: highlightTagsMap[hl.id] || [],
    });
  }

  // 按 top 排序，避免重叠
  items.sort((a, b) => a.top - b.top);

  // 防重叠：最小间距 40px
  const MIN_GAP = 40;
  for (let i = 1; i < items.length; i++) {
    if (items[i].top - items[i - 1].top < MIN_GAP) {
      items[i].top = items[i - 1].top + MIN_GAP;
    }
  }

  return items;
}

// ==================== NoteEditor 组件 ====================

function NoteEditor({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 自动聚焦
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave(value.trim());
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="annotation-editor" onMouseDown={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="添加笔记…"
        className="annotation-editor-textarea"
        rows={3}
      />
      <div className="annotation-editor-actions">
        <button onClick={onCancel} className="annotation-editor-btn annotation-editor-btn-cancel">
          取消
        </button>
        <button
          onClick={() => onSave(value.trim())}
          className="annotation-editor-btn annotation-editor-btn-save"
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ==================== NoteDisplay 组件 ====================

function NoteDisplay({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div
      className="annotation-note-display"
      onClick={onClick}
      title="点击编辑笔记"
    >
      {text}
    </div>
  );
}

// ==================== TagDisplay 组件 ====================

function TagDisplay({
  tags,
  onRemove,
  onClick,
}: {
  tags: Tag[];
  onRemove: (tagId: string) => void;
  onClick: () => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="annotation-tags-display" onClick={onClick}>
      {tags.map((tag) => (
        <span key={tag.id} className="annotation-tag-pill">
          {tag.name}
          <button
            className="annotation-tag-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(tag.id);
            }}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}

// ==================== AnnotationLayer 主组件 ====================

export function AnnotationLayer({
  highlights,
  highlightTagsMap,
  editingAnnotation,
  contentRef,
  onSaveNote,
  onCancelEdit,
  onTagAdd,
  onTagRemove,
  onTagCreate,
  onStartEditNote,
  onStartEditTag,
}: AnnotationLayerProps) {
  const [displayItems, setDisplayItems] = useState<AnnotationItem[]>([]);
  const layerRef = useRef<HTMLDivElement>(null);

  // 计算已保存注释的位置
  const recalcPositions = useCallback(() => {
    setDisplayItems(computeAnnotationPositions(highlights, highlightTagsMap, contentRef.current));
  }, [highlights, highlightTagsMap, contentRef]);

  useEffect(() => {
    recalcPositions();
  }, [recalcPositions]);

  // DOM 变更时重新计算（高亮 mark 元素可能延迟出现）
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new MutationObserver(() => {
      recalcPositions();
    });
    observer.observe(contentRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [contentRef, recalcPositions]);

  // 正在编辑的注释位置
  const editingTop = (() => {
    if (!editingAnnotation || !contentRef.current) return null;
    return getMarkTop(contentRef.current, editingAnnotation.highlightId);
  })();

  // 找到编辑中的高亮的已有笔记
  const editingHighlight = editingAnnotation
    ? highlights.find((h) => h.id === editingAnnotation.highlightId)
    : null;

  return (
    <div
      ref={layerRef}
      className="annotation-layer"
    >
      {/* 已保存的注释（常驻显示） */}
      {displayItems.map((item) => {
        // 如果正在编辑这个高亮，不显示静态的
        const isEditing = editingAnnotation?.highlightId === item.highlightId;
        if (isEditing) return null;

        return (
          <div
            key={item.highlightId}
            className="annotation-item"
            style={{ top: item.top }}
          >
            {item.note && (
              <NoteDisplay
                text={item.note}
                onClick={() => onStartEditNote(item.highlightId)}
              />
            )}
            {item.tags.length > 0 && (
              <TagDisplay
                tags={item.tags}
                onRemove={(tagId) => onTagRemove(item.highlightId, tagId)}
                onClick={() => onStartEditTag(item.highlightId)}
              />
            )}
          </div>
        );
      })}

      {/* 正在编辑的注释 */}
      {editingAnnotation && editingTop !== null && (
        <div
          className="annotation-item annotation-item-editing"
          style={{ top: editingTop }}
        >
          {editingAnnotation.type === 'note' && (
            <NoteEditor
              initialValue={editingHighlight?.note ?? ''}
              onSave={(note) => onSaveNote(editingAnnotation.highlightId, note)}
              onCancel={onCancelEdit}
            />
          )}
          {editingAnnotation.type === 'tag' && (
            <HighlightTagPicker
              highlightId={editingAnnotation.highlightId}
              currentTags={highlightTagsMap[editingAnnotation.highlightId] || []}
              onTagAdd={onTagAdd}
              onTagRemove={onTagRemove}
              onTagCreate={onTagCreate}
              onClose={onCancelEdit}
            />
          )}
        </div>
      )}
    </div>
  );
}
