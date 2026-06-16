import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    });

    const text = response.choices[0]?.message?.content || "ㅠㅠ 잠깐만요...";
    res.json({ text });
  } catch (err: any) {
    console.error("/api/chat error:", err);
    res.status(500).json({ error: err.message });
  }
}
