# Podcast Streaming ASR + YouTube-like Transcript

## Overview

Add streaming speech recognition (ASR) to the podcast detail page using Volcengine's SeedASR 2.0 API. After transcription, display a fully interactive transcript identical to the YouTube detail page experience — time-synced segments, click-to-seek, highlights with notes/tags, free-browse mode.

## Decisions Made

- **ASR processing**: Electron main process (full Node.js WebSocket + file access)
- **Audio source**: Use downloaded file only (require download first)
- **Credentials**: Store in AppSettings (Settings page UI)
- **ASR model**: SeedASR 2.0 (`volc.seedasr.sauc.duration`) via `bigmodel_async` endpoint
- **Audio conversion**: Bundle `ffmpeg-static` for format conversion
- **Long audio**: Split into ~30min chunks, process sequentially with offset timestamps
- **Progress UX**: Progress bar + live segments appearing
- **Re-run**: Allow re-transcribe with confirmation

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (PodcastReaderView)                                    │
│                                                                   │
│  Transcript Tab                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  State machine:                                              │ │
│  │  not-configured → not-downloaded → ready → transcribing →    │ │
│  │  complete (reuses TranscriptView from YouTube)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│       │ IPC: asr:start(articleId)        ▲ IPC events:           │
│       │ IPC: asr:cancel(articleId)       │ asr:progress           │
│       ▼                                  │ asr:segment            │
├─────────────────────────────────────────┤ asr:complete           │
│  Main Process                            │ asr:error              │
│                                          │                        │
│  ┌──────────────────┐  ┌──────────────┐ │                        │
│  │ asr-handlers.ts  │──│ volc-asr-    │ │                        │
│  │ (IPC handlers)   │  │ service.ts   │ │                        │
│  └──────────────────┘  └──────┬───────┘ │                        │
│                               │          │                        │
│                   ┌───────────┴────────┐ │                        │
│                   │ Audio Pipeline:     │ │                        │
│                   │ 1. Read local file  │ │                        │
│                   │ 2. ffmpeg convert   │ │                        │
│                   │ 3. Split chunks     │ │                        │
│                   │ 4. WebSocket stream │ │                        │
│                   └────────────────────┘ │                        │
└──────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Step 1: Dependencies & Types

**Install:**
- `ffmpeg-static` — bundled ffmpeg binary
- `ws` + `@types/ws` — WebSocket client for Node.js

**Add to `src/shared/types.ts`:**
```typescript
// ASR types
export interface AsrProgressEvent {
  articleId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkProgress: number; // 0-1 within current chunk
  overallProgress: number; // 0-1 overall
}

export interface AsrSegmentEvent {
  articleId: string;
  segments: TranscriptSegment[]; // accumulated segments so far
}

export interface AsrCompleteEvent {
  articleId: string;
  segments: TranscriptSegment[];
}

export interface AsrErrorEvent {
  articleId: string;
  error: string;
}
```

**Add to `AppSettings`:**
```typescript
volcAsrAppKey?: string;
volcAsrAccessKey?: string;
```

**Add to `ElectronAPI`:**
```typescript
asrStart: (articleId: string) => Promise<void>;
asrCancel: (articleId: string) => Promise<void>;
asrOnProgress: (callback: (event: AsrProgressEvent) => void) => () => void;
asrOnSegment: (callback: (event: AsrSegmentEvent) => void) => () => void;
asrOnComplete: (callback: (event: AsrCompleteEvent) => void) => () => void;
asrOnError: (callback: (event: AsrErrorEvent) => void) => () => void;
```

**Add IPC channels to `src/shared/ipc-channels.ts`:**
```typescript
ASR_START: 'asr:start',
ASR_CANCEL: 'asr:cancel',
ASR_PROGRESS: 'asr:progress',
ASR_SEGMENT: 'asr:segment',
ASR_COMPLETE: 'asr:complete',
ASR_ERROR: 'asr:error',
```

### Step 2: Volcengine ASR Service (`src/main/services/volc-asr-service.ts`)

Core service that handles:

1. **WebSocket connection** to `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`
2. **Binary protocol** implementation:
   - Build 4-byte header (protocol version, header size, message type, serialization, compression)
   - Send Full Client Request (JSON config) as first message
   - Send Audio Only Request packets (~200ms chunks)
   - Mark last packet with flag `0b0010`
3. **Response parsing**:
   - Parse server response header
   - Extract `result.utterances[]` with `start_time`, `end_time`, `text`
   - Convert to `TranscriptSegment[]` format
4. **Config:**
   ```json
   {
     "audio": { "format": "wav", "codec": "raw", "rate": 16000, "bits": 16, "channel": 1, "language": "zh-CN" },
     "request": {
       "model_name": "bigmodel",
       "enable_itn": true,
       "enable_punc": true,
       "show_utterances": true,
       "result_type": "full"
     }
   }
   ```

### Step 3: Audio Pipeline (`src/main/services/audio-pipeline.ts`)

1. **Format detection**: Check file extension + `audioMime`
2. **Conversion**: If not wav/pcm → `ffmpeg -i input -ar 16000 -ac 1 -f wav -acodec pcm_s16le output.wav`
3. **Duration detection**: `ffprobe -show_entries format=duration`
4. **Chunking**: If duration > 1800s (30min) → split:
   ```
   ffmpeg -i input.wav -ss 0 -t 1800 chunk_0.wav
   ffmpeg -i input.wav -ss 1800 -t 1800 chunk_1.wav
   ...
   ```
5. **Streaming**: Read each chunk file, split into ~200ms packets (16000 * 2 * 0.2 = 6400 bytes per packet for 16-bit mono PCM at 16kHz)
6. **Cleanup**: Remove temp converted/chunked files after completion

### Step 4: IPC Handlers (`src/main/ipc/asr-handlers.ts`)

```typescript
export function registerAsrHandlers() {
  // asr:start — start transcription for an article
  //   1. Load settings, check credentials
  //   2. Find downloaded file path
  //   3. Run audio pipeline (convert + chunk)
  //   4. For each chunk, connect WebSocket, stream audio, collect segments
  //   5. Emit progress/segment/complete events to renderer
  //   6. Save final transcript to DB via transcriptSave()

  // asr:cancel — cancel ongoing transcription
  //   Close WebSocket, cleanup temp files, emit cancel event
}
```

Register in `src/main/ipc/index.ts`.

### Step 5: Preload Bridge (`src/preload.ts`)

Add the 6 new methods following the existing AI Chat streaming pattern:
- `asrStart`: `ipcRenderer.invoke()`
- `asrCancel`: `ipcRenderer.invoke()`
- `asrOnProgress/Segment/Complete/Error`: `ipcRenderer.on()` with cleanup return

### Step 6: Settings UI

Add to the existing Settings page:
- Section: "语音识别 (ASR)"
- Fields: App Key input, Access Token input (password masked)
- Link to Volcengine console for obtaining credentials

### Step 7: PodcastReaderView Transcript Tab

Replace the placeholder in `PodcastReaderView.tsx` with a state machine:

**States:**
1. `not-configured` — No ASR credentials → show config prompt
2. `not-downloaded` — No local file → show download prompt
3. `ready` — Show "开始转写" button with audio duration info
4. `transcribing` — Progress bar + live segments
5. `complete` — Full TranscriptView (identical to VideoReaderView)
6. `loaded` — Loaded from DB on mount (same UI as complete)

**Key interactions in transcribing/complete states:**
- Click segment → `audioPlayerRef.current.seekTo(time)`
- Highlight text → create highlight via existing `highlightCreate` IPC
- Add note to highlight → existing `highlightUpdate` IPC
- Add tag → existing `highlightTagAdd` IPC
- Auto-scroll sync with audio playback
- Free-browse mode on manual scroll
- "重新转写" button with confirmation dialog

### Step 8: Wire highlight + seek integration

Connect PodcastReaderView to TranscriptView with:
- `onSegmentClick` → `audioPlayerRef.current.seekTo(startTime)`
- `onCreateHighlight` → `window.electronAPI.highlightCreate()`
- `onDeleteHighlight` → `window.electronAPI.highlightDelete()`
- `onUpdateHighlight` → `window.electronAPI.highlightUpdate()`
- `highlights` prop from existing highlight loading logic
- `highlightTagsMap` from existing tag loading
- `scrollToSegment` triggered from DetailPanel highlight clicks

This mirrors exactly what VideoReaderView does.

## Files to Create

| File | Purpose |
|------|---------|
| `src/main/services/volc-asr-service.ts` | Volcengine WebSocket ASR client with binary protocol |
| `src/main/services/audio-pipeline.ts` | ffmpeg-based audio conversion and chunking |
| `src/main/ipc/asr-handlers.ts` | IPC handlers for ASR start/cancel/events |

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `ffmpeg-static`, `ws`, `@types/ws` |
| `src/shared/types.ts` | Add ASR event types, update AppSettings, update ElectronAPI |
| `src/shared/ipc-channels.ts` | Add 6 ASR channels |
| `src/preload.ts` | Add ASR bridge methods |
| `src/main/ipc/index.ts` | Register ASR handlers |
| `src/renderer/components/PodcastReaderView.tsx` | Replace transcript placeholder with full ASR + TranscriptView UI |
| Settings component | Add Volcengine credential fields |

## Volcengine Binary Protocol Reference

### Header (4 bytes)
```
Byte 0: [Protocol version (4bit)] [Header size (4bit)]
         0b0001                     0b0001
Byte 1: [Message type (4bit)]      [Type flags (4bit)]
         0b0001=FullClientReq       0b0000=normal, 0b0010=last audio
         0b0010=AudioOnly
         0b1001=FullServerResp
         0b1111=Error
Byte 2: [Serialization (4bit)]     [Compression (4bit)]
         0b0001=JSON                0b0000=none
Byte 3: Reserved (8bit) = 0
```

### Request flow
1. Connect WebSocket with auth headers
2. Send: Header(FullClientReq) + PayloadSize(4bytes) + JSON config
3. Send: Header(AudioOnly) + PayloadSize(4bytes) + AudioData (repeat for each ~200ms chunk)
4. Send: Header(AudioOnly, lastPacket flag) + PayloadSize(4bytes) + LastAudioData
5. Receive: Header(FullServerResp) + PayloadSize(4bytes) + JSON result (with utterances[])

### Response utterance format
```json
{
  "result": {
    "text": "全文",
    "utterances": [
      {
        "text": "分句文本",
        "start_time": 0,      // ms
        "end_time": 1705,     // ms
        "definite": true,
        "words": [{ "text": "词", "start_time": 740, "end_time": 860 }]
      }
    ]
  }
}
```

Convert to `TranscriptSegment`: `{ start: utterance.start_time/1000, end: utterance.end_time/1000, text: utterance.text }`
