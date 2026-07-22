import type { VercelRequest, VercelResponse } from "@vercel/node";

// Instagram has no official API for reading arbitrary public accounts, and its
// datacenter-IP + login walls block naive server-side scraping. So this endpoint
// reads from a *configurable* provider you point it at — the realistic free path
// is a self-hosted RSS-Bridge instance (Instagram bridge, JSON format).
//
// Configure ONE of:
//   IG_BRIDGE_BASE   e.g. https://your-rss-bridge.example.com
//                    (this builds the Instagram bridge URL for a username)
//   IG_FEED_TEMPLATE a full URL containing {user}, returning RSS-Bridge-style
//                    JSON ({ items: [...] }). Overrides IG_BRIDGE_BASE.
//
// Returns { posts: [{ id, url, caption, imageUrl, timestamp }], note? }

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function firstImg(html: string): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : undefined;
}

// accept "@name", "name", or a full profile URL
function parseHandle(raw: string): string {
  let h = String(raw).trim().replace(/^@/, "");
  const m = h.match(/instagram\.com\/([^/?#]+)/i);
  if (m) h = m[1];
  return h.replace(/\/+$/, "");
}

function buildUrl(user: string): string | null {
  const tmpl = process.env.IG_FEED_TEMPLATE;
  if (tmpl) return tmpl.replace(/\{user\}/g, encodeURIComponent(user));
  const base = process.env.IG_BRIDGE_BASE;
  if (base)
    return `${base.replace(/\/$/, "")}/?action=display&bridge=Instagram&context=Username&u=${encodeURIComponent(user)}&format=Json`;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ error: "缺少 handle" });

    const user = parseHandle(handle);
    const url = buildUrl(user);
    if (!url)
      return res.json({ posts: [], note: "未配置 IG 数据源，请设置 IG_BRIDGE_BASE 或 IG_FEED_TEMPLATE" });

    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BubbleDM/1.0)" },
    });
    if (!r.ok) return res.json({ posts: [], note: `数据源返回 ${r.status}` });

    const data: any = await r.json().catch(() => ({}));
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const posts = items.slice(0, 10).map((it) => {
      const html = it.content_html || it.content || "";
      return {
        id: String(it.uri || it.url || it.id || it.timestamp || ""),
        url: it.uri || it.url || "",
        caption: stripHtml(it.title || it.content_text || html || "").slice(0, 500),
        imageUrl: firstImg(html) || it.image || undefined,
        timestamp: it.timestamp || null,
      };
    }).filter((p) => p.id);

    res.json({ posts });
  } catch (err: any) {
    console.error("/api/instagram error:", err);
    res.status(500).json({ error: err.message });
  }
}
