import { ArticleReaderCore } from './reader/ArticleReaderCore';

interface ReaderViewProps {
  articleId: string;
  onClose: () => void;
}

export function ReaderView({ articleId, onClose }: ReaderViewProps) {
  return <ArticleReaderCore contentId={articleId} onClose={onClose} embedded={false} />;
}
