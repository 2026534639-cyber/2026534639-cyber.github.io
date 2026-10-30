import rss from "@astrojs/rss";
import { getSortedPosts } from "@utils/content-utils";
import { url } from "@utils/url-utils";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { siteConfig } from "@/config";

const parser = new MarkdownIt();

function stripInvalidXmlChars(str: string): string {
	return str.replace(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: https://www.w3.org/TR/xml/#charsets
		/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFDD0-\uFDEF\uFFFE\uFFFF]/g,
		"",
	);
}

export async function GET(context: APIContext) {
	const blog = await getSortedPosts();
	const site = context.site ?? new URL("https://fuwari.vercel.app");
	const selfUrl = new URL(url("/rss.xml"), site).toString();
	const latest = blog[0]?.data.published ?? null;

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site,
		xmlns: {
			atom: "http://www.w3.org/2005/Atom",
		},
		items: blog.map((post) => {
			const content =
				typeof post.body === "string" ? post.body : String(post.body || "");
			const cleanedContent = stripInvalidXmlChars(content);
			return {
				title: post.data.title,
				pubDate: post.data.published,
				description: post.data.description || "",
				link: url(`/posts/${post.slug}/`),
				content: sanitizeHtml(parser.render(cleanedContent), {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
				}),
			};
		}),
		customData: [
			// RFC 1766 / BCP 47 用连字符，zh_CN 这种下划线写法部分阅读器认不出
			`<language>${siteConfig.lang.replace(/_/g, "-")}</language>`,
			`<atom:link href="${selfUrl}" rel="self" type="application/rss+xml"/>`,
			latest instanceof Date && !Number.isNaN(latest.getTime())
				? `<lastBuildDate>${latest.toUTCString()}</lastBuildDate>`
				: "",
		].join(""),
	});
}
