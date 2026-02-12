# Podcast 音量控件布局稳定修复

## 问题

在 Podcast 播放器中，音量控件会影响 controls 行布局，导致中间播放控制区（后退/播放/前进）出现位移风险。

## 修复方案

文件：`src/renderer/components/AudioPlayer.tsx`

- 右侧音量区改为固定宽度容器：`w-28 shrink-0`
- 音量滑杆改为常驻显示（不再依赖 hover 展开）
- 音量图标与滑杆并排显示，避免显隐逻辑导致布局变化

## 验证

按最新需求（不增加新测试）仅保留既有测试验证：

- `npx vitest run tests/highlight-engine.test.ts tests/audio-player-icon-direction.test.ts` ✅（44/44）
