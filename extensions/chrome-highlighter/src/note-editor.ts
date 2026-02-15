import { HIGHLIGHT_COLORS, type HighlightColor, type Tag } from './types';
import { getAllTags, createTag } from './api';

const CONTAINER_ID = 'zr-note-editor-container';

export interface NoteEditorOptions {
  highlightId?: string;
  initialNote?: string;
  selectedText?: string;
  initialColor?: HighlightColor;
  initialTags?: Tag[];
  onSave: (note: string, color: HighlightColor, tagIds: string[]) => void;
  onCancel: () => void;
}

const ICONS = {
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
};

const CSS_CONTENT = `
  :host {
    all: initial;
    --zr-bg-base: #141414;
    --zr-bg-card: #1a1a1a;
    --zr-bg-hover: rgba(255, 255, 255, 0.08);
    --zr-border: rgba(255, 255, 255, 0.1);
    --zr-text-primary: #ffffff;
    --zr-text-secondary: #9ca3af;
    --zr-text-muted: #6b7280;
    --zr-blue: #3b82f6;
    --zr-blue-hover: #2563eb;
    --zr-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    --zr-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  }

  .zr-editor-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    z-index: 999998;
    animation: zr-fade-in 0.2s ease;
  }

  .zr-note-editor {
    position: fixed;
    top: 20px;
    right: 20px;
    bottom: 20px;
    width: 380px;
    max-width: calc(100vw - 40px);
    background: var(--zr-bg-base);
    border: 1px solid var(--zr-border);
    border-radius: var(--zr-radius);
    box-shadow: var(--zr-shadow);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: zr-slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    color: var(--zr-text-primary);
  }

  @keyframes zr-slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes zr-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .zr-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--zr-border);
  }

  .zr-editor-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: white;
  }

  .zr-editor-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--zr-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .zr-editor-close:hover {
    background: var(--zr-bg-hover);
    color: var(--zr-text-primary);
  }

  .zr-editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .zr-editor-quote-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zr-editor-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--zr-text-muted);
  }

  .zr-editor-quote {
    padding: 12px 16px;
    background: var(--zr-bg-card);
    border-left: 3px solid var(--zr-blue);
    border-radius: 4px;
    color: var(--zr-text-secondary);
    font-size: 13px;
    line-height: 1.6;
    font-style: italic;
    max-height: 120px;
    overflow-y: auto;
  }

  .zr-editor-colors {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .zr-color-option {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000;
  }

  .zr-color-option:hover { transform: scale(1.1); }
  .zr-color-option.active {
    border-color: white;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  .zr-editor-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .zr-tag-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--zr-bg-card);
    border: 1px solid var(--zr-border);
    border-radius: 100px;
    color: var(--zr-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .zr-tag-item:hover {
    background: var(--zr-bg-hover);
    border-color: var(--zr-text-muted);
    color: var(--zr-text-primary);
  }

  .zr-tag-item.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: var(--zr-blue);
    color: var(--zr-blue);
  }

  .zr-tag-add {
    color: var(--zr-blue);
    border-style: dashed;
  }

  .zr-editor-textarea-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  .zr-editor-textarea {
    width: 100%;
    flex: 1;
    background: transparent;
    border: none;
    color: var(--zr-text-primary);
    font-size: 14px;
    line-height: 1.6;
    resize: none;
    outline: none;
    padding: 0;
    min-height: 150px;
    box-sizing: border-box;
  }

  .zr-editor-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--zr-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--zr-bg-card);
  }

  .zr-editor-hint {
    font-size: 11px;
    color: var(--zr-text-muted);
  }

  .zr-editor-actions {
    display: flex;
    gap: 8px;
  }

  .zr-btn {
    height: 32px;
    padding: 0 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    box-sizing: border-box;
  }

  .zr-btn-secondary {
    background: transparent;
    color: var(--zr-text-secondary);
    border: 1px solid var(--zr-border);
  }

  .zr-btn-primary {
    background: var(--zr-blue);
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  .zr-editor-body::-webkit-scrollbar { width: 6px; }
  .zr-editor-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
`;

/**
 * 显示笔记编辑器 (Shadow DOM 版本)
 */
export async function showNoteEditor(options: NoteEditorOptions): Promise<void> {
  hideNoteEditor();

  let selectedColor: HighlightColor = options.initialColor || 'yellow';
  let selectedTagIds: Set<string> = new Set(options.initialTags?.map(t => t.id) || []);
  let allAvailableTags: Tag[] = [];

  try {
    allAvailableTags = await getAllTags();
  } catch (err) {
    console.error('Failed to fetch tags:', err);
  }

  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  const shadow = container.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = CSS_CONTENT;
  shadow.appendChild(style);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'zr-editor-backdrop';
  shadow.appendChild(backdrop);
  
  // Editor
  const editor = document.createElement('div');
  editor.className = 'zr-note-editor';

  // Header
  const header = document.createElement('div');
  header.className = 'zr-editor-header';
  header.innerHTML = `<h3>${options.initialNote ? '编辑笔记' : '添加笔记'}</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-editor-close';
  closeBtn.innerHTML = ICONS.close;
  closeBtn.onclick = () => { options.onCancel(); hideNoteEditor(); };
  header.appendChild(closeBtn);
  editor.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'zr-editor-body';

  // Quote
  if (options.selectedText) {
    const quoteContainer = document.createElement('div');
    quoteContainer.className = 'zr-editor-quote-container';
    quoteContainer.innerHTML = `
      <div class="zr-editor-label">引用原文</div>
      <div class="zr-editor-quote">${options.selectedText}</div>
    `;
    body.appendChild(quoteContainer);
  }

  // Color Picker
  const colorContainer = document.createElement('div');
  colorContainer.className = 'zr-editor-quote-container';
  colorContainer.innerHTML = '<div class="zr-editor-label">高亮颜色</div>';
  const colorsRow = document.createElement('div');
  colorsRow.className = 'zr-editor-colors';
  
  const colorOptions: HighlightColor[] = ['yellow', 'blue', 'green', 'red'];
  const updateColors = () => {
    colorsRow.innerHTML = '';
    colorOptions.forEach(color => {
      const btn = document.createElement('button');
      btn.className = `zr-color-option ${color === selectedColor ? 'active' : ''}`;
      btn.style.backgroundColor = HIGHLIGHT_COLORS[color];
      btn.innerHTML = color === selectedColor ? ICONS.check : '';
      btn.onclick = () => {
        selectedColor = color;
        updateColors();
        const quote = body.querySelector('.zr-editor-quote') as HTMLElement;
        if (quote) quote.style.borderLeftColor = HIGHLIGHT_COLORS[selectedColor];
      };
      colorsRow.appendChild(btn);
    });
  };
  updateColors();
  colorContainer.appendChild(colorsRow);
  body.appendChild(colorContainer);

  // Tags
  const tagsSection = document.createElement('div');
  tagsSection.className = 'zr-editor-quote-container';
  tagsSection.innerHTML = '<div class="zr-editor-label">标签</div>';
  const tagsList = document.createElement('div');
  tagsList.className = 'zr-editor-tags-list';
  
  const renderTags = () => {
    tagsList.innerHTML = '';
    allAvailableTags.forEach(tag => {
      const isSelected = selectedTagIds.has(tag.id);
      const tagBtn = document.createElement('button');
      tagBtn.className = `zr-tag-item ${isSelected ? 'active' : ''}`;
      tagBtn.innerHTML = `${ICONS.tag} <span>${tag.name}</span>`;
      tagBtn.onclick = () => {
        if (isSelected) selectedTagIds.delete(tag.id);
        else selectedTagIds.add(tag.id);
        renderTags();
      };
      tagsList.appendChild(tagBtn);
    });
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'zr-tag-item zr-tag-add';
    addTagBtn.innerHTML = `${ICONS.plus} <span>新建标签</span>`;
    addTagBtn.onclick = async () => {
      const name = prompt('输入新标签名称:');
      if (name?.trim()) {
        const newTag = await createTag(name.trim());
        allAvailableTags.push(newTag);
        selectedTagIds.add(newTag.id);
        renderTags();
      }
    };
    tagsList.appendChild(addTagBtn);
  };
  renderTags();
  tagsSection.appendChild(tagsList);
  body.appendChild(tagsSection);

  // Textarea
  const textareaContainer = document.createElement('div');
  textareaContainer.className = 'zr-editor-textarea-container';
  textareaContainer.innerHTML = '<div class="zr-editor-label">笔记内容</div>';
  const textarea = document.createElement('textarea');
  textarea.className = 'zr-editor-textarea';
  textarea.placeholder = '在此输入您的想法...';
  textarea.value = options.initialNote || '';
  textareaContainer.appendChild(textarea);
  body.appendChild(textareaContainer);
  editor.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'zr-editor-footer';
  footer.innerHTML = '<span class="zr-editor-hint">Ctrl+Enter 保存</span>';
  const actions = document.createElement('div');
  actions.className = 'zr-editor-actions';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'zr-btn zr-btn-secondary';
  cancelBtn.textContent = '取消';
  cancelBtn.onclick = () => { options.onCancel(); hideNoteEditor(); };
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'zr-btn zr-btn-primary';
  saveBtn.textContent = '保存笔记';
  saveBtn.onclick = () => {
    options.onSave(textarea.value.trim(), selectedColor, Array.from(selectedTagIds));
    hideNoteEditor();
  };
  
  actions.append(cancelBtn, saveBtn);
  footer.appendChild(actions);
  editor.appendChild(footer);

  shadow.appendChild(editor);
  document.body.appendChild(container);
  textarea.focus();

  textarea.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      options.onSave(textarea.value.trim(), selectedColor, Array.from(selectedTagIds));
      hideNoteEditor();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      options.onCancel();
      hideNoteEditor();
    }
  };

  backdrop.onclick = () => { options.onCancel(); hideNoteEditor(); };
}

export function hideNoteEditor(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  
  const editor = container.shadowRoot?.querySelector('.zr-note-editor') as HTMLElement;
  const backdrop = container.shadowRoot?.querySelector('.zr-editor-backdrop') as HTMLElement;
  
  if (editor) {
    editor.style.transform = 'translateX(100%)';
    editor.style.opacity = '0';
    editor.style.transition = 'all 0.2s ease-in';
  }
  if (backdrop) {
    backdrop.style.opacity = '0';
    backdrop.style.transition = 'opacity 0.2s';
  }
  setTimeout(() => container.remove(), 200);
}
