import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKGIngestionPipeline } from '../src/ai/services/kg-ingestion';
import type { KGDatabase } from '../src/ai/providers/kg-db';

describe('KGIngestionPipeline', () => {
  // Mock KGDatabase
  const mockKgDb = {
    findEntityByName: vi.fn(),
    findEntityByAlias: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    incrementMentionCount: vi.fn(),
    addEntitySource: vi.fn(),
    findRelation: vi.fn(),
    createRelation: vi.fn(),
    incrementRelationStrength: vi.fn(),
    deleteEntitiesBySource: vi.fn(),
  } as unknown as KGDatabase;

  // Mock extraction service
  const mockExtractionService = {
    extract: vi.fn(),
  };

  let pipeline: ReturnType<typeof createKGIngestionPipeline>;

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline = createKGIngestionPipeline({
      kgDb: mockKgDb,
      extractionService: mockExtractionService,
    });
  });

  it('returns zero counts when extraction returns empty', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [],
      relations: [],
    });

    const result = await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(result.success).toBe(true);
    expect(result.entitiesCreated).toBe(0);
    expect(result.relationsCreated).toBe(0);
  });

  it('creates new entities when none exist', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [
        { name: 'React', type: 'technology', description: 'A UI lib', aliases: ['ReactJS'] },
        { name: 'Vue', type: 'technology', description: 'Framework', aliases: [] },
      ],
      relations: [
        { source: 'React', target: 'Vue', type: 'contrasts_with' },
      ],
    });

    // No existing entities
    (mockKgDb.findEntityByName as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (mockKgDb.findEntityByAlias as ReturnType<typeof vi.fn>).mockReturnValue(null);

    // Mock createEntity to return entities with IDs
    (mockKgDb.createEntity as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ id: 'ent-1', name: 'React', normalized_name: 'react' })
      .mockReturnValueOnce({ id: 'ent-2', name: 'Vue', normalized_name: 'vue' });

    // No existing relations
    (mockKgDb.findRelation as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (mockKgDb.createRelation as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'rel-1' });

    const result = await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(result.success).toBe(true);
    expect(result.entitiesCreated).toBe(2);
    expect(result.entitiesUpdated).toBe(0);
    expect(result.relationsCreated).toBe(1);
    expect(result.relationsUpdated).toBe(0);
    expect(mockKgDb.createEntity).toHaveBeenCalledTimes(2);
    expect(mockKgDb.addEntitySource).toHaveBeenCalledTimes(2);
    expect(mockKgDb.createRelation).toHaveBeenCalledTimes(1);
  });

  it('updates existing entities (increment mention count)', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [
        { name: 'React', type: 'technology', description: 'short', aliases: [] },
      ],
      relations: [],
    });

    // Entity already exists with longer description
    (mockKgDb.findEntityByName as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'ent-1',
      name: 'React',
      normalized_name: 'react',
      description: 'A much longer existing description',
      aliases_json: '["ReactJS"]',
      mention_count: 3,
    });

    const result = await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(result.success).toBe(true);
    expect(result.entitiesCreated).toBe(0);
    expect(result.entitiesUpdated).toBe(1);
    expect(mockKgDb.incrementMentionCount).toHaveBeenCalledWith('ent-1');
    expect(mockKgDb.addEntitySource).toHaveBeenCalledTimes(1);
    // Should NOT update description since existing is longer
    expect(mockKgDb.updateEntity).not.toHaveBeenCalledWith(
      'ent-1',
      expect.objectContaining({ description: 'short' })
    );
  });

  it('updates description when new one is longer', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [
        { name: 'React', type: 'technology', description: 'A very detailed and long description of React', aliases: [] },
      ],
      relations: [],
    });

    (mockKgDb.findEntityByName as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'ent-1',
      name: 'React',
      normalized_name: 'react',
      description: 'short',
      aliases_json: '[]',
      mention_count: 1,
    });

    await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(mockKgDb.updateEntity).toHaveBeenCalledWith('ent-1', {
      description: 'A very detailed and long description of React',
    });
  });

  it('merges new aliases into existing entity', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [
        { name: 'React', type: 'technology', description: '', aliases: ['React.js', 'ReactJS'] },
      ],
      relations: [],
    });

    (mockKgDb.findEntityByName as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'ent-1',
      name: 'React',
      normalized_name: 'react',
      description: '',
      aliases_json: '["ReactJS"]', // already has ReactJS
      mention_count: 1,
    });

    await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    // Should add React.js but not duplicate ReactJS
    expect(mockKgDb.updateEntity).toHaveBeenCalledWith('ent-1', {
      aliases: ['ReactJS', 'React.js'],
    });
  });

  it('increments relation strength for existing relations', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [
        { name: 'A', type: 'concept', description: '', aliases: [] },
        { name: 'B', type: 'concept', description: '', aliases: [] },
      ],
      relations: [{ source: 'A', target: 'B', type: 'related_to' }],
    });

    (mockKgDb.findEntityByName as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ id: 'ent-a', name: 'A', normalized_name: 'a', description: '', aliases_json: '[]', mention_count: 1 })
      .mockReturnValueOnce({ id: 'ent-b', name: 'B', normalized_name: 'b', description: '', aliases_json: '[]', mention_count: 1 });

    // Relation already exists
    (mockKgDb.findRelation as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'rel-1', strength: 2 });

    const result = await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(result.relationsCreated).toBe(0);
    expect(result.relationsUpdated).toBe(1);
    expect(mockKgDb.incrementRelationStrength).toHaveBeenCalledWith('rel-1');
  });

  it('skips self-referencing relations', async () => {
    mockExtractionService.extract.mockResolvedValueOnce({
      entities: [
        { name: 'A', type: 'concept', description: '', aliases: [] },
      ],
      relations: [{ source: 'A', target: 'A', type: 'related_to' }],
    });

    (mockKgDb.findEntityByName as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (mockKgDb.findEntityByAlias as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (mockKgDb.createEntity as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'ent-a', name: 'A' });

    const result = await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(result.relationsCreated).toBe(0);
    expect(mockKgDb.createRelation).not.toHaveBeenCalled();
  });

  it('handles extraction errors gracefully', async () => {
    mockExtractionService.extract.mockRejectedValueOnce(new Error('API timeout'));

    const result = await pipeline.ingest({
      sourceType: 'article',
      sourceId: 'art-1',
      sourceTitle: 'Test',
      chunks: [{ chunkId: 'c1', content: 'test' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('API timeout');
    expect(result.entitiesCreated).toBe(0);
  });

  it('remove calls deleteEntitiesBySource', () => {
    pipeline.remove('article', 'art-1');
    expect(mockKgDb.deleteEntitiesBySource).toHaveBeenCalledWith('article', 'art-1');
  });
});
