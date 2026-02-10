import { saveArticle, getHighlightsByUrl } from './api';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-zreader',
    title: '保存到 Z-Reader',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'highlight-selection',
    title: '高亮选中文本',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !tab.url) return;

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
    } catch (error) {
      console.error('保存文章失败:', error);
    }
  }

  if (info.menuItemId === 'highlight-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_SELECTION',
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
