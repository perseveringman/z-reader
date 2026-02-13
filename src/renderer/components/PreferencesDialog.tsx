import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Save, Podcast, HardDrive, Database, RefreshCw, Trash2, AlertTriangle, PlayCircle, Compass } from 'lucide-react';
import { useToast } from './Toast';
import type { AgentGraphSnapshotItem, AgentResumeMode, AgentResumePreviewResult, AppSettings } from '../../shared/types';
import {
  aggregateResumeAuditByTask,
  buildResumeAuditReport,
  detectResumeAuditAlerts,
  extractResumeAuditEntries,
  filterResumeAuditEntries,
  getResumeAuditPresetFilter,
  listResumeAuditTaskIds,
  removeResumeAuditCustomPreset,
  sanitizeResumeAuditCustomPresets,
  sanitizeResumeAuditPresetName,
  upsertResumeAuditCustomPreset,
  normalizeTaskIdsInput,
  sanitizeResumeAuditFilter,
  selectPrimaryTaskId,
  summarizeResumeAuditEntries,
  type ResumeAuditCustomPreset,
  type ResumeAuditEntry,
  type ResumeAuditModeFilter,
  type ResolvedResumeAuditFilter,
  type ResumeAuditPreset,
  type ResumeAuditStatusFilter,
  type ResumeAuditTaskFilter,
} from '../utils/agent-resume-audit';

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

const RISK_LEVEL_CLASS: Record<NonNullable<AgentResumePreviewResult['riskLevel']>, string> = {
  low: 'text-green-300',
  medium: 'text-yellow-300',
  high: 'text-red-300',
  critical: 'text-red-300',
};

const ALERT_LEVEL_CLASS = {
  info: 'text-sky-300',
  warning: 'text-yellow-300',
  critical: 'text-red-300',
} as const;

const RESUME_AUDIT_FILTER_STORAGE_KEY = 'z-reader-agent-resume-audit-filter';
const RESUME_AUDIT_CUSTOM_PRESETS_STORAGE_KEY = 'z-reader-agent-resume-audit-custom-presets';

const DEFAULT_RESUME_AUDIT_FILTER: ResolvedResumeAuditFilter = {
  mode: 'all',
  status: 'all',
  taskId: 'all',
};

function readPersistedResumeAuditFilter(): ResolvedResumeAuditFilter {
  try {
    const raw = localStorage.getItem(RESUME_AUDIT_FILTER_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_RESUME_AUDIT_FILTER;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return sanitizeResumeAuditFilter({
      mode: parsed.mode as ResumeAuditModeFilter | undefined,
      status: parsed.status as ResumeAuditStatusFilter | undefined,
      taskId: parsed.taskId as ResumeAuditTaskFilter | undefined,
    });
  } catch {
    return DEFAULT_RESUME_AUDIT_FILTER;
  }
}

function persistResumeAuditFilter(filter: ResolvedResumeAuditFilter): void {
  try {
    localStorage.setItem(RESUME_AUDIT_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {
    return;
  }
}

function readPersistedResumeAuditCustomPresets(): ResumeAuditCustomPreset[] {
  try {
    const raw = localStorage.getItem(RESUME_AUDIT_CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return sanitizeResumeAuditCustomPresets(parsed);
  } catch {
    return [];
  }
}

function persistResumeAuditCustomPresets(presets: ResumeAuditCustomPreset[]): void {
  try {
    localStorage.setItem(RESUME_AUDIT_CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    return;
  }
}

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

  const [resumeSnapshotId, setResumeSnapshotId] = useState('');
  const [resumeMode, setResumeMode] = useState<AgentResumeMode>('safe');
  const [resumePreview, setResumePreview] = useState<AgentResumePreviewResult | null>(null);
  const [resumePreviewLoading, setResumePreviewLoading] = useState(false);
  const [resumeExecuting, setResumeExecuting] = useState(false);
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  const [delegateSpecialists, setDelegateSpecialists] = useState<string[]>([]);
  const [delegateSpecialistsLoading, setDelegateSpecialistsLoading] = useState(false);
  const [resumeAuditEntries, setResumeAuditEntries] = useState<ResumeAuditEntry[]>([]);
  const [resumeAuditLoading, setResumeAuditLoading] = useState(false);
  const [auditModeFilter, setAuditModeFilter] = useState<ResumeAuditModeFilter>('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState<ResumeAuditStatusFilter>('all');
  const [auditTaskFilter, setAuditTaskFilter] = useState<ResumeAuditTaskFilter>('all');
  const [customAuditPresets, setCustomAuditPresets] = useState<ResumeAuditCustomPreset[]>([]);
  const [customAuditPresetName, setCustomAuditPresetName] = useState('');

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
      setResumeSnapshotId('');
      setResumeMode('safe');
      setResumePreview(null);
      setResumeConfirmed(false);
      setDelegateSpecialists([]);
      setResumeAuditEntries([]);
      const persistedFilter = readPersistedResumeAuditFilter();
      setAuditModeFilter(persistedFilter.mode);
      setAuditStatusFilter(persistedFilter.status);
      setAuditTaskFilter(persistedFilter.taskId);
      setCustomAuditPresets(readPersistedResumeAuditCustomPresets());
      setCustomAuditPresetName('');

      window.electronAPI
        .settingsGet()
        .then((s) => setSettings(s))
        .catch((err) => console.error('Failed to load settings:', err))
        .finally(() => setLoading(false));

      setDelegateSpecialistsLoading(true);
      window.electronAPI
        .agentResumeSpecialistsList()
        .then((list) => setDelegateSpecialists(list))
        .catch((err) => {
          console.error('Failed to load resume specialists list:', err);
          setDelegateSpecialists([]);
        })
        .finally(() => setDelegateSpecialistsLoading(false));
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

    persistResumeAuditFilter(
      sanitizeResumeAuditFilter({
        mode: auditModeFilter,
        status: auditStatusFilter,
        taskId: auditTaskFilter,
      }),
    );
  }, [open, auditModeFilter, auditStatusFilter, auditTaskFilter]);

  useEffect(() => {
    if (!open) return;

    persistResumeAuditCustomPresets(customAuditPresets);
  }, [open, customAuditPresets]);

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

  const loadSnapshots = async (taskInput: string = agentTaskId) => {
    const selection = selectPrimaryTaskId(taskInput);
    if (!selection.taskId) {
      setAgentSnapshots([]);
      setAgentError('请输入 taskId 后再查询快照');
      return;
    }

    const taskId = selection.taskId;
    if (selection.hasMultiple) {
      showToast('快照查询仅支持单 taskId，已使用第一个：' + taskId);
    }

    setAgentSnapshotLoading(true);
    setAgentError(null);

    try {
      const snapshots = await window.electronAPI.agentSnapshotList({ taskId });
      setAgentSnapshots(snapshots);

      if (snapshots.length > 0) {
        setResumeSnapshotId((current) => current || snapshots[0].id);
      } else {
        setResumeSnapshotId('');
      }

      setResumePreview(null);
      setResumeConfirmed(false);
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

  const loadResumePreview = async () => {
    const snapshotId = resumeSnapshotId.trim();
    if (!snapshotId) {
      setAgentError('请先选择快照再执行恢复预检');
      return;
    }

    setResumePreviewLoading(true);
    setAgentError(null);

    try {
      const preview = await window.electronAPI.agentResumePreview({ snapshotId, mode: resumeMode });
      setResumePreview(preview);
      setResumeConfirmed(false);
    } catch (err) {
      console.error('Failed to preview snapshot resume:', err);
      setAgentError('恢复预检失败，请稍后重试');
      setResumePreview(null);
    } finally {
      setResumePreviewLoading(false);
    }
  };

  const loadResumeAudit = async (taskInput: string = agentTaskId) => {
    const taskIds = normalizeTaskIdsInput(taskInput);
    if (taskIds.length === 0) {
      setResumeAuditEntries([]);
      setAgentError('请输入 taskId 后再加载恢复审计');
      return;
    }

    setResumeAuditLoading(true);
    setAgentError(null);

    try {
      const settled = await Promise.allSettled(taskIds.map((taskId) => window.electronAPI.agentReplayGet(taskId)));
      const entries: ResumeAuditEntry[] = [];
      const failedTaskIds: string[] = [];

      settled.forEach((item, index) => {
        if (item.status === 'fulfilled') {
          entries.push(...extractResumeAuditEntries(item.value.events));
        } else {
          failedTaskIds.push(taskIds[index]);
          console.error('Failed to load resume audit for task:', taskIds[index], item.reason);
        }
      });

      entries.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
      setResumeAuditEntries(entries);

      if (failedTaskIds.length > 0) {
        setAgentError('部分 task 审计加载失败：' + failedTaskIds.join(', '));
      }
    } catch (err) {
      console.error('Failed to load resume audit:', err);
      setResumeAuditEntries([]);
      setAgentError('恢复审计加载失败，请稍后重试');
    } finally {
      setResumeAuditLoading(false);
    }
  };

  const drillDownTaskFromRank = async (taskId: string) => {
    setAgentTaskId(taskId);
    setAuditTaskFilter(taskId);
    await loadSnapshots(taskId);
    await loadResumeAudit(taskId);
    showToast('已定位到任务：' + taskId);
  };

  const executeResume = async () => {
    const snapshotId = resumeSnapshotId.trim();
    if (!snapshotId) {
      setAgentError('请先选择快照再执行恢复');
      return;
    }

    if (resumeMode === 'delegate' && delegateSpecialists.length === 0) {
      setAgentError('delegate 模式当前无可用 specialist，请先完成主进程注册');
      return;
    }

    const requiresConfirm = resumePreview?.requiresConfirmation ?? false;
    if (requiresConfirm && !resumeConfirmed) {
      setAgentError('当前恢复模式需要人工确认');
      return;
    }

    setResumeExecuting(true);
    setAgentError(null);

    try {
      const result = await window.electronAPI.agentResumeExecute({
        snapshotId,
        mode: resumeMode,
        confirmed: resumeConfirmed,
      });

      if (!result.success) {
        setAgentError(result.message);
        showToast('恢复执行失败');
        return;
      }

      showToast('恢复执行完成');
      if (result.replayTaskId) {
        showToast(`可通过任务 ${result.replayTaskId} 查看回放`);
      }

      await loadResumePreview();
      if (agentTaskId.trim()) {
        await loadSnapshots();
        await loadResumeAudit();
      }
    } catch (err) {
      console.error('Failed to execute snapshot resume:', err);
      setAgentError('恢复执行失败，请稍后重试');
      showToast('恢复执行失败');
    } finally {
      setResumeExecuting(false);
    }
  };

  const filteredResumeAuditEntries = useMemo(() => {
    return filterResumeAuditEntries(resumeAuditEntries, {
      mode: auditModeFilter,
      status: auditStatusFilter,
      taskId: auditTaskFilter,
    });
  }, [resumeAuditEntries, auditModeFilter, auditStatusFilter, auditTaskFilter]);

  const resumeAuditSummary = useMemo(() => {
    return summarizeResumeAuditEntries(filteredResumeAuditEntries);
  }, [filteredResumeAuditEntries]);

  const resumeAuditTaskCount = useMemo(() => {
    return new Set(filteredResumeAuditEntries.map((entry) => entry.taskId)).size;
  }, [filteredResumeAuditEntries]);

  const resumeAuditAlerts = useMemo(() => {
    return detectResumeAuditAlerts(filteredResumeAuditEntries, resumeAuditSummary);
  }, [filteredResumeAuditEntries, resumeAuditSummary]);

  const resumeAuditTaskAggregates = useMemo(() => {
    return aggregateResumeAuditByTask(filteredResumeAuditEntries);
  }, [filteredResumeAuditEntries]);

  const resumeAuditTaskOptions = useMemo(() => {
    return listResumeAuditTaskIds(resumeAuditEntries);
  }, [resumeAuditEntries]);

  const applyAuditPreset = (preset: ResumeAuditPreset) => {
    const filter = getResumeAuditPresetFilter(preset);
    setAuditModeFilter(filter.mode ?? 'all');
    setAuditStatusFilter(filter.status ?? 'all');
    setAuditTaskFilter(filter.taskId ?? 'all');
  };

  const applyCustomAuditPreset = (preset: ResumeAuditCustomPreset) => {
    const filter = sanitizeResumeAuditFilter(preset.filter);
    setAuditModeFilter(filter.mode);
    setAuditStatusFilter(filter.status);
    setAuditTaskFilter(filter.taskId);
    showToast('已应用预设：' + preset.name);
  };

  const handleSaveCustomAuditPreset = () => {
    const presetName = sanitizeResumeAuditPresetName(customAuditPresetName);
    if (!presetName) {
      showToast('请输入预设名称');
      return;
    }

    setCustomAuditPresets((current) =>
      upsertResumeAuditCustomPreset(current, {
        name: presetName,
        filter: {
          mode: auditModeFilter,
          status: auditStatusFilter,
          taskId: auditTaskFilter,
        },
      }),
    );
    setCustomAuditPresetName('');
    showToast('预设已保存：' + presetName);
  };

  const handleRemoveCustomAuditPreset = (presetId: string) => {
    setCustomAuditPresets((current) => removeResumeAuditCustomPreset(current, presetId));
    showToast('预设已删除');
  };

  const handleCopyResumeAuditSummary = async () => {
    if (filteredResumeAuditEntries.length === 0) {
      showToast('暂无可复制的审计数据');
      return;
    }

    try {
      const report = buildResumeAuditReport(filteredResumeAuditEntries, resumeAuditSummary, resumeAuditAlerts);
      await navigator.clipboard.writeText(report);
      showToast('恢复审计摘要已复制');
    } catch (err) {
      console.error('Failed to copy resume audit report:', err);
      showToast('复制审计摘要失败');
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
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  <div className="md:col-span-3">
                    <label htmlFor="agent-task-id" className="block text-xs font-medium text-gray-400 mb-1.5">
                      Task ID(s)
                    </label>
                    <input
                      id="agent-task-id"
                      type="text"
                      value={agentTaskId}
                      onChange={(e) => setAgentTaskId(e.target.value)}
                      placeholder="输入 taskId（审计支持逗号或空白分隔多个）"
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
                  <div className="flex items-end">
                    <button
                      onClick={loadResumeAudit}
                      disabled={resumeAuditLoading}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors"
                    >
                      {resumeAuditLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      <span>加载审计</span>
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
                        <button
                          key={snapshot.id}
                          type="button"
                          onClick={() => {
                            setResumeSnapshotId(snapshot.id);
                            setResumePreview(null);
                            setResumeConfirmed(false);
                          }}
                          className={`w-full rounded border p-2 text-left text-xs transition-colors ${
                            resumeSnapshotId === snapshot.id
                              ? 'border-purple-400 bg-purple-500/10'
                              : 'border-white/10 bg-[#1a1a1a] hover:border-white/20'
                          }`}
                        >
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
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-white/10 bg-[#111] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-400 break-all">
                        当前恢复快照：{resumeSnapshotId || '未选择'}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-gray-500" htmlFor="resume-mode">恢复模式</label>
                        <select
                          id="resume-mode"
                          value={resumeMode}
                          onChange={(e) => setResumeMode(e.target.value === 'delegate' ? 'delegate' : 'safe')}
                          className="px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="safe">safe（无副作用）</option>
                          <option value="delegate">delegate（真实执行器）</option>
                        </select>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        delegate 执行器：
                        {delegateSpecialistsLoading ? (
                          <span className="text-gray-400 ml-1">加载中...</span>
                        ) : delegateSpecialists.length === 0 ? (
                          <span className="text-red-300 ml-1">未注册</span>
                        ) : (
                          <span className="text-green-300 ml-1">{delegateSpecialists.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={loadResumePreview}
                        disabled={!resumeSnapshotId || resumePreviewLoading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs"
                      >
                        {resumePreviewLoading ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                        <span>恢复预检</span>
                      </button>
                      <button
                        onClick={executeResume}
                        disabled={!resumeSnapshotId || resumeExecuting}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs"
                      >
                        {resumeExecuting ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                        <span>执行恢复</span>
                      </button>
                    </div>
                  </div>

                  {resumePreview ? (
                    <div className="text-xs space-y-1">
                      <div className="text-gray-400">
                        模式：
                        <span className="text-indigo-300 ml-1">{resumePreview.mode}</span>
                      </div>
                      <div className="text-gray-400">
                        可恢复：
                        <span className={resumePreview.canResume ? 'text-green-300 ml-1' : 'text-red-300 ml-1'}>
                          {String(resumePreview.canResume)}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        风险等级：
                        <span className={`${RISK_LEVEL_CLASS[resumePreview.riskLevel]} ml-1`}>{resumePreview.riskLevel}</span>
                      </div>
                      <div className="text-gray-500 break-all">
                        pending: {resumePreview.pendingNodeIds.join(', ') || '(none)'}
                      </div>
                      <div className="text-gray-500 break-all">
                        failed: {resumePreview.failedNodeIds.join(', ') || '(none)'}
                      </div>
                      <div className="text-gray-400">
                        需要确认：
                        <span className={resumePreview.requiresConfirmation ? 'text-yellow-300 ml-1' : 'text-green-300 ml-1'}>
                          {String(resumePreview.requiresConfirmation)}
                        </span>
                      </div>
                      {resumePreview.reason ? <div className="text-red-300">{resumePreview.reason}</div> : null}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">可先执行“恢复预检”查看风险与可恢复性。</div>
                  )}

                  {resumePreview?.requiresConfirmation && resumePreview.canResume ? (
                    <label className="flex items-center gap-2 text-xs text-yellow-200">
                      <input
                        type="checkbox"
                        checked={resumeConfirmed}
                        onChange={(e) => setResumeConfirmed(e.target.checked)}
                        className="accent-yellow-500"
                      />
                      <span>我已确认当前恢复模式可能触发真实执行器副作用</span>
                    </label>
                  ) : null}
                </div>

                <div className="rounded-md border border-white/10 bg-[#111] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-400">恢复审计（最近）</div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-gray-500">{filteredResumeAuditEntries.length}/{resumeAuditEntries.length} 条</div>
                      <button
                        onClick={handleCopyResumeAuditSummary}
                        disabled={filteredResumeAuditEntries.length === 0}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-[11px] text-white"
                      >
                        复制摘要
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-gray-500">预设</span>
                    <button
                      type="button"
                      onClick={() => applyAuditPreset('all')}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      all
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAuditPreset('failed')}
                      className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
                    >
                      失败优先
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAuditPreset('delegate')}
                      className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white"
                    >
                      delegate
                    </button>
                  </div>

                  <div className="rounded border border-white/10 bg-[#141414] p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={customAuditPresetName}
                        onChange={(e) => setCustomAuditPresetName(e.target.value)}
                        placeholder="保存当前筛选为预设（最多30字）"
                        className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCustomAuditPreset}
                        className="px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-[11px] text-white"
                      >
                        保存视图
                      </button>
                    </div>

                    {customAuditPresets.length === 0 ? (
                      <div className="text-[11px] text-gray-500">暂无自定义预设。</div>
                    ) : (
                      <div className="space-y-1">
                        {customAuditPresets.map((preset) => (
                          <div key={preset.id} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => applyCustomAuditPreset(preset)}
                              className="flex-1 text-left px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-white"
                            >
                              {preset.name}
                              <span className="ml-1 text-gray-300">({preset.filter.mode}/{preset.filter.status}/{preset.filter.taskId})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomAuditPreset(preset.id)}
                              className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px] text-white"
                              aria-label="删除预设"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <label className="text-gray-400 flex items-center gap-2">
                      <span className="w-14">模式</span>
                      <select
                        value={auditModeFilter}
                        onChange={(e) => setAuditModeFilter((e.target.value as ResumeAuditModeFilter) || 'all')}
                        className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">all</option>
                        <option value="safe">safe</option>
                        <option value="delegate">delegate</option>
                      </select>
                    </label>
                    <label className="text-gray-400 flex items-center gap-2">
                      <span className="w-14">状态</span>
                      <select
                        value={auditStatusFilter}
                        onChange={(e) => setAuditStatusFilter((e.target.value as ResumeAuditStatusFilter) || 'all')}
                        className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">all</option>
                        <option value="succeeded">succeeded</option>
                        <option value="failed">failed</option>
                        <option value="running">running</option>
                        <option value="canceled">canceled</option>
                      </select>
                    </label>
                    <label className="text-gray-400 flex items-center gap-2">
                      <span className="w-14">任务</span>
                      <select
                        value={auditTaskFilter}
                        onChange={(e) => setAuditTaskFilter((e.target.value as ResumeAuditTaskFilter) || 'all')}
                        className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">all</option>
                        {resumeAuditTaskOptions.map((taskId) => (
                          <option key={taskId} value={taskId}>{taskId}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="text-[11px] text-gray-500 break-all">
                    tasks: {resumeAuditTaskCount} · total: {resumeAuditSummary.total} · successRate: {(resumeAuditSummary.successRate * 100).toFixed(1)}% · sideEffectRate: {(resumeAuditSummary.sideEffectRate * 100).toFixed(1)}% · avgHitRate: {(resumeAuditSummary.avgHitRate * 100).toFixed(1)}% · topMissing: {resumeAuditSummary.topMissingAgents.join(', ') || '(none)'}
                  </div>

                  {resumeAuditAlerts.length > 0 ? (
                    <div className="rounded border border-white/10 bg-[#141414] p-2 space-y-1">
                      {resumeAuditAlerts.map((alert) => (
                        <div key={alert.id} className="text-[11px] leading-relaxed">
                          <span className={ALERT_LEVEL_CLASS[alert.level]}>[{alert.level}] {alert.title}</span>
                          <span className="text-gray-500 ml-1">{alert.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-emerald-300">当前未检测到异常告警。</div>
                  )}

                  <div className="rounded border border-white/10 bg-[#141414] p-2 space-y-1">
                    <div className="text-[11px] text-gray-400">Task 风险排行（Top 5）</div>
                    {resumeAuditTaskAggregates.length === 0 ? (
                      <div className="text-[11px] text-gray-500">暂无 task 聚合数据。</div>
                    ) : (
                      resumeAuditTaskAggregates.slice(0, 5).map((item) => (
                        <button
                          key={item.taskId}
                          type="button"
                          onClick={() => {
                            void drillDownTaskFromRank(item.taskId);
                          }}
                          className="w-full text-left rounded border border-white/10 bg-[#1a1a1a] px-2 py-1 text-[11px] text-gray-500 break-all hover:border-sky-500/50"
                        >
                          <span className="text-sky-300">{item.taskId}</span>
                          <span className="ml-1">f={item.failed} · success={(item.successRate * 100).toFixed(1)}% · hit={(item.avgHitRate * 100).toFixed(1)}%</span>
                        </button>
                      ))
                    )}
                  </div>

                  {resumeAuditLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 size={12} className="animate-spin" />
                      <span>加载中...</span>
                    </div>
                  ) : filteredResumeAuditEntries.length === 0 ? (
                    <div className="text-xs text-gray-500">暂无符合筛选条件的恢复审计，输入 taskId 后点击“加载审计”。</div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {filteredResumeAuditEntries.slice(0, 8).map((entry) => (
                        <div key={entry.id} className="rounded border border-white/10 bg-[#1a1a1a] p-2 text-[11px] space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-gray-300">{entry.mode}</span>
                            <span className={entry.status === 'succeeded' ? 'text-green-300' : entry.status === 'failed' ? 'text-red-300' : 'text-yellow-300'}>{entry.status}</span>
                            <span className="text-gray-500">risk: {entry.riskLevel}</span>
                            <span className={entry.sideEffectFlag ? 'text-amber-300' : 'text-emerald-300'}>{entry.sideEffectFlag ? 'side-effect' : 'no-side-effect'}</span>
                          </div>
                          <div className="text-gray-500">
                            hitRate: {entry.specialistHitRate.toFixed(2)} · hit/miss: {entry.specialistHitCount}/{entry.specialistMissCount}
                          </div>
                          <div className="text-gray-500 break-all">
                            missing: {entry.missingAgents.join(', ') || '(none)'}
                          </div>
                          <div className="text-gray-600">{formatTime(entry.occurredAt)}</div>
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
