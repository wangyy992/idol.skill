import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

const EVENT_TYPES = ["comeback", "concert", "birthday", "anniversary", "album", "variety", "custom"];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch the current + next month calendar text from an aggregator.
// Source is swappable; kept intentionally simple (no scraping deps).
async function fetchCalendarText(): Promise<string> {
  const now = new Date();
  const months = [now, new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  const chunks: string[] = [];
  for (const m of months) {
    const url = `https://kpopping.com/calendar/${m.getFullYear()}-${m.getMonth() + 1}`;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });
      if (r.ok) chunks.push(stripHtml(await r.text()));
    } catch {
      /* one month failing is fine */
    }
  }
  return chunks.join("\n").slice(0, 16000);
}

function extractJson(raw: string): any {
  try { return JSON.parse(raw); } catch {}
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch {}
  }
  return {};
}

// POST { artist } -> { events: [{type,title,date}], source, note? }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { artist } = req.body;
    if (!artist) return res.status(400).json({ error: "缺少 artist" });

    const text = await fetchCalendarText();
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
}
