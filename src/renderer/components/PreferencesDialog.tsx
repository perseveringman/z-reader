import { useState, useEffect } from 'react';
import { X, Loader2, Save, Podcast, HardDrive, Compass, Database, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from './Toast';
import type { AgentGraphSnapshotItem, AppSettings } from '../../shared/types';

interface PreferencesDialogProps {
  open: boolean;
  onClose: () => void;
}

const SNAPSHOT_STATUS_CLASS: Record<AgentGraphSnapshotItem['status'], string> = {
  running: 'text-blue-300',
  succeeded: 'text-green-300',
  failed: 'text-red-300',
  canceled: 'text-yellow-300',
};

export function PreferencesDialog({ open, onClose }: PreferencesDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [agentTaskId, setAgentTaskId] = useState('');
  const [agentSnapshots, setAgentSnapshots] = useState<AgentGraphSnapshotItem[]>([]);
  const [agentSnapshotLoading, setAgentSnapshotLoading] = useState(false);
  const [agentCleanupLoading, setAgentCleanupLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [maxSnapshotsPerTask, setMaxSnapshotsPerTask] = useState(5);
  const [staleBeforeLocal, setStaleBeforeLocal] = useState('');

  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(true);
      setDirty(false);
      setAgentTaskId('');
      setAgentSnapshots([]);
      setAgentError(null);
      setMaxSnapshotsPerTask(5);
      setStaleBeforeLocal('');

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

  const loadSnapshots = async () => {
    const taskId = agentTaskId.trim();
    if (!taskId) {
      setAgentSnapshots([]);
      setAgentError('请输入 taskId 后再查询快照');
      return;
    }

    setAgentSnapshotLoading(true);
    setAgentError(null);

    try {
      const snapshots = await window.electronAPI.agentSnapshotList({ taskId });
      setAgentSnapshots(snapshots);
    } catch (err) {
      console.error('Failed to list agent snapshots:', err);
      setAgentSnapshots([]);
      setAgentError('快照查询失败，请稍后重试');
    } finally {
      setAgentSnapshotLoading(false);
    }
  };

  const handleCleanupSnapshots = async () => {
    const hasStaleBefore = staleBeforeLocal.trim().length > 0;
    const staleBeforeDate = hasStaleBefore ? new Date(staleBeforeLocal) : null;

    if (hasStaleBefore && (!staleBeforeDate || Number.isNaN(staleBeforeDate.getTime()))) {
      showToast('清理时间格式无效');
      return;
    }

    setAgentCleanupLoading(true);
    setAgentError(null);

    try {
      const result = await window.electronAPI.agentSnapshotCleanup({
        maxSnapshotsPerTask: Number.isFinite(maxSnapshotsPerTask) ? Math.max(0, maxSnapshotsPerTask) : undefined,
        staleBefore: staleBeforeDate ? staleBeforeDate.toISOString() : undefined,
      });

      showToast(`清理完成，删除 ${result.deletedCount} 条快照`);

      if (agentTaskId.trim()) {
        await loadSnapshots();
      }
    } catch (err) {
      console.error('Failed to cleanup agent snapshots:', err);
      setAgentError('快照清理失败，请稍后重试');
      showToast('快照清理失败');
    } finally {
      setAgentCleanupLoading(false);
    }
  };

  const formatTime = (value: string): string => {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return value;
    }

    return new Date(timestamp).toLocaleString();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-3xl bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl max-h-[85vh] overflow-hidden">
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
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-80px)]">
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
                      updateField('downloadCapacityMb', parseInt(e.target.value, 10) || 5120)
                    }
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-[11px] text-gray-600 mt-1">
                    超过限制时自动清理最早的已下载文件。默认 5120 MB (5 GB)。
                  </p>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Database size={16} className="text-purple-400" />
                <h3 className="text-sm font-medium text-white">Agent 运维面板（本地）</h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="md:col-span-3">
                    <label htmlFor="agent-task-id" className="block text-xs font-medium text-gray-400 mb-1.5">
                      Task ID
                    </label>
                    <input
                      id="agent-task-id"
                      type="text"
                      value={agentTaskId}
                      onChange={(e) => setAgentTaskId(e.target.value)}
                      placeholder="输入 taskId 后查询关联快照"
                      className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={loadSnapshots}
                      disabled={agentSnapshotLoading}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors"
                    >
                      {agentSnapshotLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      <span>查询快照</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="snapshot-retain" className="block text-xs font-medium text-gray-400 mb-1.5">
                      每任务保留数量
                    </label>
                    <input
                      id="snapshot-retain"
                      type="number"
                      min={0}
                      step={1}
                      value={maxSnapshotsPerTask}
                      onChange={(e) => setMaxSnapshotsPerTask(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="snapshot-stale" className="block text-xs font-medium text-gray-400 mb-1.5">
                      清理截止时间（可选）
                    </label>
                    <input
                      id="snapshot-stale"
                      type="datetime-local"
                      value={staleBeforeLocal}
                      onChange={(e) => setStaleBeforeLocal(e.target.value)}
                      className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleCleanupSnapshots}
                      disabled={agentCleanupLoading}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors"
                    >
                      {agentCleanupLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      <span>执行清理</span>
                    </button>
                  </div>
                </div>

                {agentError ? <p className="text-xs text-red-300">{agentError}</p> : null}

                <div className="rounded-md border border-white/10 bg-[#111] p-3 space-y-2">
                  <div className="text-xs text-gray-400">快照列表（按更新时间倒序）</div>

                  {agentSnapshotLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 size={14} className="animate-spin" />
                      <span>加载中...</span>
                    </div>
                  ) : agentSnapshots.length === 0 ? (
                    <div className="text-xs text-gray-500">暂无快照，请输入 taskId 后查询。</div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {agentSnapshots.map((snapshot) => (
                        <div key={snapshot.id} className="rounded border border-white/10 bg-[#1a1a1a] p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-gray-300 font-medium">{snapshot.id}</span>
                            <span className={SNAPSHOT_STATUS_CLASS[snapshot.status]}>{snapshot.status}</span>
                            <span className="text-gray-500">nodes: {snapshot.nodeCount}</span>
                            <span className="text-gray-500">steps: {snapshot.executionOrder.length}</span>
                          </div>
                          <div className="mt-1 text-gray-500 break-all">
                            task: {snapshot.taskId} · graph: {snapshot.graphId}
                          </div>
                          <div className="mt-1 text-gray-500">
                            updated: {formatTime(snapshot.updatedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

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
