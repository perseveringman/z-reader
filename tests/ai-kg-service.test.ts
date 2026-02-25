import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKGService } from '../src/ai/services/kg-service';
import type { KGDatabase, EntityRow, EntityRelationRow } from '../src/ai/providers/kg-db';

describe('KGService', () => {
  // Mock KGDatabase
  const mockKgDb = {
    getSubgraph: vi.fn(),
    getEntitiesBySource: vi.fn(),
    getRelationsBetweenEntities: vi.fn(),
    getTopEntities: vi.fn(),
    searchEntities: vi.fn(),
    getStats: vi.fn(),
    getEntitySourceCount: vi.fn(),
  } as unknown as KGDatabase;

  let service: ReturnType<typeof createKGService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createKGService(mockKgDb);
    // Default sourceCount mock
    (mockKgDb.getEntitySourceCount as ReturnType<typeof vi.fn>).mockReturnValue(1);
  });

  const makeEntity = (overrides: Partial<EntityRow> = {}): EntityRow => ({
    id: 'ent-1',
    name: 'React',
    normalized_name: 'react',
    type: 'technology',
    description: 'A UI lib',
    aliases_json: '[]',
    mention_count: 5,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  });

  const makeRelation = (overrides: Partial<EntityRelationRow> = {}): EntityRelationRow => ({
    id: 'rel-1',
    source_entity_id: 'ent-1',
    target_entity_id: 'ent-2',
    relation_type: 'related_to',
    strength: 3,
    evidence_count: 2,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  });

  describe('getArticleGraph', () => {
    it('returns empty graph when no entities for source', () => {
      (mockKgDb.getEntitiesBySource as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = service.getArticleGraph('article', 'art-1');

      expect(result).toEqual({ nodes: [], edges: [] });
      expect(mockKgDb.getRelationsBetweenEntities).not.toHaveBeenCalled();
    });

    it('returns nodes and edges for article', () => {
      const entities = [
        makeEntity({ id: 'ent-1', name: 'React' }),
        makeEntity({ id: 'ent-2', name: 'Vue' }),
      ];
      const relations = [makeRelation()];

      (mockKgDb.getEntitiesBySource as ReturnType<typeof vi.fn>).mockReturnValue(entities);
      (mockKgDb.getRelationsBetweenEntities as ReturnType<typeof vi.fn>).mockReturnValue(relations);

      const result = service.getArticleGraph('article', 'art-1');

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes[0]).toEqual(
        expect.objectContaining({ id: 'ent-1', name: 'React', type: 'technology' })
      );
      expect(result.edges[0]).toEqual(
        expect.objectContaining({
          source: 'ent-1',
          target: 'ent-2',
          relationType: 'related_to',
          strength: 3,
        })
      );
    });
  });

  describe('getOverview', () => {
    it('returns empty graph when no entities', () => {
      (mockKgDb.getTopEntities as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = service.getOverview(50);

      expect(result).toEqual({ nodes: [], edges: [] });
    });

    it('returns top entities and their relations', () => {
      const entities = [
        makeEntity({ id: 'ent-1', mention_count: 10 }),
        makeEntity({ id: 'ent-2', mention_count: 5 }),
      ];
      const relations = [makeRelation()];

      (mockKgDb.getTopEntities as ReturnType<typeof vi.fn>).mockReturnValue(entities);
      (mockKgDb.getRelationsBetweenEntities as ReturnType<typeof vi.fn>).mockReturnValue(relations);

      const result = service.getOverview(50);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(mockKgDb.getTopEntities).toHaveBeenCalledWith(50);
    });
  });

  describe('getSubgraph', () => {
    it('delegates to kgDb and converts format', () => {
      const entities = [makeEntity({ id: 'ent-1' }), makeEntity({ id: 'ent-2' })];
      const relations = [makeRelation()];

      (mockKgDb.getSubgraph as ReturnType<typeof vi.fn>).mockReturnValue({
        nodes: entities,
        edges: relations,
      });

      const result = service.getSubgraph('ent-1', 2);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes[0].sourceCount).toBe(1); // from mock
      expect(mockKgDb.getSubgraph).toHaveBeenCalledWith('ent-1', 2);
    });
  });

  describe('searchEntities', () => {
    it('delegates to kgDb', () => {
      const entities = [makeEntity()];
      (mockKgDb.searchEntities as ReturnType<typeof vi.fn>).mockReturnValue(entities);

      const result = service.searchEntities('react', 'technology');

      expect(result).toEqual(entities);
      expect(mockKgDb.searchEntities).toHaveBeenCalledWith('react', 'technology');
    });
  });

  describe('getStats', () => {
    it('returns stats from kgDb', () => {
      const stats = { entityCount: 10, relationCount: 15, sourceCount: 5 };
      (mockKgDb.getStats as ReturnType<typeof vi.fn>).mockReturnValue(stats);

      expect(service.getStats()).toEqual(stats);
    });
  });

  describe('GraphNode format', () => {
    it('includes sourceCount from getEntitySourceCount', () => {
      const entities = [makeEntity()];
      (mockKgDb.getEntitiesBySource as ReturnType<typeof vi.fn>).mockReturnValue(entities);
      (mockKgDb.getRelationsBetweenEntities as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (mockKgDb.getEntitySourceCount as ReturnType<typeof vi.fn>).mockReturnValue(7);

      const result = service.getArticleGraph('article', 'art-1');

      expect(result.nodes[0].sourceCount).toBe(7);
      expect(result.nodes[0].mentionCount).toBe(5);
    });
  });
});
