/**
 * 设置面板
 * 提供高亮样式自定义和其他用户偏好设置
 */

import { toast } from './toast';

const PANEL_ID = 'zr-settings-panel';
const STORAGE_KEY = 'zr-user-preferences';

export interface UserPreferences {
  // 高亮样式
  highlightOpacity: number; // 0-100
  highlightBorderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  highlightBorderWidth: number; // 0-3
  customColors: {
    yellow: string;
    blue: string;
    green: string;
    red: string;
  };
  
  // 字体样式
  highlightFontWeight: 'normal' | 'bold';
  highlightFontStyle: 'normal' | 'italic';
  highlightTextDecoration: 'none' | 'underline';
  
  // 动画和效果
  enableAnimations: boolean;
  enableSounds: boolean;
  
  // 快捷键
  shortcutsEnabled: boolean;
  
  // 自动保存
  autoSave: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  highlightOpacity: 60,
  highlightBorderStyle: 'none',
  highlightBorderWidth: 0,
  customColors: {
    yellow: '#fef3c7',
    blue: '#dbeafe',
    green: '#d1fae5',
    red: '#fee2e2',
  },
  highlightFontWeight: 'normal',
  highlightFontStyle: 'normal',
  highlightTextDecoration: 'none',
  enableAnimations: true,
  enableSounds: false,
  shortcutsEnabled: true,
  autoSave: true,
};

let currentPreferences: UserPreferences = { ...DEFAULT_PREFERENCES };
let isPanelVisible = false;

/**
 * 初始化设置系统
 */
export function initSettings(): void {
  loadPreferences();
  applyPreferences();
  console.log('[Z-Reader] 设置系统已初始化');
}

/**
 * 显示设置面板
 */
export function showSettingsPanel(): void {
  if (isPanelVisible) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'zr-settings-backdrop';
  backdrop.addEventListener('click', hideSettingsPanel);

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'zr-settings-panel';

  // 头部
  const header = document.createElement('div');
  header.className = 'zr-settings-header';

  const title = document.createElement('h2');
  title.textContent = '⚙️ 设置';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-settings-close';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', hideSettingsPanel);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // 内容
  const content = document.createElement('div');
  content.className = 'zr-settings-content';

  // 高亮样式设置
  content.appendChild(createHighlightStyleSection());

  // 字体样式设置
  content.appendChild(createFontStyleSection());

  // 动画和效果设置
  content.appendChild(createEffectsSection());

  // 其他设置
  content.appendChild(createOtherSection());

  panel.appendChild(content);

  // 底部按钮
  const footer = document.createElement('div');
  footer.className = 'zr-settings-footer';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'zr-settings-btn zr-settings-btn-secondary';
  resetBtn.textContent = '恢复默认';
  resetBtn.addEventListener('click', resetToDefaults);
  footer.appendChild(resetBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'zr-settings-btn zr-settings-btn-primary';
  saveBtn.textContent = '保存设置';
  saveBtn.addEventListener('click', () => {
    savePreferences();
    applyPreferences();
    hideSettingsPanel();
    toast.success('设置已保存');
  });
  footer.appendChild(saveBtn);

  panel.appendChild(footer);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  requestAnimationFrame(() => {
    panel.classList.add('zr-settings-panel-show');
  });

  isPanelVisible = true;
}

/**
 * 隐藏设置面板
 */
export function hideSettingsPanel(): void {
  const panel = document.getElementById(PANEL_ID);
  const backdrop = document.querySelector('.zr-settings-backdrop');

  if (panel) {
    panel.classList.remove('zr-settings-panel-show');
    setTimeout(() => panel.remove(), 300);
  }
  if (backdrop) backdrop.remove();

  isPanelVisible = false;
}

/**
 * 创建高亮样式设置区域
 */
function createHighlightStyleSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'zr-settings-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'zr-settings-section-title';
  sectionTitle.textContent = '🎨 高亮样式';
  section.appendChild(sectionTitle);

  // 透明度滑块
  const opacityGroup = createSliderControl(
    '透明度',
    'highlightOpacity',
    0,
    100,
    currentPreferences.highlightOpacity,
    (value) => {
      currentPreferences.highlightOpacity = value;
      updatePreview();
    }
  );
  section.appendChild(opacityGroup);

  // 边框样式
  const borderStyleGroup = createSelectControl(
    '边框样式',
    'highlightBorderStyle',
    [
      { value: 'none', label: '无边框' },
      { value: 'solid', label: '实线' },
      { value: 'dashed', label: '虚线' },
      { value: 'dotted', label: '点线' },
    ],
    currentPreferences.highlightBorderStyle,
    (value) => {
      currentPreferences.highlightBorderStyle = value as any;
      updatePreview();
    }
  );
  section.appendChild(borderStyleGroup);

  // 边框宽度
  if (currentPreferences.highlightBorderStyle !== 'none') {
    const borderWidthGroup = createSliderControl(
      '边框粗细',
      'highlightBorderWidth',
      0,
      3,
      currentPreferences.highlightBorderWidth,
      (value) => {
        currentPreferences.highlightBorderWidth = value;
        updatePreview();
      }
    );
    section.appendChild(borderWidthGroup);
  }

  // 颜色自定义
  const colorGroup = document.createElement('div');
  colorGroup.className = 'zr-settings-group';
  
  const colorLabel = document.createElement('label');
  colorLabel.className = 'zr-settings-label';
  colorLabel.textContent = '自定义颜色';
  colorGroup.appendChild(colorLabel);

  const colorGrid = document.createElement('div');
  colorGrid.className = 'zr-settings-color-grid';

  Object.entries(currentPreferences.customColors).forEach(([name, color]) => {
    const colorItem = document.createElement('div');
    colorItem.className = 'zr-settings-color-item';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = color;
    colorInput.addEventListener('change', (e) => {
      currentPreferences.customColors[name as keyof typeof currentPreferences.customColors] = 
        (e.target as HTMLInputElement).value;
      updatePreview();
    });
    colorItem.appendChild(colorInput);

    const colorName = document.createElement('span');
    colorName.textContent = getColorLabel(name);
    colorItem.appendChild(colorName);

    colorGrid.appendChild(colorItem);
  });

  colorGroup.appendChild(colorGrid);
  section.appendChild(colorGroup);

  // 预览区域
  const preview = createPreviewArea();
  section.appendChild(preview);

  return section;
}

/**
 * 创建字体样式设置区域
 */
function createFontStyleSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'zr-settings-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'zr-settings-section-title';
  sectionTitle.textContent = '✍️ 字体样式';
  section.appendChild(sectionTitle);

  // 字重
  const fontWeightGroup = createSelectControl(
    '字体粗细',
    'highlightFontWeight',
    [
      { value: 'normal', label: '正常' },
      { value: 'bold', label: '加粗' },
    ],
    currentPreferences.highlightFontWeight,
    (value) => {
      currentPreferences.highlightFontWeight = value as any;
      updatePreview();
    }
  );
  section.appendChild(fontWeightGroup);

  // 字体样式
  const fontStyleGroup = createSelectControl(
    '字体样式',
    'highlightFontStyle',
    [
      { value: 'normal', label: '正常' },
      { value: 'italic', label: '斜体' },
    ],
    currentPreferences.highlightFontStyle,
    (value) => {
      currentPreferences.highlightFontStyle = value as any;
      updatePreview();
    }
  );
  section.appendChild(fontStyleGroup);

  // 文本装饰
  const textDecorationGroup = createSelectControl(
    '文本装饰',
    'highlightTextDecoration',
    [
      { value: 'none', label: '无' },
      { value: 'underline', label: '下划线' },
    ],
    currentPreferences.highlightTextDecoration,
    (value) => {
      currentPreferences.highlightTextDecoration = value as any;
      updatePreview();
    }
  );
  section.appendChild(textDecorationGroup);

  return section;
}

/**
 * 创建动画和效果设置区域
 */
function createEffectsSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'zr-settings-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'zr-settings-section-title';
  sectionTitle.textContent = '✨ 动画和效果';
  section.appendChild(sectionTitle);

  // 启用动画
  const animationsGroup = createCheckboxControl(
    '启用动画效果',
    'enableAnimations',
    currentPreferences.enableAnimations,
    (checked) => {
      currentPreferences.enableAnimations = checked;
    }
  );
  section.appendChild(animationsGroup);

  // 启用声音
  const soundsGroup = createCheckboxControl(
    '启用声音反馈',
    'enableSounds',
    currentPreferences.enableSounds,
    (checked) => {
      currentPreferences.enableSounds = checked;
    }
  );
  section.appendChild(soundsGroup);

  return section;
}

/**
 * 创建其他设置区域
 */
function createOtherSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'zr-settings-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'zr-settings-section-title';
  sectionTitle.textContent = '🔧 其他设置';
  section.appendChild(sectionTitle);

  // 快捷键
  const shortcutsGroup = createCheckboxControl(
    '启用键盘快捷键',
    'shortcutsEnabled',
    currentPreferences.shortcutsEnabled,
    (checked) => {
      currentPreferences.shortcutsEnabled = checked;
    }
  );
  section.appendChild(shortcutsGroup);

  // 自动保存
  const autoSaveGroup = createCheckboxControl(
    '自动保存高亮',
    'autoSave',
    currentPreferences.autoSave,
    (checked) => {
      currentPreferences.autoSave = checked;
    }
  );
  section.appendChild(autoSaveGroup);

  return section;
}

/**
 * 创建滑块控件
 */
function createSliderControl(
  label: string,
  id: string,
  min: number,
  max: number,
  value: number,
  onChange: (value: number) => void
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'zr-settings-group';

  const labelEl = document.createElement('label');
  labelEl.className = 'zr-settings-label';
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  group.appendChild(labelEl);

  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'zr-settings-slider-container';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.className = 'zr-settings-slider';
  slider.min = min.toString();
  slider.max = max.toString();
  slider.value = value.toString();

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'zr-settings-slider-value';
  valueDisplay.textContent = `${value}${max === 100 ? '%' : ''}`;

  slider.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    valueDisplay.textContent = `${val}${max === 100 ? '%' : ''}`;
    onChange(val);
  });

  sliderContainer.appendChild(slider);
  sliderContainer.appendChild(valueDisplay);
  group.appendChild(sliderContainer);

  return group;
}

/**
 * 创建下拉选择控件
 */
function createSelectControl(
  label: string,
  id: string,
  options: Array<{ value: string; label: string }>,
  value: string,
  onChange: (value: string) => void
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'zr-settings-group';

  const labelEl = document.createElement('label');
  labelEl.className = 'zr-settings-label';
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  group.appendChild(labelEl);

  const select = document.createElement('select');
  select.id = id;
  select.className = 'zr-settings-select';
  select.value = value;

  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    onChange((e.target as HTMLSelectElement).value);
  });

  group.appendChild(select);

  return group;
}

/**
 * 创建复选框控件
 */
function createCheckboxControl(
  label: string,
  id: string,
  checked: boolean,
  onChange: (checked: boolean) => void
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'zr-settings-group zr-settings-checkbox-group';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.className = 'zr-settings-checkbox';
  checkbox.checked = checked;

  checkbox.addEventListener('change', (e) => {
    onChange((e.target as HTMLInputElement).checked);
  });

  const labelEl = document.createElement('label');
  labelEl.className = 'zr-settings-checkbox-label';
  labelEl.htmlFor = id;
  labelEl.textContent = label;

  group.appendChild(checkbox);
  group.appendChild(labelEl);

  return group;
}

/**
 * 创建预览区域
 */
function createPreviewArea(): HTMLElement {
  const preview = document.createElement('div');
  preview.className = 'zr-settings-preview';
  preview.id = 'zr-settings-preview';

  const previewLabel = document.createElement('div');
  previewLabel.className = 'zr-settings-preview-label';
  previewLabel.textContent = '预览效果';
  preview.appendChild(previewLabel);

  const previewContent = document.createElement('div');
  previewContent.className = 'zr-settings-preview-content';
  previewContent.innerHTML = `
    <p>这是一段示例文本。<span class="preview-highlight preview-yellow">黄色高亮示例</span>，<span class="preview-highlight preview-blue">蓝色高亮示例</span>，<span class="preview-highlight preview-green">绿色高亮示例</span>，<span class="preview-highlight preview-red">红色高亮示例</span>。</p>
  `;
  preview.appendChild(previewContent);

  updatePreview();

  return preview;
}

/**
 * 更新预览
 */
function updatePreview(): void {
  const preview = document.getElementById('zr-settings-preview');
  if (!preview) return;

  const highlights = preview.querySelectorAll('.preview-highlight');
  highlights.forEach((el) => {
    const element = el as HTMLElement;
    const color = element.classList.contains('preview-yellow') ? 'yellow' :
                   element.classList.contains('preview-blue') ? 'blue' :
                   element.classList.contains('preview-green') ? 'green' : 'red';

    element.style.backgroundColor = currentPreferences.customColors[color];
    element.style.opacity = (currentPreferences.highlightOpacity / 100).toString();
    element.style.borderStyle = currentPreferences.highlightBorderStyle;
    element.style.borderWidth = `${currentPreferences.highlightBorderWidth}px`;
    element.style.borderColor = adjustColorBrightness(currentPreferences.customColors[color], -20);
    element.style.fontWeight = currentPreferences.highlightFontWeight;
    element.style.fontStyle = currentPreferences.highlightFontStyle;
    element.style.textDecoration = currentPreferences.highlightTextDecoration;
  });
}

/**
 * 加载偏好设置
 */
function loadPreferences(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      currentPreferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('[Z-Reader] 加载设置失败:', error);
  }
}

/**
 * 保存偏好设置
 */
function savePreferences(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPreferences));
  } catch (error) {
    console.error('[Z-Reader] 保存设置失败:', error);
    toast.error('保存设置失败');
  }
}

/**
 * 应用偏好设置
 */
export function applyPreferences(): void {
  // 应用高亮样式
  const style = document.getElementById('zr-custom-styles') || document.createElement('style');
  style.id = 'zr-custom-styles';

  const { customColors, highlightOpacity, highlightBorderStyle, highlightBorderWidth, 
          highlightFontWeight, highlightFontStyle, highlightTextDecoration } = currentPreferences;

  style.textContent = `
    [data-highlight-id] {
      opacity: ${highlightOpacity / 100} !important;
      border-style: ${highlightBorderStyle} !important;
      border-width: ${highlightBorderWidth}px !important;
      font-weight: ${highlightFontWeight} !important;
      font-style: ${highlightFontStyle} !important;
      text-decoration: ${highlightTextDecoration} !important;
    }
    
    [data-highlight-id][style*="rgb(254, 243, 199)"] {
      background-color: ${customColors.yellow} !important;
      border-color: ${adjustColorBrightness(customColors.yellow, -20)} !important;
    }
    
    [data-highlight-id][style*="rgb(219, 234, 254)"] {
      background-color: ${customColors.blue} !important;
      border-color: ${adjustColorBrightness(customColors.blue, -20)} !important;
    }
    
    [data-highlight-id][style*="rgb(209, 250, 229)"] {
      background-color: ${customColors.green} !important;
      border-color: ${adjustColorBrightness(customColors.green, -20)} !important;
    }
    
    [data-highlight-id][style*="rgb(254, 226, 226)"] {
      background-color: ${customColors.red} !important;
      border-color: ${adjustColorBrightness(customColors.red, -20)} !important;
    }
  `;

  if (!document.head.contains(style)) {
    document.head.appendChild(style);
  }

  // 应用动画设置
  if (!currentPreferences.enableAnimations) {
    document.body.classList.add('zr-no-animations');
  } else {
    document.body.classList.remove('zr-no-animations');
  }
}

/**
 * 恢复默认设置
 */
function resetToDefaults(): void {
  if (!confirm('确定要恢复所有设置为默认值吗？')) return;

  currentPreferences = { ...DEFAULT_PREFERENCES };
  savePreferences();
  applyPreferences();
  hideSettingsPanel();
  setTimeout(() => showSettingsPanel(), 300);
  toast.success('已恢复默认设置');
}

/**
 * 获取当前偏好设置
 */
export function getPreferences(): UserPreferences {
  return { ...currentPreferences };
}

/**
 * 调整颜色亮度
 */
function adjustColorBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

/**
 * 获取颜色标签
 */
function getColorLabel(color: string): string {
  const labels: Record<string, string> = {
    yellow: '黄色',
    blue: '蓝色',
    green: '绿色',
    red: '红色',
  };
  return labels[color] || color;
}