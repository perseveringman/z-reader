import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Loader2,
  Save,
  Podcast,
  HardDrive,
  Compass,
  Globe,
  Brain,
  Eye,
  EyeOff,
  Mic,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from './Toast';
import { AIDebugPanel } from './AIDebugPanel';
import type { AppSettings, AISettingsData } from '../../shared/types';
import { changeLanguage, supportedLanguages } from '../../i18n';
import {
  PRIMARY_PREFERENCE_SECTIONS,
  getSecondarySectionsForPrimary,
  getFirstSecondarySection,
  isSecondarySectionInPrimary,
  getPreferencesDialogLayout,
  type PrimaryPreferenceSectionId,
  type SecondaryPreferenceSectionId,
} from './preferences-layout';

interface PreferencesDialogProps {
  open: boolean;
  onClose: () => void;
}

const PRIMARY_SECTION_LABELS: Record<PrimaryPreferenceSectionId, string> = {
  general: '通用',
  content: '内容源',
  asr: '语音识别',
  ai: 'AI',
};

const PRIMARY_SECTION_ICONS: Record<PrimaryPreferenceSectionId, LucideIcon> = {
  general: Settings,
  content: Podcast,
  asr: Mic,
  ai: Brain,
};

const SECONDARY_SECTION_LABELS: Record<SecondaryPreferenceSectionId, string> = {
  language: '语言',
  podcast: '播客设置',
  rsshub: 'RSSHub',
  download: '下载',
  'asr-provider': '服务提供商',
  'asr-credentials-volcengine': '火山引擎凭据',
  'asr-credentials-tencent': '腾讯云凭据',
  'ai-models': '模型与密钥',
  'ai-debug': '调试面板',
};

export function PreferencesDialog({ open, onClose }: PreferencesDialogProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activePrimary, setActivePrimary] = useState<PrimaryPreferenceSectionId>('general');
  const [activeSecondary, setActiveSecondary] = useState<SecondaryPreferenceSectionId>('language');

  const [aiSettings, setAiSettings] = useState<AISettingsData>({
    provider: 'openrouter',
    apiKey: '',
    models: { fast: '', smart: '', cheap: '' },
  });
  const [aiDirty, setAiDirty] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(true);
      setDirty(false);
      setAiDirty(false);
      setShowApiKey(false);
      setActivePrimary('general');
      setActiveSecondary('language');

      Promise.all([
        window.electronAPI.settingsGet(),
        window.electronAPI.aiSettingsGet().catch(() => null),
      ])
        .then(([s, ai]) => {
          setSettings(s);
          if (ai) {
            setAiSettings(ai);
          }
        })
        .catch((err) => console.error('Failed to load settings:', err))
        .finally(() => setLoading(false));
    }
  }, [open]);

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
    if (!isSecondarySectionInPrimary(activePrimary, activeSecondary, settings)) {
      setActiveSecondary(getFirstSecondarySection(activePrimary, settings));
    }
  }, [open, activePrimary, activeSecondary, settings.asrProvider]);

  const secondarySections = getSecondarySectionsForPrimary(activePrimary, settings);
  const dialogLayout = getPreferencesDialogLayout();

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await window.electronAPI.settingsSet(settings);
      setSettings(updated);
      setDirty(false);
      showToast(t('preferences.settingsSaved'));
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast(t('preferences.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateAiField = useCallback(
    <K extends keyof AISettingsData>(key: K, value: AISettingsData[K]) => {
      setAiSettings((prev) => ({ ...prev, [key]: value }));
      setAiDirty(true);
    },
    [],
  );

  const updateAiModel = useCallback(
    (slot: 'fast' | 'smart' | 'cheap', value: string) => {
      setAiSettings((prev) => ({
        ...prev,
        models: { ...prev.models, [slot]: value },
      }));
      setAiDirty(true);
    },
    [],
  );

  const handleAiSave = async () => {
    setAiSaving(true);
    try {
      await window.electronAPI.aiSettingsSet(aiSettings);
      setAiDirty(false);
      showToast(t('ai.saved'));
    } catch (err) {
      console.error('Failed to save AI settings:', err);
      showToast(t('preferences.saveFailed'));
    } finally {
      setAiSaving(false);
    }
  };

  const onPrimaryChange = (id: PrimaryPreferenceSectionId) => {
    setActivePrimary(id);
    setActiveSecondary(getFirstSecondarySection(id, settings));
  };

  const renderLanguageSection = () => (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Globe size={16} className="text-cyan-400" />
        <h3 className="text-sm font-medium text-white">语言</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="language-select"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            选择语言
          </label>
          <select
            id="language-select"
            value={settings.language || 'zh'}
            onChange={(e) => {
              const newLang = e.target.value;
              updateField('language', newLang);
              changeLanguage(newLang as 'en' | 'zh');
            }}
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.name})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-600 mt-1">
            更改语言后，部分界面将立即更新。
          </p>
        </div>
      </div>
    </section>
  );

  const renderPodcastSection = () => (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Podcast size={16} className="text-blue-400" />
        <h3 className="text-sm font-medium text-white">播客设置</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="pi-key"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Podcast Index API Key
          </label>
          <input
            id="pi-key"
            type="text"
            value={settings.podcastIndexApiKey || ''}
            onChange={(e) => updateField('podcastIndexApiKey', e.target.value || undefined)}
            placeholder="可选 - 启用 Podcast Index 搜索"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="pi-secret"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Podcast Index API Secret
          </label>
          <input
            id="pi-secret"
            type="password"
            value={settings.podcastIndexApiSecret || ''}
            onChange={(e) => updateField('podcastIndexApiSecret', e.target.value || undefined)}
            placeholder="可选 - 配合 API Key 使用"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <p className="text-[11px] text-gray-600 leading-relaxed">
          在 <span className="text-gray-400">podcastindex.org</span> 免费注册即可获取 API 密钥，启用
          Podcast Index 作为补充搜索源。
        </p>
      </div>
    </section>
  );

  const renderRsshubSection = () => (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Compass size={16} className="text-orange-400" />
        <h3 className="text-sm font-medium text-white">RSSHub 设置</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="rsshub-url"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            RSSHub 实例地址
          </label>
          <input
            id="rsshub-url"
            type="text"
            value={settings.rsshubBaseUrl || ''}
            onChange={(e) => updateField('rsshubBaseUrl', e.target.value || undefined)}
            placeholder="https://rsshub.example.com"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-[11px] text-gray-600 mt-1">
            配置自建 RSSHub 实例地址，启用发现页面的分类浏览和路由搜索功能。
          </p>
        </div>
      </div>
    </section>
  );

  const renderDownloadSection = () => (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <HardDrive size={16} className="text-green-400" />
        <h3 className="text-sm font-medium text-white">下载设置</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="dl-dir"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            下载目录
          </label>
          <input
            id="dl-dir"
            type="text"
            value={settings.downloadDirectory || ''}
            onChange={(e) => updateField('downloadDirectory', e.target.value || undefined)}
            placeholder="默认: 应用数据目录/podcasts"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="dl-cap"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            存储容量限制 (MB)
          </label>
          <input
            id="dl-cap"
            type="number"
            min={100}
            step={100}
            value={settings.downloadCapacityMb ?? 5120}
            onChange={(e) => updateField('downloadCapacityMb', parseInt(e.target.value, 10) || 5120)}
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-[11px] text-gray-600 mt-1">
            超过限制时自动清理最早的已下载文件。默认 5120 MB (5 GB)。
          </p>
        </div>
      </div>
    </section>
  );

  const renderAsrProviderSection = () => (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Mic size={16} className="text-teal-400" />
        <h3 className="text-sm font-medium text-white">语音识别服务</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="asr-provider"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            服务提供商
          </label>
          <select
            id="asr-provider"
            value={settings.asrProvider || 'volcengine'}
            onChange={(e) => updateField('asrProvider', e.target.value as 'volcengine' | 'tencent')}
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="volcengine">火山引擎</option>
            <option value="tencent">腾讯云</option>
          </select>
          <p className="text-[11px] text-gray-600 mt-1">切换后将自动展示对应服务的凭据配置。</p>
        </div>
      </div>
    </section>
  );

  const renderAsrVolcSection = () => (
    <section>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="volc-asr-app-key"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            App Key
          </label>
          <input
            id="volc-asr-app-key"
            type="text"
            value={settings.volcAsrAppKey || ''}
            onChange={(e) => updateField('volcAsrAppKey', e.target.value || undefined)}
            placeholder="控制台获取的 APP ID"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="volc-asr-access-key"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Access Token
          </label>
          <input
            id="volc-asr-access-key"
            type="password"
            value={settings.volcAsrAccessKey || ''}
            onChange={(e) => updateField('volcAsrAccessKey', e.target.value || undefined)}
            placeholder="控制台获取的 Access Token"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          在 <span className="text-gray-400">console.volcengine.com</span> 开通豆包语音识别服务，获取
          App Key 和 Access Token。
        </p>
      </div>
    </section>
  );

  const renderAsrTencentSection = () => (
    <section>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="tencent-asr-app-id"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            AppID
          </label>
          <input
            id="tencent-asr-app-id"
            type="text"
            value={settings.tencentAsrAppId || ''}
            onChange={(e) => updateField('tencentAsrAppId', e.target.value || undefined)}
            placeholder="腾讯云账号 AppID"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="tencent-asr-secret-id"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            SecretId
          </label>
          <input
            id="tencent-asr-secret-id"
            type="text"
            value={settings.tencentAsrSecretId || ''}
            onChange={(e) => updateField('tencentAsrSecretId', e.target.value || undefined)}
            placeholder="API 密钥 SecretId"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="tencent-asr-secret-key"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            SecretKey
          </label>
          <input
            id="tencent-asr-secret-key"
            type="password"
            value={settings.tencentAsrSecretKey || ''}
            onChange={(e) => updateField('tencentAsrSecretKey', e.target.value || undefined)}
            placeholder="API 密钥 SecretKey"
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          在 <span className="text-gray-400">console.cloud.tencent.com</span> 开通语音识别服务，获取
          AppID 和 API 密钥。使用极速版引擎，转写速度极快。
        </p>
      </div>
    </section>
  );

  const renderAiModelsSection = () => (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Brain size={16} className="text-purple-400" />
        <h3 className="text-sm font-medium text-white">{t('ai.settings')}</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="ai-provider" className="block text-xs font-medium text-gray-400 mb-1.5">
            {t('ai.provider')}
          </label>
          <select
            id="ai-provider"
            value={aiSettings.provider}
            onChange={(e) => updateAiField('provider', e.target.value as 'openrouter' | 'minimax')}
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="openrouter">OpenRouter</option>
            <option value="minimax">MiniMax</option>
          </select>
        </div>

        <div>
          <label htmlFor="ai-api-key" className="block text-xs font-medium text-gray-400 mb-1.5">
            {t('ai.apiKey')}
          </label>
          <div className="relative">
            <input
              id="ai-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={aiSettings.apiKey}
              onChange={(e) => updateAiField('apiKey', e.target.value)}
              placeholder={t('ai.apiKeyPlaceholder')}
              className="w-full px-3 py-2 pr-10 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              tabIndex={-1}
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="ai-model-fast" className="block text-xs font-medium text-gray-400 mb-1.5">
            {t('ai.modelFast')}
          </label>
          <input
            id="ai-model-fast"
            type="text"
            value={aiSettings.models.fast}
            onChange={(e) => updateAiModel('fast', e.target.value)}
            placeholder={
              aiSettings.provider === 'openrouter' ? 'google/gemini-flash-1.5' : 'abab6.5s-chat'
            }
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="ai-model-smart" className="block text-xs font-medium text-gray-400 mb-1.5">
            {t('ai.modelSmart')}
          </label>
          <input
            id="ai-model-smart"
            type="text"
            value={aiSettings.models.smart}
            onChange={(e) => updateAiModel('smart', e.target.value)}
            placeholder={
              aiSettings.provider === 'openrouter'
                ? 'anthropic/claude-3.5-sonnet'
                : 'abab6.5-chat'
            }
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="ai-model-cheap" className="block text-xs font-medium text-gray-400 mb-1.5">
            {t('ai.modelCheap')}
          </label>
          <input
            id="ai-model-cheap"
            type="text"
            value={aiSettings.models.cheap}
            onChange={(e) => updateAiModel('cheap', e.target.value)}
            placeholder={
              aiSettings.provider === 'openrouter' ? 'google/gemini-flash-1.5-8b' : 'abab5.5-chat'
            }
            className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>
    </section>
  );

  const renderActiveSection = () => {
    if (activeSecondary === 'language') return renderLanguageSection();
    if (activeSecondary === 'podcast') return renderPodcastSection();
    if (activeSecondary === 'rsshub') return renderRsshubSection();
    if (activeSecondary === 'download') return renderDownloadSection();
    if (activeSecondary === 'asr-provider') return renderAsrProviderSection();
    if (activeSecondary === 'asr-credentials-volcengine') return renderAsrVolcSection();
    if (activeSecondary === 'asr-credentials-tencent') return renderAsrTencentSection();
    if (activeSecondary === 'ai-models') return renderAiModelsSection();
    return <AIDebugPanel />;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative ${dialogLayout.containerClass} bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{t('preferences.title')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <div className={`flex ${dialogLayout.bodyClass}`}>
            <aside className={`${dialogLayout.sidebarClass} border-r border-white/10 bg-[#151515] p-3 space-y-1.5`}>
              {PRIMARY_PREFERENCE_SECTIONS.map((section) => {
                const Icon = PRIMARY_SECTION_ICONS[section.id];
                const active = section.id === activePrimary;
                return (
                  <button
                    key={section.id}
                    onClick={() => onPrimaryChange(section.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                      active
                        ? 'bg-white/10 text-white border border-white/15'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{PRIMARY_SECTION_LABELS[section.id]}</span>
                  </button>
                );
              })}
            </aside>

            <section className="flex-1 min-w-0 flex flex-col">
              <div className="px-5 pt-5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 flex-wrap">
                  {secondarySections.map((section) => {
                    const active = section.id === activeSecondary;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSecondary(section.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
                            : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {SECONDARY_SECTION_LABELS[section.id]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">{renderActiveSection()}</div>

              <div className="border-t border-white/10 p-4">
                {activePrimary === 'ai' ? (
                  <button
                    onClick={handleAiSave}
                    disabled={aiSaving || !aiDirty}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {aiSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>{t('preferences.saving')}</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>{aiDirty ? t('ai.save') : t('ai.saved')}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>保存中...</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>保存设置</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
