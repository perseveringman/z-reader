import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmCardProps {
  toolName: string;
  preview: string;
  confirmId: string;
  onConfirm: (confirmId: string, trust: boolean) => void;
  onCancel: (confirmId: string) => void;
}

export function ConfirmCard({ toolName, preview, confirmId, onConfirm, onCancel }: ConfirmCardProps) {
  const [trust, setTrust] = useState(false);

  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
      {/* 警告头部 */}
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">操作确认</span>
      </div>

      {/* 操作信息 */}
      <div className="space-y-1">
        <div className="text-xs text-gray-400">
          工具: <span className="text-gray-300">{toolName}</span>
        </div>
        <p className="text-sm text-gray-200 leading-relaxed">{preview}</p>
      </div>

      {/* 信任选项 */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={trust}
          onChange={(e) => setTrust(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-blue-500"
        />
        <span className="text-xs text-gray-400">下次不再询问</span>
      </label>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onConfirm(confirmId, trust)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 hover:bg-green-500 
                     text-white transition-colors"
        >
          确认
        </button>
        <button
          onClick={() => onCancel(confirmId)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/10 hover:bg-white/15 
                     text-gray-300 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
