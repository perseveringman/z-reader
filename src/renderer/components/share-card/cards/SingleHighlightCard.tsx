import React from 'react';
import type { Highlight, CardTheme, Article } from '../../../../shared/types';

/** 文章信息精简类型 */
type CardArticle = Pick<Article, 'id' | 'title' | 'author' | 'url' | 'domain' | 'publishedAt'>;

interface SingleHighlightCardProps {
  highlight: Highlight;
  article: CardArticle;
  theme: CardTheme;
}

/** 高亮文本截断（最多 300 字） */
function truncateText(text: string | null, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

/** 日期格式化为 YYYY-MM-DD */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

/**
 * 单条高亮分享卡片
 *
 * 布局：标题 → 元信息 → 引用块 → 笔记（可选）→ 分隔线 → 品牌
 */
const SingleHighlightCard: React.FC<SingleHighlightCardProps> = ({
  highlight,
  article,
  theme,
}) => {
  const quoteClass = `quote-${theme.styles.quoteStyle}`;
  const today = formatDate(new Date().toISOString());

  return (
    <div
      className={`share-card ${theme.cssClass}`}
      style={{
        '--accent-color': theme.styles.accentColor,
        borderRadius: theme.styles.cardRadius,
        padding: theme.styles.padding,
        fontFamily: theme.styles.fontFamily,
      } as React.CSSProperties}
    >
      <div className="card-content">
        {/* 文章标题 */}
        <div className="card-title" style={{ fontSize: '1.125rem', marginBottom: '6px' }}>
          {article.title ?? '无标题'}
        </div>

        {/* 作者 · 来源域名 */}
        <div className="card-meta" style={{ marginBottom: '16px' }}>
          {article.author && <span>{article.author}</span>}
          {article.author && article.domain && <span> · </span>}
          {article.domain && <span className="card-source">{article.domain}</span>}
        </div>

        {/* 引用块 */}
        <div className={quoteClass} style={{ marginBottom: '14px' }}>
          <span className="quote-text">
            {truncateText(highlight.text, 300)}
          </span>
        </div>

        {/* 笔记内容（如有） */}
        {highlight.note && highlight.note.trim() !== '' && (
          <div
            className="card-note"
            style={{
              fontSize: '0.85rem',
              opacity: 0.75,
              marginBottom: '14px',
              paddingLeft: '8px',
            }}
          >
            {highlight.note}
          </div>
        )}

        {/* 分隔线 */}
        <div className="card-divider" />

        {/* 底部品牌 + 日期 */}
        <div
          className="card-branding"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '4px',
          }}
        >
          <span>Z-Reader</span>
          <span>{today}</span>
        </div>
      </div>
    </div>
  );
};

export default SingleHighlightCard;
