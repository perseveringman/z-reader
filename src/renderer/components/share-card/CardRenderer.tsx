import React from 'react';
import type { CardType, CardTheme, Highlight, Article } from '../../../shared/types';
import SingleHighlightCard from './cards/SingleHighlightCard';
import MultiHighlightCard from './cards/MultiHighlightCard';
import ArticleSummaryCard from './cards/ArticleSummaryCard';
import './share-card.css';

/** CardRenderer 的 props */
export interface CardRendererProps {
  cardType: CardType;
  theme: CardTheme;
  highlights: Highlight[];
  article: Pick<Article, 'id' | 'title' | 'author' | 'url' | 'domain' | 'publishedAt'>;
}

/**
 * 卡片渲染器
 *
 * 使用 forwardRef 暴露外层 DOM 节点，供截图（html-to-image / dom-to-image）使用。
 * 根据 cardType 分发到对应的卡片子组件。
 */
const CardRenderer = React.forwardRef<HTMLDivElement, CardRendererProps>(
  ({ cardType, theme, highlights, article }, ref) => {
    /** 根据 cardType 渲染对应卡片 */
    const renderCard = () => {
      switch (cardType) {
        case 'single':
          return (
            <SingleHighlightCard
              highlight={highlights[0]}
              article={article}
              theme={theme}
            />
          );
        case 'multi':
          return (
            <MultiHighlightCard
              highlights={highlights}
              article={article}
              theme={theme}
            />
          );
        case 'summary':
          return (
            <ArticleSummaryCard
              highlights={highlights}
              article={article}
              theme={theme}
            />
          );
        default:
          return null;
      }
    };

    return (
      <div
        ref={ref}
        className={theme.cssClass}
        style={{
          width: 420,
          background: theme.styles.background,
          color: theme.styles.textColor,
          fontFamily: theme.styles.fontFamily,
          borderRadius: theme.styles.cardRadius,
          padding: theme.styles.padding,
        }}
      >
        {renderCard()}
      </div>
    );
  },
);

CardRenderer.displayName = 'CardRenderer';

export default CardRenderer;
