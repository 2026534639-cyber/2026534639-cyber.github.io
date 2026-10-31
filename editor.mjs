// 入口：node editor.mjs（或双击「启动编辑器.bat」）
// 真正干活的是 admin/server.mjs：起 astro dev → 反代到 4999 → 往页面注入编辑脚本
import path from "node:path";
import { startServer } from "./admin/server.mjs";

const root = path.resolve(import.meta.dirname);
const server = startServer(root);

const url = await server.listen();
console.log(`\n可视化后台已启动 → ${url}\n（写文章、改界面都在这个页面里，Ctrl+C 退出）`);

for (const sig of ["SIGINT", "SIGTERM"]) {
	process.on(sig, () => {
		server.close();
		process.exit(0);
	});
}
