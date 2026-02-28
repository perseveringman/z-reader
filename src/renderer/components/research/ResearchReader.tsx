import type { ContentType } from '../reader/ReaderRegistry';
import { getReader } from '../reader/ReaderRegistry';

// 确保 article reader 已注册
import '../reader/ArticleReaderCore';

interface ResearchReaderProps {
  contentType: ContentType;
  contentId: string;
  onClose: () => void;
}

export function ResearchReader({ contentType, contentId, onClose }: ResearchReaderProps) {
  const ReaderComponent = getReader(contentType);

  if (!ReaderComponent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">暂不支持 {contentType} 类型的阅读器</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 h-full">
      <ReaderComponent contentId={contentId} onClose={onClose} embedded={true} />
    </div>
  );
}
