import { describe, expect, it } from 'vitest';
import {
  annotatePodcastTimestampLines,
  extractPodcastTimestampOutlineFromAnnotatedHtml,
  extractTimestampSecondsFromLine,
  parsePodcastContentTextLines,
} from '../src/renderer/utils/podcast-timestamps';

describe('podcast timestamp lines', () => {
  it('extracts seconds from leading timestamp lines', () => {
    expect(extractTimestampSecondsFromLine('00:45 开场')).toBe(45);
    expect(extractTimestampSecondsFromLine('1:02:03 深入讨论')).toBe(3723);
    expect(extractTimestampSecondsFromLine('- [12:34] 主题一')).toBe(754);
    expect(extractTimestampSecondsFromLine('• 08:01 小结')).toBe(481);
  });

  it('does not match timestamps in the middle of a line', () => {
    expect(extractTimestampSecondsFromLine('本期内容 12:34 才开始')).toBeNull();
  });

  it('annotates html blocks with clickable timestamp metadata', () => {
    const html = `
      <p>00:30 Intro</p>
      <p>No timestamp here</p>
      <ul><li>[1:02:03] Deep dive</li></ul>
    `;

    const annotated = annotatePodcastTimestampLines(html);
    const doc = new DOMParser().parseFromString(annotated, 'text/html');
    const blocks = doc.querySelectorAll('[data-podcast-ts]');

    expect(blocks).toHaveLength(2);
    expect(blocks[0].getAttribute('data-podcast-ts')).toBe('30');
    expect(blocks[0].getAttribute('data-podcast-ts-label')).toBe('00:30');
    expect(blocks[0].getAttribute('data-podcast-ts-id')).toBe('podcast-ts-0');
    expect(blocks[0].textContent?.trim()).toBe('Intro');
    expect(blocks[1].getAttribute('data-podcast-ts')).toBe('3723');
    expect(blocks[1].getAttribute('data-podcast-ts-label')).toBe('1:02:03');
    expect(blocks[1].getAttribute('data-podcast-ts-id')).toBe('podcast-ts-1');
    expect(blocks[1].textContent?.trim()).toBe('Deep dive');
    expect(doc.querySelector('p:not([data-podcast-ts])')?.textContent).toContain('No timestamp here');
  });

  it('does not annotate both parent and child nodes for the same timestamp row', () => {
    const html = '<ul><li><p>00:20 Nested timestamp row</p></li></ul>';
    const annotated = annotatePodcastTimestampLines(html);
    const doc = new DOMParser().parseFromString(annotated, 'text/html');
    const all = doc.querySelectorAll('[data-podcast-ts]');

    expect(all).toHaveLength(1);
    expect(doc.querySelector('p[data-podcast-ts]')).not.toBeNull();
    expect(doc.querySelector('li[data-podcast-ts]')).toBeNull();
  });

  it('parses plain text lines and marks timestamp rows', () => {
    const lines = parsePodcastContentTextLines('00:10 开场\n普通行\n\n02:00 主题');

    expect(lines).toEqual([
      { text: '00:10 开场', seconds: 10, timestampLabel: '00:10', content: '开场' },
      { text: '普通行', seconds: null, timestampLabel: null, content: '普通行' },
      { text: '', seconds: null, timestampLabel: null, content: '' },
      { text: '02:00 主题', seconds: 120, timestampLabel: '02:00', content: '主题' },
    ]);
  });

  it('extracts ordered timestamp outline from annotated html', () => {
    const annotated = annotatePodcastTimestampLines('<p>00:10 Intro</p><p>01:20 Main Topic</p>');
    const outline = extractPodcastTimestampOutlineFromAnnotatedHtml(annotated);

    expect(outline).toEqual([
      { id: 'podcast-ts-0', seconds: 10, label: '00:10', title: 'Intro' },
      { id: 'podcast-ts-1', seconds: 80, label: '01:20', title: 'Main Topic' },
    ]);
  });
});
