# Blog

理不尽的折腾记录 —— <https://2026534639-cyber.github.io/>

基于 [Fuwari](https://github.com/saicaca/fuwari)（Astro + Svelte + Tailwind），部署在 GitHub Pages。

## 写文章

双击桌面「博客后台」，浏览器会打开 <http://localhost:4999>。**看到的就是真实的博客页面**，改动直接落在页面上：

- 点标题、点正文就能改，选中文字会浮出工具条（加粗/斜体/标题/列表/引用/链接/图片）
- `Ctrl+V` 直接粘截图，图片自动上传到 `public/assets/`
- 左下角工具条：切换文章、＋新建、保存、发布、设置
- 「保存」= 写回 markdown 文件；「发布」= `git commit` + `git push`，一两分钟后线上更新
- `Ctrl+S` 保存；有未保存改动时关闭页面会拦一下

## 改界面

同一个后台点「设置」：

| 分组 | 能改 |
|---|---|
| 外观 | 站点标题、副标题、个人简介、主题色（实时预览）、横幅图、头像 |
| 排版 | 每页篇数、横幅高度、首页延伸、页宽、目录层级 |
| 导航栏 | 增删条目、排序、内置项（主页/归档/关于）保留、外链标记 |
| 独立页面 | 新建 `/短名/` 页面（自动生成路由）、删除页面 |

设置会写进 `src/config.ts` 和 `src/constants/constants.ts`，只改值不动结构，改坏了 `git checkout` 就能回滚。

也可以手动创建文章，放在 `src/content/posts/`，格式：

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

`category` 决定归档页分组，`draft: true` 只在本机预览、不会构建上线。

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
  content/pages/         后台新建的独立页面（正文）
  content/spec/about.md  关于页
  components/            Astro / Svelte 组件
  plugins/               remark / rehype 插件（:::tip、GitHub 卡片等）
  i18n/                  多语言文案
admin/
  server.mjs             反代 astro dev + 后台接口（端口 4999）
  settings.mjs           读写 config.ts / constants.ts 的字段
  pages.mjs              新建/删除独立页面
  inject.js              注入页面的编辑界面 + HTML→Markdown
editor.mjs               入口（双击「启动编辑器.bat」跑的就是它）
.github/workflows/       Pages 部署
```
