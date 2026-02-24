import type { Article, Highlight, CreateHighlightInput, SaveArticleInput } from './types';

const BASE_URL = 'http://127.0.0.1:21897/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '未知错误');
    throw new Error(`API 请求失败 [${res.status}]: ${errorText}`);
  }

  return res.json() as Promise<T>;
}

export async function openApp(): Promise<void> {
  await request<unknown>('/open');
}

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/status`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function saveArticle(input: SaveArticleInput): Promise<Article> {
  return request<Article>('/articles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getHighlightsByUrl(url: string): Promise<{ articleId: string | null; highlights: Highlight[] }> {
  return request<{ articleId: string | null; highlights: Highlight[] }>(
    `/highlights?url=${encodeURIComponent(url)}`
  );
}

export async function createHighlight(input: CreateHighlightInput): Promise<Highlight> {
  return request<Highlight>('/highlights', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  await request<unknown>(`/highlights/${highlightId}`, {
    method: 'DELETE',
  });
}

export async function updateHighlight(highlightId: string, data: { note?: string; color?: string }): Promise<Highlight> {
  return request<Highlight>(`/highlights/${highlightId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getAllTags(): Promise<Tag[]> {
  return request<Tag[]>('/tags');
}

export async function createTag(name: string): Promise<Tag> {
  return request<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getHighlightTags(highlightId: string): Promise<Tag[]> {
  return request<Tag[]>(`/highlights/${highlightId}/tags`);
}

export async function addTagToHighlight(highlightId: string, tagId: string): Promise<void> {
  await request<unknown>(`/highlights/${highlightId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagId }),
  });
}

export async function removeTagFromHighlight(highlightId: string, tagId: string): Promise<void> {
  await request<unknown>(`/highlights/${highlightId}/tags/${tagId}`, {
    method: 'DELETE',
  });
}
