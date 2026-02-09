import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import * as schema from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase() {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'z-reader.db');

  const sqlite = new Database(dbPath);

  // 开启 WAL 模式提升并发性能
  sqlite.pragma('journal_mode = WAL');
  // 开启外键约束
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  // 初始化表结构
  initTables(sqlite);

  return db;
}

function initTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      favicon TEXT,
      category TEXT,
      etag TEXT,
      last_modified TEXT,
      fetch_interval INTEGER DEFAULT 15,
      last_fetched_at TEXT,
      error_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_flg INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      feed_id TEXT REFERENCES feeds(id),
      guid TEXT,
      url TEXT,
      title TEXT,
      author TEXT,
      summary TEXT,
      content TEXT,
      content_text TEXT,
      thumbnail TEXT,
      word_count INTEGER,
      reading_time INTEGER,
      language TEXT,
      published_at TEXT,
      saved_at TEXT,
      read_status TEXT DEFAULT 'inbox',
      read_progress REAL DEFAULT 0,
      is_shortlisted INTEGER DEFAULT 0,
      domain TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_flg INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      article_id TEXT REFERENCES articles(id),
      text TEXT,
      note TEXT,
      color TEXT DEFAULT 'yellow',
      start_offset INTEGER,
      end_offset INTEGER,
      paragraph_index INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_flg INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_flg INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      article_id TEXT NOT NULL REFERENCES articles(id),
      tag_id TEXT NOT NULL REFERENCES tags(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (article_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filter_json TEXT,
      sort_field TEXT,
      sort_order TEXT DEFAULT 'desc',
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 全文搜索索引
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title, content_text, author,
      content='articles',
      content_rowid='rowid'
    );

    -- 常用查询索引
    CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
    CREATE INDEX IF NOT EXISTS idx_articles_read_status ON articles(read_status);
    CREATE INDEX IF NOT EXISTS idx_articles_saved_at ON articles(saved_at);
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_deleted_flg ON articles(deleted_flg);
    CREATE INDEX IF NOT EXISTS idx_feeds_deleted_flg ON feeds(deleted_flg);
    CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id ON article_tags(tag_id);
  `);
}

export { schema };
