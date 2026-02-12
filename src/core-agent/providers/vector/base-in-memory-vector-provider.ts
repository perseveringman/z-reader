import type { IVectorStore, VectorDocument, VectorSearchHit, VectorSearchParams } from '../../contracts';

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];

    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export abstract class BaseInMemoryVectorProvider implements IVectorStore {
  private readonly documents = new Map<string, Map<string, VectorDocument>>();

  constructor(readonly path: string, readonly defaultNamespace?: string) {}

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const document of documents) {
      const namespace = document.namespace || this.defaultNamespace || 'default';
      if (!this.documents.has(namespace)) {
        this.documents.set(namespace, new Map());
      }

      this.documents.get(namespace)?.set(document.id, {
        ...document,
        namespace,
      });
    }
  }

  async search(params: VectorSearchParams): Promise<VectorSearchHit[]> {
    const namespace = params.namespace || this.defaultNamespace || 'default';
    const rows = Array.from(this.documents.get(namespace)?.values() ?? []);

    const filtered = rows.filter((row) => {
      if (!params.filter) {
        return true;
      }

      const metadata = row.metadata ?? {};
      return Object.entries(params.filter).every(([key, value]) => metadata[key] === value);
    });

    return filtered
      .map((row) => ({
        id: row.id,
        score: cosineSimilarity(row.embedding, params.queryEmbedding),
        content: row.content,
        metadata: row.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, params.topK));
  }

  async delete(namespace: string, ids?: string[]): Promise<void> {
    if (!this.documents.has(namespace)) {
      return;
    }

    if (!ids || ids.length === 0) {
      this.documents.delete(namespace);
      return;
    }

    const namespaceMap = this.documents.get(namespace);
    for (const id of ids) {
      namespaceMap?.delete(id);
    }
  }
}
