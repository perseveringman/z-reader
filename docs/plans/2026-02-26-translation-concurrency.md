# 全文翻译并发优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将全文翻译的批次串行处理改为并发处理，同时调小批量大小，将翻译速度提升约 3 倍。

**Architecture:** 在 `service.ts` 的 `translateInBackground` 函数中，将串行 `for` 循环替换为 sliding window 并发模式，最多同时处理 `CONCURRENCY=3` 个批次，每批 `BATCH_SIZE=5` 段。同时小幅调低 `llm-engine.ts` 的 `maxOutputTokens` 估算系数。

**Tech Stack:** TypeScript, Node.js Promise, Drizzle ORM (SQLite)

---

### Task 1: 修改 `service.ts` — 参数 + 并发逻辑

**Files:**
- Modify: `src/main/translation/service.ts:25`（BATCH_SIZE）
- Modify: `src/main/translation/service.ts:438-519`（translateInBackground 函数主体）

**Step 1: 修改 BATCH_SIZE 和新增 CONCURRENCY 常量**

在 `service.ts` 第 25 行，将：

```typescript
/** 每批翻译的段落数 */
const BATCH_SIZE = 10;
```

替换为：

```typescript
/** 每批翻译的段落数 */
const BATCH_SIZE = 5;

/** 最大并发批次数 */
const CONCURRENCY = 3;
```

**Step 2: 替换 `translateInBackground` 函数中的串行 for 循环**

将 `service.ts` 中 `translateInBackground` 函数的 `try` 块内容（第 451-501 行）替换为以下并发实现：

```typescript
  try {
    // 将所有待翻译批次预先切好
    const batches: Array<{ start: number; end: number }> = [];
    for (let i = startIndex; i < total; i += BATCH_SIZE) {
      batches.push({ start: i, end: Math.min(i + BATCH_SIZE, total) });
    }

    // sliding window 并发：最多同时进行 CONCURRENCY 个批次
    let batchIndex = 0;

    async function runNextBatch(): Promise<void> {
      if (abortController.signal.aborted) {
        return;
      }
      if (batchIndex >= batches.length) {
        return;
      }

      const { start, end } = batches[batchIndex++];
      const batchTexts = paragraphs.slice(start, end).map((p) => p.original);

      const translatedTexts = await engine.translateBatch(batchTexts, sourceLang, targetLang);

      if (translatedTexts.length !== batchTexts.length) {
        throw new Error(
          `翻译引擎返回数量不匹配: 期望 ${batchTexts.length}, 实际 ${translatedTexts.length}`
        );
      }

      // 更新段落翻译结果
      for (let j = 0; j < translatedTexts.length; j++) {
        paragraphs[start + j].translated = translatedTexts[j];
      }

      completedCount = Math.max(completedCount, end);
      const progress = completedCount / total;

      // 更新数据库
      const now = new Date().toISOString();
      await db
        .update(schema.translations)
        .set({
          paragraphs: JSON.stringify(paragraphs),
          progress,
          updatedAt: now,
        })
        .where(eq(schema.translations.id, translationId));

      // 广播进度事件
      for (let j = 0; j < translatedTexts.length; j++) {
        broadcastProgress({
          translationId,
          index: start + j,
          translated: translatedTexts[j],
          progress,
        });
      }

      // 当前 slot 完成后，继续领取下一批
      await runNextBatch();
    }

    // 启动最多 CONCURRENCY 个并发 slot
    const slots = Array.from(
      { length: Math.min(CONCURRENCY, batches.length) },
      () => runNextBatch()
    );
    await Promise.all(slots);
```

**Step 3: 启动开发模式验证编译无报错**

```bash
cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader
pnpm lint
```

Expected: 无 TypeScript / ESLint 错误。

**Step 4: Commit**

```bash
git add src/main/translation/service.ts
git commit -m "perf(translation): 并发批次翻译，BATCH_SIZE 5，CONCURRENCY 3"
```

---

### Task 2: 修改 `llm-engine.ts` — 调低 maxOutputTokens 系数

**Files:**
- Modify: `src/main/translation/llm-engine.ts:80-81`

**Step 1: 修改 `translateBatch` 中的 maxOutputTokens 估算**

将 `llm-engine.ts` 第 79-81 行：

```typescript
    // 估算 maxOutputTokens：每段文本预估翻译后最多 3 倍字符长度 / 3 tokens per char + 额外 JSON 开销
    const estimatedTokens = texts.reduce((sum, t) => sum + t.length, 0) * 2 + 200;
    const maxOutputTokens = Math.max(estimatedTokens, 2048);
```

替换为：

```typescript
    // 估算 maxOutputTokens：中文译文通常比英文原文更短，1.5 倍系数足够
    const estimatedTokens = texts.reduce((sum, t) => sum + t.length, 0) * 1.5 + 200;
    const maxOutputTokens = Math.max(Math.ceil(estimatedTokens), 1024);
```

**Step 2: 验证编译**

```bash
pnpm lint
```

Expected: 无错误。

**Step 3: Commit**

```bash
git add src/main/translation/llm-engine.ts
git commit -m "perf(translation): 降低 LLM maxOutputTokens 估算系数至 1.5x"
```
