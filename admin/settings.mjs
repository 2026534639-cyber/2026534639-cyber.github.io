// 读写站点配置：src/config.ts、src/constants/constants.ts
// 只做「定位字段并替换值」，不改结构、不删注释，失败就抛错，绝不半途写坏文件。
import fs from "node:fs/promises";
import path from "node:path";

export function createSettings(root) {
	const CONFIG = path.join(root, "src", "config.ts");
	const CONSTANTS = path.join(root, "src", "constants", "constants.ts");

	const q = (v) => JSON.stringify(String(v ?? ""));

	/* ---------- 文本工具 ---------- */

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

	// 从 fromIndex 之后的第一个 { 开始，返回配对括号的位置
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

	// 一行里净增的大括号数量（忽略字符串和注释）
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

	// 在 block 内（顶层，不在嵌套对象里）找到 `key:` 那一行
	// seg 总是从 `{` 开始，所以第 0 行之后深度为 1，那一层才是字段所在层
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

	// keys 的最后一项是字段名，前面的是嵌套对象名
	function setField(text, rootRe, keys, literal) {
		const range = findBlock(text, rootRe);
		if (keys.length === 1) return replaceFieldValue(text, range, keys[0], literal);
		const seg = text.slice(range.start, range.end + 1);
		const re = new RegExp(`\\b${keys[0]}\\s*:\\s*\\{`);
		const m = re.exec(seg);
		if (!m) throw new Error(`找不到嵌套块：${keys[0]}`);
		const inner = braceRange(text, range.start + m.index);
		if (!inner) throw new Error(`嵌套块括号不匹配：${keys[0]}`);
		if (keys.length === 2) return replaceFieldValue(text, inner, keys[1], literal);
		throw new Error("配置嵌套过深");
	}

	/* ---------- 读取 ---------- */

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

	/* ---------- 导航栏 ---------- */

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
		const next = `[\n${body}\n\t]`;
		return text.slice(0, arr.start) + next + text.slice(arr.end + 1);
	}

	/* ---------- 对外 API ---------- */

	async function read() {
		const cfg = await fs.readFile(CONFIG, "utf8");
		const cons = await fs.readFile(CONSTANTS, "utf8");
		const site = /export const siteConfig/;
		const profile = /export const profileConfig/;
		const num = (name) => {
			const m = cons.match(new RegExp(`export const ${name}\\s*=\\s*([-\\d.]+)`));
			return m ? Number(m[1]) : undefined;
		};
		const bsrc = pick(cfg, site, ["banner", "src"]) || "";
		const avatar = pick(cfg, profile, ["avatar"]) || "";
		return {
			site: {
				title: pick(cfg, site, ["title"]),
				subtitle: pick(cfg, site, ["subtitle"]),
			},
			theme: {
				hue: pick(cfg, site, ["themeColor", "hue"]),
				fixed: pick(cfg, site, ["themeColor", "fixed"]),
			},
			banner: {
				enable: pick(cfg, site, ["banner", "enable"]),
				file: bsrc.split("/").pop() || "",
			},
			toc: {
				enable: pick(cfg, site, ["toc", "enable"]),
				depth: pick(cfg, site, ["toc", "depth"]),
			},
			profile: {
				name: pick(cfg, profile, ["name"]),
				bio: pick(cfg, profile, ["bio"]),
				avatar: avatar.split("/").pop() || "",
			},
			layout: {
				pageSize: num("PAGE_SIZE"),
				bannerHeight: num("BANNER_HEIGHT"),
				bannerExtend: num("BANNER_HEIGHT_EXTEND"),
				pageWidth: num("PAGE_WIDTH"),
			},
			nav: readNav(cfg),
		};
	}

	async function write(patch) {
		const cfgRaw = await fs.readFile(CONFIG, "utf8");
		const consRaw = await fs.readFile(CONSTANTS, "utf8");
		const cfgCRLF = /\r\n/.test(cfgRaw);
		const consCRLF = /\r\n/.test(consRaw);
		let cfg = cfgRaw;
		let cons = consRaw;
		const site = /export const siteConfig/;
		const profile = /export const profileConfig/;
		const changed = [];

		if (patch.site) {
			if (typeof patch.site.title === "string") {
				cfg = setField(cfg, site, ["title"], q(patch.site.title));
				changed.push("site.title");
			}
			if (typeof patch.site.subtitle === "string") {
				cfg = setField(cfg, site, ["subtitle"], q(patch.site.subtitle));
				changed.push("site.subtitle");
			}
		}
		if (patch.theme) {
			if (Number.isFinite(patch.theme.hue)) {
				const h = Math.max(0, Math.min(360, Math.round(patch.theme.hue)));
				cfg = setField(cfg, site, ["themeColor", "hue"], String(h));
				changed.push("theme.hue");
			}
			if (typeof patch.theme.fixed === "boolean") {
				cfg = setField(cfg, site, ["themeColor", "fixed"], String(patch.theme.fixed));
				changed.push("theme.fixed");
			}
		}
		if (patch.banner && typeof patch.banner.enable === "boolean") {
			cfg = setField(cfg, site, ["banner", "enable"], String(patch.banner.enable));
			changed.push("banner.enable");
		}
		if (patch.toc) {
			if (typeof patch.toc.enable === "boolean") {
				cfg = setField(cfg, site, ["toc", "enable"], String(patch.toc.enable));
				changed.push("toc.enable");
			}
			if (Number.isFinite(patch.toc.depth)) {
				const d = Math.max(1, Math.min(3, Math.round(patch.toc.depth)));
				cfg = setField(cfg, site, ["toc", "depth"], String(d));
				changed.push("toc.depth");
			}
		}
		if (patch.profile) {
			if (typeof patch.profile.name === "string") {
				cfg = setField(cfg, profile, ["name"], q(patch.profile.name));
				changed.push("profile.name");
			}
			if (typeof patch.profile.bio === "string") {
				cfg = setField(cfg, profile, ["bio"], q(patch.profile.bio));
				changed.push("profile.bio");
			}
		}
		if (patch.layout) {
			const nums = {
				PAGE_SIZE: patch.layout.pageSize,
				BANNER_HEIGHT: patch.layout.bannerHeight,
				BANNER_HEIGHT_EXTEND: patch.layout.bannerExtend,
				PAGE_WIDTH: patch.layout.pageWidth,
			};
			for (const [name, val] of Object.entries(nums)) {
				if (!Number.isFinite(val)) continue;
				const re = new RegExp(`(export const ${name}\\s*=\\s*)([-\\d.]+)`);
				if (!re.test(cons)) continue;
				cons = cons.replace(re, `$1${Math.round(val)}`);
				changed.push(`layout.${name}`);
			}
		}
		if (Array.isArray(patch.nav)) {
			cfg = writeNav(cfg, patch.nav);
			changed.push("nav");
		}

		if (changed.some((c) => c.startsWith("layout."))) {
			const out = consCRLF ? cons.replace(/\r?\n/g, "\r\n") : cons;
			await fs.writeFile(CONSTANTS, out, "utf8");
		}
		if (changed.some((c) => !c.startsWith("layout."))) {
			const out = cfgCRLF ? cfg.replace(/\r?\n/g, "\r\n") : cfg;
			await fs.writeFile(CONFIG, out, "utf8");
		}
		return changed;
	}

	// 换横幅 / 头像：只覆盖图片文件，并把配置里的扩展名对齐
	async function setAsset(kind, filename) {
		let cfg = await fs.readFile(CONFIG, "utf8");
		if (kind === "banner") {
			cfg = setField(cfg, /export const siteConfig/, ["banner", "src"], q(`assets/images/${filename}`));
		} else if (kind === "avatar") {
			cfg = setField(cfg, /export const profileConfig/, ["avatar"], q(`assets/images/${filename}`));
		} else {
			throw new Error("未知图片类型");
		}
		await fs.writeFile(CONFIG, cfg, "utf8");
		return filename;
	}

	return { read, write, setAsset };
}
