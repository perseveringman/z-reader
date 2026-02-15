import { saveArticle, getHighlightsByUrl } from './api';

chrome.runtime.onInstalled.addListener(() => {
  // 主菜单：保存页面
  chrome.contextMenus.create({
    id: 'save-to-zreader',
    title: '💾 保存到 Z-Reader',
    contexts: ['page'],
  });

  // 选中文本时的菜单
  chrome.contextMenus.create({
    id: 'highlight-parent',
    title: '🖍️ Z-Reader 高亮',
    contexts: ['selection'],
  });

  // 高亮颜色子菜单
  chrome.contextMenus.create({
    id: 'highlight-yellow',
    parentId: 'highlight-parent',
    title: '🟡 黄色高亮',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'highlight-blue',
    parentId: 'highlight-parent',
    title: '🔵 蓝色高亮',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'highlight-green',
    parentId: 'highlight-parent',
    title: '🟢 绿色高亮',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'highlight-red',
    parentId: 'highlight-parent',
    title: '🔴 红色高亮',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'separator-1',
    parentId: 'highlight-parent',
    type: 'separator',
    contexts: ['selection'],
  });

  // 添加笔记
  chrome.contextMenus.create({
    id: 'highlight-with-note',
    parentId: 'highlight-parent',
    title: '📝 添加笔记高亮',
    contexts: ['selection'],
  });

  // 搜索选中文本
  chrome.contextMenus.create({
    id: 'search-in-zreader',
    parentId: 'highlight-parent',
    title: '🔍 在 Z-Reader 中搜索',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !tab.url) return;

  // 保存页面到 Z-Reader
  if (info.menuItemId === 'save-to-zreader') {
    try {
      const article = await saveArticle({
        url: tab.url,
        title: tab.title,
      });
      chrome.tabs.sendMessage(tab.id, {
        type: 'ARTICLE_SAVED',
        payload: article,
      });
      // 显示成功通知
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TOAST',
        payload: { message: '文章已保存到 Z-Reader', type: 'success' },
      });
    } catch (error) {
      console.error('保存文章失败:', error);
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TOAST',
        payload: { message: '保存文章失败', type: 'error' },
      });
    }
  }

  // 颜色高亮
  const colorMap: Record<string, string> = {
    'highlight-yellow': 'yellow',
    'highlight-blue': 'blue',
    'highlight-green': 'green',
    'highlight-red': 'red',
  };

  if (info.menuItemId && colorMap[info.menuItemId as string]) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_SELECTION',
      payload: { color: colorMap[info.menuItemId as string] },
    });
  }

  // 添加笔记高亮
  if (info.menuItemId === 'highlight-with-note') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_WITH_NOTE',
    });
  }

  // 在 Z-Reader 中搜索
  if (info.menuItemId === 'search-in-zreader' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SEARCH_IN_ZREADER',
      payload: { text: info.selectionText },
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_HIGHLIGHTS_BY_URL') {
    getHighlightsByUrl(message.payload.url)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error: Error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'SAVE_ARTICLE') {
    saveArticle(message.payload)
      .then((article) => sendResponse({ success: true, data: article }))
      .catch((error: Error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
