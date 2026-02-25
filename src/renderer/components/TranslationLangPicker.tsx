// 翻译目标语言选择下拉菜单组件

import { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

/** 支持的目标语言列表 */
const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
] as const;

interface TranslationLangPickerProps {
  /** 当前选中的语言代码 */
  currentLang?: string;
  /** 选择语言后的回调 */
  onSelect: (langCode: string) => void;
  /** 菜单对齐方向 */
  align?: 'left' | 'right';
  /** 触发元素（children） */
  children: React.ReactNode;
}

/**
 * 翻译目标语言选择下拉菜单
 *
 * 点击 children 展开/收起语言列表，选择后触发 onSelect 回调。
 */
export function TranslationLangPicker({
  currentLang,
  onSelect,
  align = 'right',
  children,
}: TranslationLangPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setOpen((prev) => !prev)}>
        {children}
      </div>

      {open && (
        <div
          className={`absolute top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} z-50 w-44 max-h-64 overflow-y-auto rounded-lg border border-[#333] bg-[#1e1e1e] shadow-lg py-1`}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 transition-colors cursor-pointer"
              onClick={() => {
                onSelect(lang.code);
                setOpen(false);
              }}
            >
              <span>{lang.label}</span>
              {currentLang === lang.code && (
                <Check className="w-3.5 h-3.5 text-blue-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 导出语言列表，供其他组件使用 */
export { LANGUAGES };
