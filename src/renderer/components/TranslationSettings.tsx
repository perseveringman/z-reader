// 翻译配置面板组件
// 提供翻译引擎选择、凭据配置、语言设置、显示样式和快捷键配置

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  Languages,
  Eye,
  EyeOff,
  Palette,
  Keyboard,
} from 'lucide-react';
import { LANGUAGES } from './TranslationLangPicker';
import type {
  TranslationSettings as TranslationSettingsData,
  TranslationProvider,
  TranslationStyle,
} from '../../shared/types';

interface TranslationSettingsProps {
  open: boolean;
  onClose: () => void;
}

/** 翻译引擎选项卡定义 */
const PROVIDER_TABS: { key: TranslationProvider; label: string }[] = [
  { key: 'llm', label: 'LLM' },
  { key: 'google', label: 'Google' },
  { key: 'microsoft', label: 'Microsoft' },
];

/** 翻译风格选项 */
const STYLE_OPTIONS: { key: TranslationStyle; label: string }[] = [
  { key: 'professional', label: '专业' },
  { key: 'casual', label: '口语' },
  { key: 'literal', label: '直译' },
];

/** 默认配置 */
const DEFAULT_SETTINGS: TranslationSettingsData = {
  provider: 'llm',
  llm: {
    apiKey: '',
    baseUrl: '',
    model: '',
    style: 'professional',
    customPrompt: '',
  },
  google: {
    apiKey: '',
  },
  microsoft: {
    apiKey: '',
    region: '',
  },
  defaultTargetLang: 'zh-CN',
  autoDetectLang: true,
  autoTranslateFeeds: [],
  display: {
    fontSize: 14,
    color: '#9ca3af',
    opacity: 0.85,
    showOriginal: true,
  },
  shortcut: 'CommandOrControl+Shift+T',
};

export function TranslationSettings({ open, onClose }: TranslationSettingsProps) {
  const [settings, setSettings] = useState<TranslationSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  /** 控制 LLM API Key 是否显示明文 */
  const [showLlmKey, setShowLlmKey] = useState(false);
  /** 控制 Google API Key 是否显示明文 */
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  /** 控制 Microsoft API Key 是否显示明文 */
  const [showMsKey, setShowMsKey] = useState(false);
  /** 是否正在录制快捷键 */
  const [recordingShortcut, setRecordingShortcut] = useState(false);

  // 打开时加载配置
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setShowLlmKey(false);
    setShowGoogleKey(false);
    setShowMsKey(false);
    setRecordingShortcut(false);

    window.electronAPI
      .translationSettingsGet()
      .then((data) => {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      })
      .catch((err) => {
        console.error('加载翻译配置失败:', err);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // ESC 关闭面板
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !recordingShortcut) {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, recordingShortcut]);

  /** 更新配置并立即保存 */
  const updateSettings = useCallback(
    (partial: Partial<TranslationSettingsData>) => {
      setSettings((prev) => {
        const next = { ...prev, ...partial };
        // 异步保存，不阻塞 UI
        window.electronAPI.translationSettingsSet(partial).catch((err) => {
          console.error('保存翻译配置失败:', err);
        });
        return next;
      });
    },
    [],
  );

  /** 更新 LLM 子配置 */
  const updateLlm = useCallback(
    (partial: Partial<TranslationSettingsData['llm']>) => {
      setSettings((prev) => {
        const nextLlm = { ...prev.llm, ...partial };
        const next = { ...prev, llm: nextLlm };
        window.electronAPI.translationSettingsSet({ llm: nextLlm }).catch((err) => {
          console.error('保存 LLM 配置失败:', err);
        });
        return next;
      });
    },
    [],
  );

  /** 更新 Google 子配置 */
  const updateGoogle = useCallback(
    (partial: Partial<TranslationSettingsData['google']>) => {
      setSettings((prev) => {
        const nextGoogle = { ...prev.google, ...partial };
        const next = { ...prev, google: nextGoogle };
        window.electronAPI.translationSettingsSet({ google: nextGoogle }).catch((err) => {
          console.error('保存 Google 配置失败:', err);
        });
        return next;
      });
    },
    [],
  );

  /** 更新 Microsoft 子配置 */
  const updateMicrosoft = useCallback(
    (partial: Partial<TranslationSettingsData['microsoft']>) => {
      setSettings((prev) => {
        const nextMs = { ...prev.microsoft, ...partial };
        const next = { ...prev, microsoft: nextMs };
        window.electronAPI.translationSettingsSet({ microsoft: nextMs }).catch((err) => {
          console.error('保存 Microsoft 配置失败:', err);
        });
        return next;
      });
    },
    [],
  );

  /** 更新显示样式子配置 */
  const updateDisplay = useCallback(
    (partial: Partial<TranslationSettingsData['display']>) => {
      setSettings((prev) => {
        const nextDisplay = { ...prev.display, ...partial };
        const next = { ...prev, display: nextDisplay };
        window.electronAPI.translationSettingsSet({ display: nextDisplay }).catch((err) => {
          console.error('保存显示配置失败:', err);
        });
        return next;
      });
    },
    [],
  );

  /** 快捷键录制处理 */
  const handleShortcutKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // 忽略单独的修饰键
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);

      const shortcut = parts.join('+');
      updateSettings({ shortcut });
      setRecordingShortcut(false);
    },
    [updateSettings],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 面板主体 */}
      <div className="relative w-[560px] max-h-[85vh] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Languages size={18} className="text-blue-400" />
            <h2 className="text-lg font-semibold text-white">翻译设置</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
            {/* ==================== 翻译引擎 ==================== */}
            <section>
              <h3 className="text-sm font-medium text-white mb-4">翻译引擎</h3>

              {/* 引擎选项卡 */}
              <div className="flex items-center gap-2 mb-4">
                {PROVIDER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => updateSettings({ provider: tab.key })}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      settings.provider === tab.key
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* LLM 配置区 */}
              {settings.provider === 'llm' && (
                <div className="space-y-3 p-4 rounded-lg border border-[#333] bg-[#111]">
                  {/* API Key */}
                  <div>
                    <label
                      htmlFor="llm-api-key"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        id="llm-api-key"
                        type={showLlmKey ? 'text' : 'password'}
                        value={settings.llm.apiKey}
                        onChange={(e) => updateLlm({ apiKey: e.target.value })}
                        placeholder="输入 LLM API Key"
                        className="w-full px-3 py-2 pr-10 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLlmKey(!showLlmKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showLlmKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label
                      htmlFor="llm-base-url"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      Base URL
                    </label>
                    <input
                      id="llm-base-url"
                      type="text"
                      value={settings.llm.baseUrl}
                      onChange={(e) => updateLlm({ baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 模型选择 */}
                  <div>
                    <label
                      htmlFor="llm-model"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      模型
                    </label>
                    <input
                      id="llm-model"
                      type="text"
                      value={settings.llm.model}
                      onChange={(e) => updateLlm({ model: e.target.value })}
                      placeholder="gpt-4o-mini"
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 翻译风格 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      翻译风格
                    </label>
                    <div className="flex items-center gap-2">
                      {STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => updateLlm({ style: opt.key })}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                            settings.llm.style === opt.key
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
                              : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 自定义 Prompt */}
                  <div>
                    <label
                      htmlFor="llm-custom-prompt"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      自定义 Prompt
                    </label>
                    <textarea
                      id="llm-custom-prompt"
                      value={settings.llm.customPrompt}
                      onChange={(e) => updateLlm({ customPrompt: e.target.value })}
                      placeholder="可选 - 自定义翻译提示词，留空使用默认提示词"
                      rows={3}
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                    />
                    <p className="text-[11px] text-gray-600 mt-1">
                      可使用 {'{text}'} 表示待翻译文本，{'{targetLang}'} 表示目标语言。
                    </p>
                  </div>
                </div>
              )}

              {/* Google 配置区 */}
              {settings.provider === 'google' && (
                <div className="space-y-3 p-4 rounded-lg border border-[#333] bg-[#111]">
                  <div>
                    <label
                      htmlFor="google-api-key"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        id="google-api-key"
                        type={showGoogleKey ? 'text' : 'password'}
                        value={settings.google.apiKey}
                        onChange={(e) => updateGoogle({ apiKey: e.target.value })}
                        placeholder="输入 Google Cloud Translation API Key"
                        className="w-full px-3 py-2 pr-10 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleKey(!showGoogleKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showGoogleKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1">
                      在 Google Cloud Console 中启用 Cloud Translation API 后获取。
                    </p>
                  </div>
                </div>
              )}

              {/* Microsoft 配置区 */}
              {settings.provider === 'microsoft' && (
                <div className="space-y-3 p-4 rounded-lg border border-[#333] bg-[#111]">
                  <div>
                    <label
                      htmlFor="ms-api-key"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        id="ms-api-key"
                        type={showMsKey ? 'text' : 'password'}
                        value={settings.microsoft.apiKey}
                        onChange={(e) => updateMicrosoft({ apiKey: e.target.value })}
                        placeholder="输入 Azure Translator API Key"
                        className="w-full px-3 py-2 pr-10 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMsKey(!showMsKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showMsKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="ms-region"
                      className="block text-xs font-medium text-gray-400 mb-1.5"
                    >
                      Region
                    </label>
                    <input
                      id="ms-region"
                      type="text"
                      value={settings.microsoft.region}
                      onChange={(e) => updateMicrosoft({ region: e.target.value })}
                      placeholder="eastasia"
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-[11px] text-gray-600 mt-1">
                      Azure Translator 资源所在区域，如 eastasia、westus2 等。
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* ==================== 语言设置 ==================== */}
            <section>
              <h3 className="text-sm font-medium text-white mb-4">语言设置</h3>

              <div className="space-y-4">
                {/* 默认目标语言 */}
                <div>
                  <label
                    htmlFor="default-target-lang"
                    className="block text-xs font-medium text-gray-400 mb-1.5"
                  >
                    默认目标语言
                  </label>
                  <select
                    id="default-target-lang"
                    value={settings.defaultTargetLang}
                    onChange={(e) => updateSettings({ defaultTargetLang: e.target.value })}
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 自动检测源语言 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">自动检测源语言</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      自动识别文章的原始语言，无需手动指定
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateSettings({ autoDetectLang: !settings.autoDetectLang })
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      settings.autoDetectLang
                        ? 'bg-blue-500'
                        : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.autoDetectLang ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* ==================== 显示样式 ==================== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Palette size={16} className="text-purple-400" />
                <h3 className="text-sm font-medium text-white">显示样式</h3>
              </div>

              <div className="space-y-4">
                {/* 译文字号 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="display-font-size"
                      className="text-xs font-medium text-gray-400"
                    >
                      译文字号
                    </label>
                    <span className="text-xs text-gray-500">
                      {settings.display.fontSize}px
                    </span>
                  </div>
                  <input
                    id="display-font-size"
                    type="number"
                    min={10}
                    max={28}
                    value={settings.display.fontSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 10 && val <= 28) {
                        updateDisplay({ fontSize: val });
                      }
                    }}
                    className="w-32 px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* 译文颜色 */}
                <div>
                  <label
                    htmlFor="display-color"
                    className="block text-xs font-medium text-gray-400 mb-1.5"
                  >
                    译文颜色
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="display-color"
                      type="text"
                      value={settings.display.color}
                      onChange={(e) => updateDisplay({ color: e.target.value })}
                      placeholder="#9ca3af"
                      className="w-36 px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {/* 颜色预览 */}
                    <div
                      className="w-8 h-8 rounded border border-white/10"
                      style={{ backgroundColor: settings.display.color }}
                    />
                    {/* 原生颜色选择器 */}
                    <input
                      type="color"
                      value={settings.display.color}
                      onChange={(e) => updateDisplay({ color: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                    />
                  </div>
                </div>

                {/* 译文透明度 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="display-opacity"
                      className="text-xs font-medium text-gray-400"
                    >
                      译文透明度
                    </label>
                    <span className="text-xs text-gray-500">
                      {Math.round(settings.display.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    id="display-opacity"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.display.opacity}
                    onChange={(e) => updateDisplay({ opacity: parseFloat(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* 默认显示原文 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">默认显示原文</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      翻译完成后是否同时显示原文
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateDisplay({ showOriginal: !settings.display.showOriginal })
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      settings.display.showOriginal
                        ? 'bg-purple-500'
                        : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.display.showOriginal ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* ==================== 快捷键 ==================== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Keyboard size={16} className="text-green-400" />
                <h3 className="text-sm font-medium text-white">快捷键</h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  翻译快捷键
                </label>
                <div className="flex items-center gap-3">
                  <input
                    readOnly={!recordingShortcut}
                    value={recordingShortcut ? '按下快捷键组合...' : settings.shortcut}
                    onKeyDown={recordingShortcut ? handleShortcutKeyDown : undefined}
                    className={`w-64 px-3 py-2 bg-[#111] border rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                      recordingShortcut
                        ? 'border-green-400/60 bg-green-500/5'
                        : 'border-white/10'
                    }`}
                  />
                  <button
                    onClick={() => setRecordingShortcut(!recordingShortcut)}
                    className={`px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      recordingShortcut
                        ? 'bg-red-500/20 text-red-300 border border-red-400/40 hover:bg-red-500/30'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {recordingShortcut ? '取消' : '录制'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  点击"录制"后按下键盘组合键即可设置快捷键。
                </p>
              </div>
            </section>
          </div>
        )}

        {/* 底部提示 */}
        <div className="border-t border-white/10 px-6 py-3 shrink-0">
          <p className="text-center text-[11px] text-gray-500">
            所有配置修改后自动保存
          </p>
        </div>
      </div>
    </div>
  );
}
