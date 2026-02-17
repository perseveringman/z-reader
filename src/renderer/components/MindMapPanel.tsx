import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { AIMindmapRecord } from '../../shared/types';

interface MindMapPanelProps {
  articleId: string;
  generateSignal?: number;
}

type MarkmapRuntime = {
  Transformer: new () => {
    transform: (markdown: string) => { root: unknown };
  };
  Markmap: {
    create: (
      svg: SVGSVGElement,
      options: Record<string, unknown>,
      root: unknown,
    ) => {
      fit?: () => void;
      destroy?: () => void;
    };
  };
};

let markmapRuntimePromise: Promise<MarkmapRuntime> | null = null;

function dynamicImportModule(specifier: string): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ specifier);
}

async function loadMarkmapRuntime(): Promise<MarkmapRuntime> {
  if (markmapRuntimePromise) return markmapRuntimePromise;

  markmapRuntimePromise = (async () => {
    try {
      const [lib, view] = await Promise.all([
        dynamicImportModule('markmap-lib'),
        dynamicImportModule('markmap-view'),
      ]);
      if (lib.Transformer && view.Markmap) {
        return {
          Transformer: lib.Transformer as MarkmapRuntime['Transformer'],
          Markmap: view.Markmap as MarkmapRuntime['Markmap'],
        };
      }
      throw new Error('Invalid local markmap modules');
    } catch {
      const [lib, view] = await Promise.all([
        dynamicImportModule('https://esm.sh/markmap-lib@0.18.10'),
        dynamicImportModule('https://esm.sh/markmap-view@0.18.10'),
      ]);
      return {
        Transformer: lib.Transformer as MarkmapRuntime['Transformer'],
        Markmap: view.Markmap as MarkmapRuntime['Markmap'],
      };
    }
  })();

  return markmapRuntimePromise;
}

function sourceTypeLabel(sourceType: AIMindmapRecord['sourceType']): string {
  if (sourceType === 'transcript') return '转写';
  if (sourceType === 'summary') return '摘要';
  return '正文';
}

export function MindMapPanel({ articleId, generateSignal }: MindMapPanelProps) {
  const [mindmap, setMindmap] = useState<AIMindmapRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const markmapInstanceRef = useRef<{ fit?: () => void; destroy?: () => void } | null>(null);
  const triggerRef = useRef<number | undefined>(generateSignal);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLatestMindmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latest = await window.electronAPI.aiMindmapGet(articleId);
      setMindmap(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const next = await window.electronAPI.aiMindmapGenerate({ articleId });
      setMindmap(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [articleId]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!mindmap?.mindmapMarkdown) return;
    try {
      await navigator.clipboard.writeText(mindmap.mindmapMarkdown);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [mindmap?.mindmapMarkdown]);

  const renderMindmap = useCallback(async (markdown: string) => {
    const svg = svgRef.current;
    if (!svg) return;

    try {
      setRenderError(null);
      const runtime = await loadMarkmapRuntime();
      const transformer = new runtime.Transformer();
      const transformed = transformer.transform(markdown);

      if (markmapInstanceRef.current?.destroy) {
        markmapInstanceRef.current.destroy();
      }
      svg.innerHTML = '';
      const instance = runtime.Markmap.create(
        svg,
        {
          autoFit: true,
          duration: 300,
          maxWidth: 260,
          pan: true,
          zoom: true,
        },
        transformed.root,
      );
      markmapInstanceRef.current = instance;
      if (instance.fit) instance.fit();
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadLatestMindmap();
  }, [loadLatestMindmap]);

  useEffect(() => {
    if (mindmap?.mindmapMarkdown) {
      void renderMindmap(mindmap.mindmapMarkdown);
    }
  }, [mindmap?.mindmapMarkdown, renderMindmap]);

  useEffect(() => {
    if (generateSignal == null || triggerRef.current === generateSignal) return;
    triggerRef.current = generateSignal;
    void handleGenerate();
  }, [generateSignal, handleGenerate]);

  useEffect(() => () => {
    if (markmapInstanceRef.current?.destroy) {
      markmapInstanceRef.current.destroy();
    }
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        加载思维导图...
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          {mindmap && (
            <span className="px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">
              来源: {sourceTypeLabel(mindmap.sourceType)}
            </span>
          )}
          {mindmap && (
            <span className="text-gray-500">
              更新于 {new Date(mindmap.updatedAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mindmap && (
            <button
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? '已复制' : '复制 Markdown'}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {mindmap ? '重新生成' : '生成思维导图'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!mindmap ? (
        <div className="flex-1 min-h-0 flex items-center justify-center px-8">
          <div className="text-center text-gray-500">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm text-gray-400">点击右上角按钮生成思维导图</p>
            <p className="mt-1 text-xs text-gray-600">支持文章正文、视频转写、播客转写内容</p>
          </div>
        </div>
      ) : renderError ? (
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="text-xs text-red-300 mb-2">导图渲染失败: {renderError}</div>
          <pre className="text-[12px] leading-[1.5] text-gray-300 bg-[#111] border border-white/10 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
            {mindmap.mindmapMarkdown}
          </pre>
        </div>
      ) : (
        <div className="mindmap-dark flex-1 min-h-0 bg-[#101010]">
          <svg ref={svgRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
