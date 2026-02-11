# YouTube 视频清晰度选择

**Linear Issue**: [ZYB-170](https://linear.app/zybwork/issue/ZYB-170/youtube-视频清晰度选择)

## 功能概述

允许用户在播放 YouTube 视频时自由选择清晰度（360p / 720p / 1080p / 1080p60 / 4K 等）。

## 技术方案

### YouTube Format 分类

YouTube 的视频流分两类：

| 类型 | 特征 | 最高画质 | 播放方式 |
|------|------|----------|----------|
| `formats`（muxed） | 音视频合一 | 720p | 单 `<video>` 直接播放 |
| `adaptiveFormats` | 纯视频/纯音频分开 | 4K+ | `<video>` + `<audio>` 双轨同步 |

### 播放策略

- **有音频的 format（muxed）**：直接设置 `<video src={url}>` 播放
- **无音频的 format（adaptive 纯视频）**：`<video src={videoUrl}>` + 隐藏 `<audio src={bestAudioUrl}>` 双轨同步

### 双轨同步机制

1. **事件同步**：video 的 `play`/`pause`/`seeked` 事件同步触发 audio 对应操作
2. **定时校正**：每 3 秒检查 video 和 audio 的 currentTime 差值，超过 0.3 秒则校正 audio
3. **切换清晰度**：记住 currentTime，切换 src 后在 `canplay` 事件中恢复位置

### 默认清晰度

默认选择最高的 muxed format（有音频的最高画质），通常是 720p。

## 修改文件

| 文件 | 改动 |
|------|------|
| `src/shared/types.ts` | 新增 `VideoFormat`、`VideoStreamData` 类型，修改 `ElectronAPI.youtubeGetStreamUrl` 返回类型 |
| `src/main/services/youtube-service.ts` | `getVideoStreamUrl` 返回所有 format 列表 + 最佳音频流 |
| `src/renderer/components/VideoPlayer.tsx` | 清晰度选择器 UI + 双轨合成播放逻辑 |

## 新增类型

```typescript
// VideoFormat - 单个视频/音频格式
interface VideoFormat {
  itag: number;
  qualityLabel: string;  // "1080p", "720p" 等
  width: number;
  height: number;
  url: string;
  mimeType: string;
  bitrate: number;
  hasAudio: boolean;     // muxed 为 true，adaptive 纯视频为 false
  hasVideo: boolean;
}

// VideoStreamData - 所有可用格式
interface VideoStreamData {
  formats: VideoFormat[];      // 按 height 降序，已去重
  bestAudio: VideoFormat | null; // 最佳音频流（audio/mp4 最高 bitrate）
}
```

## 后端处理逻辑

1. 遍历 `streamingData.formats`（muxed）和 `streamingData.adaptiveFormats`（adaptive）
2. 对每个视频流解密 URL 并收集为 `VideoFormat`
3. 按 `height` 降序排列，同 `qualityLabel` 取 bitrate 最高的（去重）
4. 从 `adaptiveFormats` 中找最佳音频流（`audio/mp4`，最高 bitrate）

## UI 交互

- 视频右下角（controls 上方）显示清晰度按钮，hover 时可见
- 点击展开清晰度列表，当前选中项高亮
- 选择新清晰度后自动从原位置继续播放
