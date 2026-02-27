/**
 * 本地 Reranker
 * 基于关键词重叠度对 RAG 检索结果进行重排序
 */
export class LocalReranker {
  private weight: number;

  /**
   * @param weight rerank 分数的权重（0-1），默认 0.4
   */
  constructor(weight = 0.4) {
    this.weight = weight;
  }

  /**
   * 对候选结果重排序
   */
  rerank<T extends { content: string; score: number }>(
    query: string,
    candidates: T[],
    topK: number
  ): T[] {
    if (candidates.length === 0) return [];

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return candidates.slice(0, topK);

    // 计算每个候选的关键词重叠分数
    const scored = candidates.map(candidate => {
      const docTerms = this.tokenize(candidate.content);
      const overlapScore = this.computeOverlap(queryTerms, docTerms);
      return { candidate, overlapScore };
    });

    // 归一化原始分数
    const maxOriginal = Math.max(...candidates.map(c => c.score), 1e-10);
    const maxOverlap = Math.max(...scored.map(s => s.overlapScore), 1e-10);

    // 融合分数
    const fused = scored.map(({ candidate, overlapScore }) => ({
      candidate,
      fusedScore:
        (1 - this.weight) * (candidate.score / maxOriginal) +
        this.weight * (overlapScore / maxOverlap),
    }));

    // 排序并返回
    fused.sort((a, b) => b.fusedScore - a.fusedScore);
    return fused.slice(0, topK).map(f => ({
      ...f.candidate,
      score: f.fusedScore,
    }));
  }

  /** 分词：中文 bigram + 英文空格分割 */
  private tokenize(text: string): string[] {
    const terms: string[] = [];

    // 提取英文词
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    terms.push(...englishWords.map(w => w.toLowerCase()));

    // 提取中文 bigram
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    for (let i = 0; i < chineseChars.length - 1; i++) {
      terms.push(chineseChars[i] + chineseChars[i + 1]);
    }

    return terms;
  }

  /** 计算 query terms 与 doc terms 的重叠率 */
  private computeOverlap(queryTerms: string[], docTerms: string[]): number {
    const docSet = new Set(docTerms);
    let matches = 0;
    for (const term of queryTerms) {
      if (docSet.has(term)) matches++;
    }
    return queryTerms.length > 0 ? matches / queryTerms.length : 0;
  }
}
