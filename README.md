# Blog

理不尽的折腾记录 —— <https://2026534639-cyber.github.io/>

基于 [Mizuki](https://github.com/LyraVoid/Mizuki)（Astro 7 + Svelte + Tailwind），部署在 GitHub Pages。满屏二次元壁纸、波浪过渡、站点统计都是主题自带的。

## 站点信息在哪改

配置全部在 `src/config/`，按文件拆分：

| 文件 | 内容 |
|---|---|
| `siteConfig.ts` | 标题、副标题、语言、主题色、首页大字与打字机文案、横幅图、各功能页开关 |
| `profileConfig.ts` | 名字、头像、简介、社交链接 |
| `navBarConfig.ts` | 导航栏（预设 + 自定义，支持多级菜单） |
| `backgroundWallpaper.ts` | 全屏壁纸（桌面/手机分开，可轮播） |
| `musicConfig.ts` | 音乐播放器（默认关着，要开就 enable: true 并配自己的歌单） |
| `commentConfig.ts` | 评论（giscus/twikoo，默认关） |

壁纸图片放 `public/assets/desktop-banner/` 和 `public/assets/mobile-banner/`，头像在 `src/assets/images/avatar.png`。

## 写文章

文章在 `src/content/posts/`，Mizuki 的 frontmatter：

```markdown
---
title: 标题
published: 2026-10-31
pinned: true          # 可选，置顶
description: 一句话摘要
tags: [随笔]
category: 随笔
author: 理不尽
licenseName: "Unlicensed"
draft: false
---
```

`draft: true` 只在本机预览，不会构建上线。关于页在 `src/content/spec/about.md`。

> 可视化后台（原随笔编辑器）是按 Fuwari 的页面结构写的，正在适配 Mizuki；适配好之前，改文章直接编辑 md 文件然后推送。

## 本地调试 / 手动构建

```bash
npx pnpm@11.5.3 dev      # 本地预览 http://localhost:4321
npx pnpm@11.5.3 exec astro build && npx pnpm@11.5.3 exec pagefind --site dist
```

注意：不要用 `pnpm build`，它会先跑番剧数据抓取脚本（需要外网）。字体已经放在 `src/assets/fonts/`，构建不需要联网。

推送 `main` 分支后，GitHub Actions 自动构建并发布。
