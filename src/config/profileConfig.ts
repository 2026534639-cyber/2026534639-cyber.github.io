import type { ProfileConfig } from "../types/config";

// 个人资料配置
export const profileConfig: ProfileConfig = {
	avatar: "assets/images/avatar.png", // 相对于 /src 目录。如果以 '/' 开头，则相对于 /public 目录
	name: "理不尽",
	bio: "深大学生 · 写点工具，记点坑",
	typewriter: {
		enable: true, // 启用个人简介打字机效果
		speed: 80, // 打字速度（毫秒）
	},
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/2026534639-cyber",
		},
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss.xml",
		},
	],
};
