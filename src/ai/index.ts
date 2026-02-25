export { createLLMProvider } from './providers/llm';
export { DEFAULT_AI_CONFIG } from './providers/config';
export { getEmbeddingConfig } from './providers/config';
export { AIDatabase } from './providers/db';
export type { AIProviderConfig } from './providers/config';
export type { InsertTaskLogInput, TaskLogRow, ChatSessionRow } from './providers/db';
export type { AISkill, AIContext, AITaskStatus, AITaskLog } from './skills/types';
export { extractTopicsSkill } from './skills/extract-topics';
export { AITraceCollector } from './services/trace';
export type { AITraceStep, AIExecutionTrace } from './services/trace';
export { ChatService } from './services/chat';
export type { ChatServiceDeps } from './services/chat';
export { createAllTools, createArticleTools, createTagTools, createFeedTools, createHighlightTools } from './tools';
export type { ToolContext } from './tools';

// RAG 模块导出
export { RAGDatabase } from './providers/rag-db';
export type {
  ChunkSourceType,
  ChunkEmbeddingStatus,
  ChunkRow,
  CreateChunkInput,
  VectorSearchResult,
} from './providers/rag-db';
export { EmbeddingService, createEmbeddingService, DEFAULT_EMBEDDING_CONFIG } from './services/embedding';
export type { EmbeddingServiceConfig, EmbeddingResult, BatchEmbeddingResult, EmbeddingModelInfo } from './services/embedding';
export { ChunkingService, createChunkingService, estimateTokenCount } from './services/chunking';
export type { ChunkInput, ChunkResult, ChunkingConfig } from './services/chunking';
export { IngestionPipeline, createIngestionPipeline } from './services/ingestion';
export type { IngestSource, IngestResult, IngestionPipelineDeps } from './services/ingestion';
export { HybridRetriever, createHybridRetriever } from './services/retriever';
export type { SearchQuery, SearchFilters, SearchResult } from './services/retriever';
export { ContextBuilder, createContextBuilder } from './services/context-builder';
export type { ContextBuilderConfig, BuiltContext } from './services/context-builder';

// Knowledge Graph 模块导出
export { KGDatabase } from './providers/kg-db';
export type {
  EntityRow,
  EntityRelationRow,
  EntitySourceRow,
  EntityType,
  RelationType,
  EntitySourceType,
  CreateEntityInput,
  CreateRelationInput,
} from './providers/kg-db';
export { createEntityExtractionService } from './services/entity-extraction';
export type {
  ExtractInput as KGExtractInputChunk,
  ExtractionResult as KGExtractionResult,
  ExtractedEntity,
  ExtractedRelation,
  EntityExtractionDeps,
} from './services/entity-extraction';
export { createKGIngestionPipeline } from './services/kg-ingestion';
export type {
  KGIngestionDeps,
  KGIngestInput,
  KGIngestResult,
} from './services/kg-ingestion';
export { createKGService } from './services/kg-service';
export type { GraphNode, GraphEdge, GraphData } from './services/kg-service';
