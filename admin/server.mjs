// 可视化后台：把 astro dev 反向代理到 127.0.0.1:4999，并往页面里注入编辑脚本
// 浏览器看到的始终是「真实的博客页面」，改动直接写回 src/，发布就是 git push。
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { createSettings } from "./settings.mjs";
import { createPages } from "./pages.mjs";

const run = promisify(execFile);

export const ADMIN_PORT = 4999;
export const DEV_PORT = 4321;

export function startServer(root) {
	const POSTS = path.join(root, "src", "content", "posts");
	const ASSETS = path.join(root, "public", "assets");
	const INJECT = path.join(root, "admin", "inject.js");
	const settings = createSettings(root);
	const pages = createPages(root);

	let devChild = null;

	/* ---------- dev 服务器 ---------- */

	function pingDev() {
		return new Promise((resolve) => {
			const req = http.get(
				{ host: "127.0.0.1", port: DEV_PORT, path: "/", timeout: 1500 },
				(res) => {
					res.resume();
					resolve(true);
				},
			);
			req.on("error", () => resolve(false));
			req.on("timeout", () => {
				req.destroy();
				resolve(false);
			});
		});
	}

	async function ensureDev() {
		if (await pingDev()) {
			console.log(`[admin] 复用已在运行的 astro dev (:${DEV_PORT})`);
			return;
		}
		console.log(`[admin] 启动 astro dev (:${DEV_PORT})…`);
		devChild = spawn(
			process.execPath,
			["node_modules/astro/astro.js", "dev", "--port", String(DEV_PORT), "--host", "127.0.0.1"],
			{ cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
		);
		const pipe = (buf) => {
			for (const line of buf.toString().split("\n")) {
				const t = line.trim();
				if (t) console.log(`[astro] ${t}`);
			}
		};
		devChild.stdout.on("data", pipe);
		devChild.stderr.on("data", pipe);
		devChild.on("exit", (code) => {
			console.log(`[admin] astro dev 退出（${code}）`);
			devChild = null;
		});
		for (let i = 0; i < 120; i++) {
			await new Promise((r) => setTimeout(r, 500));
			if (await pingDev()) {
				console.log("[admin] astro dev 就绪");
				return;
			}
		}
		throw new Error("astro dev 启动超时");
	}

	/* ---------- frontmatter ---------- */

	function parseFrontmatter(text) {
		const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
		if (!m) return { fm: {}, body: text };
		const fm = {};
		let cur = null;
		for (const line of m[1].split(/\r?\n/)) {
			const t = line.trim();
			if (!t) continue;
			const kv = t.match(/^([A-Za-z_]+):\s*(.*)$/);
			if (kv && !t.startsWith("-")) {
				cur = kv[1];
				let v = kv[2].trim();
				if (/^\[.*\]$/.test(v)) {
					fm[cur] = v
						.slice(1, -1)
						.split(",")
						.map((s) => s.trim().replace(/^["']|["']$/g, ""))
						.filter(Boolean);
					cur = null;
					continue;
				}
				v = v.replace(/^["']|["']$/g, "");
				if (v === "true") v = true;
				else if (v === "false") v = false;
				fm[cur] = v;
			} else if (t.startsWith("-") && cur) {
				if (!Array.isArray(fm[cur])) fm[cur] = [];
				fm[cur].push(t.slice(1).trim());
			}
		}
		return { fm, body: m[2] };
	}

	function buildFile(p) {
		const q = (s) => `"${String(s ?? "").replace(/"/g, "'")}"`;
		const tags = p.tags && p.tags.length ? p.tags : ["随笔"];
		return `---
title: ${q(p.title)}
published: ${p.published}
description: ${q(p.description)}
tags: [${tags.map(q).join(", ")}]
category: ${q(p.category || tags[0])}
author: ${q(p.author || "理不尽")}
licenseName: "Unlicensed"
draft: ${!!p.draft}
---

${String(p.markdown || "").replace(/\r\n/g, "\n").trimEnd()}
`;
	}

	function nowIso() {
		const d = new Date();
		const p = (n) => String(n).padStart(2, "0");
		const off = -d.getTimezoneOffset();
		const sign = off >= 0 ? "+" : "-";
		const oh = p(Math.floor(Math.abs(off) / 60));
		const om = p(Math.abs(off) % 60);
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${oh}:${om}`;
	}

	/* ---------- 文章 ---------- */

	async function listPosts() {
		const names = (await fs.readdir(POSTS)).filter((f) => f.endsWith(".md"));
		const out = [];
		for (const name of names) {
			const raw = await fs.readFile(path.join(POSTS, name), "utf8");
			const { fm } = parseFrontmatter(raw);
			out.push({
				slug: name.replace(/\.md$/, ""),
				title: fm.title || name,
				draft: !!fm.draft,
				published: fm.published || "",
			});
		}
		// 关于页也放进列表（排最前，isPage 标记方便前端识别）
		if (await fileExists(path.join(root, "src", "content", "spec", "about.md"))) {
			out.push({ slug: "about", title: "关于（页面）", draft: false, published: "9999-12-31", isPage: true });
		}
		return out.sort((a, b) => String(b.published).localeCompare(String(a.published)));
	}

	async function fileExists(p) {
		try {
			await fs.access(p);
			return true;
		} catch {
			return false;
		}
	}

	async function getPost(slug) {
		// 关于页：内容在 spec/about.md，且没有 frontmatter
		if (slug === "about") {
			const raw = await fs.readFile(path.join(root, "src", "content", "spec", "about.md"), "utf8");
			const { fm, body } = parseFrontmatter(raw);
			return { slug, fm, markdown: body.replace(/^\r?\n/, "") };
		}
		const raw = await fs.readFile(path.join(POSTS, `${slug}.md`), "utf8");
		const { fm, body } = parseFrontmatter(raw);
		return { slug, fm, markdown: body.replace(/^\r?\n/, "") };
	}

	async function savePost({ slug, title, markdown }) {
		if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug || "")) throw new Error("文章短名不合法");
		if (slug === "about") {
			// 关于页只写正文，不生成 frontmatter
			await fs.writeFile(
				path.join(root, "src", "content", "spec", "about.md"),
				String(markdown || "").replace(/\r\n/g, "\n").trimStart() + "\n",
				"utf8",
			);
			return { slug, title: "关于（页面）" };
		}
		const file = path.join(POSTS, `${slug}.md`);
		let fm = {};
		try {
			fm = (await getPost(slug)).fm;
		} catch {
			/* 新文件 */
		}
		const merged = {
			title: title || fm.title || "无题",
			published: fm.published || nowIso(),
			description: fm.description || "",
			tags: fm.tags || ["随笔"],
			category: fm.category || (fm.tags || ["随笔"])[0],
			author: fm.author || "理不尽",
			draft: fm.draft ?? false,
			markdown,
		};
		await fs.writeFile(file, buildFile(merged), "utf8");
		return { slug, title: merged.title };
	}

	/* ---------- git ---------- */

	async function gitPublish(message) {
		const opt = { cwd: root, windowsHide: true };
		try {
			await run("git", ["add", "-A"], opt);
			let committed = "";
			try {
				const c = await run("git", ["commit", "-m", message || "博客更新"], opt);
				committed = c.stdout.trim();
			} catch (e) {
				if (/nothing to commit/.test(e.stderr || "")) {
					return { ok: true, output: "没有需要发布的新更改。" };
				}
				throw e;
			}
			const p = await run("git", ["push"], opt);
			return {
				ok: true,
				output: `${committed}\n${(p.stdout + p.stderr).trim()}\n\n✅ 已推送，一两分钟后见：https://2026534639-cyber.github.io/`,
			};
		} catch (e) {
			return { ok: false, output: `发布失败：\n${(e.stderr || e.message).trim()}` };
		}
	}

	/* ---------- 注入 ---------- */

	const INJECT_TAG = '<script src="/__admin/inject.js" defer></script>';

	function injectHtml(html) {
		if (html.includes('src="/__admin/inject.js"')) return html;
		const i = html.lastIndexOf("</body>");
		if (i < 0) return html + INJECT_TAG;
		return html.slice(0, i) + INJECT_TAG + html.slice(i);
	}

	/* ---------- 代理 ---------- */

	function proxyHttp(req, res, body) {
		const headers = { ...req.headers, host: `127.0.0.1:${DEV_PORT}`, "accept-encoding": "identity" };
		const up = http.request(
			{ host: "127.0.0.1", port: DEV_PORT, path: req.url, method: req.method, headers },
			(ur) => {
				const type = ur.headers["content-type"] || "";
				if (type.includes("text/html")) {
					const chunks = [];
					ur.on("data", (c) => chunks.push(c));
					ur.on("end", () => {
						const html = injectHtml(Buffer.concat(chunks).toString("utf8"));
						const h = { ...ur.headers };
						delete h["content-length"];
						delete h["content-encoding"];
						delete h["transfer-encoding"];
						h["cache-control"] = "no-store";
						res.writeHead(ur.statusCode || 200, h);
						res.end(Buffer.from(html, "utf8"));
					});
				} else {
					res.writeHead(ur.statusCode || 200, ur.headers);
					ur.pipe(res);
				}
			},
		);
		up.on("error", () => {
			// dev 还在启动（比如刚改完配置触发了重启）→ 给一个会自动重试的占位页
			if ((req.headers.accept || "").includes("text/html")) {
				res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
				res.end(
					'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2">' +
						'<title>启动中…</title><body style="font:14px/1.8 system-ui,-apple-system,\'Microsoft YaHei\';padding:48px;color:#888">' +
						"预览服务正在启动，两秒后自动刷新……</body>",
				);
				return;
			}
			res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			res.end("astro dev 没起来，稍等几秒再刷新。");
		});
		if (body?.length) up.write(body);
		up.end();
	}

	function proxyUpgrade(req, socket, head) {
		const up = net.connect(DEV_PORT, "127.0.0.1", () => {
			let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
			for (let i = 0; i < req.rawHeaders.length; i += 2) {
				raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
			}
			up.write(`${raw}\r\n`);
			if (head?.length) up.write(head);
			socket.pipe(up);
			up.pipe(socket);
		});
		up.on("error", () => socket.destroy());
		socket.on("error", () => up.destroy());
	}

	/* ---------- 路由 ---------- */

	function readBody(req, limit = 20e6) {
		return new Promise((resolve, reject) => {
			const chunks = [];
			let size = 0;
			req.on("data", (c) => {
				size += c.length;
				if (size > limit) {
					reject(new Error("请求体过大"));
					req.destroy();
					return;
				}
				chunks.push(c);
			});
			req.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				if (!text) return resolve({});
				try {
					resolve(JSON.parse(text));
				} catch (e) {
					reject(new Error(`请求体不是合法 JSON：${e.message}`));
				}
			});
			req.on("error", reject);
		});
	}

	const server = http.createServer(async (req, res) => {
		const json = (code, obj) => {
			res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
			res.end(JSON.stringify(obj));
		};

		try {
			const url = new URL(req.url, "http://127.0.0.1");

			if (url.pathname === "/__admin/inject.js") {
				const data = await fs.readFile(INJECT);
				res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
				return res.end(data);
			}

			if (url.pathname === "/__admin/ping") {
				return json(200, { ok: true, dev: await pingDev() });
			}

			if (url.pathname === "/__admin/posts") {
				return json(200, await listPosts());
			}

			if (url.pathname === "/__admin/post") {
				return json(200, await getPost(url.searchParams.get("slug") || ""));
			}

			if (url.pathname === "/__admin/save" && req.method === "POST") {
				return json(200, { ok: true, ...(await savePost(await readBody(req))) });
			}

			if (url.pathname === "/__admin/new" && req.method === "POST") {
				const { slug, title } = await readBody(req);
				if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug || ""))
					throw new Error("短名只能用 a-z、0-9 和短横线，比如 szu-grab-tool");
				const file = path.join(POSTS, `${slug}.md`);
				let taken = false;
				try {
					await fs.access(file);
					taken = true;
				} catch {
					taken = false;
				}
				if (taken) throw new Error(`文章 ${slug} 已存在`);
				await fs.mkdir(POSTS, { recursive: true });
				await fs.writeFile(
					file,
					buildFile({
						title: title || slug,
						published: nowIso(),
						description: "",
						tags: ["随笔"],
						category: "随笔",
						draft: true,
						markdown: "",
					}),
					"utf8",
				);
				return json(200, { ok: true, slug });
			}

			if (url.pathname === "/__admin/publish" && req.method === "POST") {
				const { message } = await readBody(req);
				return json(200, await gitPublish(message));
			}

			if (url.pathname === "/__admin/upload" && req.method === "POST") {
				const { name, data } = await readBody(req);
				const buf = Buffer.from(String(data || ""), "base64");
				if (!buf.length || buf.length > 10e6) throw new Error("图片为空或超过 10MB");
				const ext = path.extname(String(name || "")).toLowerCase();
				if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(ext))
					throw new Error("不支持的图片格式");
				await fs.mkdir(ASSETS, { recursive: true });
				const d = new Date();
				const p = (n) => String(n).padStart(2, "0");
				const fname = `img-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}${ext}`;
				await fs.writeFile(path.join(ASSETS, fname), buf);
				return json(200, { ok: true, url: `/assets/${fname}` });
			}

			if (url.pathname === "/__admin/settings") {
				if (req.method === "GET") return json(200, await settings.read());
				return json(200, { ok: true, changed: await settings.write(await readBody(req)) });
			}

			if (url.pathname === "/__admin/asset" && req.method === "POST") {
				const { kind, name, data } = await readBody(req);
				const ext = path.extname(String(name || "")).toLowerCase() || ".png";
				const buf = Buffer.from(String(data || ""), "base64");
				if (!buf.length || buf.length > 12e6) throw new Error("图片为空或超过 12MB");
				// 文件名带内容哈希：同尺寸换图也能换 URL，绕开 astro 图片缓存
				const hash = createHash("md5").update(buf).digest("hex").slice(0, 8);

				if (kind === "avatar") {
					if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) throw new Error("只支持 png/jpg/webp");
					const filename = `avatar-${hash}${ext}`;
					const dir = path.join(root, "src", "assets", "images");
					await fs.mkdir(dir, { recursive: true });
					await fs.writeFile(path.join(dir, filename), buf);
					await settings.setAsset("avatar", filename);
					return json(200, { ok: true, file: filename });
				}

				if (kind === "avatar-icon") {
					// 浏览器 canvas 生成的圆形小图，顶栏图标用
					const filename = `home-${hash}.png`;
					const dir = path.join(root, "public", "assets", "home");
					await fs.mkdir(dir, { recursive: true });
					await fs.writeFile(path.join(dir, filename), buf);
					const f = path.join(root, "src", "config", "siteConfig.ts");
					let t = await fs.readFile(f, "utf8");
					t = t.replace(/(icon:\s*")assets\/home\/[^"]+(")/, `$1assets/home/${filename}$2`);
					await fs.writeFile(f, t, "utf8");
					return json(200, { ok: true, file: filename });
				}

				if (kind === "banner") {
					if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) throw new Error("只支持 png/jpg/webp");
					const filename = `banner-${hash}${ext}`;
					const dir = path.join(root, "public", "assets", "desktop-banner");
					await fs.mkdir(dir, { recursive: true });
					await fs.writeFile(path.join(dir, filename), buf);
					await settings.setAsset("banner", filename);
					return json(200, { ok: true, file: filename });
				}

				throw new Error("未知图片类型");
			}

			if (url.pathname === "/__admin/pages") {
				if (req.method === "GET") return json(200, await pages.list());
				throw new Error("方法不支持");
			}

			if (url.pathname === "/__admin/pages/create" && req.method === "POST") {
				const { slug, title, description } = await readBody(req);
				return json(200, { ok: true, ...(await pages.create(slug, title, description)) });
			}

			if (url.pathname === "/__admin/pages/delete" && req.method === "POST") {
				const { slug } = await readBody(req);
				return json(200, { ok: true, ...(await pages.remove(slug)) });
			}

			if (url.pathname.startsWith("/__admin/")) {
				return json(404, { error: "未知接口" });
			}

			// 其余全部转发给 astro dev
			const body = req.method === "POST" || req.method === "PUT" ? await streamBody(req) : null;
			proxyHttp(req, res, body);
		} catch (e) {
			json(500, { error: String(e.message || e) });
		}
	});

	server.on("upgrade", proxyUpgrade);

	return {
		async listen() {
			await ensureDev();
			await new Promise((resolve) => server.listen(ADMIN_PORT, "127.0.0.1", resolve));
			return `http://localhost:${ADMIN_PORT}`;
		},
		close() {
			server.close();
			if (devChild) devChild.kill();
		},
	};
}

function streamBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}
