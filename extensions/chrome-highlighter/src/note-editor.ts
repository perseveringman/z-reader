/**
 * 笔记编辑器模块
 * 提供富文本笔记编辑功能，支持格式化、快捷键等
 */

const EDITOR_ID = 'zr-note-editor';
const EDITOR_BACKDROP_ID = 'zr-note-editor-backdrop';

export interface NoteEditorOptions {
  initialNote?: string;
  selectedText?: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

/**
 * 显示笔记编辑器
 */
export function showNoteEditor(options: NoteEditorOptions): void {
  hideNoteEditor();

  // 创建背景遮罩
  const backdrop = document.createElement('div');
  backdrop.id = EDITOR_BACKDROP_ID;
  backdrop.className = 'zr-editor-backdrop';
  
  // 创建编辑器容器
  const container = document.createElement('div');
  container.id = EDITOR_ID;
  container.className = 'zr-note-editor';

  // 创建编辑器头部
  const header = document.createElement('div');
  header.className = 'zr-editor-header';
  
  const title = document.createElement('h3');
  title.textContent = '添加笔记';
  header.appendChild(title);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-editor-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = '关闭 (Esc)';
  closeBtn.addEventListener('click', () => {
    options.onCancel();
    hideNoteEditor();
  });
  header.appendChild(closeBtn);
  
  container.appendChild(header);

  // 如果有选中的文本，显示引用区域
  if (options.selectedText) {
    const quote = document.createElement('div');
    quote.className = 'zr-editor-quote';
    quote.textContent = `"${options.selectedText.slice(0, 150)}${options.selectedText.length > 150 ? '...' : ''}"`;
    container.appendChild(quote);
  }

  // 创建工具栏
  const toolbar = createToolbar();
  container.appendChild(toolbar);

  // 创建编辑区域
  const editorArea = document.createElement('div');
  editorArea.className = 'zr-editor-content';
  editorArea.contentEditable = 'true';
  editorArea.setAttribute('placeholder', '在此输入笔记内容...');
  
  if (options.initialNote) {
    editorArea.innerHTML = options.initialNote;
  }
  
  container.appendChild(editorArea);

  // 创建底部操作栏
  const footer = document.createElement('div');
  footer.className = 'zr-editor-footer';
  
  const hint = document.createElement('span');
  hint.className = 'zr-editor-hint';
  hint.textContent = '支持快捷键: Ctrl+B 加粗, Ctrl+I 斜体, Ctrl+Enter 保存';
  footer.appendChild(hint);
  
  const actions = document.createElement('div');
  actions.className = 'zr-editor-actions';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'zr-editor-btn zr-editor-btn-secondary';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => {
    options.onCancel();
    hideNoteEditor();
  });
  actions.appendChild(cancelBtn);
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'zr-editor-btn zr-editor-btn-primary';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', () => {
    const note = editorArea.innerHTML.trim();
    if (note) {
      options.onSave(note);
      hideNoteEditor();
    }
  });
  actions.appendChild(saveBtn);
  
  footer.appendChild(actions);
  container.appendChild(footer);

  // 添加到页面
  document.body.appendChild(backdrop);
  document.body.appendChild(container);

  // 聚焦编辑器
  editorArea.focus();

  // 绑定快捷键
  editorArea.addEventListener('keydown', (e) => {
    handleEditorKeydown(e, editorArea, options);
  });

  // 点击背景关闭
  backdrop.addEventListener('click', () => {
    options.onCancel();
    hideNoteEditor();
  });
}

/**
 * 创建工具栏
 */
function createToolbar(): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'zr-editor-toolbar';

  const tools = [
    { icon: '𝐁', title: '加粗 (Ctrl+B)', command: 'bold' },
    { icon: '𝐼', title: '斜体 (Ctrl+I)', command: 'italic' },
    { icon: 'U̲', title: '下划线 (Ctrl+U)', command: 'underline' },
    { type: 'divider' },
    { icon: '≡', title: '无序列表', command: 'insertUnorderedList' },
    { icon: '⋮', title: '有序列表', command: 'insertOrderedList' },
    { type: 'divider' },
    { icon: '🔗', title: '插入链接', command: 'createLink' },
    { icon: '❌', title: '清除格式', command: 'removeFormat' },
  ];

  tools.forEach((tool) => {
    if (tool.type === 'divider') {
      const divider = document.createElement('span');
      divider.className = 'zr-toolbar-divider';
      toolbar.appendChild(divider);
    } else {
      const btn = document.createElement('button');
      btn.className = 'zr-toolbar-btn';
      btn.innerHTML = tool.icon!;
      btn.title = tool.title!;
      btn.type = 'button';
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        executeCommand(tool.command!);
      });
      
      toolbar.appendChild(btn);
    }
  });

  return toolbar;
}

/**
 * 执行编辑器命令
 */
function executeCommand(command: string): void {
  if (command === 'createLink') {
    const url = prompt('请输入链接地址:');
    if (url) {
      document.execCommand('createLink', false, url);
    }
  } else {
    document.execCommand(command, false);
  }
}

/**
 * 处理编辑器快捷键
 */
function handleEditorKeydown(
  e: KeyboardEvent,
  editorArea: HTMLElement,
  options: NoteEditorOptions
): void {
  // Ctrl+Enter 或 Cmd+Enter 保存
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    const note = editorArea.innerHTML.trim();
    if (note) {
      options.onSave(note);
      hideNoteEditor();
    }
    return;
  }

  // Esc 取消
  if (e.key === 'Escape') {
    e.preventDefault();
    options.onCancel();
    hideNoteEditor();
    return;
  }

  // 其他快捷键由浏览器的 contentEditable 默认处理
  // Ctrl+B, Ctrl+I, Ctrl+U 等会自动工作
}

/**
 * 隐藏笔记编辑器
 */
export function hideNoteEditor(): void {
  const editor = document.getElementById(EDITOR_ID);
  const backdrop = document.getElementById(EDITOR_BACKDROP_ID);
  
  if (editor) {
    editor.remove();
  }
  
  if (backdrop) {
    backdrop.remove();
  }
}

/**
 * 将 HTML 转换为纯文本（用于后端存储）
 */
export function htmlToPlainText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

/**
 * 将纯文本转换为 HTML（保持换行）
 */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}