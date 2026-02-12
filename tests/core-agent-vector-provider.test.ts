import { describe, expect, it } from 'vitest';

import { LanceDbProvider, SqliteVecProvider, VectorProviderFactory } from '../src/core-agent';

describe('core-agent vector providers', () => {
  it('factory 可创建 sqlite-vec provider', () => {
    const provider = VectorProviderFactory.create({
      kind: 'sqlite_vec',
      path: '/tmp/agent.sqlite',
      namespace: 'default',
    });

    expect(provider).toBeInstanceOf(SqliteVecProvider);
  });

  it('factory 可创建 lancedb provider', () => {
    const provider = VectorProviderFactory.create({
      kind: 'lancedb',
      path: '/tmp/agent-lancedb',
      namespace: 'default',
    });

    expect(provider).toBeInstanceOf(LanceDbProvider);
  });

  it('provider 支持 upsert/search/delete 最小链路', async () => {
    const provider = VectorProviderFactory.create({
      kind: 'sqlite_vec',
      path: '/tmp/agent.sqlite',
      namespace: 'default',
    });

    await provider.upsert([
      {
        id: 'd1',
        namespace: 'default',
        embedding: [0.1, 0.2, 0.9],
        content: 'alpha',
      },
      {
        id: 'd2',
        namespace: 'default',
        embedding: [0.1, 0.1, 0.8],
        content: 'beta',
      },
    ]);

    const hits = await provider.search({
      namespace: 'default',
      queryEmbedding: [0.1, 0.2, 0.95],
      topK: 1,
    });

    expect(hits).toHaveLength(1);
    expect(['d1', 'd2']).toContain(hits[0].id);

    await provider.delete('default', ['d1', 'd2']);

    const emptyHits = await provider.search({
      namespace: 'default',
      queryEmbedding: [0.1, 0.2, 0.95],
      topK: 1,
    });

    expect(emptyHits).toHaveLength(0);
  });
});
