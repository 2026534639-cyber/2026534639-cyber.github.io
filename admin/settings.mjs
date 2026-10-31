// 读写 Mizuki 的站点配置（src/config/*.ts 按文件拆分 + src/constants/constants.ts）
// 只做「定位字段并替换值」，不改结构、不删注释，失败就抛错。
import fs from "node:fs/promises";
import path from "node:path";

export function createSettings(root) {
	const CFG = (name) => path.join(root, "src", "config", name);
	const CONSTANTS = path.join(root, "src", "constants", "constants.ts");

	const q = (v) => JSON.stringify(String(v ?? ""));

	/* ---------- 文本工具（与旧版相同） ---------- */

	function skipString(text, i) {
		const quote = text[i];
		for (let j = i + 1; j < text.length; j++) {
			if (text[j] === "\\") {
				j++;
				continue;
			}
			if (text[j] === quote) return j;
		}
		return text.length - 1;
	}

	function braceRange(text, fromIndex) {
		const open = text.indexOf("{", fromIndex);
		if (open < 0) return null;
		let depth = 0;
		for (let i = open; i < text.length; i++) {
			const ch = text[i];
			if (ch === '"' || ch === "'" || ch === "`") {
				i = skipString(text, i);
				continue;
			}
			if (ch === "/" && text[i + 1] === "/") {
				const nl = text.indexOf("\n", i);
				if (nl < 0) break;
				i = nl;
				continue;
			}
			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) return { start: open, end: i };
			}
		}
		return null;
	}

	function braceDelta(line) {
		let d = 0;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"' || ch === "'" || ch === "`") {
				i = skipString(line, i);
				continue;
			}
			if (ch === "/" && line[i + 1] === "/") break;
			if (ch === "{") d++;
			else if (ch === "}") d--;
		}
		return d;
	}

	function findBlock(text, rootRe) {
		const m = typeof rootRe === "string" ? null : rootRe.exec(text);
		const from = m ? m.index : text.indexOf(rootRe);
		if (from < 0) throw new Error(`找不到配置块：${rootRe}`);
		const range = braceRange(text, from);
		if (!range) throw new Error(`配置块括号不匹配：${rootRe}`);
		return range;
	}

	// seg 总是从 `{` 开始，第 0 行之后深度 1 是字段层
	function fieldIndex(lines, key) {
		const re = new RegExp(`^\\s*${key}\\s*:`);
		const base = braceDelta(lines[0]);
		let depth = 0;
		for (let i = 0; i < lines.length; i++) {
			if (i > 0 && depth === base && re.test(lines[i])) return i;
			depth += braceDelta(lines[i]);
		}
		return -1;
	}

	function replaceFieldValue(text, range, key, literal) {
		const seg = text.slice(range.start, range.end + 1);
		const lines = seg.split("\n");
		const idx = fieldIndex(lines, key);
		if (idx < 0) throw new Error(`块内找不到字段：${key}`);
		const raw = lines[idx];
		const cr = raw.endsWith("\r") ? "\r" : "";
		const line = cr ? raw.slice(0, -1) : raw;
		const m = line.match(/^(\s*[A-Za-z_$][\w$]*\s*:\s*)(.*)$/);
		if (!m) throw new Error(`字段行格式不认识：${line}`);
		const rest = m[2];
		const cIdx = rest.indexOf("//");
		const comment = cIdx >= 0 ? ` ${rest.slice(cIdx).trimEnd()}` : "";
		lines[idx] = `${m[1]}${literal},${comment}${cr}`;
		return text.slice(0, range.start) + lines.join("\n") + text.slice(range.end + 1);
	}

	function setField(text, rootRe, keys, literal) {
		const range = findBlock(text, rootRe);
		if (keys.length === 1) return replaceFieldValue(text, range, keys[0], literal);
		const seg = text.slice(range.start, range.end + 1);
		const m = new RegExp(`\\b${keys[0]}\\s*:\\s*\\{`).exec(seg);
		if (!m) throw new Error(`找不到嵌套块：${keys[0]}`);
		const inner = braceRange(text, range.start + m.index);
		if (!inner) throw new Error(`嵌套块括号不匹配：${keys[0]}`);
		if (keys.length === 2) return replaceFieldValue(text, inner, keys[1], literal);
		throw new Error("配置嵌套过深");
	}

	function pick(text, rootRe, keys) {
		let range = findBlock(text, rootRe);
		for (const key of keys.slice(0, -1)) {
			const seg = text.slice(range.start, range.end + 1);
			const m = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(seg);
			if (!m) return undefined;
			range = braceRange(text, range.start + m.index);
			if (!range) return undefined;
		}
		const seg = text.slice(range.start, range.end + 1);
		const lines = seg.split("\n");
		const idx = fieldIndex(lines, keys[keys.length - 1]);
		if (idx < 0) return undefined;
		const rest = lines[idx].replace(/^[^:]*:\s*/, "");
		const cIdx = rest.indexOf("//");
		let v = (cIdx >= 0 ? rest.slice(0, cIdx) : rest).trim().replace(/,$/, "").trim();
		if (/^".*"$/.test(v)) v = JSON.parse(v);
		if (v === "true") v = true;
		if (v === "false") v = false;
		if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
		return v;
	}

	// 把多行字符串数组（如打字机文案）整体替换掉
	function setStringArray(text, rootRe, keys, values) {
		const range = findBlock(text, rootRe);
		let cur = range;
		for (const key of keys.slice(0, -1)) {
			const seg = text.slice(cur.start, cur.end + 1);
			const m = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(seg);
			if (!m) throw new Error(`找不到嵌套块：${key}`);
			cur = braceRange(text, cur.start + m.index);
		}
		const arrStart = text.indexOf("[", cur.start);
		let depth = 0;
		let arrEnd = -1;
		for (let i = arrStart; i < text.length; i++) {
			const c = text[i];
			if (c === '"' || c === "'" || c === "`") {
				i = skipString(text, i);
				continue;
			}
			if (c === "[") depth++;
			else if (c === "]") {
				depth--;
				if (depth === 0) {
					arrEnd = i;
					break;
				}
			}
		}
		if (arrStart < 0 || arrEnd < 0) throw new Error("找不到数组");
		const body = values.map((v) => `\t\t\t\t${q(v)},`).join("\n");
		return text.slice(0, arrStart) + `[\n${body}\n\t\t\t]` + text.slice(arrEnd + 1);
	}

	function getStringArray(text, rootRe, keys) {
		const range = findBlock(text, rootRe);
		let cur = range;
		for (const key of keys.slice(0, -1)) {
			const seg = text.slice(cur.start, cur.end + 1);
			const m = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(seg);
			if (!m) return [];
			cur = braceRange(text, cur.start + m.index);
		}
		const arrStart = text.indexOf("[", cur.start);
		let depth = 0;
		let arrEnd = -1;
		for (let i = arrStart; i < text.length; i++) {
			const c = text[i];
			if (c === '"' || c === "'" || c === "`") {
				i = skipString(text, i);
				continue;
			}
			if (c === "[") depth++;
			else if (c === "]") {
				depth--;
				if (depth === 0) {
					arrEnd = i;
					break;
				}
			}
		}
		const body = text.slice(arrStart + 1, arrEnd);
		return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
	}

	/* ---------- 导航栏（结构与 Fuwari 相同） ---------- */

	function arrayRange(text, fromIndex) {
		const open = text.indexOf("[", fromIndex);
		if (open < 0) return null;
		let depth = 0;
		for (let i = open; i < text.length; i++) {
			const ch = text[i];
			if (ch === '"' || ch === "'" || ch === "`") {
				i = skipString(text, i);
				continue;
			}
			if (ch === "/" && text[i + 1] === "/") {
				const nl = text.indexOf("\n", i);
				if (nl < 0) break;
				i = nl;
				continue;
			}
			if (ch === "[") depth++;
			else if (ch === "]") {
				depth--;
				if (depth === 0) return { start: open, end: i };
			}
		}
		return null;
	}

	function readNav(text) {
		const block = findBlock(text, /export const navBarConfig/);
		const arr = arrayRange(text, block.start);
		if (!arr) return [];
		const body = text.slice(arr.start + 1, arr.end);
		const entries = [];
		let depth = 0;
		let buf = "";
		for (let i = 0; i < body.length; i++) {
			const ch = body[i];
			if (ch === '"' || ch === "'" || ch === "`") {
				const end = skipString(body, i);
				buf += body.slice(i, end + 1);
				i = end;
				continue;
			}
			if (ch === "/" && body[i + 1] === "/") {
				const nl = body.indexOf("\n", i);
				i = nl < 0 ? body.length : nl;
				continue;
			}
			if (ch === "{" || ch === "[" || ch === "(") depth++;
			if (ch === "}" || ch === "]" || ch === ")") depth--;
			if (ch === "," && depth === 0) {
				entries.push(buf);
				buf = "";
				continue;
			}
			buf += ch;
		}
		entries.push(buf);
		return entries
			.map((e) => e.trim())
			.filter(Boolean)
			.map((e) => {
				const preset = e.match(/^LinkPreset\.(\w+)$/);
				if (preset) return { kind: "preset", key: preset[1] };
				const name = (e.match(/name:\s*"([^"]*)"/) || [])[1] || "";
				const url = (e.match(/url:\s*"([^"]*)"/) || [])[1] || "";
				const external = /external:\s*true/.test(e);
				return { kind: "custom", name, url, external };
			});
	}

	function writeNav(text, entries) {
		const block = findBlock(text, /export const navBarConfig/);
		const arr = arrayRange(text, block.start);
		if (!arr) throw new Error("找不到导航 links 数组");
		const body = entries
			.map((e) => {
				if (e.kind === "preset") return `\t\tLinkPreset.${e.key},`;
				return `\t\t{\n\t\t\tname: ${q(e.name)},\n\t\t\turl: ${q(e.url)},\n\t\t\texternal: ${!!e.external},\n\t\t},`;
			})
			.join("\n");
		return text.slice(0, arr.start) + `[\n${body}\n\t]` + text.slice(arr.end + 1);
	}

	/* ---------- 对外 API ---------- */

	async function read() {
		const site = await fs.readFile(CFG("siteConfig.ts"), "utf8");
		const profile = await fs.readFile(CFG("profileConfig.ts"), "utf8");
		const ann = await fs.readFile(CFG("announcementConfig.ts"), "utf8");
		const music = await fs.readFile(CFG("musicConfig.ts"), "utf8");
		const comment = await fs.readFile(CFG("commentConfig.ts"), "utf8");
		const wallpaper = await fs.readFile(CFG("backgroundWallpaper.ts"), "utf8");
		const cons = await fs.readFile(CONSTANTS, "utf8");
		const nav = await fs.readFile(CFG("navBarConfig.ts"), "utf8");
		const num = (name) => {
			const m = cons.match(new RegExp(`export const ${name}\\s*=\\s*([-\\d.]+)`));
			return m ? Number(m[1]) : undefined;
		};
		return {
			site: {
				title: pick(site, /export const siteConfig/, ["title"]),
				subtitle: pick(site, /export const siteConfig/, ["subtitle"]),
			},
			hero: {
				title: pick(site, /export const siteConfig/, ["homeText", "title"]),
				subtitles: getStringArray(site, /export const siteConfig/, ["homeText", "subtitle"]),
			},
			theme: {
				hue: pick(site, /export const siteConfig/, ["themeColor", "hue"]),
				fixed: pick(site, /export const siteConfig/, ["themeColor", "fixed"]),
			},
			profile: {
				name: pick(profile, /export const profileConfig/, ["name"]),
				bio: pick(profile, /export const profileConfig/, ["bio"]),
				avatar: (pick(profile, /export const profileConfig/, ["avatar"]) || "").split("/").pop(),
			},
			font: {
				mode: pick(site, /export const siteConfig/, ["font", "mode"]),
			},
			announcement: {
				content: pick(ann, /export const announcementConfig/, ["content"]),
				linkText: pick(ann, /export const announcementConfig/, ["link", "text"]),
				linkUrl: pick(ann, /export const announcementConfig/, ["link", "url"]),
			},
			music: { enable: pick(music, /export const musicPlayerConfig/, ["enable"]) },
			comment: { enable: pick(comment, /export const commentConfig/, ["enable"]) },
			layout: {
				pageSize: num("PAGE_SIZE"),
				pageWidth: num("PAGE_WIDTH"),
			},
			nav: readNav(nav),
		};
	}

	async function write(p) {
		const files = {
			site: await fs.readFile(CFG("siteConfig.ts"), "utf8"),
			profile: await fs.readFile(CFG("profileConfig.ts"), "utf8"),
			ann: await fs.readFile(CFG("announcementConfig.ts"), "utf8"),
			music: await fs.readFile(CFG("musicConfig.ts"), "utf8"),
			comment: await fs.readFile(CFG("commentConfig.ts"), "utf8"),
			nav: await fs.readFile(CFG("navBarConfig.ts"), "utf8"),
			cons: await fs.readFile(CONSTANTS, "utf8"),
		};
		const crlf = {};
		for (const [k, v] of Object.entries(files)) crlf[k] = /\r\n/.test(v);
		const siteRe = /export const siteConfig/;
		const profileRe = /export const profileConfig/;
		const annRe = /export const announcementConfig/;
		const changed = [];

		if (p.site) {
			if (typeof p.site.title === "string") {
				files.site = setField(files.site, siteRe, ["title"], q(p.site.title));
				changed.push("site.title");
			}
			if (typeof p.site.subtitle === "string") {
				files.site = setField(files.site, siteRe, ["subtitle"], q(p.site.subtitle));
				changed.push("site.subtitle");
			}
		}
		if (p.hero) {
			if (typeof p.hero.title === "string") {
				files.site = setField(files.site, siteRe, ["homeText", "title"], q(p.hero.title));
				changed.push("hero.title");
			}
			if (Array.isArray(p.hero.subtitles)) {
				files.site = setStringArray(files.site, siteRe, ["homeText", "subtitle"], p.hero.subtitles.filter((s) => String(s).trim()));
				changed.push("hero.subtitles");
			}
		}
		if (p.theme) {
			if (Number.isFinite(p.theme.hue)) {
				files.site = setField(files.site, siteRe, ["themeColor", "hue"], String(Math.max(0, Math.min(360, Math.round(p.theme.hue)))));
				changed.push("theme.hue");
			}
			if (typeof p.theme.fixed === "boolean") {
				files.site = setField(files.site, siteRe, ["themeColor", "fixed"], String(p.theme.fixed));
				changed.push("theme.fixed");
			}
		}
		if (p.profile) {
			if (typeof p.profile.name === "string") {
				files.profile = setField(files.profile, profileRe, ["name"], q(p.profile.name));
				changed.push("profile.name");
			}
			if (typeof p.profile.bio === "string") {
				files.profile = setField(files.profile, profileRe, ["bio"], q(p.profile.bio));
				changed.push("profile.bio");
			}
		}
		if (p.font && (p.font.mode === "custom" || p.font.mode === "system")) {
			files.site = setField(files.site, siteRe, ["font", "mode"], q(p.font.mode));
			changed.push("font.mode");
		}
		if (p.announcement) {
			if (typeof p.announcement.content === "string") {
				files.ann = setField(files.ann, annRe, ["content"], q(p.announcement.content));
				changed.push("announcement.content");
			}
			if (typeof p.announcement.linkText === "string") {
				files.ann = setField(files.ann, annRe, ["link", "text"], q(p.announcement.linkText));
				changed.push("announcement.linkText");
			}
			if (typeof p.announcement.linkUrl === "string") {
				files.ann = setField(files.ann, annRe, ["link", "url"], q(p.announcement.linkUrl));
				changed.push("announcement.linkUrl");
			}
		}
		if (p.music && typeof p.music.enable === "boolean") {
			files.music = setField(files.music, /export const musicPlayerConfig/, ["enable"], String(p.music.enable));
			changed.push("music.enable");
		}
		if (p.comment && typeof p.comment.enable === "boolean") {
			files.comment = setField(files.comment, /export const commentConfig/, ["enable"], String(p.comment.enable));
			changed.push("comment.enable");
		}
		if (p.layout) {
			const nums = { PAGE_SIZE: p.layout.pageSize, PAGE_WIDTH: p.layout.pageWidth };
			for (const [name, val] of Object.entries(nums)) {
				if (!Number.isFinite(val)) continue;
				const re = new RegExp(`(export const ${name}\\s*=\\s*)([-\\d.]+)`);
				if (!re.test(files.cons)) continue;
				files.cons = files.cons.replace(re, `$1${Math.round(val)}`);
				changed.push(`layout.${name}`);
			}
		}
		if (Array.isArray(p.nav)) {
			files.nav = writeNav(files.nav, p.nav);
			changed.push("nav");
		}

		const targets = [
			[CFG("siteConfig.ts"), files.site],
			[CFG("profileConfig.ts"), files.profile],
			[CFG("announcementConfig.ts"), files.ann],
			[CFG("musicConfig.ts"), files.music],
			[CFG("commentConfig.ts"), files.comment],
			[CFG("navBarConfig.ts"), files.nav],
			[CONSTANTS, files.cons],
		];
		for (const [file, content] of targets) {
			const key = Object.keys(files).find((k) => files[k] === content);
			const out = key && crlf[key] ? content.replace(/\r?\n/g, "\r\n") : content;
			await fs.writeFile(file, out, "utf8");
		}
		return changed;
	}

	// 换头像 / 全屏壁纸
	async function setAsset(kind, filename) {
		if (kind === "avatar") {
			const f = CFG("profileConfig.ts");
			let t = await fs.readFile(f, "utf8");
			t = setField(t, /export const profileConfig/, ["avatar"], q(`assets/images/${filename}`));
			await fs.writeFile(f, t, "utf8");
			return filename;
		}
		if (kind === "banner") {
			// 全屏壁纸 + 顶部横幅都指到新图
			const wp = CFG("backgroundWallpaper.ts");
			let w = await fs.readFile(wp, "utf8");
			w = w.replace(/\/assets\/desktop-banner\/[^"]+/g, `/assets/desktop-banner/${filename}`);
			w = w.replace(/\/assets\/mobile-banner\/[^"]+/g, `/assets/desktop-banner/${filename}`);
			await fs.writeFile(wp, w, "utf8");
			const f = CFG("siteConfig.ts");
			let t = await fs.readFile(f, "utf8");
			t = t.replace(/\/assets\/desktop-banner\/[^"]+/g, `/assets/desktop-banner/${filename}`);
			t = t.replace(/\/assets\/mobile-banner\/[^"]+/g, `/assets/desktop-banner/${filename}`);
			await fs.writeFile(f, t, "utf8");
			return filename;
		}
		throw new Error("未知图片类型");
	}

	return { read, write, setAsset };
}
