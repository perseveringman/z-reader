import { useState, useEffect } from 'react';
import { X, Loader2, Save, Podcast, HardDrive, Compass } from 'lucide-react';
import { useToast } from './Toast';
import type { AppSettings } from '../../shared/types';

interface PreferencesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PreferencesDialog({ open, onClose }: PreferencesDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(true);
      setDirty(false);
      window.electronAPI
        .settingsGet()
        .then((s) => setSettings(s))
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
      showToast('设置已保存');
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">偏好设置</h2>
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
          <div className="p-6 space-y-6">
            {/* Podcast Section */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Podcast size={16} className="text-blue-400" />
                <h3 className="text-sm font-medium text-white">播客设置</h3>
              </div>

              <div className="space-y-4">
                {/* Podcast Index API Key */}
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

                {/* Podcast Index API Secret */}
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
                    onChange={(e) =>
                      updateField('podcastIndexApiSecret', e.target.value || undefined)
                    }
                    placeholder="可选 - 配合 API Key 使用"
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <p className="text-[11px] text-gray-600 leading-relaxed">
                  在{' '}
                  <span className="text-gray-400">podcastindex.org</span>{' '}
                  免费注册即可获取 API 密钥，启用 Podcast Index 作为补充搜索源。
                </p>
              </div>
            </section>

            {/* RSSHub Section */}
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

            {/* Download Section */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <HardDrive size={16} className="text-green-400" />
                <h3 className="text-sm font-medium text-white">下载设置</h3>
              </div>

              <div className="space-y-4">
                {/* Download directory */}
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
                    onChange={(e) =>
                      updateField('downloadDirectory', e.target.value || undefined)
                    }
                    placeholder="默认: 应用数据目录/podcasts"
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Capacity limit */}
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
                    onChange={(e) =>
                      updateField('downloadCapacityMb', parseInt(e.target.value) || 5120)
                    }
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-[11px] text-gray-600 mt-1">
                    超过限制时自动清理最早的已下载文件。默认 5120 MB (5 GB)。
                  </p>
                </div>
              </div>
            </section>

            {/* Save button */}
            <div className="pt-2">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
