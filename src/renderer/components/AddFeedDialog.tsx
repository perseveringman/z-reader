import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Plus, FileUp, Rss, Podcast, Mail, Copy, Check, MessageSquare } from 'lucide-react';
import { useToast } from './Toast';
import { PodcastSearchPanel } from './PodcastSearchPanel';

type DialogTab = 'rss' | 'podcast' | 'newsletter' | 'wechat';

interface AddFeedDialogProps {
  open: boolean;
  onClose: () => void;
  onFeedAdded?: () => void;
}

export function AddFeedDialog({ open, onClose, onFeedAdded }: AddFeedDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DialogTab>('rss');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newsletterInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // 微信状态
  const [wechatUrl, setWechatUrl] = useState('');
  const [wechatParsed, setWechatParsed] = useState<{
    nickname: string;
    biz: string;
    homeUrl: string;
    articleTitle: string;
  } | null>(null);
  const [wechatCategory, setWechatCategory] = useState('');
  const wechatInputRef = useRef<HTMLInputElement>(null);

  // Newsletter 状态
  const [newsletterName, setNewsletterName] = useState('');
  const [newsletterCategory, setNewsletterCategory] = useState('');
  const [newsletterResult, setNewsletterResult] = useState<{
    email: string;
    feedUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      // 重置表单
      setUrl('');
      setTitle('');
      setCategory('');
      setNewsletterName('');
      setNewsletterCategory('');
      setNewsletterResult(null);
      setCopied(false);
      setWechatUrl('');
      setWechatParsed(null);
      setWechatCategory('');
      // 聚焦输入框
      if (activeTab === 'rss') {
        setTimeout(() => inputRef.current?.focus(), 100);
      } else if (activeTab === 'newsletter') {
        setTimeout(() => newsletterInputRef.current?.focus(), 100);
      } else if (activeTab === 'wechat') {
        setTimeout(() => wechatInputRef.current?.focus(), 100);
      }
    }
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      await window.electronAPI.feedAdd({
        url: url.trim(),
        title: title.trim() || undefined,
        category: category.trim() || undefined,
      });
      showToast(t('dialog.addFeed.addSuccess'));
      onClose();
      onFeedAdded?.();
    } catch (error) {
      console.error('添加订阅失败:', error);
      showToast(t('dialog.addFeed.addFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleImportOpml = async () => {
    setLoading(true);
    try {
      const feeds = await window.electronAPI.feedImportOpml();
      if (feeds.length > 0) {
        showToast(t('dialog.addFeed.addSuccess') + `: ${feeds.length} feeds`);
        onClose();
        onFeedAdded?.();
      } else {
        showToast('No feeds imported');
      }
    } catch (error) {
      console.error('导入 OPML 失败:', error);
      showToast('Failed to import OPML');
    } finally {
      setLoading(false);
    }
  };

  const handlePodcastSubscribed = () => {
    onFeedAdded?.();
  };

  const handleNewsletterCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterName.trim()) return;

    setLoading(true);
    try {
      const result = await window.electronAPI.newsletterCreate({
        name: newsletterName.trim(),
        category: newsletterCategory.trim() || undefined,
      });
      setNewsletterResult({
        email: result.email,
        feedUrl: result.feedUrl,
      });
      showToast('Newsletter created');
      onFeedAdded?.();
    } catch (error) {
      console.error('创建 Newsletter 失败:', error);
      showToast('Failed to create newsletter');
    } finally {
      setLoading(false);
    }
  };

  // 微信：解析 URL
  const handleWechatParse = async () => {
    if (!wechatUrl.trim()) return;
    setLoading(true);
    setWechatParsed(null);
    try {
      const result = await window.electronAPI.wechatParseArticleUrl(wechatUrl.trim());
      if (!result) {
        showToast('无法识别微信公众号信息，请检查 URL');
        return;
      }
      setWechatParsed(result);
    } catch (error) {
      console.error('解析微信文章 URL 失败:', error);
      showToast('无法识别微信公众号信息，请检查 URL');
    } finally {
      setLoading(false);
    }
  };

  // 微信：添加为 Feed
  const handleWechatAdd = async () => {
    if (!wechatParsed) return;
    setLoading(true);
    try {
      await window.electronAPI.feedAdd({
        url: wechatParsed.homeUrl,
        title: wechatParsed.nickname,
        category: wechatCategory.trim() || '微信公众号',
        feedType: 'wechat',
        wechatBiz: wechatParsed.biz,
      });
      showToast(`已添加公众号「${wechatParsed.nickname}」`);
      onClose();
      onFeedAdded?.();
    } catch (error) {
      console.error('添加微信公众号失败:', error);
      showToast('添加失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = async () => {
    if (!newsletterResult) return;
    try {
      await navigator.clipboard.writeText(newsletterResult.email);
      setCopied(true);
      showToast(t('common.copy') + ' success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t('common.copy') + ' failed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{t('dialog.addFeed.title')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-white/10 px-6">
          <button
            onClick={() => setActiveTab('rss')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'rss'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Rss size={16} />
            RSS / YouTube
          </button>
          <button
            onClick={() => setActiveTab('podcast')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'podcast'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Podcast size={16} />
            播客
          </button>
          <button
            onClick={() => setActiveTab('wechat')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'wechat'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageSquare size={16} />
            微信
          </button>
          <button
            onClick={() => setActiveTab('newsletter')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'newsletter'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Mail size={16} />
            Newsletter
          </button>
        </div>

        {/* Tab 内容 */}
        {activeTab === 'rss' ? (
          <>
            {/* RSS 表单 */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="feed-url" className="block text-sm font-medium text-gray-300 mb-1.5">
                  RSS URL <span className="text-red-400">*</span>
                </label>
                <input
                  ref={inputRef}
                  id="feed-url"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml 或 YouTube 频道 URL"
                  className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="feed-title" className="block text-sm font-medium text-gray-300 mb-1.5">
                  订阅名称 (可选)
                </label>
                <input
                  id="feed-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="自动从 RSS 获取"
                  className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="feed-category" className="block text-sm font-medium text-gray-300 mb-1.5">
                  分类 (可选)
                </label>
                <input
                  id="feed-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="例如: 技术、新闻、博客"
                  className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>添加中...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>添加订阅</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleImportOpml}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  title="导入 OPML 文件"
                >
                  <FileUp size={16} />
                  <span>导入 OPML</span>
                </button>
              </div>
            </form>

            {/* 提示信息 */}
            <div className="px-6 pb-6 pt-0">
              <p className="text-xs text-gray-500">
                提示: 可以直接输入 RSS URL、网站首页或 YouTube 频道链接
              </p>
            </div>
          </>
        ) : activeTab === 'podcast' ? (
          /* 播客搜索 Tab */
          <div className="p-6">
            <PodcastSearchPanel onSubscribed={handlePodcastSubscribed} />
          </div>
        ) : activeTab === 'wechat' ? (
          /* 微信公众号 Tab */
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="wechat-url" className="block text-sm font-medium text-gray-300 mb-1.5">
                微信文章链接 <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  ref={wechatInputRef}
                  id="wechat-url"
                  type="text"
                  value={wechatUrl}
                  onChange={(e) => setWechatUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleWechatParse(); } }}
                  placeholder="粘贴任意微信公众号文章链接"
                  className="flex-1 px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handleWechatParse}
                  disabled={loading || !wechatUrl.trim()}
                  className="shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors cursor-pointer"
                >
                  {loading && !wechatParsed ? '解析中...' : '解析'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                提示: 粘贴任意该公众号的文章链接，会自动识别公众号名称
              </p>
            </div>

            {wechatParsed && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-3">
                <p className="text-sm text-green-400 font-medium">识别成功</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-20 shrink-0">公众号:</span>
                    <span className="text-white font-medium">{wechatParsed.nickname}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-20 shrink-0">文章标题:</span>
                    <span className="text-gray-300 truncate">{wechatParsed.articleTitle}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="wechat-category" className="block text-xs text-gray-400 mb-1">
                    分类 (可选)
                  </label>
                  <input
                    id="wechat-category"
                    type="text"
                    value={wechatCategory}
                    onChange={(e) => setWechatCategory(e.target.value)}
                    placeholder="默认: 微信公众号"
                    className="w-full px-3 py-1.5 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleWechatAdd}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>添加中...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>添加公众号「{wechatParsed.nickname}」</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Newsletter Tab */
          <>
            {!newsletterResult ? (
              <form onSubmit={handleNewsletterCreate} className="p-6 space-y-4">
                <div>
                  <label htmlFor="newsletter-name" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Newsletter 名称 <span className="text-red-400">*</span>
                  </label>
                  <input
                    ref={newsletterInputRef}
                    id="newsletter-name"
                    type="text"
                    value={newsletterName}
                    onChange={(e) => setNewsletterName(e.target.value)}
                    placeholder="例如: Morning Brew, The Hustle"
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label htmlFor="newsletter-category" className="block text-sm font-medium text-gray-300 mb-1.5">
                    分类 (可选)
                  </label>
                  <input
                    id="newsletter-category"
                    type="text"
                    value={newsletterCategory}
                    onChange={(e) => setNewsletterCategory(e.target.value)}
                    placeholder="例如: 技术、新闻、商业"
                    className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || !newsletterName.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>创建中...</span>
                      </>
                    ) : (
                      <>
                        <Mail size={16} />
                        <span>创建 Newsletter 订阅</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-0">
                  <p className="text-xs text-gray-500">
                    将通过 kill-the-newsletter.com 生成一个专用邮箱地址，用该地址订阅 newsletter 后，内容会自动出现在你的 Feed 中。
                  </p>
                </div>
              </form>
            ) : (
              /* 创建成功后展示邮箱地址 */
              <div className="p-6 space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-3">
                  <p className="text-sm text-green-400 font-medium">
                    Newsletter 订阅创建成功
                  </p>
                  <p className="text-xs text-gray-400">
                    请用以下邮箱地址去订阅你的 newsletter：
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded text-sm text-white font-mono select-all break-all">
                      {newsletterResult.email}
                    </code>
                    <button
                      onClick={handleCopyEmail}
                      className="shrink-0 p-2 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      title="复制邮箱地址"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-gray-500">
                  <p>接下来：</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>复制上面的邮箱地址</li>
                    <li>去 newsletter 的网站用此地址订阅</li>
                    <li>收到的 newsletter 会自动出现在 Feed 中</li>
                  </ol>
                </div>

                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors"
                >
                  完成
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
