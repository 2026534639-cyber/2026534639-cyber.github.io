// 注入到真实博客页面里的后台脚本：所见即所得改文章 + 外观/排版/导航/页面设置
// 只挂一层 UI，不碰站点自己的组件；保存写 md，发布走 git push。
(() => {
	if (window.top !== window.self) return;
	if (window.__admLoaded) return;
	window.__admLoaded = true;

	const api = async (url, body) => {
		const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
		const data = await res.json().catch(() => ({}));
		if (!res.ok || data.error) throw new Error(data.error || `请求失败 ${res.status}`);
		return data;
	};

	const slug = (location.pathname.match(/^\/posts\/([^/]+)\/$/) || [])[1] || "";
	let dirty = false;

	/* ---------- 样式 ---------- */

	const css = `
	#adm-bar{position:fixed;left:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:6px;
		padding:6px 8px;border-radius:14px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
		background:rgba(255,255,255,.82);box-shadow:0 8px 30px rgba(0,0,0,.14);border:1px solid rgba(0,0,0,.07);
		font:13px/1.4 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#1a1a1a}
	html.dark #adm-bar{background:rgba(28,28,32,.84);border-color:rgba(255,255,255,.1);color:#eaeaea}
	#adm-bar .brand{font-weight:700;letter-spacing:.5px;padding:0 6px;opacity:.55}
	#adm-bar button{border:1px solid transparent;background:transparent;color:inherit;font:inherit;padding:6px 10px;
		border-radius:9px;cursor:pointer;display:flex;align-items:center;gap:5px}
	#adm-bar button:hover{background:rgba(127,127,127,.14)}
	#adm-bar button.pri{background:var(--primary,#3b82f6);color:#fff}
	#adm-bar button.pri:hover{filter:brightness(1.06)}
	#adm-bar select{max-width:180px;padding:6px 8px;border-radius:9px;border:1px solid rgba(127,127,127,.3);
		background:transparent;color:inherit;font:inherit;cursor:pointer}
	#adm-bar .dot{width:6px;height:6px;border-radius:99px;background:#f59e0b;display:none}
	#adm-bar.dirty .dot{display:block}
	#adm-status{font-size:12px;opacity:.6;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

	#adm-sel{position:fixed;z-index:2147483001;display:none;gap:2px;padding:4px;border-radius:11px;
		background:rgba(24,24,28,.94);box-shadow:0 10px 30px rgba(0,0,0,.3)}
	#adm-sel button{min-width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#fff;
		font:13px/1 system-ui,sans-serif;cursor:pointer;padding:0 7px}
	#adm-sel button:hover{background:rgba(255,255,255,.16)}

	[contenteditable="true"]{outline:0;transition:box-shadow .15s}
	[contenteditable="true"]:focus{box-shadow:0 0 0 2px color-mix(in oklab, var(--primary,#3b82f6) 45%, transparent)}

	#adm-drawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);z-index:2147483002;
		transform:translateX(105%);transition:transform .28s cubic-bezier(.2,.8,.2,1);
		background:rgba(255,255,255,.97);backdrop-filter:blur(18px);border-left:1px solid rgba(0,0,0,.08);
		display:flex;flex-direction:column;font:13px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#1a1a1a}
	html.dark #adm-drawer{background:rgba(24,24,28,.97);border-color:rgba(255,255,255,.09);color:#eee}
	#adm-drawer.open{transform:none}
	#adm-drawer header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
		border-bottom:1px solid rgba(127,127,127,.18);font-weight:700}
	#adm-drawer .body{overflow:auto;padding:6px 18px 24px}
	#adm-drawer h4{margin:18px 0 8px;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;opacity:.5}
	#adm-drawer .row{display:flex;align-items:center;gap:8px;margin-bottom:9px}
	#adm-drawer .row label{flex:0 0 78px;opacity:.7;font-size:12px}
	#adm-drawer input[type=text],#adm-drawer input[type=number]{flex:1;min-width:0;padding:7px 9px;border-radius:8px;
		border:1px solid rgba(127,127,127,.32);background:transparent;color:inherit;font:inherit}
	#adm-drawer input[type=range]{flex:1}
	#adm-drawer input[type=file]{flex:1;font-size:12px}
	#adm-drawer .btn{padding:7px 12px;border-radius:9px;border:1px solid rgba(127,127,127,.32);background:transparent;
		color:inherit;font:inherit;cursor:pointer}
	#adm-drawer .btn.pri{background:var(--primary,#3b82f6);border-color:transparent;color:#fff}
	#adm-drawer .btn.sm{padding:4px 8px;font-size:12px}
	#adm-drawer .foot{padding:12px 18px;border-top:1px solid rgba(127,127,127,.18);display:flex;gap:8px;justify-content:flex-end}
	#adm-drawer .navrow{display:flex;gap:6px;align-items:center;margin-bottom:6px}
	#adm-drawer .navrow input{flex:1}
	#adm-drawer .muted{opacity:.55;font-size:12px}
	#adm-drawer .list{display:flex;justify-content:space-between;align-items:center;padding:6px 0;
		border-bottom:1px dashed rgba(127,127,127,.22)}
	#adm-toast{position:fixed;left:50%;bottom:88px;transform:translate(-50%,12px);z-index:2147483003;
		padding:9px 16px;border-radius:11px;background:rgba(24,24,28,.94);color:#fff;font:13px/1.5 system-ui,sans-serif;
		opacity:0;pointer-events:none;transition:.25s;max-width:70vw;white-space:pre-wrap}
	#adm-toast.on{opacity:1;transform:translate(-50%,0)}
	`;

	const style = document.createElement("style");
	style.textContent = css;
	document.head.appendChild(style);

	/* ---------- 小工具 ---------- */

	const el = (tag, attrs = {}, html) => {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) {
			if (k === "class") n.className = v;
			else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
			else n.setAttribute(k, v);
		}
		if (html != null) n.innerHTML = html;
		return n;
	};

	let toastTimer;
	function toast(text, ms = 2600) {
		let t = document.getElementById("adm-toast");
		if (!t) {
			t = el("div", { id: "adm-toast" });
			document.body.appendChild(t);
		}
		t.textContent = text;
		t.classList.add("on");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => t.classList.remove("on"), ms);
	}

	function setStatus(text) {
		const s = document.getElementById("adm-status");
		if (s) s.textContent = text || "";
	}

	function markDirty(on) {
		dirty = on;
		document.getElementById("adm-bar")?.classList.toggle("dirty", on);
	}

	/* ---------- HTML → Markdown ---------- */

	function textOf(node) {
		return (node.textContent || "").replace(/\u00a0/g, " ");
	}

	function inline(node) {
		let out = "";
		node.childNodes.forEach((n) => {
			if (n.nodeType === 3) {
				out += n.nodeValue.replace(/[ \t]*\n[ \t]*/g, " ");
				return;
			}
			if (n.nodeType !== 1) return;
			const tag = n.tagName.toLowerCase();
			const inner = inline(n).trim();
			if (tag === "strong" || tag === "b") out += `**${inner}**`;
			else if (tag === "em" || tag === "i") out += `*${inner}*`;
			else if (tag === "del" || tag === "s") out += `~~${inner}~~`;
			else if (tag === "code") out += "`" + textOf(n).replace(/`/g, "'") + "`";
			else if (tag === "a") {
				const href = n.getAttribute("href") || "";
				const t = inner || href;
				out += href ? `[${t}](${href})` : t;
			} else if (tag === "img") out += `![${n.getAttribute("alt") || "图片"}](${n.getAttribute("src") || ""})`;
			else if (tag === "br") out += "\n";
			else if (["svg", "button", "script", "style", "figure"].includes(tag)) out += "";
			else out += inner;
		});
		return out;
	}

	function codeText(pre) {
		const lines = pre.querySelectorAll(".ec-line");
		if (lines.length) {
			return [...lines]
				.map((l) => {
					const code = l.querySelector(".code") || l;
					return textOf(code).replace(/^\s{0,4}/, "");
				})
				.join("\n");
		}
		const code = pre.querySelector("code") || pre;
		return textOf(code).replace(/\n+$/, "");
	}

	function block(node) {
		if (node.nodeType === 3) {
			const t = node.nodeValue.trim();
			return t ? t : "";
		}
		if (node.nodeType !== 1) return "";
		const tag = node.tagName.toLowerCase();
		if (/^h[1-6]$/.test(tag)) return "#".repeat(Number(tag[1])) + " " + inline(node).trim();
		if (tag === "p") return inline(node).trim();
		if (tag === "blockquote")
			return children(node)
				.split("\n")
				.map((l) => (l ? `> ${l}` : ">"))
				.join("\n");
		if (tag === "ul" || tag === "ol") {
			const items = [...node.children].filter((c) => c.tagName.toLowerCase() === "li");
			return items
				.map((li, i) => {
					const marker = tag === "ol" ? `${i + 1}. ` : "- ";
					const inner = children(li).trim();
					const lines = inner.split("\n");
					return marker + lines[0] + lines.slice(1).map((l) => `\n  ${l}`).join("");
				})
				.join("\n");
		}
		if (tag === "pre") {
			const codeEl = node.querySelector("code");
			const cls = codeEl?.className || "";
			const lang = (cls.match(/language-([\w-]+)/) || [])[1] || "";
			return "```" + lang + "\n" + codeText(node) + "\n```";
		}
		if (tag === "hr") return "---";
		if (tag === "img") return `![${node.getAttribute("alt") || "图片"}](${node.getAttribute("src") || ""})`;
		if (tag === "table") {
			const rows = [...node.querySelectorAll("tr")];
			if (!rows.length) return "";
			const cells = (tr) => [...tr.children].map((c) => inline(c).trim());
			const head = cells(rows[0]);
			const body = rows.slice(1).map(cells);
			return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
		}
		if (tag === "figure") {
			const pre = node.querySelector("pre");
			if (pre) return block(pre);
			const img = node.querySelector("img");
			if (img) return block(img);
			return children(node);
		}
		if (["div", "section", "article", "details", "summary", "span"].includes(tag)) return children(node);
		return inline(node).trim();
	}

	function children(node) {
		const parts = [];
		node.childNodes.forEach((n) => {
			const s = block(n);
			if (s && s.trim()) parts.push(s.trim());
		});
		return parts.join("\n\n");
	}

	function toMarkdown(root) {
		return children(root)
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	/* ---------- 文章编辑 ---------- */

	const titleEl = document.querySelector('[data-pagefind-meta="title"]');
	const contentEl = document.querySelector(".markdown-content");
	const editable = Boolean(slug && titleEl && contentEl);

	function enableEditing() {
		if (!editable) return;
		for (const node of [titleEl, contentEl]) {
			node.setAttribute("contenteditable", "true");
			node.setAttribute("spellcheck", "false");
			node.addEventListener("input", () => markDirty(true));
			node.addEventListener("paste", onPaste);
			node.addEventListener("drop", onDrop);
		}
	}

	async function uploadAndInsert(file) {
		setStatus("上传图片…");
		const b64 = await new Promise((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = () => resolve(String(fr.result).split(",")[1]);
			fr.onerror = reject;
			fr.readAsDataURL(file);
		});
		const r = await api("/__admin/upload", { name: file.name || "paste.png", data: b64 });
		insertHtml(`<img src="${r.url}" alt="图片">`);
		markDirty(true);
		setStatus("图片已插入");
	}

	function insertHtml(html) {
		const sel = window.getSelection();
		if (!sel || !sel.rangeCount || !contentEl.contains(sel.anchorNode)) {
			contentEl.insertAdjacentHTML("beforeend", html);
			return;
		}
		const range = sel.getRangeAt(0);
		range.deleteContents();
		const tmp = document.createElement("div");
		tmp.innerHTML = html;
		const frag = document.createDocumentFragment();
		while (tmp.firstChild) frag.appendChild(tmp.firstChild);
		range.insertNode(frag);
		range.collapse(false);
	}

	async function onPaste(e) {
		const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
		if (!files.length) return;
		e.preventDefault();
		for (const f of files) await uploadAndInsert(f);
	}

	async function onDrop(e) {
		const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
		if (!files.length) return;
		e.preventDefault();
		for (const f of files) await uploadAndInsert(f);
	}

	async function savePost() {
		if (!editable) return false;
		try {
			const markdown = toMarkdown(contentEl);
			await api("/__admin/save", { slug, title: titleEl.textContent.trim(), markdown });
			markDirty(false);
			setStatus("已保存到本地");
			return true;
		} catch (e) {
			toast("保存失败：" + e.message, 5000);
			return false;
		}
	}

	/* ---------- 选中文字浮条 ---------- */

	const selBar = el("div", { id: "adm-sel" });
	const selButtons = [
		{ label: "B", title: "加粗", run: () => document.execCommand("bold") },
		{ label: "I", title: "斜体", run: () => document.execCommand("italic") },
		{ label: "H2", title: "二级标题", run: () => document.execCommand("formatBlock", false, "h2") },
		{ label: "H3", title: "三级标题", run: () => document.execCommand("formatBlock", false, "h3") },
		{ label: "•", title: "无序列表", run: () => document.execCommand("insertUnorderedList") },
		{ label: "1.", title: "有序列表", run: () => document.execCommand("insertOrderedList") },
		{ label: "❝", title: "引用", run: () => document.execCommand("formatBlock", false, "blockquote") },
		{ label: "`", title: "行内代码", run: () => document.execCommand("formatBlock", false, "pre") },
		{
			label: "🔗",
			title: "链接",
			run: () => {
				const href = prompt("链接地址", "https://");
				if (href) document.execCommand("createLink", false, href);
			},
		},
		{ label: "🖼", title: "插入图片", run: () => pickImage() },
	];
	for (const b of selButtons) {
		selBar.appendChild(el("button", { title: b.title, onclick: () => { b.run(); markDirty(true); } }, b.label));
	}
	document.body.appendChild(selBar);

	let pickImageResolve = null;
	const fileInput = el("input", { type: "file", accept: "image/*", multiple: "true", style: "display:none" });
	fileInput.addEventListener("change", async (e) => {
		for (const f of [...e.target.files]) await uploadAndInsert(f);
		e.target.value = "";
	});
	document.body.appendChild(fileInput);
	function pickImage() {
		fileInput.click();
	}

	document.addEventListener("selectionchange", () => {
		if (!editable || !contentEl.contains(document.activeElement)) {
			selBar.style.display = "none";
			return;
		}
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !sel.rangeCount || !contentEl.contains(sel.anchorNode)) {
			selBar.style.display = "none";
			return;
		}
		const rect = sel.getRangeAt(0).getBoundingClientRect();
		if (!rect.width) {
			selBar.style.display = "none";
			return;
		}
		selBar.style.display = "flex";
		const top = rect.top - selBar.offsetHeight - 8;
		selBar.style.left = `${Math.max(8, Math.min(window.innerWidth - selBar.offsetWidth - 8, rect.left + rect.width / 2 - selBar.offsetWidth / 2))}px`;
		selBar.style.top = `${Math.max(8, top)}px`;
	});

	/* ---------- 顶栏 ---------- */

	const bar = el("div", { id: "adm-bar" });
	bar.innerHTML = `
		<span class="brand">后台</span>
		<span class="dot" title="有未保存的改动"></span>
		<select id="adm-jump" title="切换文章"></select>
		<button data-act="new">＋ 新建</button>
		${editable ? '<button data-act="save">保存</button>' : ""}
		<button data-act="publish" class="pri">发布</button>
		<button data-act="settings">设置</button>
		<span id="adm-status"></span>`;
	document.body.appendChild(bar);

	const jump = bar.querySelector("#adm-jump");
	jump.addEventListener("change", () => {
		if (dirty && !confirm("当前改动还没保存，离开会丢。确定走？")) {
			jump.value = slug;
			return;
		}
		location.href = `/posts/${jump.value}/`;
	});

	api("/__admin/posts")
		.then((posts) => {
			jump.innerHTML =
				`<option value="" disabled${slug ? "" : " selected"}>选择文章…</option>` +
				posts
					.map(
						(p) =>
							`<option value="${p.slug}"${p.slug === slug ? " selected" : ""}>${p.title}${p.draft ? "（草稿）" : ""}</option>`,
					)
					.join("");
		})
		.catch(() => {});

	bar.addEventListener("click", async (e) => {
		const act = e.target.closest("button")?.dataset.act;
		if (!act) return;
		if (act === "new") {
			const newSlug = (prompt("新文章的短名（英文短横线，决定网址 /posts/短名/）", "") || "").trim().toLowerCase();
			if (!newSlug) return;
			const title = (prompt("文章标题", "") || "").trim() || newSlug;
			try {
				await api("/__admin/new", { slug: newSlug, title });
				markDirty(false);
				location.href = `/posts/${newSlug}/`;
			} catch (err) {
				toast("新建失败：" + err.message, 5000);
			}
		} else if (act === "save") {
			await savePost();
		} else if (act === "publish") {
			if (editable) {
				const ok = await savePost();
				if (!ok) return;
			}
			setStatus("推送中…");
			const r = await api("/__admin/publish", { message: editable ? `更新文章：${titleEl.textContent.trim()}` : "站点更新" });
			setStatus("");
			toast(r.output, r.ok ? 4000 : 9000);
		} else if (act === "settings") {
			openDrawer();
		}
	});

	document.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
			e.preventDefault();
			if (editable) savePost();
		}
	});

	window.addEventListener("beforeunload", (e) => {
		if (dirty) {
			e.preventDefault();
			e.returnValue = "";
		}
	});

	/* ---------- 设置面板 ---------- */

	const drawer = el("div", { id: "adm-drawer" });
	document.body.appendChild(drawer);

	let drawerLoaded = false;

	async function openDrawer() {
		drawer.classList.add("open");
		if (drawerLoaded) return;
		const [s, pages] = await Promise.all([api("/__admin/settings"), api("/__admin/pages")]);
		drawer.innerHTML = `
			<header><span>站点设置</span><button class="btn sm" data-close>关闭</button></header>
			<div class="body">
				<h4>外观</h4>
				<div class="row"><label>标题</label><input type="text" id="s-title"></div>
				<div class="row"><label>副标题</label><input type="text" id="s-subtitle"></div>
				<div class="row"><label>简介</label><input type="text" id="s-bio"></div>
				<div class="row"><label>主题色</label><input type="range" id="s-hue" min="0" max="360" step="1"><span id="s-hue-val" class="muted"></span></div>
				<div class="row"><label>横幅</label><input type="file" id="s-banner" accept="image/*"></div>
				<div class="row"><label>头像</label><input type="file" id="s-avatar" accept="image/*"></div>
				<div class="muted">图片建议：横幅 1920×700，头像正方形 ≥512。</div>

				<h4>排版</h4>
				<div class="row"><label>每页篇数</label><input type="number" id="s-page-size" min="1" max="50"></div>
				<div class="row"><label>横幅高度</label><input type="number" id="s-banner-h" min="0" max="80" step="1"><span class="muted">vh</span></div>
				<div class="row"><label>首页延伸</label><input type="number" id="s-banner-ext" min="0" max="80" step="1"><span class="muted">vh</span></div>
				<div class="row"><label>页宽</label><input type="number" id="s-page-width" min="50" max="120" step="1"><span class="muted">rem</span></div>
				<div class="row"><label>目录</label><input type="number" id="s-toc-depth" min="1" max="3" step="1"><span class="muted">级</span></div>

				<h4>导航栏</h4>
				<div id="s-nav"></div>
				<div class="row"><button class="btn sm" id="s-nav-add">＋ 添加条目</button></div>

				<h4>独立页面</h4>
				<div id="s-pages"></div>
				<div class="row"><input type="text" id="s-page-slug" placeholder="短名，如 links"><input type="text" id="s-page-title" placeholder="页面标题"></div>
				<div class="row"><button class="btn sm" id="s-page-add">＋ 新建页面</button><span class="muted">会生成 /短名/ 并可加入导航</span></div>
			</div>
			<div class="foot"><button class="btn" data-close>取消</button><button class="btn pri" id="s-save">保存设置</button></div>`;

		drawer.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => drawer.classList.remove("open")));

		drawer.querySelector("#s-title").value = s.site.title || "";
		drawer.querySelector("#s-subtitle").value = s.site.subtitle || "";
		drawer.querySelector("#s-bio").value = s.profile.bio || "";
		drawer.querySelector("#s-hue").value = s.theme.hue ?? 250;
		drawer.querySelector("#s-hue-val").textContent = String(s.theme.hue ?? 250);
		drawer.querySelector("#s-page-size").value = s.layout.pageSize;
		drawer.querySelector("#s-banner-h").value = s.layout.bannerHeight;
		drawer.querySelector("#s-banner-ext").value = s.layout.bannerExtend;
		drawer.querySelector("#s-page-width").value = s.layout.pageWidth;
		drawer.querySelector("#s-toc-depth").value = s.toc.depth;

		const hue = drawer.querySelector("#s-hue");
		hue.addEventListener("input", () => {
			const v = Number(hue.value);
			drawer.querySelector("#s-hue-val").textContent = String(v);
			document.documentElement.style.setProperty("--hue", String(v));
			document.documentElement.style.setProperty("--configHue", String(v));
		});

		drawer.querySelector("#s-banner").addEventListener("change", (e) => uploadAsset("banner", e.target.files[0]));
		drawer.querySelector("#s-avatar").addEventListener("change", (e) => uploadAsset("avatar", e.target.files[0]));

		renderNav(s.nav);
		renderPages(pages);

		drawer.querySelector("#s-nav-add").addEventListener("click", () => {
			navState.push({ kind: "custom", name: "新条目", url: "/", external: false });
			renderNav(navState);
		});

		drawer.querySelector("#s-page-add").addEventListener("click", async () => {
			const slugIn = drawer.querySelector("#s-page-slug").value.trim();
			const titleIn = drawer.querySelector("#s-page-title").value.trim();
			try {
				await api("/__admin/pages/create", { slug: slugIn, title: titleIn || slugIn });
				toast(`已创建 /${slugIn}/`);
				navState.push({ kind: "custom", name: titleIn || slugIn, url: `/${slugIn}/`, external: false });
				renderNav(navState);
				renderPages(await api("/__admin/pages"));
				drawer.querySelector("#s-page-slug").value = "";
				drawer.querySelector("#s-page-title").value = "";
			} catch (err) {
				toast("创建失败：" + err.message, 5000);
			}
		});

		drawer.querySelector("#s-save").addEventListener("click", async () => {
			const patch = {
				site: { title: drawer.querySelector("#s-title").value, subtitle: drawer.querySelector("#s-subtitle").value },
				profile: { bio: drawer.querySelector("#s-bio").value },
				theme: { hue: Number(drawer.querySelector("#s-hue").value) },
				toc: { depth: Number(drawer.querySelector("#s-toc-depth").value) },
				layout: {
					pageSize: Number(drawer.querySelector("#s-page-size").value),
					bannerHeight: Number(drawer.querySelector("#s-banner-h").value),
					bannerExtend: Number(drawer.querySelector("#s-banner-ext").value),
					pageWidth: Number(drawer.querySelector("#s-page-width").value),
				},
				nav: navState,
			};
			try {
				await api("/__admin/settings", patch);
				toast("设置已写入，等预览重启…");
				// config.ts 变了，astro dev 会自己重启；等它回来再刷新
				for (let i = 0; i < 40; i++) {
					await new Promise((r) => setTimeout(r, 500));
					try {
						const p = await api("/__admin/ping");
						if (p.dev) break;
					} catch {
						/* 重启中，继续等 */
					}
				}
				location.reload();
			} catch (e) {
				toast("保存失败：" + e.message, 6000);
			}
		});

		drawerLoaded = true;
	}

	let navState = [];

	const PRESET_LABEL = { Home: "主页", Archive: "归档", About: "关于" };

	function renderNav(list) {
		navState = list.map((x) => ({ ...x }));
		const box = drawer.querySelector("#s-nav");
		box.innerHTML = "";
		navState.forEach((item, i) => {
			const row = el("div", { class: "navrow" });
			if (item.kind === "preset") {
				row.innerHTML = `<input type="text" value="${PRESET_LABEL[item.key] || item.key}" readonly><span class="muted">内置 · /${item.key === "Home" ? "" : item.key.toLowerCase() + "/"}</span>`;
			} else {
				row.innerHTML = `<input type="text" value="${item.name}" data-k="name" placeholder="名称"><input type="text" value="${item.url}" data-k="url" placeholder="链接"><label class="muted"><input type="checkbox" data-k="external" ${item.external ? "checked" : ""}>外链</label>`;
			}
			row.appendChild(el("button", { class: "btn sm", onclick: () => { if (i > 0) { [navState[i - 1], navState[i]] = [navState[i], navState[i - 1]]; renderNav(navState); } } }, "↑"));
			row.appendChild(el("button", { class: "btn sm", onclick: () => { if (i < navState.length - 1) { [navState[i + 1], navState[i]] = [navState[i], navState[i + 1]]; renderNav(navState); } } }, "↓"));
			row.appendChild(el("button", { class: "btn sm", onclick: () => { navState.splice(i, 1); renderNav(navState); } }, "✕"));
			row.querySelectorAll("input[data-k]").forEach((inp) => {
				inp.addEventListener("input", () => {
					const k = inp.dataset.k;
					item[k] = inp.type === "checkbox" ? inp.checked : inp.value;
				});
			});
			box.appendChild(row);
		});
	}

	function renderPages(list) {
		const box = drawer.querySelector("#s-pages");
		box.innerHTML = "";
		if (!list.length) {
			box.appendChild(el("div", { class: "muted" }, "还没有独立页面"));
		}
		for (const p of list) {
			const row = el("div", { class: "list" });
			row.innerHTML = `<span>/${p.slug}/ <span class="muted">${p.title}</span></span>`;
			row.appendChild(
				el("button", {
					class: "btn sm",
					onclick: async () => {
						if (!confirm(`删除页面 /${p.slug}/ ？`)) return;
						await api("/__admin/pages/delete", { slug: p.slug });
						renderPages(await api("/__admin/pages"));
						toast(`已删除 /${p.slug}/`);
					},
				}, "删除"),
			);
			box.appendChild(row);
		}
	}

	async function uploadAsset(kind, file) {
		if (!file) return;
		setStatus("上传中…");
		const b64 = await new Promise((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = () => resolve(String(fr.result).split(",")[1]);
			fr.onerror = reject;
			fr.readAsDataURL(file);
		});
		await api("/__admin/asset", { kind, name: file.name, data: b64 });
		setStatus("");
		toast(`${kind === "banner" ? "横幅" : "头像"}已替换，保存设置后生效`);
	}

	/* ---------- 启动 ---------- */

	enableEditing();
	if (!editable) {
		setStatus("这里不编辑文章；用「设置」改外观，用文章页改正文");
	}
})();
