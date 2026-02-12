export interface MemoryRecord {
  id: string;
  scope: 'session' | 'long_term';
  namespace: string;
  key: string;
  value: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  scope?: MemoryRecord['scope'];
  namespace: string;
  key?: string;
  limit?: number;
}

export interface VectorDocument {
  id: string;
  namespace: string;
  embedding: number[];
  content: string;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchParams {
  namespace: string;
  queryEmbedding: number[];
  topK: number;
  filter?: Record<string, string | number | boolean>;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RetrieverQuery {
  namespace: string;
  text: string;
  topK?: number;
  filter?: Record<string, string | number | boolean>;
}

export interface RetrieverResult {
  textMatches: Array<{ id: string; score: number; content: string }>;
  vectorMatches: VectorSearchHit[];
}

export interface IMemoryStore {
  upsert(record: MemoryRecord): Promise<void>;
  query(query: MemoryQuery): Promise<MemoryRecord[]>;
  delete(namespace: string, key: string): Promise<void>;
}

export interface IVectorStore {
  upsert(documents: VectorDocument[]): Promise<void>;
  search(params: VectorSearchParams): Promise<VectorSearchHit[]>;
  delete(namespace: string, ids?: string[]): Promise<void>;
}

export interface IRetriever {
  retrieve(query: RetrieverQuery): Promise<RetrieverResult>;
}
