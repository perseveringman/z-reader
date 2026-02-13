import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

/** 插入任务日志的输入参数 */
export interface InsertTaskLogInput {
  taskType: string;
  status: string;
  inputJson: string;
  outputJson: string | null;
  tracesJson?: string | null;
  tokenCount: number;
  costUsd: number;
  errorText?: string | null;
  metadataJson?: string | null;
}

/** 任务日志行（匹配 SQLite 原生 snake_case 列名） */
export interface TaskLogRow {
  id: string;
  task_type: string;
  status: string;
  input_json: string;
  output_json: string | null;
  traces_json: string | null;
  token_count: number;
  cost_usd: number;
  error_text: string | null;
  metadata_json: string | null;
  created_at: string;
}

/**
 * AI 模块数据库操作层
 * 负责 ai_settings 和 ai_task_logs 两张表的 CRUD
 */
export class AIDatabase {
  constructor(private sqlite: Database.Database) {}

  /** 初始化 AI 相关表 */
  initTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ai_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_task_logs (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input_json TEXT,
        output_json TEXT,
        traces_json TEXT,
        token_count INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        error_text TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_task_logs_type ON ai_task_logs(task_type);
      CREATE INDEX IF NOT EXISTS idx_ai_task_logs_created ON ai_task_logs(created_at);
    `);
  }

  /** 读取设置，不存在则返回 null */
  getSetting(key: string): string | null {
    const row = this.sqlite.prepare(
      'SELECT value_json FROM ai_settings WHERE key = ?'
    ).get(key) as { value_json: string } | undefined;
    return row ? JSON.parse(row.value_json) : null;
  }

  /** 保存设置（upsert） */
  setSetting(key: string, value: unknown): void {
    const now = new Date().toISOString();
    this.sqlite.prepare(`
      INSERT INTO ai_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now);
  }

  /** 插入任务日志 */
  insertTaskLog(input: InsertTaskLogInput): TaskLogRow {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.sqlite.prepare(`
      INSERT INTO ai_task_logs (id, task_type, status, input_json, output_json, traces_json, token_count, cost_usd, error_text, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.taskType, input.status,
      input.inputJson, input.outputJson ?? null,
      input.tracesJson ?? null, input.tokenCount, input.costUsd,
      input.errorText ?? null, input.metadataJson ?? null, now
    );
    return {
      id,
      task_type: input.taskType,
      status: input.status,
      input_json: input.inputJson,
      output_json: input.outputJson ?? null,
      traces_json: input.tracesJson ?? null,
      token_count: input.tokenCount,
      cost_usd: input.costUsd,
      error_text: input.errorText ?? null,
      metadata_json: input.metadataJson ?? null,
      created_at: now,
    };
  }

  /** 查询最近 N 条任务日志 */
  listTaskLogs(limit: number): TaskLogRow[] {
    return this.sqlite.prepare(
      'SELECT * FROM ai_task_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as TaskLogRow[];
  }
}
