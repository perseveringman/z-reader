# PDF 阅读器触摸板双指缩放

## 需求

在 PDF 阅读器中支持触摸板双指缩放（放大/缩小），提升阅读时的缩放体验。

## 实现方案

文件：`src/renderer/components/PdfReader.tsx`

- 新增 `pinchZoom` 状态，默认值为 `1`
- 在阅读容器上监听 `wheel` 事件（`passive: false`）
- 当 `event.ctrlKey === true` 时判定为双指缩放手势，调用 `event.preventDefault()` 阻止浏览器默认缩放行为
- 基于 `deltaY` 做指数缩放计算：`next = prev * exp(-deltaY * sensitivity)`
- 通过 `clamp` 限制缩放范围在 `0.6 ~ 2.5`
- 将 `pinchZoom` 参与 PDF 页面 scale 计算（与原有字体缩放比例叠加）

## 关键参数

- `MIN_PINCH_ZOOM = 0.6`
- `MAX_PINCH_ZOOM = 2.5`
- `PINCH_ZOOM_SENSITIVITY = 0.002`

## 行为说明

- 双指放大：页面放大
- 双指缩小：页面缩小
- 缩放结果会触发已渲染页面重绘，文本层与高亮层继续保持对齐

## 验证

执行：

- `npx vitest run tests/highlight-engine.test.ts tests/audio-player-icon-direction.test.ts` ✅（44/44）

