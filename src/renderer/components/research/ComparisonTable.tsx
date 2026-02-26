import React from 'react';

interface ComparisonData {
  dimensions: string[];
  items: Array<{ name: string; values: Record<string, string> }>;
}

interface ComparisonTableProps {
  data: ComparisonData;
}

export function ComparisonTable({ data }: ComparisonTableProps) {
  if (!data.dimensions || !data.items || data.items.length === 0) {
    return <p className="text-gray-500 text-sm">对比数据为空</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 border-b border-white/10 text-gray-400 font-medium sticky left-0 bg-[#1a1a1a]">
              维度
            </th>
            {data.items.map(item => (
              <th key={item.name} className="text-left px-3 py-2 border-b border-white/10 text-gray-300 font-medium min-w-[150px]">
                {item.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.dimensions.map(dim => (
            <tr key={dim} className="hover:bg-white/5">
              <td className="px-3 py-2 border-b border-white/5 text-gray-400 sticky left-0 bg-[#1a1a1a]">
                {dim}
              </td>
              {data.items.map(item => (
                <td key={item.name} className="px-3 py-2 border-b border-white/5 text-gray-300">
                  {item.values[dim] || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
