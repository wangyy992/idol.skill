<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Bubble DM Simulator

一个高仿 Bubble / Weverse DM 的爱豆互动模拟器：从真实素材蒸馏爱豆人格，聊天带韩→中实时翻译，爱豆还会**主动**给你发消息，并能感知**回归 / 演唱会**等行程。

View in AI Studio: https://ai.studio/apps/ee25b821-0c35-4799-a18f-8b09986ce699

## 功能一览

- **人格蒸馏**：上传泡泡截图 / 粘贴文字 / YouTube 链接 → 生成爱豆专属说话风格
- **聊天 + 翻译**：韩文原文与中文译文实时对齐，一键切换
- **主动消息**：早安 / 晚安、"好久没理你"、开聊天时连发（像真 Bubble 一条条刷）
- **行程感知**：为爱豆添加回归 / 演唱会 / 生日等日程，临近（D-3 / D-1 / 当天）时主动发相关消息；支持从公开日程源**半自动获取**
- **通知**：标签页在后台时，主动消息走浏览器通知

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | **必填**。后端所有 LLM 调用（聊天 / 蒸馏 / 翻译 / 行程抽取）都走 DeepSeek |
| `IG_BRIDGE_BASE` | 选填。Instagram 同步的数据源——一个 [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge) 实例地址（如 `https://your-rss-bridge.example.com`）。不填则 IG 同步不工作 |
| `IG_FEED_TEMPLATE` | 选填。含 `{user}` 占位符的完整 feed URL，返回 RSS-Bridge 风格 JSON（`{items:[...]}`）。设置后优先于 `IG_BRIDGE_BASE` |

> 注意：本项目后端用的是 **DeepSeek**（`api/*.ts` 与 `server.ts` 里 `process.env.DEEPSEEK_API_KEY`），不是 Gemini。

### 关于 Instagram 同步

IG 没有官方途径读取「别人的」公开账号，数据中心 IP + 登录墙会挡掉直接爬取。所以本功能读取一个**你自己配置的数据源**：最现实的免费路径是自建一个 [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge) 实例，然后把它的地址填进 `IG_BRIDGE_BASE`。功能代码已就绪，连上数据源即可用；连不上时该功能静默降级、不影响其它。

## 本地运行

**前置：** Node.js 18+

1. 安装依赖：`npm install`
2. 新建 `.env`，写入：`DEEPSEEK_API_KEY=你的密钥`
3. 启动：`npm run dev` → 打开 http://localhost:3000

## 部署到 Vercel

这是一个「前端(Vite) + 后端(serverless functions)」的全栈应用，需要能跑服务端代码的平台，**GitHub Pages 这类纯静态托管跑不了**（后端握着密钥、还要服务端抓取行程）。Vercel 已在 `vercel.json` 中配好。

1. 打开 [vercel.com](https://vercel.com) → 用 GitHub 登录
2. **Add New → Project** → 选择本仓库
3. 在 **Environment Variables** 里加：`DEEPSEEK_API_KEY = 你的密钥`
4. **Deploy** → 部署完成后获得 `https://<项目名>.vercel.app` 网址

`api/` 下每个 `.ts` 会自动成为一个 serverless 函数：

| 端点 | 作用 |
| --- | --- |
| `api/chat.ts` | 聊天 / 主动消息生成 |
| `api/distill.ts` | 人格蒸馏 |
| `api/translate.ts` | 韩→中翻译 |
| `api/schedule.ts` | 按艺人名抓取近期回归/演唱会行程 |
| `api/instagram.ts` | 从配置的数据源读取爱豆 IG 最新帖 |
| `api/subtitle.ts` | 从 YouTube 拉字幕作为蒸馏素材（需 `yt-dlp`） |

## 常用脚本

- `npm run dev` — 本地开发（Express + Vite 中间件）
- `npm run build` — 生产构建（Vite 前端 + esbuild 打包 server）
- `npm run lint` — TypeScript 类型检查
