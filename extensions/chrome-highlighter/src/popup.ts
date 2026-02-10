import { checkConnection, getHighlightsByUrl, saveArticle } from './api';

const statusEl = document.getElementById('status')!;
const saveBtnEl = document.getElementById('save-btn')!;
const articleInfoEl = document.getElementById('article-info')!;
const articleTitleEl = document.getElementById('article-title')!;
const articleMetaEl = document.getElementById('article-meta')!;

async function init() {
  const connected = await checkConnection();
  if (connected) {
    statusEl.textContent = '已连接';
    statusEl.className = 'status status--online';
  } else {
    statusEl.textContent = '未连接 — 请启动 Z-Reader';
    statusEl.className = 'status status--offline';
    saveBtnEl.setAttribute('disabled', 'true');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try {
      const result = await getHighlightsByUrl(tab.url);
      if (result.articleId) {
        articleTitleEl.textContent = tab.title ?? '无标题';
        articleMetaEl.textContent = `已有 ${result.highlights.length} 条高亮`;
        articleInfoEl.style.display = 'block';
        saveBtnEl.textContent = '✅ 已保存';
        saveBtnEl.setAttribute('disabled', 'true');
      }
    } catch {
      // 文章尚未保存
    }
  }
}

saveBtnEl.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  saveBtnEl.textContent = '保存中...';
  saveBtnEl.setAttribute('disabled', 'true');

  try {
    const article = await saveArticle({
      url: tab.url,
      title: tab.title,
    });

    articleTitleEl.textContent = article.title ?? '无标题';
    articleMetaEl.textContent = `保存于 ${new Date(article.createdAt).toLocaleString('zh-CN')}`;
    articleInfoEl.style.display = 'block';
    saveBtnEl.textContent = '✅ 已保存';

    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'ARTICLE_SAVED',
        payload: article,
      });
    }
  } catch (error) {
    saveBtnEl.textContent = '❌ 保存失败';
    saveBtnEl.removeAttribute('disabled');
    console.error('保存失败:', error);
  }
});

init();
