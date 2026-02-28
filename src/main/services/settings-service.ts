import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';

const SETTINGS_FILE = 'z-reader-settings.json';

function getSettingsPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, SETTINGS_FILE);
}

const DEFAULT_SETTINGS: AppSettings = {
  downloadCapacityMb: 5120, // 5 GB default
};

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(getSettingsPath(), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const settingsPath = getSettingsPath();
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  return settings;
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged = { ...current, ...partial };
  return saveSettings(merged);
}

/**
 * 生成安装识别码，格式: ZR-YYYYMMDD-XXXXXXXX
 * - ZR 前缀标识 Z-Reader
 * - YYYYMMDD 为首次启动日期，可用于判断早期用户
 * - XXXXXXXX 为 8 位随机十六进制，保证唯一性
 */
function generateInstallId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = randomBytes(4).toString('hex');
  return `ZR-${y}${m}${d}-${rand}`;
}

/** 确保 settings 中存在 installId，不存在则生成并持久化 */
export function ensureInstallId(): string {
  const settings = loadSettings();
  if (settings.installId) return settings.installId;
  const id = generateInstallId();
  updateSettings({ installId: id });
  return id;
}
