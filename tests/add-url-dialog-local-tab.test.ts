import { describe, expect, it } from 'vitest';
import { formatLocalImportToastMessage } from '../src/renderer/components/AddUrlDialog';

describe('AddUrlDialog local media messaging', () => {
  it('formats singular import success message', () => {
    expect(formatLocalImportToastMessage(1)).toBe('Imported 1 media file');
  });

  it('formats plural import success message', () => {
    expect(formatLocalImportToastMessage(3)).toBe('Imported 3 media files');
  });
});
