import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

function collectFiles(dir: string, extension = '.ts'): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, extension));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

function relativeFile(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

describe('core-agent architecture boundary', () => {
  it('core-agent 不得反向依赖业务与 UI 层', () => {
    const coreDir = path.join(rootDir, 'src/core-agent');
    const files = collectFiles(coreDir);

    const forbiddenImportPatterns: RegExp[] = [
      /from\s+['"]\.\.\/\.\.\/main\//,
      /from\s+['"]\.\.\/\.\.\/renderer\//,
      /from\s+['"]\.\.\/\.\.\/business-adapters\//,
      /from\s+['"]@\/main\//,
      /from\s+['"]@\/renderer\//,
      /from\s+['"]@\/business-adapters\//,
    ];

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const hasViolation = forbiddenImportPatterns.some((pattern) => pattern.test(content));

      if (hasViolation) {
        violations.push(relativeFile(file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('core-agent 不包含业务领域词汇', () => {
    const coreDir = path.join(rootDir, 'src/core-agent');
    const files = collectFiles(coreDir);

    const forbiddenDomainTerms = /\b(feed|article|highlight|podcast|book|reader-view)\b/i;
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (forbiddenDomainTerms.test(content)) {
        violations.push(relativeFile(file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('业务适配层通过 contracts 与 core-agent 交互', () => {
    const adapterFile = path.join(rootDir, 'src/business-adapters/zreader-agent/provider.ts');
    const content = fs.readFileSync(adapterFile, 'utf8');

    expect(content).toContain("from '../../core-agent/contracts'");
    expect(content).not.toContain("from '../../core-agent/runtime'");
    expect(content).not.toContain("from '../../main/'");
  });
});
