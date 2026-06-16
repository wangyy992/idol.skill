import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
}
