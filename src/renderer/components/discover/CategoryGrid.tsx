import type { RSSHubCategory } from '../../../shared/types';
import {
  Globe, Tv, Newspaper, BookOpen, GraduationCap, Code,
  ShoppingCart, Gamepad2, Music, Camera, MessageSquare,
  TrendingUp, Users, Layers,
} from 'lucide-react';

interface CategoryGridProps {
  categories: RSSHubCategory[];
  onSelect: (category: string) => void;
}

// 分类图标映射
const categoryIcons: Record<string, React.ReactNode> = {
  social: <Users size={20} />,
  'social-media': <Users size={20} />,
  traditional: <Newspaper size={20} />,
  'traditional-media': <Newspaper size={20} />,
  new: <TrendingUp size={20} />,
  'new-media': <TrendingUp size={20} />,
  multimedia: <Tv size={20} />,
  blog: <BookOpen size={20} />,
  programming: <Code size={20} />,
  university: <GraduationCap size={20} />,
  shopping: <ShoppingCart size={20} />,
  gaming: <Gamepad2 size={20} />,
  game: <Gamepad2 size={20} />,
  music: <Music size={20} />,
  picture: <Camera size={20} />,
  forum: <MessageSquare size={20} />,
  bbs: <MessageSquare size={20} />,
  finance: <TrendingUp size={20} />,
  travel: <Globe size={20} />,
  design: <Layers size={20} />,
  live: <Tv size={20} />,
};

function getCategoryIcon(name: string): React.ReactNode {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(categoryIcons)) {
    if (lower.includes(key)) return icon;
  }
  return <Globe size={20} />;
}

export function CategoryGrid({ categories, onSelect }: CategoryGridProps) {
  if (categories.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500">暂无分类数据</p>
        <p className="text-xs text-gray-600 mt-1">请检查 RSSHub 实例是否可访问</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 mb-4">浏览分类</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => onSelect(cat.name)}
            className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[#111] border border-white/5 hover:border-white/15 hover:bg-[#161616] transition-all cursor-pointer group"
          >
            <div className="text-gray-500 group-hover:text-gray-300 transition-colors">
              {getCategoryIcon(cat.name)}
            </div>
            <div className="text-sm text-gray-300 group-hover:text-white transition-colors text-center">
              {cat.name}
            </div>
            <div className="text-[10px] text-gray-600">
              {cat.count} 个路由
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
