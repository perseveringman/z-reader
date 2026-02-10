import { useState, useEffect, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import type { Tag } from '../../shared/types';

interface HighlightTagPickerProps {
  highlightId: string;
  currentTags: Tag[];
  onTagAdd: (highlightId: string, tagId: string) => void;
  onTagRemove: (highlightId: string, tagId: string) => void;
  onTagCreate: (highlightId: string, name: string) => void;
  onClose: () => void;
}

export function HighlightTagPicker({
  highlightId,
  currentTags,
  onTagAdd,
  onTagRemove,
  onTagCreate,
  onClose,
}: HighlightTagPickerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.tagList().then(setAllTags);
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const filteredTags = allTags.filter(
    (t) =>
      !currentTags.some((ct) => ct.id === t.id) &&
      t.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleAddTag = (tagId: string) => {
    onTagAdd(highlightId, tagId);
    setInputValue('');
  };

  const handleCreateAndAdd = () => {
    const name = inputValue.trim();
    if (!name) return;
    onTagCreate(highlightId, name);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags.length > 0) {
        handleAddTag(filteredTags[0].id);
      } else if (inputValue.trim()) {
        handleCreateAndAdd();
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className="annotation-tag-picker"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 已有标签 */}
      {currentTags.length > 0 && (
        <div className="annotation-tag-picker-current">
          {currentTags.map((tag) => (
            <span key={tag.id} className="annotation-tag-pill">
              {tag.name}
              <button
                onClick={() => onTagRemove(highlightId, tag.id)}
                className="annotation-tag-remove"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 搜索输入 */}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="搜索或创建标签…"
        className="annotation-tag-picker-input"
      />

      {/* 下拉列表 */}
      <div className="annotation-tag-picker-list">
        {filteredTags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => handleAddTag(tag.id)}
            className="annotation-tag-picker-option"
          >
            {tag.name}
          </button>
        ))}
        {filteredTags.length === 0 && inputValue.trim() && (
          <button
            onClick={handleCreateAndAdd}
            className="annotation-tag-picker-create"
          >
            <Plus size={12} />
            <span>创建 "{inputValue.trim()}"</span>
          </button>
        )}
        {filteredTags.length === 0 && !inputValue.trim() && (
          <p className="annotation-tag-picker-empty">暂无可用标签</p>
        )}
      </div>
    </div>
  );
}
