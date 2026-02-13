import React from 'react';
import type { Highlight, CardTheme, Article } from '../../../../shared/types';

/** 文章信息精简类型 */
type CardArticle = Pick<Article, 'id' | 'title' | 'author' | 'url' | 'domain' | 'publishedAt'>;

interface MultiHighlightCardProps {
  highlights: Highlight[];
  article: CardArticle;
  theme: CardTheme;
}

/** 最多展示的高亮条数 */
const MAX_DISPLAY = 10;
/** 每条高亮文本截断长度 */
const MAX_TEXT_LEN = 150;

/** 高亮文本截断 */
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
 * 多条高亮分享卡片
 *
 * 布局：标题 → 元信息 → 高亮列表 → 分隔线 → 品牌 + 统计 + 日期
 */
const MultiHighlightCard: React.FC<MultiHighlightCardProps> = ({
  highlights,
  article,
  theme,
}) => {
  const today = formatDate(new Date().toISOString());
  const totalCount = highlights.length;
  const displayItems = highlights.slice(0, MAX_DISPLAY);
  const overflowCount = totalCount - MAX_DISPLAY;

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

        {/* 高亮列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
          {displayItems.map((hl) => (
            <div key={hl.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {/* 圆点标记 */}
              <span
                style={{
                  color: 'var(--accent-color)',
                  flexShrink: 0,
                  lineHeight: '1.6',
                  fontSize: '0.75rem',
                }}
              >
                ●
              </span>
              <div style={{ flex: 1 }}>
                {/* 引用文本，用引号包裹 */}
                <span className="quote-text" style={{ lineHeight: '1.6' }}>
                  「{truncateText(hl.text, MAX_TEXT_LEN)}」
                </span>
                {/* 笔记（如有） */}
                {hl.note && hl.note.trim() !== '' && (
                  <div
                    className="card-note"
                    style={{
                      fontSize: '0.8rem',
                      opacity: 0.7,
                      marginTop: '4px',
                    }}
                  >
                    {hl.note}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* 超出提示 */}
          {overflowCount > 0 && (
            <div style={{ fontSize: '0.8rem', opacity: 0.55, textAlign: 'center', paddingTop: '4px' }}>
              还有 {overflowCount} 条高亮
            </div>
          )}
        </div>

        {/* 分隔线 */}
        <div className="card-divider" />

        {/* 底部：品牌 + 统计 + 日期 */}
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
          <span>共 {totalCount} 条高亮</span>
          <span>{today}</span>
        </div>
      </div>
    </div>
  );
};

export default MultiHighlightCard;
