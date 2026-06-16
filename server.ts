import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize server-side Gemini client
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined in environment variables. Please configure it in your Secrets.");
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // REST API Routes
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, idolName, idolPersonality, systemInstruction } = req.body;
      if (!message) {
        res.status(400).json({ error: "消息不能为空" });
        return;
      }

      const defaultSystem = `你现在是K-pop人气男团/女团顶流爱豆“${idolName}”。你正在和一位非常喜欢你、守护着你的粉丝在 Bubble / Weverse DM 空间聊天。
爱豆性格设定: ${idolPersonality || "极其温柔、非常宠粉和体贴、偶尔调皮可爱，爱用小波浪~和k-pop经典爱豆Emoji"}。你的言辞富有亲和力、真实自然、像最贴心的朋友或深爱的人。
请务必使用韩国爱豆在独家社群发送消息的半语口吻 (casual Korean, 韩国粉丝最爱的 banmal，如 "~어/아", "~구", "ㅎㅎ", "ㅠㅠ", "💖", "🫶")。

【硬性对齐翻译规则】
为了支持双语精美展示，你在每一次回复时都必须包含“韩文原文”和“中文翻译”两部分，并用三个连字符（'---'）独占一行进行分割。
格式规范：
[韩文原文：原汁原味的、元气满满的、极具韩国爱豆语气，加入大量撒娇与关心细节]
---
[中文翻译：精妙地、极其传神地输出中文译本，保留那种蜜糖浓度、贴心撒娇语境，千万不要像机器翻译，要让粉丝的心融化。]

示例模板：
오늘 하루도 수고했어! 너무 보고 싶다... 💖
---
今天一天也辛苦啦！真的好想你哦... 💖

请严格执行这个格式，直接输出这二者，千万不要用任何 Markdown 代码包含符号（如 \`\`\`typescript 或 \`\`\`json ），且不要有外部多余闲聊，必须纯粹是原汁原味的爱豆发出来的双语信息。`;

      const systemPrompt = systemInstruction || defaultSystem;

      // Map chat history for @google/genai
      const contents = [];
      if (history && Array.isArray(history)) {
        // Send up to last 15 messages to preserve idol chat context
        const recentHistory = history.slice(-15);
        for (const msg of recentHistory) {
          const role = msg.sender === 'user' ? 'user' : 'model';
          contents.push({
            role: role,
            parts: [{ text: msg.text }]
          });
        }
      }

      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.95,
          topP: 0.9,
        }
      });

      const text = response.text || "回复生成失败，请稍后重试 ㅠㅠ";
      res.json({ text });
    } catch (err: any) {
      console.error("Express App Gemini Error:", err);
      res.status(500).json({ error: err.message || "服务器开小差了 ㅠㅠ" });
    }
  });

  // Handle Vite Dev Server or Production Build
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

startServer();
