import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Vercel 环境无法安装 yt-dlp，返回提示让用户改用文字粘贴
  res.status(501).json({
    error: "YouTube 字幕下载在当前环境不支持，请改用「文字粘贴」方式输入素材。",
  });
}
