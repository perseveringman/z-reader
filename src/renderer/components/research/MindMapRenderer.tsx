import { useEffect, useRef, useState } from 'react';

interface MindMapRendererProps {
  markdown: string;
  className?: string;
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

export function MindMapRenderer({ markdown, className }: MindMapRendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const instanceRef = useRef<{ fit?: () => void; destroy?: () => void } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!markdown) return;

    let cancelled = false;

    (async () => {
      const svg = svgRef.current;
      if (!svg) return;

      try {
        setRenderError(null);
        const runtime = await loadMarkmapRuntime();
        if (cancelled) return;

        const transformer = new runtime.Transformer();
        const { root } = transformer.transform(markdown);

        if (instanceRef.current?.destroy) {
          instanceRef.current.destroy();
        }
        svg.innerHTML = '';

        const instance = runtime.Markmap.create(
          svg,
          { autoFit: true, duration: 300, maxWidth: 260 },
          root,
        );
        instanceRef.current = instance;
        if (instance.fit) instance.fit();
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markdown]);

  useEffect(() => {
    return () => {
      if (instanceRef.current?.destroy) {
        instanceRef.current.destroy();
      }
    };
  }, []);

  if (renderError) {
    return (
      <div className={className}>
        <div className="text-xs text-red-300 mb-2">思维导图渲染失败: {renderError}</div>
        <pre className="text-[12px] leading-[1.5] text-gray-300 bg-[#111] border border-white/10 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
          {markdown}
        </pre>
      </div>
    );
  }

  return (
    <div className={`mindmap-dark bg-[#101010] ${className ?? ''}`}>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
