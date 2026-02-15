# Local Media Upload + Unified Transcription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add local audio/video import into Library (podcasts/videos) and unify transcription source handling for podcast + video with ffmpeg audio extraction.

**Architecture:** Keep `articles` as the single media entry model, add one new IPC for local media import, and introduce a transcription source/materialization layer used by both realtime and background ASR paths. Video reader keeps current YouTube subtitle-first behavior, and shows ASR CTA only when transcript is unavailable.

**Tech Stack:** Electron IPC, React + TypeScript, Drizzle ORM (SQLite), ffmpeg/ffprobe, Vitest.

---

### Task 1: Add failing tests for new backend source resolution behavior

**Files:**
- Create: `tests/transcription-source-service.test.ts`
- Modify: `src/main/services/standard-asr-service.ts`
- Modify: `src/main/ipc/asr-handlers.ts`

**Step 1: Write the failing test**

- Assert source resolver can:
  - return downloaded audio path for podcast records
  - return local audio file path from `audioUrl=file://...`
  - return local video file path and mark `requiresExtraction=true` from `url=file://...`
  - reject when no usable source exists

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/transcription-source-service.test.ts`  
Expected: FAIL with missing module/function.

**Step 3: Write minimal implementation**

- Add new service `src/main/services/transcription-source-service.ts` implementing source resolution + ffmpeg extraction to temp audio file.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/transcription-source-service.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/transcription-source-service.test.ts src/main/services/transcription-source-service.ts
git commit -m "test+feat: add transcription source resolver and extraction service"
```

### Task 2: Route ASR realtime/background through unified transcription source service

**Files:**
- Modify: `src/main/services/standard-asr-service.ts`
- Modify: `src/main/ipc/asr-handlers.ts`

**Step 1: Write the failing test**

- Extend `tests/transcription-source-service.test.ts` (or add a second focused test) to verify both ASR entry paths call unified source resolver for media without downloaded podcast file.

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/transcription-source-service.test.ts`  
Expected: FAIL with unmet expectation.

**Step 3: Write minimal implementation**

- In both realtime/background ASR paths:
  - resolve source via unified service
  - materialize audio file (including video extraction)
  - preserve existing provider + progress + transcript persistence behavior
  - ensure temp file cleanup in success/failure/cancel paths

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/transcription-source-service.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/ipc/asr-handlers.ts src/main/services/standard-asr-service.ts src/main/services/transcription-source-service.ts tests/transcription-source-service.test.ts
git commit -m "refactor: unify asr source resolution for podcast and video"
```

### Task 3: Add local media import IPC + renderer API contract

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload.ts`
- Modify: `src/main/ipc/article-handlers.ts`

**Step 1: Write the failing test**

- Add test file `tests/local-media-import-mapper.test.ts` to validate extension->media type mapping and metadata fallback behavior.

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/local-media-import-mapper.test.ts`  
Expected: FAIL with missing function.

**Step 3: Write minimal implementation**

- Add `ARTICLE_IMPORT_LOCAL_MEDIA` IPC.
- In main handler:
  - open file picker with allowed audio/video extensions
  - copy files to `userData/media/podcasts|videos`
  - create `articles` rows with `source=library`, `mediaType`, `audioUrl` (audio) / `url` (video), duration if detectable
- Expose new `electronAPI.articleImportLocalMedia()`.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/local-media-import-mapper.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/ipc/article-handlers.ts tests/local-media-import-mapper.test.ts
git commit -m "feat: add local media import ipc for podcasts and videos"
```

### Task 4: Add local file tab to AddUrlDialog and wire import action

**Files:**
- Modify: `src/renderer/components/AddUrlDialog.tsx`

**Step 1: Write the failing test**

- Add `tests/add-url-dialog-local-tab.test.tsx` verifying:
  - local tab renders
  - clicking import triggers `electronAPI.articleImportLocalMedia`
  - success triggers `onArticleSaved`

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/add-url-dialog-local-tab.test.tsx`  
Expected: FAIL with missing UI/API path.

**Step 3: Write minimal implementation**

- Add two tabs (`URL` / `Local File`).
- Keep existing URL flow unchanged.
- Add local import button + loading state + toast messaging.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/add-url-dialog-local-tab.test.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/components/AddUrlDialog.tsx tests/add-url-dialog-local-tab.test.tsx
git commit -m "feat: add local media import tab in add url dialog"
```

### Task 5: VideoReader transcript-area ASR CTA behavior

**Files:**
- Modify: `src/renderer/components/VideoReaderView.tsx`
- Modify: `tests/audio-player-icon-direction.test.ts` (no change likely; placeholder if shared helpers needed)
- Create: `tests/video-reader-transcript-cta.test.tsx`

**Step 1: Write the failing test**

- Verify:
  - when transcript exists, ASR button is hidden
  - when transcript absent, ASR button appears in transcript area
  - clicking button creates `asr-standard` task

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/video-reader-transcript-cta.test.tsx`  
Expected: FAIL with missing UI logic.

**Step 3: Write minimal implementation**

- Keep YouTube `transcriptFetch` fallback.
- If still no transcript, render CTA in transcript section.
- Hook button to `appTaskCreate({ type: 'asr-standard', articleId, ... })` and observe task updates.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/video-reader-transcript-cta.test.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/components/VideoReaderView.tsx tests/video-reader-transcript-cta.test.tsx
git commit -m "feat: add video transcript-area asr cta when subtitle missing"
```

### Task 6: Full verification and cleanup

**Files:**
- Modify: `docs/plans/2026-02-15-local-media-upload-and-unified-transcription-design.md` (optional notes only)

**Step 1: Run targeted tests**

Run:
- `pnpm test tests/transcription-source-service.test.ts`
- `pnpm test tests/local-media-import-mapper.test.ts`
- `pnpm test tests/add-url-dialog-local-tab.test.tsx`
- `pnpm test tests/video-reader-transcript-cta.test.tsx`

**Step 2: Run full project test suite**

Run: `pnpm test`  
Expected: PASS.

**Step 3: Lint**

Run: `pnpm lint`  
Expected: PASS.

**Step 4: Commit final polish**

```bash
git add -A
git commit -m "feat: support local media import and unified transcription flow"
```
