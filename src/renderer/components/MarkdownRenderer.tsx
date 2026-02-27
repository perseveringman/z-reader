import { useMemo, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MARKDOWN_STYLES = `
.markdown-body {
  color: #d1d5db;
  font-size: 13px;
  line-height: 1.7;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #f3f4f6; font-weight: 600; margin: 1em 0 0.5em; }
.markdown-body h1 { font-size: 1.4em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.2em; }
.markdown-body h3 { font-size: 1.05em; }
.markdown-body p { margin: 0.5em 0; }
.markdown-body ul, .markdown-body ol { padding-left: 1.5em; margin: 0.5em 0; }
.markdown-body li { margin: 0.2em 0; }
.markdown-body code { background: rgba(255,255,255,0.08); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; color: #93c5fd; }
.markdown-body pre { background: rgba(255,255,255,0.05); padding: 0.8em 1em; border-radius: 6px; overflow-x: auto; margin: 0.8em 0; }
.markdown-body pre code { background: transparent; padding: 0; color: #d1d5db; }
.markdown-body blockquote { border-left: 3px solid rgba(59,130,246,0.5); padding-left: 1em; margin: 0.5em 0; color: #9ca3af; }
.markdown-body table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
.markdown-body th, .markdown-body td { border: 1px solid rgba(255,255,255,0.1); padding: 0.4em 0.8em; text-align: left; }
.markdown-body th { background: rgba(255,255,255,0.05); font-weight: 600; }
.markdown-body a { color: #60a5fa; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 1em 0; }
.markdown-body strong { color: #f3f4f6; }
`;

const STYLE_ID = 'markdown-renderer-styles';

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Inject styles into document head (once)
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = MARKDOWN_STYLES;
    document.head.appendChild(style);
  }, []);

  const html = useMemo(() => {
    const rawHtml = marked.parse(content, { gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(rawHtml);
  }, [content]);

  return (
    <div
      className={`markdown-body ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
