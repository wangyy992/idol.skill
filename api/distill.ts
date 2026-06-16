import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { idolName, material, detectNameOnly } = req.body;

    const materialText = (material || "").slice(0, 8000);

    // ── 模式一：只识别爱豆名字 ──────────────────────────────
    if (detectNameOnly) {
      if (!materialText) return res.json({ idolName: "" });

      const response = await deepseek.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{
          role: "user",
          content: `以下是从韩国偶像平台（Bubble/Weverse）截图中提取的文字：

<material>
${materialText.slice(0, 2000)}
</material>

请判断这是哪位偶像发的消息，输出他/她最常用的名字或艺名（可以含emoji，例如 "mocha ☕" 或 "령💜"）。
如果无法判断，输出空字符串。
只输出名字本身，不要任何解释。`,
        }],
        temperature: 0.3,
        max_tokens: 30,
      });

      const name = response.choices[0]?.message?.content?.trim() || "";
      return res.json({ idolName: name });
    }

    // ── 模式二：蒸馏生成 systemPrompt ──────────────────────
    if (!idolName) return res.status(400).json({ error: "请填写爱豆名字" });

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
8. 用韩文回复为主，自然夹杂中文

只输出系统提示词本体，200字以内，不要任何标题或解释。`
      : `你是一个偶像人格生成引擎。
请为K-pop偶像「${idolName}」生成一段角色扮演系统提示词。
风格：温暖、亲切、偶像感，爱用 emoji 和韩语语气词，关心粉丝日常。
禁止谈恋爱，保持健康互动距离。回复以韩文为主，1-3句为主。
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
}
