// 入口：node editor.mjs（或双击「启动编辑器.bat」）
// 真正干活的是 admin/server.mjs：起 astro dev → 反代到 4999 → 往页面注入编辑脚本
import path from "node:path";
import { startServer } from "./admin/server.mjs";

const root = path.resolve(import.meta.dirname);
const server = startServer(root);

const url = await server.listen();

if (!url) {
	console.log("\n后台已经在运行了 → http://127.0.0.1:4999");
	console.log("（直接刷新浏览器即可；这个窗口可以关掉）");
	setTimeout(() => process.exit(0), 4000);
} else {
	console.log(`\n可视化后台已启动 → ${url}`);
	console.log("预览服务随后自动起来（首次约 10-20 秒），页面会自己刷新。");
	console.log("写文章、改界面都在这个页面里，Ctrl+C 或关掉窗口即退出。\n");

	for (const sig of ["SIGINT", "SIGTERM"]) {
		process.on(sig, () => {
			server.close();
			process.exit(0);
		});
	}
}
