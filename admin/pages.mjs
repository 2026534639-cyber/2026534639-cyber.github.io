// 独立页面：正文放 src/content/pages/<slug>.md，路由 src/pages/<slug>.astro
// 只允许新建/删除自己生成的页面，绝不覆盖 about.astro 这类手写路由。
import fs from "node:fs/promises";
import path from "node:path";

const TEMPLATE = (slug, varName) => `---
import { getEntry, render } from "astro:content";
import Markdown from "../components/misc/Markdown.astro";
import MainGridLayout from "../layouts/MainGridLayout.astro";

const ${varName} = await getEntry("pages", ${JSON.stringify(slug)});
if (!${varName}) {
	throw new Error("页面内容不存在：${slug}");
}
const { Content } = await render(${varName});
---
<MainGridLayout title={${varName}.data.title} description={${varName}.data.description}>
	<div class="flex w-full rounded-[var(--radius-large)] overflow-hidden relative min-h-32">
		<div class="card-base z-10 px-9 py-6 relative w-full">
			<Markdown class="mt-2"><Content /></Markdown>
		</div>
	</div>
</MainGridLayout>
`;

export function createPages(root) {
	const PAGES = path.join(root, "src", "content", "pages");
	const ROUTES = path.join(root, "src", "pages");

	async function exists(p) {
		try {
			await fs.access(p);
			return true;
		} catch {
			return false;
		}
	}

	function validSlug(slug) {
		return typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/.test(slug);
	}

	async function list() {
		await fs.mkdir(PAGES, { recursive: true });
		const files = (await fs.readdir(PAGES)).filter((f) => f.endsWith(".md"));
		const out = [];
		for (const f of files) {
			const slug = f.replace(/\.md$/, "");
			const raw = await fs.readFile(path.join(PAGES, f), "utf8");
			const title = (raw.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || slug;
			out.push({ slug, title, hasRoute: await exists(path.join(ROUTES, `${slug}.astro`)) });
		}
		return out.sort((a, b) => a.slug.localeCompare(b.slug));
	}

	async function create(slug, title, description = "") {
		if (!validSlug(slug)) throw new Error("页面短名只能用 a-z、0-9、短横线");
		const md = path.join(PAGES, `${slug}.md`);
		const route = path.join(ROUTES, `${slug}.astro`);
		if (await exists(md)) throw new Error(`页面 ${slug} 已存在`);
		if (await exists(route)) throw new Error(`路由 /${slug}/ 已被占用`);
		await fs.mkdir(PAGES, { recursive: true });
		const body = `---\ntitle: ${JSON.stringify(title || slug)}\ndescription: ${JSON.stringify(description)}\n---\n\n在这里写内容。支持 Markdown，也支持 \`:::tip\` 这类提示框。\n`;
		await fs.writeFile(md, body, "utf8");
		const varName = "pageEntry";
		await fs.writeFile(route, TEMPLATE(slug, varName), "utf8");
		return { slug, title };
	}

	async function remove(slug) {
		if (!validSlug(slug)) throw new Error("页面短名不合法");
		const md = path.join(PAGES, `${slug}.md`);
		const route = path.join(ROUTES, `${slug}.astro`);
		if (!(await exists(md))) throw new Error(`页面 ${slug} 不存在`);
		await fs.rm(md, { force: true });
		await fs.rm(route, { force: true });
		return { slug };
	}

	return { list, create, remove, dirs: { PAGES, ROUTES } };
}
