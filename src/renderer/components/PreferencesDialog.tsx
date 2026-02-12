import { useState, useEffect } from 'react';
import { X, Loader2, Save, Podcast, HardDrive, Compass, Database, RefreshCw, Trash2, AlertTriangle, PlayCircle } from 'lucide-react';
import { useToast } from './Toast';
import type { AgentGraphSnapshotItem, AgentResumeMode, AgentResumePreviewResult, AppSettings } from '../../shared/types';

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
      }
    } catch (err) {
      console.error('Failed to execute snapshot resume:', err);
      setAgentError('恢复执行失败，请稍后重试');
      showToast('恢复执行失败');
    } finally {
      setResumeExecuting(false);
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
