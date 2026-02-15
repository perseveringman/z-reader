# 本地音视频上传与统一转写链路设计

- 日期: 2026-02-15
- 状态: 已确认（Brainstorming 输出）
- 相关目标:
  - 提供上传本地音频/视频文件能力
  - 本地音频进入 `Podcasts` 列表，本地视频进入 `Videos` 列表
  - 抽象转写链路，统一满足播客与视频，支持未来扩展

## 1. 背景与问题

当前应用已具备 `library-videos`、`library-podcasts` 两个媒体列表，也已有播客与视频阅读页。  
但内容新增入口仍以 URL 为主，缺少“本地媒体导入”能力。  
此外，转写链路存在分散逻辑：

- 播客侧有实时/后台 ASR 流程
- 视频侧优先走 YouTube 原生字幕获取
- 两侧在“可转写源解析、下载、转码、落库”上尚未形成统一编排层

目标是在不破坏现有体验的前提下，实现本地导入 + 统一转写能力。

## 2. 已确认决策

1. 文件存储策略: 复制到应用目录（不是仅保存原路径）
2. 上传入口: 在现有 `Save URL` 弹窗中新增“本地文件”Tab
3. 首版格式范围:
   - 音频: `mp3/m4a/wav/flac/aac/ogg`
   - 视频: `mp4/mov/webm/mkv`
4. 视频转写交互:
   - 在视频阅读页“原字幕位置”处理
   - 有字幕时不显示转写按钮
   - 无字幕时显示“开始转写”
5. 转写实现方向:
   - 通过 ffmpeg 抽音轨
   - 复用播客已有音频大模型转写接口
   - 抽象统一转写编排层，兼容未来更多媒体类型

## 3. 方案总览

### 3.1 上传与入库

- 在 `AddUrlDialog` 增加 Tab: `URL` / `本地文件`
- 点击本地文件上传时，弹出系统文件选择器（支持多选）
- Main 进程将文件复制到:
  - `app.getPath('userData')/media/podcasts`
  - `app.getPath('userData')/media/videos`
- 通过扩展名/容器类型判定媒体类别，创建 `articles` 记录并设置:
  - `source = library`
  - `mediaType = podcast | video`
  - `readStatus = inbox`

### 3.2 统一转写架构

新增 `src/main/services/transcription/`：

- `source-resolver.ts`
  - 输入: `articleId`
  - 输出统一源描述: 本地文件 / 已下载音频 / 远程音频 URL
- `audio-materializer.ts`
  - 将各种源统一为“可转写音频文件路径”
  - 若为视频文件，调用 ffmpeg 抽取音轨
- `transcription-runner.ts`
  - 承接现有 provider（火山/腾讯）
  - 处理进度、分块、落库 `transcripts`
- `cleanup.ts`
  - 临时文件/抽轨产物清理

`asr-handlers.ts` 与 `standard-asr-service.ts` 只保留入口与任务调度，核心逻辑委托至 orchestrator。

## 4. 数据与兼容策略

首版为控制改动范围，沿用现有 `articles` 字段，不强制新增表字段：

- 本地音频: 优先填 `audioUrl = file://...`
- 本地视频: 填 `url = file://...`
- `mediaType` 继续作为列表与阅读分流依据

后续若需要更强语义，可追加 `localFilePath` 等字段并做迁移；首版先通过 resolver 统一读取 `file://` 路径与下载记录，保证功能闭环。

## 5. 播放与阅读页行为

### 5.1 PodcastReaderView

- 对本地音频直接可播放（`audioUrl=file://...`）
- 转写入口继续可用，底层换成统一 orchestrator

### 5.2 VideoReaderView

- 本地视频播放支持（播放器新增本地文件 source 分支）
- 字幕区逻辑:
  1. 先读 `transcriptGet`
  2. 若已有字幕: 显示字幕，不显示转写按钮
  3. 若无字幕:
     - 且有 `videoId`: 尝试 `transcriptFetch`（YouTube）
     - 仍无字幕: 显示“开始转写”按钮
     - 本地视频（无 `videoId`）直接显示按钮

## 6. 错误处理与可观测性

统一错误码与文案映射：

- `SOURCE_NOT_FOUND`: 无可用媒体源
- `MEDIA_COPY_FAILED`: 导入复制失败
- `FFMPEG_FAILED`: 抽轨/转码失败
- `ASR_NOT_CONFIGURED`: 凭据未配置
- `TRANSCRIBE_FAILED`: Provider 转写失败

要求：

- 用户可见短提示（可重试）
- 任务系统保留失败原因
- 日志附带 `articleId`, `mediaType`, `sourceKind`

## 7. 实施切分

### Phase 1: 上传闭环

- 新增本地文件上传 IPC
- `AddUrlDialog` 增加本地文件 Tab
- 文件复制 + `articles` 入库 + 列表刷新

### Phase 2: 统一转写编排层

- 落地 `transcription/` 目录
- 迁移 `asr-start` 与 `asr-standard` 到统一 runner
- 保持对播客现有 UI 行为兼容

### Phase 3: 视频阅读页转写交互

- 字幕区加入“无字幕 -> 转写按钮”逻辑
- 完成“有字幕不显示按钮”规则
- 接入后台任务状态更新

## 8. 测试策略

### 单元测试

- `source-resolver`: 各媒体来源分支（本地/下载/远程）
- `audio-materializer`: 视频抽轨、音频直通、异常分支

### 集成测试

- 本地音频导入 -> 播客列表可见 -> 可播放 -> 可转写
- 本地视频导入 -> 视频列表可见 -> 可播放 -> 可转写并落库字幕

### UI 测试

- 视频阅读页字幕区按钮显隐:
  - 有字幕: 按钮隐藏
  - 无字幕: 按钮显示

## 9. 非目标（首版不做）

- 自动批量转写所有导入视频
- 新增复杂媒体元数据抓取（如本地视频封面自动抽帧）
- 对旧数据进行强制 schema 迁移

## 10. 风险与缓解

- 风险: 大视频文件抽轨耗时长  
  缓解: 走后台任务 + 明确进度反馈 + 可取消

- 风险: 不同容器编码导致 ffmpeg 失败  
  缓解: 标准化错误码 + 提示用户转换格式后重试

- 风险: 本地路径兼容差异（平台差异、转义问题）  
  缓解: 统一 URI/path 规范化工具，集中在 resolver 处理

