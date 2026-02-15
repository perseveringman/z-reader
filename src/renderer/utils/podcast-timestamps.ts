const LEADING_TIMESTAMP_RE = /^\s*(?:[-*•]\s*)?(?:\[(\d{1,2}[:：]\d{2}(?:[:：]\d{2})?)\]|(\d{1,2}[:：]\d{2}(?:[:：]\d{2})?))(?:\s*[-–—:：]\s*|\s+)?(.*)$/;
const LEADING_TIMESTAMP_PREFIX_RE = /^\s*(?:[-*•]\s*)?(?:\[(\d{1,2}[:：]\d{2}(?:[:：]\d{2})?)\]|(\d{1,2}[:：]\d{2}(?:[:：]\d{2})?))(?:\s*[-–—:：]\s*|\s+)?/;

export interface ParsedPodcastContentLine {
  text: string;
  seconds: number | null;
  timestampLabel: string | null;
  content: string;
}

export interface PodcastTimestampOutlineItem {
  id: string;
  seconds: number;
  label: string;
  title: string;
}

function parseTimestampLabel(label: string): number | null {
  const normalized = label.replaceAll('：', ':');
  const parts = normalized.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;

  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0)) return null;

  if (parts.length === 2) {
    const [mm, ss] = nums;
    if (ss >= 60) return null;
    return mm * 60 + ss;
  }

  const [hh, mm, ss] = nums;
  if (mm >= 60 || ss >= 60) return null;
  return hh * 3600 + mm * 60 + ss;
}

export function extractTimestampSecondsFromLine(line: string): number | null {
  const match = line.match(LEADING_TIMESTAMP_RE);
  if (!match) return null;
  const label = match[1] ?? match[2];
  if (!label) return null;
  return parseTimestampLabel(label);
}

function extractTimestampMetaFromLine(line: string): { seconds: number; label: string; content: string } | null {
  const match = line.match(LEADING_TIMESTAMP_RE);
  if (!match) return null;
  const rawLabel = match[1] ?? match[2];
  if (!rawLabel) return null;
  const seconds = parseTimestampLabel(rawLabel);
  if (seconds == null) return null;
  return {
    seconds,
    label: rawLabel.replaceAll('：', ':'),
    content: (match[3] ?? '').trim(),
  };
}

function stripLeadingTimestampFromElement(el: Element): void {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let firstTextNode: Text | null = null;
  while (walker.nextNode()) {
    const current = walker.currentNode as Text;
    if ((current.nodeValue ?? '').trim().length === 0) continue;
    firstTextNode = current;
    break;
  }
  if (!firstTextNode) return;
  firstTextNode.nodeValue = (firstTextNode.nodeValue ?? '').replace(LEADING_TIMESTAMP_PREFIX_RE, '');
}

export function annotatePodcastTimestampLines(html: string): string {
  if (!html) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const selector = 'p, li, h1, h2, h3, h4, h5, h6';
  const candidates = doc.body.querySelectorAll(selector);
  let timestampIndex = 0;

  for (const el of candidates) {
    const text = (el.textContent ?? '').trim();
    const meta = extractTimestampMetaFromLine(text);
    if (!meta) continue;
    const nestedTimestampEl = Array.from(el.querySelectorAll(selector))
      .find((child) => extractTimestampSecondsFromLine((child.textContent ?? '').trim()) != null);
    if (nestedTimestampEl) continue;

    stripLeadingTimestampFromElement(el);
    el.setAttribute('data-podcast-ts', String(meta.seconds));
    el.setAttribute('data-podcast-ts-label', meta.label);
    el.setAttribute('data-podcast-ts-id', `podcast-ts-${timestampIndex}`);
    el.classList.add('podcast-timestamp-line');
    timestampIndex += 1;
  }

  return doc.body.innerHTML;
}

export function parsePodcastContentTextLines(contentText: string | null | undefined): ParsedPodcastContentLine[] {
  if (!contentText) return [];
  return contentText.split(/\r?\n/).map((line) => {
    const meta = extractTimestampMetaFromLine(line);
    if (!meta) {
      return { text: line, seconds: null, timestampLabel: null, content: line };
    }
    return {
      text: line,
      seconds: meta.seconds,
      timestampLabel: meta.label,
      content: meta.content,
    };
  });
}

export function extractPodcastTimestampOutlineFromAnnotatedHtml(annotatedHtml: string): PodcastTimestampOutlineItem[] {
  if (!annotatedHtml) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(annotatedHtml, 'text/html');
  const rows = doc.querySelectorAll<HTMLElement>('[data-podcast-ts]');

  const items: PodcastTimestampOutlineItem[] = [];
  rows.forEach((row, index) => {
    const seconds = Number(row.getAttribute('data-podcast-ts'));
    if (!Number.isFinite(seconds)) return;
    const label = row.getAttribute('data-podcast-ts-label') ?? '';
    const id = row.getAttribute('data-podcast-ts-id') ?? `podcast-ts-${index}`;
    const title = (row.textContent ?? '').trim() || label;
    items.push({
      id,
      seconds,
      label,
      title,
    });
  });

  return items;
}
