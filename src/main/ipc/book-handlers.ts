import { ipcMain, dialog, app } from 'electron';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { BookListQuery, UpdateBookInput } from '../../shared/types';

export function registerBookHandlers() {
  const { BOOK_LIST, BOOK_GET, BOOK_IMPORT, BOOK_DELETE, BOOK_UPDATE, BOOK_GET_CONTENT, BOOK_PERMANENT_DELETE, BOOK_RESTORE } = IPC_CHANNELS;

  // 获取书籍存储目录
  function getBooksDir() {
    return join(app.getPath('userData'), 'books');
  }

  // 查询书籍列表
  ipcMain.handle(BOOK_LIST, async (_event, query: BookListQuery) => {
    const db = getDatabase();
    const conditions = [eq(schema.books.deletedFlg, 0)];

    if (query.readStatus) {
      conditions.push(eq(schema.books.readStatus, query.readStatus));
    }
    if (query.isShortlisted) {
      conditions.push(eq(schema.books.isShortlisted, 1));
    }

    return db
      .select()
      .from(schema.books)
      .where(and(...conditions))
      .orderBy(desc(schema.books.updatedAt))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
  });

  // 获取单本书
  ipcMain.handle(BOOK_GET, async (_event, id: string) => {
    const db = getDatabase();
    const result = await db.select().from(schema.books).where(eq(schema.books.id, id));
    return result[0] ?? null;
  });

  // 导入 EPUB 文件
  ipcMain.handle(BOOK_IMPORT, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择 EPUB 文件',
      filters: [{ name: 'EPUB', extensions: ['epub'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || filePaths.length === 0) return [];

    const db = getDatabase();
    const booksDir = getBooksDir();
    await mkdir(booksDir, { recursive: true });

    const now = new Date().toISOString();
    const importedBooks = [];

    for (const srcPath of filePaths) {
      const id = randomUUID();
      const fileName = basename(srcPath);
      const title = basename(fileName, extname(fileName));
      const destPath = join(booksDir, `${id}${extname(fileName)}`);

      // 复制文件到应用数据目录
      await copyFile(srcPath, destPath);

      // 获取文件大小
      const fileStat = await stat(destPath);

      await db.insert(schema.books).values({
        id,
        title,
        author: null,
        cover: null,
        filePath: destPath,
        fileSize: fileStat.size,
        language: null,
        publisher: null,
        description: null,
        readStatus: 'inbox',
        readProgress: 0,
        totalLocations: null,
        currentLocation: null,
        isShortlisted: 0,
        createdAt: now,
        updatedAt: now,
        deletedFlg: 0,
      });

      const [book] = await db.select().from(schema.books).where(eq(schema.books.id, id));
      importedBooks.push(book);
    }

    return importedBooks;
  });

  // 软删除书籍
  ipcMain.handle(BOOK_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.books).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.books.id, id));
  });

  // 更新书籍信息
  ipcMain.handle(BOOK_UPDATE, async (_event, input: UpdateBookInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.readStatus !== undefined) updates.readStatus = input.readStatus;
    if (input.readProgress !== undefined) updates.readProgress = input.readProgress;
    if (input.currentLocation !== undefined) updates.currentLocation = input.currentLocation;
    if (input.isShortlisted !== undefined) updates.isShortlisted = input.isShortlisted ? 1 : 0;
    if (input.title !== undefined) updates.title = input.title;
    if (input.author !== undefined) updates.author = input.author;

    await db.update(schema.books).set(updates).where(eq(schema.books.id, input.id));
    const [result] = await db.select().from(schema.books).where(eq(schema.books.id, input.id));
    return result;
  });

  // 获取书籍文件路径（渲染进程用 epubjs 打开）
  ipcMain.handle(BOOK_GET_CONTENT, async (_event, id: string) => {
    const db = getDatabase();
    const [book] = await db.select().from(schema.books).where(eq(schema.books.id, id));
    if (!book) return null;
    return book.filePath;
  });

  // 永久删除书籍（同时删除文件）
  ipcMain.handle(BOOK_PERMANENT_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const [book] = await db.select().from(schema.books).where(eq(schema.books.id, id));
    if (book) {
      try {
        await unlink(book.filePath);
      } catch {
        // 文件可能已被手动删除，忽略错误
      }
      await db.delete(schema.books).where(eq(schema.books.id, id));
    }
  });

  // 恢复已删除书籍
  ipcMain.handle(BOOK_RESTORE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.books).set({ deletedFlg: 0, updatedAt: now }).where(eq(schema.books.id, id));
    const [result] = await db.select().from(schema.books).where(eq(schema.books.id, id));
    return result;
  });
}
