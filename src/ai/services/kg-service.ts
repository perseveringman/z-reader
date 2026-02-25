import type {
  KGDatabase,
  EntityType,
  EntitySourceType,
  EntityRow,
} from '../providers/kg-db';

// ==================== 类型定义 ====================

/** 图谱节点（面向前端的统一格式） */
export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  mentionCount: number;
  sourceCount: number;
  description?: string;
}

/** 图谱边（面向前端的统一格式） */
export interface GraphEdge {
  source: string; // entity id
  target: string; // entity id
  relationType: string;
  strength: number;
  evidenceCount: number;
}

/** 图谱数据 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ==================== 辅助函数 ====================

/**
 * 将 EntityRow 转换为 GraphNode
 */
function toGraphNode(
  entity: EntityRow,
  sourceCount: number
): GraphNode {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type as EntityType,
    mentionCount: entity.mention_count,
    sourceCount,
    description: entity.description ?? undefined,
  };
}

// ==================== Service ====================

/**
 * 创建知识图谱查询服务
 * 提供面向前端的图谱数据查询接口
 */
export function createKGService(kgDb: KGDatabase) {
  /**
   * 将 EntityRow 数组转为 GraphNode 数组（批量查 sourceCount）
   */
  function toGraphNodes(entities: EntityRow[]): GraphNode[] {
    return entities.map((e) => toGraphNode(e, kgDb.getEntitySourceCount(e.id)));
  }

  return {
    /**
     * 获取实体子图（以指定实体为中心，BFS 扩展到 depth 深度）
     */
    getSubgraph(entityId: string, depth: number = 2): GraphData {
      const subgraph = kgDb.getSubgraph(entityId, depth);

      return {
        nodes: toGraphNodes(subgraph.nodes),
        edges: subgraph.edges.map((r) => ({
          source: r.source_entity_id,
          target: r.target_entity_id,
          relationType: r.relation_type,
          strength: r.strength,
          evidenceCount: r.evidence_count,
        })),
      };
    },

    /**
     * 获取文章相关的图谱（通过 entity_sources 查找文章关联实体）
     */
    getArticleGraph(
      sourceType: EntitySourceType,
      sourceId: string
    ): GraphData {
      // 获取该文章关联的所有实体
      const entities = kgDb.getEntitiesBySource(sourceType, sourceId);

      if (entities.length === 0) {
        return { nodes: [], edges: [] };
      }

      // 查询这些实体之间的关系
      const entityIds = entities.map((e) => e.id);
      const relations = kgDb.getRelationsBetweenEntities(entityIds);

      return {
        nodes: toGraphNodes(entities),
        edges: relations.map((r) => ({
          source: r.source_entity_id,
          target: r.target_entity_id,
          relationType: r.relation_type,
          strength: r.strength,
          evidenceCount: r.evidence_count,
        })),
      };
    },

    /**
     * 获取全局概览图谱（mention_count 最高的 TopN 实体 + 关系）
     */
    getOverview(topN: number = 50): GraphData {
      const entities = kgDb.getTopEntities(topN);

      if (entities.length === 0) {
        return { nodes: [], edges: [] };
      }

      const entityIds = entities.map((e) => e.id);
      const relations = kgDb.getRelationsBetweenEntities(entityIds);

      return {
        nodes: toGraphNodes(entities),
        edges: relations.map((r) => ({
          source: r.source_entity_id,
          target: r.target_entity_id,
          relationType: r.relation_type,
          strength: r.strength,
          evidenceCount: r.evidence_count,
        })),
      };
    },

    /**
     * 搜索实体
     */
    searchEntities(query: string, type?: EntityType): EntityRow[] {
      return kgDb.searchEntities(query, type);
    },

    /**
     * 获取统计信息
     */
    getStats(): {
      entityCount: number;
      relationCount: number;
      sourceCount: number;
    } {
      return kgDb.getStats();
    },
  };
}
