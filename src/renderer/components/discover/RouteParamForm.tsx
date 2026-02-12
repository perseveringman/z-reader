import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface RouteParamFormProps {
  namespace: string;
  route: {
    path: string;
    name: string;
    example?: string;
    parameters?: Record<string, string>;
  };
  onSubmit: (feedPath: string) => void;
  onCancel: () => void;
}

interface ParamDef {
  name: string;
  description: string;
  optional: boolean;
}

function parsePathParams(path: string, parameters?: Record<string, string>): ParamDef[] {
  const params: ParamDef[] = [];
  const regex = /:(\w+\??)/g;
  let match;

  while ((match = regex.exec(path)) !== null) {
    const raw = match[1];
    const optional = raw.endsWith('?');
    const name = optional ? raw.slice(0, -1) : raw;
    const description = parameters?.[name] || '';

    params.push({ name, description, optional });
  }

  return params;
}

function buildPath(pathTemplate: string, values: Record<string, string>): string {
  let result = pathTemplate;
  for (const [key, value] of Object.entries(values)) {
    // 替换 :param 或 :param?
    result = result.replace(new RegExp(`:${key}\\??`, 'g'), value);
  }
  // 移除未填写的可选参数
  result = result.replace(/\/:[^/]+\?/g, '');
  // 清理多余的斜杠
  result = result.replace(/\/+/g, '/').replace(/\/$/, '');
  return result;
}

export function RouteParamForm({ namespace, route, onSubmit, onCancel }: RouteParamFormProps) {
  const params = parsePathParams(route.path, route.parameters);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    // 验证必填参数
    for (const param of params) {
      if (!param.optional && !values[param.name]?.trim()) {
        return;
      }
    }

    setLoading(true);
    const feedPath = buildPath(route.path, values);
    onSubmit(feedPath);
    setLoading(false);
  }, [params, values, route.path, onSubmit]);

  const canSubmit = params
    .filter(p => !p.optional)
    .every(p => values[p.name]?.trim());

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-white">{route.name}</h3>
        <p className="text-sm text-gray-500 mt-1">{namespace}</p>
        {route.example && (
          <p className="text-xs text-gray-600 mt-2 font-mono">
            示例路径: {route.example}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {params.map((param) => (
          <div key={param.name}>
            <label className="block text-sm text-gray-300 mb-1.5">
              {param.name}
              {param.optional && (
                <span className="text-gray-600 ml-1">(选填)</span>
              )}
            </label>
            {param.description && (
              <p className="text-xs text-gray-600 mb-1.5">{param.description}</p>
            )}
            <input
              type="text"
              value={values[param.name] || ''}
              onChange={(e) => handleChange(param.name, e.target.value)}
              placeholder={param.name}
              className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors cursor-pointer"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : '预览订阅'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-transparent hover:bg-white/5 text-gray-400 text-sm rounded-md transition-colors cursor-pointer"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
