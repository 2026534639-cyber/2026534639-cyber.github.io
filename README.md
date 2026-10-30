# Blog

理不尽的折腾记录 —— <https://2026534639-cyber.github.io/>

基于 [Fuwari](https://github.com/saicaca/fuwari)（Astro + Svelte + Tailwind），部署在 GitHub Pages。

## 写文章

不要手写 frontmatter，用本地编辑器：

```
双击桌面「随笔编辑器」
```

它会打开 <http://127.0.0.1:4999>，左边选文章、右边写正文，支持 Markdown 预览、贴图（`Ctrl+V`）和一键发布。点「保存并发布」= `git commit` + `git push`，一两分钟后线上更新。

手动创建文章则放在 `src/content/posts/`，格式：

```markdown
---
title: 标题
published: 2026-10-30T20:00:00+08:00
description: 一句话摘要
tags: ["随笔", "工具"]
category: 随笔
draft: false
---
```

`category` 决定归档页分组，`draft: true` 的文章不会构建上线。

## 改站点信息

全部集中在 `src/config.ts`：站点标题/副标题/语言、主题色相、横幅图、头像、导航栏、社交链接。

- 横幅：`src/assets/images/banner.png`
- 头像：`src/assets/images/avatar.png`
- 站点地址：`astro.config.mjs` 里的 `site`

## 本地调试 / 手动构建

```bash
npx pnpm@9.14.4 dev      # 本地预览 http://localhost:4321
npx pnpm@9.14.4 build    # 构建到 dist/（含 Pagefind 搜索索引）
```

推送 `main` 分支后，GitHub Actions 自动构建并发布。

## 目录

```
src/
  config.ts              站点配置
  content/posts/         文章
  content/spec/about.md  关于页
  components/            Astro / Svelte 组件
  plugins/               remark / rehype 插件（:::tip、GitHub 卡片等）
  i18n/                  多语言文案
editor.mjs               零依赖本地编辑器（端口 4999）
.github/workflows/       Pages 部署
```
