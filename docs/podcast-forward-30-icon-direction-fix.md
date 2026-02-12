# Podcast「前进 30 秒」图标方向修复

## 背景

在 Podcast 播放器中：

- 「后退 15 秒」使用了逆时针图标（`RotateCcw`）
- 「前进 30 秒」此前使用的是 `SkipForward`

这导致两个跳转按钮在视觉语义上不成对，不符合“前进/后退方向相反”的预期。

## 修改内容

- 文件：`src/renderer/components/AudioPlayer.tsx`
- 将「前进 30 秒」按钮图标从 `SkipForward` 替换为 `RotateCw`
- 保持按钮行为不变（仍调用 `skipForward`，前进 30 秒）

## 验证

新增回归测试：

- `tests/audio-player-icon-direction.test.ts`

测试断言：

- 渲染结果包含 `lucide-rotate-ccw`（后退）
- 渲染结果包含 `lucide-rotate-cw`（前进）
- 渲染结果不再包含 `lucide-skip-forward`

执行结果：

- `npx vitest run tests/audio-player-icon-direction.test.ts` ✅
- `npx vitest run` ✅（44/44 通过）

