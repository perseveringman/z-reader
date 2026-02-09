import { useState, useEffect, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import type { Tag } from '../../shared/types';

interface TagPickerProps {
  articleId: string;
  onTagsChange?: () => void;
}

export function TagPicker({ articleId, onTagsChange }: TagPickerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [articleTags, setArticleTags] = useState<Tag[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadTags = async () => {
    const [tags, aTags] = await Promise.all([
      window.electronAPI.tagList(),
      window.electronAPI.articleTagsForArticle(articleId),
    ]);
    setAllTags(tags);
    setArticleTags(aTags);
  };

  useEffect(() => {
    loadTags();
  }, [articleId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredTags = allTags.filter(
    (t) =>
      !articleTags.some((at) => at.id === t.id) &&
      t.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleAddTag = async (tagId: string) => {
    await window.electronAPI.articleTagAdd(articleId, tagId);
    await loadTags();
    setInputValue('');
    onTagsChange?.();
  };

  const handleRemoveTag = async (tagId: string) => {
    await window.electronAPI.articleTagRemove(articleId, tagId);
    await loadTags();
    onTagsChange?.();
  };

  const handleCreateAndAdd = async () => {
    const name = inputValue.trim();
    if (!name) return;
    const tag = await window.electronAPI.tagCreate(name);
    await window.electronAPI.articleTagAdd(articleId, tag.id);
    await loadTags();
    setInputValue('');
    onTagsChange?.();
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
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 已关联标签 */}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {articleTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-blue-500/15 text-blue-400 border border-blue-500/20"
          >
            {tag.name}
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="hover:text-white transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          <Plus size={10} />
          <span>Add tag</span>
        </button>
      </div>

      {/* 下拉选择器 */}
      {isOpen && (
        <div className="absolute z-50 left-0 top-full mt-1 w-[200px] bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create tag..."
            className="w-full px-3 py-2 bg-transparent text-[12px] text-white placeholder-gray-500 border-b border-white/10 outline-none"
          />
          <div className="max-h-[160px] overflow-y-auto py-1">
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddTag(tag.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-gray-300 hover:bg-white/5 transition-colors text-left"
              >
                <span>{tag.name}</span>
                {tag.articleCount !== undefined && (
                  <span className="text-[10px] text-gray-600">{tag.articleCount}</span>
                )}
              </button>
            ))}
            {filteredTags.length === 0 && inputValue.trim() && (
              <button
                onClick={handleCreateAndAdd}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-blue-400 hover:bg-white/5 transition-colors text-left"
              >
                <Plus size={12} />
                <span>Create "{inputValue.trim()}"</span>
              </button>
            )}
            {filteredTags.length === 0 && !inputValue.trim() && (
              <p className="px-3 py-2 text-[11px] text-gray-600">No tags available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
