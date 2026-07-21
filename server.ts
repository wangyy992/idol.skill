import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import Tesseract from "tesseract.js";

dotenv.config();
const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: "https://api.deepseek.com",
  });

  // ── /api/chat ──────────────────────────────────────────────
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, systemPrompt } = req.body;
      if (!message) return res.status(400).json({ error: "消息不能为空" });

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt || "你是一个温柔的K-pop偶像，正在和粉丝聊天。" },
      ];

      const recent = (history || []).slice(-15);
      for (const m of recent) {
        messages.push({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        });
      }
      messages.push({ role: "user", content: message });

      const response = await deepseek.chat.completions.create({
        model: "deepseek-v4-flash",
        messages,
        temperature: 0.95,
        max_tokens: 400,
        stream: false,
      });

      const text = response.choices[0]?.message?.content || "ㅠㅠ 잠깐만요...";
      res.json({ text });
    } catch (err: any) {
      console.error("/api/chat error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── /api/ocr ───────────────────────────────────────────────
  // tesseract.js 读取截图文字，支持韩语+中文
  app.post("/api/ocr", async (req, res) => {
    try {
      const { images } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "请上传至少一张图片" });
      }

      const results: string[] = [];

      for (const imgBase64 of images) {
        try {
          const { data: { text } } = await Tesseract.recognize(
            imgBase64,
            "kor+chi_sim", // 韩语 + 简体中文
            { logger: () => {} }
          );
          const cleaned = text.trim();
          if (cleaned) results.push(cleaned);
        } catch (imgErr) {
          console.warn("单张图片 OCR 失败，跳过:", imgErr);
        }
      }

      const combined = results.join("\n").trim();
      res.json({ text: combined, count: results.length });
    } catch (err: any) {
      console.error("/api/ocr error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── /api/distill ───────────────────────────────────────────
  app.post("/api/distill", async (req, res) => {
    try {
      const { idolName, material } = req.body;
      if (!idolName) return res.status(400).json({ error: "请填写爱豆名字" });

      const materialText = (material || "").slice(0, 8000);

      const prompt = materialText
        ? `你是一个偶像人格蒸馏引擎。
以下是偶像「${idolName}」在 Bubble/Weverse 等粉丝平台发送的真实消息素材：

<material>
${materialText}
</material>

请从以上素材中提取这位偶像的对话风格，生成一段角色扮演系统提示词。

要求：
1. 说话节奏与语气（快/慢/温柔/活泼/傲娇等）
2. 高频词汇和口头禅（直接引用素材中出现的词）
3. 常用 emoji 和韩语语气词（ㅎㅎ、ㅠㅠ、~~ 等，从素材中提取）
4. 对粉丝的称呼和态度
5. 话题偏好（爱聊什么）
6. 禁止谈恋爱，保持偶像与粉丝的健康互动距离
7. 回复简短自然，1-3句为主，像真实平台消息

只输出系统提示词本体，200字以内，不要任何标题或解释。`
        : `你是一个偶像人格生成引擎。
请为K-pop偶像「${idolName}」生成一段角色扮演系统提示词。
风格：温暖、亲切、偶像感，爱用 emoji 和韩语语气词，关心粉丝日常。
禁止谈恋爱，保持健康互动距离。回复简短自然，1-3句为主。
只输出系统提示词本体，150字以内。`;

      const response = await deepseek.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 400,
      });

      const systemPrompt = response.choices[0]?.message?.content?.trim() || "";
      res.json({ systemPrompt });
    } catch (err: any) {
      console.error("/api/distill error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── /api/translate ─────────────────────────────────────────
  app.post("/api/translate", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "文本不能为空" });

      const response = await deepseek.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: "你是一个韩中翻译助手。将用户输入的韩文翻译成地道的中文，保留语气和 emoji，不要解释，只输出翻译结果。",
          },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const translated = response.choices[0]?.message?.content?.trim() || "";
      res.json({ translated });
    } catch (err: any) {
      console.error("/api/translate error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── /api/subtitle ──────────────────────────────────────────
  app.post("/api/subtitle", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "请提供 YouTube 链接" });

      const tmpDir = `/tmp/yt_${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });

      const cmd = `yt-dlp --write-auto-sub --sub-lang ko,ja,zh-Hans --skip-download --output "${tmpDir}/%(id)s" "${url}" 2>&1`;
      await execAsync(cmd).catch(() => null);

      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".vtt") || f.endsWith(".srt"));
      if (files.length === 0) {
        fs.rmSync(tmpDir, { recursive: true });
        return res.status(404).json({ error: "未找到字幕，请尝试粘贴文字素材" });
      }

      let rawText = "";
      for (const f of files) {
        rawText += fs.readFileSync(path.join(tmpDir, f), "utf-8") + "\n";
      }

      const lines = rawText
        .split("\n")
        .filter((l) => l.trim())
        .filter((l) => !l.startsWith("WEBVTT"))
        .filter((l) => !/^\d{2}:\d{2}/.test(l))
        .filter((l) => !/^NOTE/.test(l))
        .filter((l) => !/^\d+$/.test(l.trim()));

      const unique = [...new Set(lines)];
      const cleaned = unique.join("\n").slice(0, 8000);

      fs.rmSync(tmpDir, { recursive: true });
      res.json({ text: cleaned });
    } catch (err: any) {
      console.error("/api/subtitle error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── /api/schedule ──────────────────────────────────────────
  // 抓取 K-pop 日程源，用 LLM 抽取指定艺人的近期事件（回归/演唱会等）
  app.post("/api/schedule", async (req, res) => {
    const EVENT_TYPES = ["comeback", "concert", "birthday", "anniversary", "album", "variety", "custom"];
    const stripHtml = (html: string) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const extractJson = (raw: string): any => {
      try { return JSON.parse(raw); } catch {}
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s >= 0 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
      return {};
    };
    try {
      const { artist } = req.body;
      if (!artist) return res.status(400).json({ error: "缺少 artist" });

      const now = new Date();
      const months = [now, new Date(now.getFullYear(), now.getMonth() + 1, 1)];
      const chunks: string[] = [];
      for (const m of months) {
        const url = `https://kpopping.com/calendar/${m.getFullYear()}-${m.getMonth() + 1}`;
        try {
          const r = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" },
          });
          if (r.ok) chunks.push(stripHtml(await r.text()));
        } catch {}
      }
      const text = chunks.join("\n").slice(0, 16000);
      if (!text) return res.json({ events: [], note: "暂时没抓到日程源，请稍后再试或手动添加" });

      const today = new Date().toISOString().slice(0, 10);
      const prompt = `今天是 ${today}。以下是 K-pop 日程网站的纯文本内容。
请从中提取与艺人/组合「${artist}」直接相关、且日期为今天或未来的事件。
只输出 JSON：{"events":[{"type":"...","title":"...","date":"YYYY-MM-DD"}]}
- type 只能是：${EVENT_TYPES.join(", ")}
- date 用 YYYY-MM-DD
- 只保留明确属于「${artist}」的事件，最多 8 条；找不到就返回 {"events":[]}
- 不要输出任何解释文字

<calendar>
${text}
</calendar>`;

      const resp = await deepseek.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 600,
      });
      const parsed = extractJson(resp.choices[0]?.message?.content || "{}");
      const events = (Array.isArray(parsed.events) ? parsed.events : [])
        .filter((e: any) => e && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
        .map((e: any) => ({
          type: EVENT_TYPES.includes(e.type) ? e.type : "custom",
          title: String(e.title || "").slice(0, 80),
          date: e.date,
        }))
        .slice(0, 8);
      res.json({ events, source: "kpopping.com" });
    } catch (err: any) {
      console.error("/api/schedule error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Vite / Static ──────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
