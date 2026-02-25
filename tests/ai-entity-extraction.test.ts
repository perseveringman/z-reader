import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEntityExtractionService } from '../src/ai/services/entity-extraction';

// Mock generateObject
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from 'ai';
const mockedGenerateObject = vi.mocked(generateObject);

describe('EntityExtractionService', () => {
  const mockGetModel = vi.fn().mockReturnValue('mock-model');

  let service: ReturnType<typeof createEntityExtractionService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createEntityExtractionService({ getModel: mockGetModel });
  });

  it('returns empty result for empty chunks', async () => {
    const result = await service.extract([]);
    expect(result.entities).toEqual([]);
    expect(result.relations).toEqual([]);
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('calls generateObject with fast model', async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        entities: [
          {
            name: 'React',
            type: 'technology',
            description: 'A JavaScript library',
            aliases: ['ReactJS'],
          },
        ],
        relations: [],
      },
    } as never);

    const result = await service.extract([
      {
        chunkId: 'chunk-1',
        content: 'React is a JavaScript library for building UIs.',
        sourceTitle: 'Test Article',
      },
    ]);

    expect(mockGetModel).toHaveBeenCalledWith('fast');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('React');
    expect(result.entities[0].type).toBe('technology');
  });

  it('extracts entities and relations', async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        entities: [
          {
            name: 'React',
            type: 'technology',
            description: 'A UI library',
            aliases: ['ReactJS'],
          },
          {
            name: 'Facebook',
            type: 'organization',
            description: 'Tech company',
            aliases: ['Meta'],
          },
        ],
        relations: [
          {
            source: 'React',
            target: 'Facebook',
            type: 'created_by',
          },
        ],
      },
    } as never);

    const result = await service.extract([
      {
        chunkId: 'chunk-1',
        content: 'React was created by Facebook.',
        sourceTitle: 'Test Article',
      },
    ]);

    expect(result.entities).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toEqual({
      source: 'React',
      target: 'Facebook',
      type: 'created_by',
    });
  });

  it('merges batched results and deduplicates entities', async () => {
    // 生成足够长的内容触发分批
    const longContent = 'x'.repeat(9000);

    // 第一批
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        entities: [
          {
            name: 'React',
            type: 'technology',
            description: 'short',
            aliases: ['ReactJS'],
          },
        ],
        relations: [],
      },
    } as never);

    // 第二批
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        entities: [
          {
            name: 'React',
            type: 'technology',
            description: 'A longer description of React library',
            aliases: ['React.js'],
          },
          {
            name: 'Vue',
            type: 'technology',
            description: 'Another framework',
            aliases: [],
          },
        ],
        relations: [
          {
            source: 'React',
            target: 'Vue',
            type: 'contrasts_with',
          },
        ],
      },
    } as never);

    const result = await service.extract([
      {
        chunkId: 'chunk-1',
        content: longContent,
        sourceTitle: 'Test Article',
      },
      {
        chunkId: 'chunk-2',
        content: longContent,
        sourceTitle: 'Test Article',
      },
    ]);

    // React 应该被去重，保留更长的 description
    const react = result.entities.find(
      (e) => e.name.toLowerCase() === 'react'
    );
    expect(react).toBeDefined();
    expect(react!.description).toBe('A longer description of React library');
    // Aliases 应该被合并
    expect(react!.aliases).toContain('ReactJS');
    expect(react!.aliases).toContain('React.js');

    // Vue 应该存在
    expect(result.entities.find((e) => e.name === 'Vue')).toBeDefined();

    // 应该有 2 个唯一实体
    expect(result.entities).toHaveLength(2);

    // 关系不重复
    expect(result.relations).toHaveLength(1);
  });

  it('deduplicates relations across batches', async () => {
    const longContent = 'x'.repeat(9000);

    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        entities: [
          { name: 'A', type: 'concept', description: '', aliases: [] },
          { name: 'B', type: 'concept', description: '', aliases: [] },
        ],
        relations: [{ source: 'A', target: 'B', type: 'related_to' }],
      },
    } as never);

    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        entities: [
          { name: 'A', type: 'concept', description: '', aliases: [] },
          { name: 'B', type: 'concept', description: '', aliases: [] },
        ],
        relations: [{ source: 'A', target: 'B', type: 'related_to' }],
      },
    } as never);

    const result = await service.extract([
      { chunkId: 'c1', content: longContent, sourceTitle: 'T' },
      { chunkId: 'c2', content: longContent, sourceTitle: 'T' },
    ]);

    expect(result.relations).toHaveLength(1);
  });
});
