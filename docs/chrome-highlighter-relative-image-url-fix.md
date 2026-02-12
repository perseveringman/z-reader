# Chrome 插件保存网页图片相对路径修复

## 问题
Chrome 插件保存网页后，文章 HTML 中的图片仍保留相对路径（如 `/images/a.jpg`、`media/b.png`），在 Z-Reader 内离线/二次渲染时会出现图片无法加载。

## 根因
`parseArticleContent` 直接使用 `@postlight/parser` 返回的 `content` 和 `lead_image_url`，没有对 HTML 内图片 URL 做归一化处理。

## 方案
在 `src/main/services/parser-service.ts` 中新增 URL 归一化逻辑：

- 对 `img/source` 标签的 `src`、`data-src`、`poster` 属性转为基于文章 URL 的绝对地址
- 对 `srcset`、`data-srcset` 的每个候选资源逐项转绝对地址
- 保留 `#`、`data:`、`javascript:`、`mailto:`、`tel:` 等无需转换的值
- 同时将 `lead_image_url` 转为绝对地址

## 验证
新增测试：`tests/parser-service.test.ts`

- 构造包含相对 `src` 与 `srcset` 的解析结果
- 断言输出 `content` 中图片地址全部变为绝对路径
- 断言 `leadImageUrl` 也被转换

执行：

```bash
pnpm vitest run
```

结果：45 个测试全部通过。
