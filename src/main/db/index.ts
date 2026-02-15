import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import * as schema from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDatabase() {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'z-reader.db');

  const sqlite = new Database(dbPath);

  // 开启 WAL 模式提升并发性能
  sqlite.pragma('journal_mode = WAL');
  // 开启外键约束
  sqlite.pragma('foreign_keys = ON');

  sqliteInstance = sqlite;
  db = drizzle(sqlite, { schema });

  // 初始化表结构
  initTables(sqlite);

  return db;
}

export function getSqlite() {
  return sqliteInstance;
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

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT,
      author TEXT,
      cover TEXT,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      language TEXT,
      publisher TEXT,
      description TEXT,
      read_status TEXT DEFAULT 'inbox',
      read_progress REAL DEFAULT 0,
      total_locations INTEGER,
      current_location TEXT,
      is_shortlisted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_flg INTEGER DEFAULT 0
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
    CREATE INDEX IF NOT EXISTS idx_books_read_status ON books(read_status);
    CREATE INDEX IF NOT EXISTS idx_books_deleted_flg ON books(deleted_flg);

    -- FTS5 同步触发器：插入
    CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, content_text, author)
      VALUES (NEW.rowid, NEW.title, NEW.content_text, NEW.author);
    END;

    -- FTS5 同步触发器：删除
    CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, content_text, author)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.content_text, OLD.author);
    END;

    -- FTS5 同步触发器：更新
    CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, content_text, author)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.content_text, OLD.author);
      INSERT INTO articles_fts(rowid, title, content_text, author)
      VALUES (NEW.rowid, NEW.title, NEW.content_text, NEW.author);
    END;
  `);

  // Migration: add source column for Library/Feed separation
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN source TEXT DEFAULT 'feed'`);
    sqlite.exec(`UPDATE articles SET source = 'feed' WHERE source IS NULL`);
  } catch {
    // Column already exists — no-op
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)`);

  // Migration: add pinned column to feeds for sidebar pinning
  try {
    sqlite.exec(`ALTER TABLE feeds ADD COLUMN pinned INTEGER DEFAULT 0`);
  } catch {
    // Column already exists — no-op
  }

  // Migration: add anchor_path column to highlights for DOM path positioning
  try {
    sqlite.exec(`ALTER TABLE highlights ADD COLUMN anchor_path TEXT`);
  } catch {
    // Column already exists — no-op
  }

  // Migration: add file_type column to books
  try {
    sqlite.exec(`ALTER TABLE books ADD COLUMN file_type TEXT DEFAULT 'epub'`);
  } catch {
    // Column already exists
  }

  // Migration: add book_id column to highlights for book highlighting
  try {
    sqlite.exec(`ALTER TABLE highlights ADD COLUMN book_id TEXT REFERENCES books(id)`);
  } catch {
    // Column already exists
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_highlights_book_id ON highlights(book_id)`);

  // Migration: highlight_tags 关联表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS highlight_tags (
      highlight_id TEXT NOT NULL REFERENCES highlights(id),
      tag_id TEXT NOT NULL REFERENCES tags(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (highlight_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_highlight_tags_tag_id ON highlight_tags(tag_id);
  `);

  // Migration: articles 表新增 YouTube 相关字段
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN media_type TEXT DEFAULT 'article'`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN video_id TEXT`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN duration INTEGER`);
  } catch { /* Column already exists */ }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_articles_media_type ON articles(media_type)`);

  // Migration: feeds 表新增 feed_type 字段
  try {
    sqlite.exec(`ALTER TABLE feeds ADD COLUMN feed_type TEXT DEFAULT 'rss'`);
  } catch { /* Column already exists */ }

  // Migration: transcripts 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      article_id TEXT REFERENCES articles(id),
      segments TEXT,
      language TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transcripts_article_id ON transcripts(article_id);
  `);

  // Migration: transcripts 表新增 speaker_map 字段
  try {
    sqlite.exec(`ALTER TABLE transcripts ADD COLUMN speaker_map TEXT`);
  } catch { /* Column already exists */ }

  // Migration: articles 表新增 Podcast 相关字段
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_url TEXT`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_mime TEXT`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_bytes INTEGER`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_duration INTEGER`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN episode_number INTEGER`);
  } catch { /* Column already exists */ }
  try {
    sqlite.exec(`ALTER TABLE articles ADD COLUMN season_number INTEGER`);
  } catch { /* Column already exists */ }

  // Migration: downloads 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      article_id TEXT REFERENCES articles(id),
      file_path TEXT,
      bytes INTEGER,
      status TEXT DEFAULT 'queued',
      added_at TEXT NOT NULL,
      last_accessed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_article_id ON downloads(article_id);
    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
  `);

  // Migration: AI 模块表
  sqlite.exec(`
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

  // Migration: app_tasks 通用任务表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      article_id TEXT,
      status TEXT NOT NULL,
      progress REAL DEFAULT 0,
      title TEXT NOT NULL,
      detail TEXT,
      meta TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_tasks_status ON app_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_app_tasks_article_id ON app_tasks(article_id);
  `);

  // Migration: notifications 通知表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      article_id TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
  `);


  // Migration: sync 同步表
  const { initSyncTables } = require('../services/sync/sync-tables');
  initSyncTables(sqlite);
}

export { schema };
