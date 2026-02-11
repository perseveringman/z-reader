import { BrowserWindow, session } from 'electron';

const PARTITION = 'persist:youtube-auth';
const YOUTUBE_LOGIN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&continue=https://www.youtube.com/';

/**
 * 打开 YouTube 登录窗口，用户登录后自动关闭
 * 返回 true 表示登录成功，false 表示用户关闭了窗口
 */
export function openLoginWindow(): Promise<boolean> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 500,
      height: 700,
      title: '登录 YouTube',
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.setMenuBarVisibility(false);

    let resolved = false;

    // 监听导航，当用户成功登录回到 youtube.com 时关闭窗口
    win.webContents.on('did-navigate', async (_event, url) => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtube.com') {
          // 等待一小段时间确保 cookie 已写入
          await new Promise((r) => setTimeout(r, 1000));
          const loggedIn = await isLoggedIn();
          if (loggedIn && !resolved) {
            resolved = true;
            win.close();
            resolve(true);
          }
        }
      } catch {
        // URL 解析失败，忽略
      }
    });

    win.on('closed', () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    win.loadURL(YOUTUBE_LOGIN_URL);
  });
}

/**
 * 从 persist:youtube-auth 分区读取 youtube.com 的所有 cookie
 * 返回格式化的 cookie 字符串 "name=value; name2=value2; ..."
 */
export async function getStoredCookies(): Promise<string | null> {
  const ses = session.fromPartition(PARTITION);
  const cookies = await ses.cookies.get({ domain: '.youtube.com' });
  if (cookies.length === 0) return null;
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * 清除 persist:youtube-auth 分区中的所有 cookie
 */
export async function clearAuth(): Promise<void> {
  const ses = session.fromPartition(PARTITION);
  await ses.clearStorageData({ storages: ['cookies'] });
}

/**
 * 检查是否有有效的 YouTube 登录 cookie（SAPISID 存在）
 */
export async function isLoggedIn(): Promise<boolean> {
  const ses = session.fromPartition(PARTITION);
  const cookies = await ses.cookies.get({ domain: '.youtube.com', name: 'SAPISID' });
  return cookies.length > 0;
}
