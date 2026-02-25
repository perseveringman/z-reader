import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

// ==================== 类型定义 ====================

/** 实体类型 */
export type EntityType = 'concept' | 'person' | 'technology' | 'topic' | 'organization';

/** 关系类型 */
export type RelationType =
  | 'related_to'
  | 'part_of'
  | 'prerequisite'
  | 'contrasts_with'
  | 'applied_in'
  | 'created_by';

/** 实体来源类型（与 RAG ChunkSourceType 对齐） */
export type EntitySourceType = 'article' | 'book' | 'highlight' | 'transcript';

/** 实体行（匹配 entities 表） */
export interface EntityRow {
  id: string;
  name: string;
  normalized_name: string;
  type: EntityType;
  description: string | null;
  aliases_json: string; // JSON 数组字符串
  mention_count: number;
  created_at: string;
  updated_at: string;
}

/** 实体关系行（匹配 entity_relations 表） */
export interface EntityRelationRow {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  strength: number;
  evidence_count: number;
  created_at: string;
  updated_at: string;
}

/** 实体来源行（匹配 entity_sources 表） */
export interface EntitySourceRow {
  id: string;
  entity_id: string;
  source_type: EntitySourceType;
  source_id: string;
  chunk_id: string | null;
  created_at: string;
}

/** 创建实体的输入 */
export interface CreateEntityInput {
  name: string;
  type: EntityType;
  description?: string | null;
  aliases?: string[];
}

/** 创建关系的输入 */
export interface CreateRelationInput {
  sourceEntityId: string;
  targetEntityId: string;
  relationType: RelationType;
}

// ==================== KGDatabase ====================

/**
 * 知识图谱数据库操作层
 * 负责 entities / entity_relations / entity_sources 三张表的 CRUD
 */
export class KGDatabase {
  constructor(private sqlite: Database.Database) {}

  /** 初始化知识图谱相关表 */
  initTables(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        mention_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entities_normalized_name
        ON entities(normalized_name);
      CREATE INDEX IF NOT EXISTS idx_entities_type
        ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_mention_count
        ON entities(mention_count DESC);

      CREATE TABLE IF NOT EXISTS entity_relations (
        id TEXT PRIMARY KEY,
        source_entity_id TEXT NOT NULL,
        target_entity_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        strength INTEGER NOT NULL DEFAULT 1,
        evidence_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_entity_relations_source
        ON entity_relations(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_entity_relations_target
        ON entity_relations(target_entity_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_relations_pair
        ON entity_relations(source_entity_id, target_entity_id, relation_type);

      CREATE TABLE IF NOT EXISTS entity_sources (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        chunk_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_entity_sources_entity
        ON entity_sources(entity_id);
      CREATE INDEX IF NOT EXISTS idx_entity_sources_source
        ON entity_sources(source_type, source_id);
    `);
  }

  // ==================== Entity CRUD ====================

  /** 按 normalized name 查找实体（精确匹配） */
  findEntityByName(name: string): EntityRow | null {
    const normalized = name.toLowerCase().trim();
    const row = this.sqlite
      .prepare('SELECT * FROM entities WHERE normalized_name = ?')
      .get(normalized) as EntityRow | undefined;
    return row ?? null;
  }

  /** 按 alias 查找实体（遍历所有实体的 aliases_json） */
  findEntityByAlias(alias: string): EntityRow | null {
    const normalized = alias.toLowerCase().trim();
    // 先尝试精确名称匹配
    const byName = this.findEntityByName(normalized);
    if (byName) return byName;

    // 遍历 aliases（SQLite JSON 函数 + LIKE 回退）
    const rows = this.sqlite
      .prepare('SELECT * FROM entities')
      .all() as EntityRow[];

    for (const row of rows) {
      try {
        const aliases: string[] = JSON.parse(row.aliases_json);
        if (aliases.some((a) => a.toLowerCase().trim() === normalized)) {
          return row;
        }
      } catch {
        // 忽略 JSON 解析错误
      }
    }
    return null;
  }

  /** 创建实体 */
  createEntity(input: CreateEntityInput): EntityRow {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const normalizedName = input.name.toLowerCase().trim();
    const aliasesJson = JSON.stringify(input.aliases ?? []);

    this.sqlite
      .prepare(
        `INSERT INTO entities (
          id, name, normalized_name, type, description,
          aliases_json, mention_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        id,
        input.name.trim(),
        normalizedName,
        input.type,
        input.description ?? null,
        aliasesJson,
        now,
        now
      );

    return {
      id,
      name: input.name.trim(),
      normalized_name: normalizedName,
      type: input.type,
      description: input.description ?? null,
      aliases_json: aliasesJson,
      mention_count: 1,
      created_at: now,
      updated_at: now,
    };
  }

  /** 更新实体 */
  updateEntity(
    id: string,
    updates: {
      description?: string | null;
      aliases?: string[];
      type?: EntityType;
    }
  ): void {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.description !== undefined) {
      sets.push('description = ?');
      values.push(updates.description);
    }
    if (updates.aliases !== undefined) {
      sets.push('aliases_json = ?');
      values.push(JSON.stringify(updates.aliases));
    }
    if (updates.type !== undefined) {
      sets.push('type = ?');
      values.push(updates.type);
    }

    values.push(id);
    this.sqlite
      .prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  /** 递增实体提及次数 */
  incrementMentionCount(id: string): void {
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        'UPDATE entities SET mention_count = mention_count + 1, updated_at = ? WHERE id = ?'
      )
      .run(now, id);
  }

  /** 获取实体 */
  getEntity(id: string): EntityRow | null {
    const row = this.sqlite
      .prepare('SELECT * FROM entities WHERE id = ?')
      .get(id) as EntityRow | undefined;
    return row ?? null;
  }

  // ==================== Relation CRUD ====================

  /** 查找已有关系 */
  findRelation(
    sourceEntityId: string,
    targetEntityId: string,
    relationType: RelationType
  ): EntityRelationRow | null {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM entity_relations
         WHERE source_entity_id = ? AND target_entity_id = ? AND relation_type = ?`
      )
      .get(sourceEntityId, targetEntityId, relationType) as
      | EntityRelationRow
      | undefined;
    return row ?? null;
  }

  /** 创建关系 */
  createRelation(input: CreateRelationInput): EntityRelationRow {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.sqlite
      .prepare(
        `INSERT INTO entity_relations (
          id, source_entity_id, target_entity_id, relation_type,
          strength, evidence_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`
      )
      .run(
        id,
        input.sourceEntityId,
        input.targetEntityId,
        input.relationType,
        now,
        now
      );

    return {
      id,
      source_entity_id: input.sourceEntityId,
      target_entity_id: input.targetEntityId,
      relation_type: input.relationType,
      strength: 1,
      evidence_count: 1,
      created_at: now,
      updated_at: now,
    };
  }

  /** 递增关系强度和证据计数 */
  incrementRelationStrength(id: string): void {
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        `UPDATE entity_relations
         SET strength = strength + 1, evidence_count = evidence_count + 1, updated_at = ?
         WHERE id = ?`
      )
      .run(now, id);
  }

  // ==================== Source CRUD ====================

  /** 添加实体来源关联 */
  addEntitySource(
    entityId: string,
    sourceType: EntitySourceType,
    sourceId: string,
    chunkId?: string
  ): void {
    // 检查是否已存在相同关联
    const existing = this.sqlite
      .prepare(
        `SELECT id FROM entity_sources
         WHERE entity_id = ? AND source_type = ? AND source_id = ?`
      )
      .get(entityId, sourceType, sourceId) as { id: string } | undefined;

    if (existing) return; // 已关联，跳过

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        `INSERT INTO entity_sources (id, entity_id, source_type, source_id, chunk_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, entityId, sourceType, sourceId, chunkId ?? null, now);
  }

  /** 获取实体的所有来源 */
  getEntitySources(entityId: string): EntitySourceRow[] {
    return this.sqlite
      .prepare('SELECT * FROM entity_sources WHERE entity_id = ?')
      .all(entityId) as EntitySourceRow[];
  }

  /** 获取指定来源关联的所有实体 */
  getEntitiesBySource(
    sourceType: EntitySourceType,
    sourceId: string
  ): EntityRow[] {
    return this.sqlite
      .prepare(
        `SELECT DISTINCT e.*
         FROM entities e
         INNER JOIN entity_sources es ON e.id = es.entity_id
         WHERE es.source_type = ? AND es.source_id = ?
         ORDER BY e.mention_count DESC`
      )
      .all(sourceType, sourceId) as EntityRow[];
  }

  // ==================== 图谱查询 ====================

  /**
   * 获取实体子图（BFS 扩展到指定深度）
   * 返回以 entityId 为中心的子图
   */
  getSubgraph(
    entityId: string,
    depth: number = 2
  ): { nodes: EntityRow[]; edges: EntityRelationRow[] } {
    const visitedIds = new Set<string>();
    const allEdges: EntityRelationRow[] = [];
    let frontier = [entityId];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = [];

      for (const nodeId of frontier) {
        if (visitedIds.has(nodeId)) continue;
        visitedIds.add(nodeId);

        // 获取该节点的所有关系
        const relations = this.getEntityRelations(nodeId);
        for (const rel of relations) {
          // 避免重复边
          if (!allEdges.some((e) => e.id === rel.id)) {
            allEdges.push(rel);
          }
          // 找对端节点
          const peerId =
            rel.source_entity_id === nodeId
              ? rel.target_entity_id
              : rel.source_entity_id;
          if (!visitedIds.has(peerId)) {
            nextFrontier.push(peerId);
          }
        }
      }

      frontier = nextFrontier;
    }

    // 把最后一层 frontier 也加入 visitedIds（它们是叶子节点）
    for (const id of frontier) {
      visitedIds.add(id);
    }

    // 批量获取所有节点
    const nodes: EntityRow[] = [];
    for (const id of visitedIds) {
      const entity = this.getEntity(id);
      if (entity) nodes.push(entity);
    }

    return { nodes, edges: allEdges };
  }

  /** 获取 mention_count 最高的 TopN 实体 */
  getTopEntities(limit: number = 50): EntityRow[] {
    return this.sqlite
      .prepare(
        'SELECT * FROM entities ORDER BY mention_count DESC LIMIT ?'
      )
      .all(limit) as EntityRow[];
  }

  /** 获取所有实体 */
  getAllEntities(): EntityRow[] {
    return this.sqlite
      .prepare('SELECT * FROM entities ORDER BY mention_count DESC')
      .all() as EntityRow[];
  }

  /** 获取所有关系 */
  getAllRelations(): EntityRelationRow[] {
    return this.sqlite
      .prepare('SELECT * FROM entity_relations ORDER BY strength DESC')
      .all() as EntityRelationRow[];
  }

  /** 获取实体的所有关系（作为 source 或 target） */
  getEntityRelations(entityId: string): EntityRelationRow[] {
    return this.sqlite
      .prepare(
        `SELECT * FROM entity_relations
         WHERE source_entity_id = ? OR target_entity_id = ?`
      )
      .all(entityId, entityId) as EntityRelationRow[];
  }

  /** 搜索实体（按名称 LIKE 匹配，可选按类型过滤） */
  searchEntities(query: string, type?: EntityType): EntityRow[] {
    const normalized = `%${query.toLowerCase().trim()}%`;

    if (type) {
      return this.sqlite
        .prepare(
          `SELECT * FROM entities
           WHERE normalized_name LIKE ? AND type = ?
           ORDER BY mention_count DESC
           LIMIT 50`
        )
        .all(normalized, type) as EntityRow[];
    }

    return this.sqlite
      .prepare(
        `SELECT * FROM entities
         WHERE normalized_name LIKE ?
         ORDER BY mention_count DESC
         LIMIT 50`
      )
      .all(normalized) as EntityRow[];
  }

  /** 获取实体的来源数量 */
  getEntitySourceCount(entityId: string): number {
    const result = this.sqlite
      .prepare(
        'SELECT COUNT(*) as count FROM entity_sources WHERE entity_id = ?'
      )
      .get(entityId) as { count: number };
    return result.count;
  }

  // ==================== 删除 ====================

  /**
   * 删除指定来源关联的实体数据
   * 1. 删除 entity_sources 记录
   * 2. 对于只被该来源引用的实体，删除实体及其关系
   * 3. 对于被多个来源引用的实体，递减 mention_count
   */
  deleteEntitiesBySource(
    sourceType: EntitySourceType,
    sourceId: string
  ): void {
    const tx = this.sqlite.transaction(() => {
      // 找到该来源关联的所有实体
      const entityIds = this.sqlite
        .prepare(
          `SELECT DISTINCT entity_id FROM entity_sources
           WHERE source_type = ? AND source_id = ?`
        )
        .all(sourceType, sourceId) as Array<{ entity_id: string }>;

      // 删除 entity_sources 记录
      this.sqlite
        .prepare(
          'DELETE FROM entity_sources WHERE source_type = ? AND source_id = ?'
        )
        .run(sourceType, sourceId);

      // 对每个实体检查是否还有其他来源引用
      for (const { entity_id } of entityIds) {
        const remainingSources = this.getEntitySourceCount(entity_id);

        if (remainingSources === 0) {
          // 没有其他来源引用了，删除实体及其关系
          this.sqlite
            .prepare(
              'DELETE FROM entity_relations WHERE source_entity_id = ? OR target_entity_id = ?'
            )
            .run(entity_id, entity_id);
          this.sqlite
            .prepare('DELETE FROM entities WHERE id = ?')
            .run(entity_id);
        } else {
          // 还有其他来源，递减 mention_count
          const now = new Date().toISOString();
          this.sqlite
            .prepare(
              `UPDATE entities
               SET mention_count = MAX(mention_count - 1, 1), updated_at = ?
               WHERE id = ?`
            )
            .run(now, entity_id);
        }
      }
    });

    tx();
  }

  // ==================== 统计 ====================

  /** 获取图谱统计信息 */
  getStats(): {
    entityCount: number;
    relationCount: number;
    sourceCount: number;
  } {
    const entities = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM entities')
      .get() as { count: number };
    const relations = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM entity_relations')
      .get() as { count: number };
    const sources = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM entity_sources')
      .get() as { count: number };

    return {
      entityCount: entities.count,
      relationCount: relations.count,
      sourceCount: sources.count,
    };
  }

  /**
   * 获取两组实体之间的所有关系
   * 用于查询文章局部图谱时，找出实体集合内部的关系
   */
  getRelationsBetweenEntities(entityIds: string[]): EntityRelationRow[] {
    if (entityIds.length === 0) return [];
    const placeholders = entityIds.map(() => '?').join(',');
    return this.sqlite
      .prepare(
        `SELECT * FROM entity_relations
         WHERE source_entity_id IN (${placeholders})
           AND target_entity_id IN (${placeholders})
         ORDER BY strength DESC`
      )
      .all(...entityIds, ...entityIds) as EntityRelationRow[];
  }
}
