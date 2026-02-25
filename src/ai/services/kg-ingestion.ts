import type { KGDatabase, EntitySourceType } from '../providers/kg-db';
import type {
  createEntityExtractionService,
  ExtractInput,
  ExtractedEntity,
  ExtractedRelation,
} from './entity-extraction';

// ==================== 类型定义 ====================

export interface KGIngestionDeps {
  kgDb: KGDatabase;
  extractionService: ReturnType<typeof createEntityExtractionService>;
}

export interface KGIngestInput {
  sourceType: EntitySourceType;
  sourceId: string;
  sourceTitle: string;
  chunks: Array<{ chunkId: string; content: string }>;
}

export interface KGIngestResult {
  entitiesCreated: number;
  entitiesUpdated: number;
  relationsCreated: number;
  relationsUpdated: number;
  success: boolean;
  error?: string;
}

// ==================== Pipeline ====================

/**
 * 创建知识图谱写入管道
 * 编排：LLM 抽取 → 实体去重 → 关系去重 → 写入数据库
 */
export function createKGIngestionPipeline(deps: KGIngestionDeps) {
  const { kgDb, extractionService } = deps;

  /**
   * 解析抽取到的实体 → 写入/更新数据库，返回 name → entityId 映射
   */
  function upsertEntities(
    entities: ExtractedEntity[],
    sourceType: EntitySourceType,
    sourceId: string,
    chunkId?: string
  ): {
    nameToId: Map<string, string>;
    created: number;
    updated: number;
  } {
    const nameToId = new Map<string, string>();
    let created = 0;
    let updated = 0;

    for (const entity of entities) {
      const normalizedName = entity.name.toLowerCase().trim();

      // 尝试查找已有实体：先精确名称匹配，再 alias 匹配
      let existing = kgDb.findEntityByName(entity.name);
      if (!existing) {
        existing = kgDb.findEntityByAlias(entity.name);
      }

      if (existing) {
        // 实体已存在 → 递增 mention_count + 关联来源
        kgDb.incrementMentionCount(existing.id);
        kgDb.addEntitySource(existing.id, sourceType, sourceId, chunkId);

        // 如果新 description 更长，更新
        if (
          entity.description &&
          entity.description.length > (existing.description?.length ?? 0)
        ) {
          kgDb.updateEntity(existing.id, {
            description: entity.description,
          });
        }

        // 合并新 aliases
        const existingAliases: string[] = JSON.parse(
          existing.aliases_json || '[]'
        );
        const newAliases = entity.aliases.filter(
          (a) =>
            !existingAliases.some(
              (ea) => ea.toLowerCase() === a.toLowerCase()
            )
        );
        if (newAliases.length > 0) {
          kgDb.updateEntity(existing.id, {
            aliases: [...existingAliases, ...newAliases],
          });
        }

        nameToId.set(normalizedName, existing.id);
        updated++;
      } else {
        // 新实体 → 创建 + 关联来源
        const created_entity = kgDb.createEntity({
          name: entity.name,
          type: entity.type,
          description: entity.description || null,
          aliases: entity.aliases,
        });
        kgDb.addEntitySource(
          created_entity.id,
          sourceType,
          sourceId,
          chunkId
        );
        nameToId.set(normalizedName, created_entity.id);
        created++;
      }
    }

    return { nameToId, created, updated };
  }

  /**
   * 解析抽取到的关系 → 写入/更新数据库
   */
  function upsertRelations(
    relations: ExtractedRelation[],
    nameToId: Map<string, string>
  ): { created: number; updated: number } {
    let created = 0;
    let updated = 0;

    for (const rel of relations) {
      const sourceId = nameToId.get(rel.source.toLowerCase().trim());
      const targetId = nameToId.get(rel.target.toLowerCase().trim());

      // 如果 source 或 target 未解析到 entity，跳过
      if (!sourceId || !targetId) continue;

      // 跳过自指关系
      if (sourceId === targetId) continue;

      // 查找已有关系
      const existing = kgDb.findRelation(sourceId, targetId, rel.type);

      if (existing) {
        kgDb.incrementRelationStrength(existing.id);
        updated++;
      } else {
        kgDb.createRelation({
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationType: rel.type,
        });
        created++;
      }
    }

    return { created, updated };
  }

  return {
    /**
     * 从 chunks 中抽取实体和关系并写入知识图谱
     */
    async ingest(input: KGIngestInput): Promise<KGIngestResult> {
      try {
        const extractInputs: ExtractInput[] = input.chunks.map((c) => ({
          chunkId: c.chunkId,
          content: c.content,
          sourceTitle: input.sourceTitle,
        }));

        // 1. LLM 抽取实体和关系
        const extraction = await extractionService.extract(extractInputs);

        if (
          extraction.entities.length === 0 &&
          extraction.relations.length === 0
        ) {
          return {
            entitiesCreated: 0,
            entitiesUpdated: 0,
            relationsCreated: 0,
            relationsUpdated: 0,
            success: true,
          };
        }

        // 2. 写入实体（事务内）
        const entityResult = upsertEntities(
          extraction.entities,
          input.sourceType,
          input.sourceId,
          input.chunks[0]?.chunkId
        );

        // 3. 写入关系
        const relationResult = upsertRelations(
          extraction.relations,
          entityResult.nameToId
        );

        return {
          entitiesCreated: entityResult.created,
          entitiesUpdated: entityResult.updated,
          relationsCreated: relationResult.created,
          relationsUpdated: relationResult.updated,
          success: true,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `KG ingestion failed for ${input.sourceType}/${input.sourceId}:`,
          message
        );
        return {
          entitiesCreated: 0,
          entitiesUpdated: 0,
          relationsCreated: 0,
          relationsUpdated: 0,
          success: false,
          error: message,
        };
      }
    },

    /**
     * 删除指定来源的知识图谱数据
     */
    remove(sourceType: EntitySourceType, sourceId: string): void {
      kgDb.deleteEntitiesBySource(sourceType, sourceId);
    },
  };
}
