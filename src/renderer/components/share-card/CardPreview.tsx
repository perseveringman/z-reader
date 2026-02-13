import React from 'react';
import CardRenderer from './CardRenderer';
import type { CardRendererProps } from './CardRenderer';

/** CardPreview 的 props，继承 CardRenderer 的所有属性并额外接收 ref */
interface CardPreviewProps extends CardRendererProps {
  rendererRef: React.RefObject<HTMLDivElement>;
}

/**
 * 卡片预览区域
 *
 * 提供一个固定高度的深色画布容器，内部居中展示 CardRenderer。
 * 如果卡片内容超出容器高度，允许滚动预览。
 */
const CardPreview: React.FC<CardPreviewProps> = ({
  rendererRef,
  cardType,
  theme,
  highlights,
  article,
}) => {
  return (
    <div
      className="card-preview-canvas"
      style={{
        height: 560,
        overflowY: 'auto',
        background: '#1a1a1a',
        /* 棋盘格/网格点阵背景 */
        backgroundImage:
          'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '32px 16px',
      }}
    >
      <CardRenderer
        ref={rendererRef}
        cardType={cardType}
        theme={theme}
        highlights={highlights}
        article={article}
      />
    </div>
  );
};

export default CardPreview;
