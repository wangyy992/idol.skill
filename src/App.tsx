import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Search, MoreVertical, Send, Plus,
  Trash2, Camera, X, Check, ChevronRight, RefreshCw, Heart,
  Bell, Star, Grid, Settings
} from "lucide-react";
import Tesseract from "tesseract.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "bubble" | "weverse";

interface Idol {
  id: string;
  name: string;
  avatar: string;
  platform: Platform;
  systemPrompt: string;
  createdAt: number;
  realName?: string; // 现实原型艺名/组合名，用于自动获取行程
  instagram?: string; // IG 用户名/主页链接，用于同步新帖
  habits?: IdolHabits; // 作息 / 发消息习惯
}

interface Message {
  id: string;
  sender: "user" | "idol";
  text: string;
  time: string;
  isUnread?: boolean;
  translation?: string;
  showTranslation?: boolean;
  image?: string; // 图片消息（如同步过来的 IG 照片）
}

type Screen = "home" | "distill" | "progress" | "chat";
type DistillSource = "image" | "text" | "youtube";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d = new Date()) {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadIdols(): Idol[] {
  try { return JSON.parse(localStorage.getItem("idols_v1") || "[]"); }
  catch { return []; }
}

function saveIdols(idols: Idol[]) {
  localStorage.setItem("idols_v1", JSON.stringify(idols));
}

function loadHistory(idolId: string): Message[] {
  try { return JSON.parse(localStorage.getItem(`history_${idolId}`) || "[]"); }
  catch { return []; }
}

function saveHistory(idolId: string, msgs: Message[]) {
  localStorage.setItem(`history_${idolId}`, JSON.stringify(msgs.slice(-100)));
}

// ─── Events & proactive engine ────────────────────────────────────────────────

type IdolEventType = "comeback" | "concert" | "birthday" | "anniversary" | "album" | "variety" | "custom";

interface IdolEvent {
  id: string;
  type: IdolEventType;
  title: string;
  date: string; // YYYY-MM-DD (local)
}

const EVENT_META: Record<IdolEventType, { label: string; emoji: string }> = {
  comeback: { label: "回归", emoji: "🎵" },
  concert: { label: "演唱会", emoji: "🎤" },
  birthday: { label: "生日", emoji: "🎂" },
  anniversary: { label: "纪念日", emoji: "💜" },
  album: { label: "专辑", emoji: "💿" },
  variety: { label: "综艺/直播", emoji: "📺" },
  custom: { label: "日程", emoji: "📌" },
};

// ── 作息 / 发消息习惯 ──────────────────────────────────────────────────────────

interface IdolHabits {
  wakeHour: number;         // 起床时间（0-23）→ 早安消息窗口
  sleepHour: number;        // 睡觉时间（0-23）→ 晚安消息窗口
  activeBuckets: string[];  // 爱发消息的时段（TIME_BUCKETS 的 id）
  burstMin: number;         // 每次发几句（下限）
  burstMax: number;         // 每次发几句（上限）
  chattiness: "low" | "med" | "high"; // 话痨程度
}

const TIME_BUCKETS: { id: string; label: string; hours: number[] }[] = [
  { id: "dawn", label: "清晨", hours: [6, 7, 8] },
  { id: "morning", label: "上午", hours: [9, 10, 11] },
  { id: "noon", label: "中午", hours: [12, 13] },
  { id: "afternoon", label: "下午", hours: [14, 15, 16, 17] },
  { id: "evening", label: "傍晚", hours: [18, 19] },
  { id: "night", label: "晚上", hours: [20, 21, 22] },
  { id: "latenight", label: "深夜", hours: [23, 0, 1] },
];

function defaultHabits(): IdolHabits {
  return { wakeHour: 9, sleepHour: 0, activeBuckets: ["noon", "night"], burstMin: 2, burstMax: 5, chattiness: "med" };
}

function habitsActiveHours(h: IdolHabits): number[] {
  const set = new Set<number>();
  for (const id of h.activeBuckets) {
    const b = TIME_BUCKETS.find((x) => x.id === id);
    if (b) b.hours.forEach((hr) => set.add(hr));
  }
  return [...set];
}

// hour 是否落在以 start 起、长 len 小时的窗口内（跨午夜安全）
function inHourWindow(hour: number, start: number, len = 2): boolean {
  for (let i = 0; i < len; i++) if ((start + i) % 24 === hour) return true;
  return false;
}

function chattinessProb(c: IdolHabits["chattiness"]): number {
  return c === "high" ? 0.7 : c === "low" ? 0.2 : 0.4;
}

function loadEvents(idolId: string): IdolEvent[] {
  try { return JSON.parse(localStorage.getItem(`events_${idolId}`) || "[]"); }
  catch { return []; }
}
function saveEvents(idolId: string, evts: IdolEvent[]) {
  localStorage.setItem(`events_${idolId}`, JSON.stringify(evts));
}

interface ProactiveState { sent: Record<string, number>; lastAt: number; }
function loadProactiveState(idolId: string): ProactiveState {
  try {
    const s = JSON.parse(localStorage.getItem(`proactive_${idolId}`) || "null");
    if (s && typeof s === "object") return { sent: s.sent || {}, lastAt: s.lastAt || 0 };
  } catch {}
  return { sent: {}, lastAt: 0 };
}
function saveProactiveState(idolId: string, s: ProactiveState) {
  localStorage.setItem(`proactive_${idolId}`, JSON.stringify(s));
}

function loadUnreadMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem("unread_v1") || "{}"); }
  catch { return {}; }
}
function saveUnreadMap(m: Record<string, number>) {
  localStorage.setItem("unread_v1", JSON.stringify(m));
}

function dateKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// integer day difference: event date − today (local, midnight-based)
function daysUntil(dateStr: string, now = Date.now()): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const target = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// nearest event that is today or in the future (for the header countdown chip)
function nextEvent(events: IdolEvent[], now = Date.now()): { e: IdolEvent; d: number } | null {
  let best: { e: IdolEvent; d: number } | null = null;
  for (const e of events) {
    const d = daysUntil(e.date, now);
    if (isNaN(d) || d < 0) continue;
    if (!best || d < best.d) best = { e, d };
  }
  return best;
}

interface ProactivePlan { key: string; context: string; min: number; max: number; }

// build a proactive plan for an event on a given day-offset, or null if that offset isn't noteworthy
function eventPlan(e: IdolEvent, d: number): ProactivePlan | null {
  const meta = EVENT_META[e.type] || EVENT_META.custom;
  const tag = `【${meta.label}·${e.title}】`;
  const mk = (context: string, min = 2, max = 5): ProactivePlan => ({ key: `event_${e.id}_${d}`, context, min, max });
  if (d === 3) return mk(`还有3天就是你的${tag}，你既紧张又期待，提前跟粉丝预告，让ta一定要关注、别错过。`);
  if (d === 1) return mk(`明天就是你的${tag}！你超级激动，跟粉丝倒计时，让ta做好准备。`);
  if (d === 0) {
    if (e.type === "concert") return mk(`今天是你的演唱会${tag}！你在后台/彩排，兴奋地告诉粉丝，问ta来现场了吗、有没有看直播。`);
    if (e.type === "comeback" || e.type === "album") return mk(`今天你${tag}正式回归/发新歌！你紧张又开心，求粉丝去听、去看打歌舞台、帮忙冲榜。`);
    if (e.type === "birthday") return mk(`今天是你的生日${tag}，你在收粉丝的祝福，撒娇又感动地谢谢粉丝。`);
    return mk(`今天是你的${tag}，你很兴奋地跟粉丝分享这件事。`);
  }
  if (d === -1 && (e.type === "comeback" || e.type === "concert" || e.type === "album"))
    return mk(`昨天是你的${tag}，你还在回味昨天的舞台/现场，谢谢粉丝的应援，问ta觉得怎么样。`);
  return null;
}

const CTX_MORNING = "现在是早上，你刚开始新的一天，温柔地跟粉丝道早安，问ta睡得好不好、今天有什么安排。";
const CTX_NIGHT = "现在是深夜，你准备睡了，跟粉丝道晚安，说点暖心的话。";
const CTX_IDLE = "粉丝好久没理你了，你有点想ta、有点小委屈，撒娇问ta最近在忙什么、是不是把你忘了。";
const CTX_POKE = "你突然想跟粉丝说话，分享你此刻在做的事、脑子里刚冒出来的想法，或者突然问ta一个小问题。";

// decide the single most relevant proactive message to send right now, or null.
// 全部按这位爱豆的作息 habits 来：起床/睡觉时间、爱发消息的时段、每次几句、话痨度
function planProactive(events: IdolEvent[], habits: IdolHabits, state: ProactiveState, now: number): ProactivePlan | null {
  const COOLDOWN = 40 * 60 * 1000; // 同一位爱豆两轮主动消息至少间隔 40 分钟
  if (now - (state.lastAt || 0) < COOLDOWN) return null;
  const sent = state.sent || {};
  const min = Math.max(1, habits.burstMin);
  const max = Math.max(min, habits.burstMax);

  // 1) 现实事件优先（回归/演唱会…），条数也按她的习惯
  for (const e of events) {
    const d = daysUntil(e.date, now);
    if (isNaN(d)) continue;
    const plan = eventPlan(e, d);
    if (plan && !sent[plan.key]) return { ...plan, min, max };
  }

  const today = dateKey(now);
  const hour = new Date(now).getHours();

  // 2) 起床 → 早安；睡前 → 晚安（按她设定的时间，跨午夜安全）
  if (inHourWindow(hour, habits.wakeHour) && !sent[`morning_${today}`])
    return { key: `morning_${today}`, context: CTX_MORNING, min, max };
  if (inHourWindow(hour, habits.sleepHour) && !sent[`night_${today}`])
    return { key: `night_${today}`, context: CTX_NIGHT, min, max };

  // 3) 在她"爱发消息的时段"里，按话痨程度随机冒出来
  if (habitsActiveHours(habits).includes(hour) && !sent[`spont_${today}_${hour}`] && Math.random() < chattinessProb(habits.chattiness))
    return { key: `spont_${today}_${hour}`, context: CTX_POKE, min, max };

  // 4) 好久没理她 → 撒娇
  const lastSeen = Number(localStorage.getItem("lastSeen_v1") || 0);
  if (lastSeen && now - lastSeen > 6 * 3600 * 1000 && !sent[`idle_${today}`])
    return { key: `idle_${today}`, context: CTX_IDLE, min, max };

  return null;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ idol, size = 40 }: { idol: Idol; size?: number }) {
  const border = idol.platform === "bubble" ? "2px solid #7C6FD4" : "2px solid #5CC8C2";
  if (idol.avatar) {
    return <img src={idol.avatar} alt={idol.name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border, flexShrink: 0 }} />;
  }
  const initials = idol.name.replace(/\p{Emoji}/gu, "").trim().slice(0, 1).toUpperCase() || "?";
  const bg = idol.platform === "bubble" ? "#7C6FD4" : "#5CC8C2";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", border, background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 500, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [idols, setIdols] = useState<Idol[]>(loadIdols);
  const [currentIdol, setCurrentIdol] = useState<Idol | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Distill
  const [distillSource, setDistillSource] = useState<DistillSource>("image");
  const [distillImages, setDistillImages] = useState<string[]>([]);
  const [distillText, setDistillText] = useState("");
  const [distillYT, setDistillYT] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [showSetupCard, setShowSetupCard] = useState(false);
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState("");

  // Setup card
  const [setupName, setSetupName] = useState("");
  const [setupAvatar, setSetupAvatar] = useState("");
  const [setupPlatform, setSetupPlatform] = useState<Platform>("bubble");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // 聊天页 UI 状态
  const [showDrawer, setShowDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatBgImage, setChatBgImage] = useState<string>("");

  // 主动消息 / 日程
  const [unread, setUnread] = useState<Record<string, number>>(loadUnreadMap);
  const [notifOn, setNotifOn] = useState<boolean>(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedEvents, setSchedEvents] = useState<IdolEvent[]>([]);
  const [evtType, setEvtType] = useState<IdolEventType>("comeback");
  const [evtTitle, setEvtTitle] = useState("");
  const [evtDate, setEvtDate] = useState("");
  // 自动获取行程
  const [fetchName, setFetchName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [suggestions, setSuggestions] = useState<IdolEvent[]>([]);
  const [setupRealName, setSetupRealName] = useState("");
  // IG 同步
  const [igHandle, setIgHandle] = useState("");
  const [igSyncing, setIgSyncing] = useState(false);
  // 作息习惯（编辑中）
  const [habits, setHabits] = useState<IdolHabits>(defaultHabits());

  // 调度器在 setInterval 闭包里跑，用 ref 读取最新的当前爱豆/屏幕
  const currentIdolRef = useRef<Idol | null>(currentIdol);
  const screenRef = useRef<Screen>(screen);
  useEffect(() => { currentIdolRef.current = currentIdol; }, [currentIdol]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => { saveIdols(idols); }, [idols]);
  useEffect(() => { if (currentIdol) saveHistory(currentIdol.id, messages); }, [messages, currentIdol]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => { saveUnreadMap(unread); }, [unread]);

  // 记录"最近在线"时间（用于"好久没理你"的判断）
  useEffect(() => {
    const mark = () => localStorage.setItem("lastSeen_v1", String(Date.now()));
    mark();
    const onVis = () => { if (!document.hidden) mark(); };
    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", mark); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // 主动消息调度器：每分钟检查一次，每次最多让一位爱豆主动发一轮
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const list = loadIdols();
      for (const idol of list) {
        const state = loadProactiveState(idol.id);
        const plan = planProactive(loadEvents(idol.id), idol.habits || defaultHabits(), state, Date.now());
        if (!plan) continue;
        // 先落盘去重，避免下一次 tick 重复触发
        saveProactiveState(idol.id, { sent: { ...state.sent, [plan.key]: Date.now() }, lastAt: Date.now() });
        await generateAndDeliver(idol, plan);
        break; // 一次 tick 只发一位，避免刷屏
      }
    };
    const iv = setInterval(tick, 60000);
    const t = setTimeout(tick, 4000);
    return () => { stopped = true; clearInterval(iv); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IG 同步轮询：每 5 分钟检查关注爱豆的新帖，有新帖就当消息发过来
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      for (const idol of loadIdols()) {
        if (!idol.instagram) continue;
        await syncIgForIdol(idol);
      }
    };
    const iv = setInterval(check, 5 * 60 * 1000);
    const t = setTimeout(check, 8000);
    return () => { stopped = true; clearInterval(iv); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 拉取某爱豆 IG 新帖并投递；首次只记录基线，避免把历史帖一次性全灌进来
  async function syncIgForIdol(idol: Idol): Promise<number> {
    if (!idol.instagram) return 0;
    try {
      const r = await fetch("/api/instagram", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: idol.instagram }),
      });
      const d = await r.json();
      const posts: any[] = d.posts || [];
      if (!posts.length) return 0;
      const key = `ig_last_${idol.id}`;
      const lastSeen = localStorage.getItem(key) || "";
      if (!lastSeen) { localStorage.setItem(key, posts[0].id); return 0; } // 基线
      const fresh: any[] = [];
      for (const p of posts) { if (p.id === lastSeen) break; fresh.push(p); }
      for (const p of fresh.reverse()) await deliverIgPost(idol, p);
      localStorage.setItem(key, posts[0].id);
      return fresh.length;
    } catch {
      return 0;
    }
  }

  // 把一条 IG 帖当作爱豆消息投递（照片 + 文案 + 中文翻译）
  async function deliverIgPost(idol: Idol, post: { id: string; imageUrl?: string; caption?: string; url?: string }) {
    let translation = "";
    if (post.caption) {
      try {
        const r = await fetch("/api/translate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: post.caption }),
        });
        translation = (await r.json()).translated || "";
      } catch {}
    }
    const msg: Message = {
      id: genId(), sender: "idol", text: post.caption || "📸", time: formatTime(),
      image: post.imageUrl, translation, showTranslation: !!translation,
    };
    const isCurrent = currentIdolRef.current?.id === idol.id && screenRef.current === "chat";
    if (isCurrent) {
      setMessages((prev) => [...prev, msg]);
    } else {
      saveHistory(idol.id, [...loadHistory(idol.id), msg]);
      setUnread((prev) => ({ ...prev, [idol.id]: (prev[idol.id] || 0) + 1 }));
      notify(idol, translation || post.caption || "发了新照片 📸");
    }
  }

  // 让爱豆生成并发送一轮主动消息（走人设 systemPrompt）
  async function generateAndDeliver(idol: Idol, plan: ProactivePlan) {
    try {
      const instr = `你是K-pop偶像「${idol.name}」，现在你要【主动】给粉丝发消息（对方没有先开口）。
情境：${plan.context}
像真实 Bubble 那样连发 ${plan.min}-${plan.max} 条，每条都很短（1-2句，有时就一个词、一个 emoji、一串 ㅋㅋㅋ）。
每条单独一行，直接输出，不要编号，韩文为主。`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "__proactive__", history: [], systemPrompt: idol.systemPrompt + "\n\n" + instr }),
      });
      const data = await res.json();
      if (!data.text) return;
      const lines: string[] = data.text
        .split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0).slice(0, 8);
      if (lines.length) await deliverIdolLines(idol, lines);
    } catch (e) {
      console.warn("proactive 失败:", e);
    }
  }

  // 统一投递：当前正在看这位爱豆 → 实时逐条冒出；否则 → 写入历史 + 未读角标 + 后台通知
  async function deliverIdolLines(idol: Idol, lines: string[]) {
    const isCurrent = currentIdolRef.current?.id === idol.id && screenRef.current === "chat";
    if (isCurrent) {
      for (let i = 0; i < lines.length; i++) {
        const delay = lines[i].length < 5 ? 400 : lines[i].length < 15 ? 700 : 1000;
        await sleep(i === 0 ? 500 : delay);
        const id = genId();
        setMessages((prev) => [...prev, { id, sender: "idol" as const, text: lines[i], time: formatTime(), showTranslation: false }]);
        autoTranslate(id, lines[i]);
      }
      return;
    }
    const hist = loadHistory(idol.id);
    const newMsgs: Message[] = [];
    for (const line of lines) {
      let translation = "";
      try {
        const r = await fetch("/api/translate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: line }),
        });
        translation = (await r.json()).translated || "";
      } catch {}
      newMsgs.push({ id: genId(), sender: "idol", text: line, time: formatTime(), translation, showTranslation: true });
    }
    saveHistory(idol.id, [...hist, ...newMsgs]);
    setUnread((prev) => ({ ...prev, [idol.id]: (prev[idol.id] || 0) + newMsgs.length }));
    notify(idol, newMsgs[0]?.translation || newMsgs[0]?.text || "");
  }

  function notify(idol: Idol, body: string) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        const n = new Notification(idol.name, { body, icon: idol.avatar || undefined });
        setTimeout(() => n.close(), 6000);
      }
    } catch {}
  }

  function toggleNotif() {
    if (typeof Notification === "undefined") { alert("当前浏览器不支持通知"); return; }
    Notification.requestPermission().then((p) => setNotifOn(p === "granted"));
  }

  // 首页每行的最后一条消息预览
  function preview(idolId: string): { text: string; time: string } | null {
    const h = loadHistory(idolId);
    const last = h[h.length - 1];
    if (!last) return null;
    const text = last.sender === "idol" ? (last.translation || last.text) : "나: " + last.text;
    return { text, time: last.time };
  }

  // 日程编辑
  function openSchedule() {
    if (!currentIdol) return;
    setSchedEvents(loadEvents(currentIdol.id));
    setFetchName(currentIdol.realName || currentIdol.name);
    setIgHandle(currentIdol.instagram || "");
    setSuggestions([]);
    setShowDrawer(false);
    setShowSchedule(true);
  }

  // 打开设置时载入这位爱豆的作息
  function openSettings() {
    if (currentIdol) setHabits(currentIdol.habits || defaultHabits());
    setShowDrawer(false);
    setShowSettings(true);
  }
  function saveHabits(next: IdolHabits) {
    setHabits(next);
    if (!currentIdol) return;
    const updated = { ...currentIdol, habits: next };
    setIdols((prev) => prev.map((i) => (i.id === currentIdol.id ? updated : i)));
    setCurrentIdol(updated);
  }

  // 连接/更新 IG 账号
  function saveIgHandle() {
    if (!currentIdol) return;
    const h = igHandle.trim();
    const updated = { ...currentIdol, instagram: h || undefined };
    setIdols((prev) => prev.map((i) => (i.id === currentIdol.id ? updated : i)));
    setCurrentIdol(updated);
    if (!h) localStorage.removeItem(`ig_last_${currentIdol.id}`);
  }

  // 立即同步一次（拉最新一条作演示，并把它设为基线）
  async function syncIgNow() {
    if (!currentIdol || !igHandle.trim()) return;
    const updated = { ...currentIdol, instagram: igHandle.trim() };
    setIdols((prev) => prev.map((i) => (i.id === currentIdol.id ? updated : i)));
    setCurrentIdol(updated);
    setIgSyncing(true);
    try {
      const r = await fetch("/api/instagram", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: updated.instagram }),
      });
      const d = await r.json();
      const posts: any[] = d.posts || [];
      if (!posts.length) { alert(d.note || "没抓到帖子。可能是数据源(IG_BRIDGE_BASE)没配好，或该账号读不到。"); return; }
      await deliverIgPost(updated, posts[0]);
      localStorage.setItem(`ig_last_${currentIdol.id}`, posts[0].id);
      alert("已同步最新一条 📸 之后有新帖会自动发给你");
    } catch {
      alert("同步失败，请稍后再试。");
    } finally {
      setIgSyncing(false);
    }
  }

  // 自动从日程源抓取该艺人的近期事件（结果作为"建议"，需一键导入）
  async function autoFetch() {
    if (!currentIdol || !fetchName.trim()) return;
    setFetching(true);
    setSuggestions([]);
    // 顺手把"现实原名"记到爱豆档案上
    const rn = fetchName.trim();
    setIdols((prev) => prev.map((i) => (i.id === currentIdol.id ? { ...i, realName: rn } : i)));
    setCurrentIdol({ ...currentIdol, realName: rn });
    try {
      const r = await fetch("/api/schedule", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artist: rn }),
      });
      const d = await r.json();
      const evts: IdolEvent[] = (d.events || []).map((e: any) => ({
        id: genId(),
        type: (EVENT_META as any)[e.type] ? e.type : "custom",
        title: e.title || EVENT_META[(e.type as IdolEventType)]?.label || "日程",
        date: e.date,
      }));
      setSuggestions(evts);
      if (evts.length === 0) alert(d.note || "没找到该艺人的近期行程。换个更准确的原名（如组合英文名），或手动添加。");
    } catch {
      alert("获取失败，请稍后再试，或先手动添加。");
    } finally {
      setFetching(false);
    }
  }

  function importSuggestion(e: IdolEvent) {
    if (!currentIdol) return;
    if (schedEvents.some((x) => x.title === e.title && x.date === e.date)) {
      setSuggestions((prev) => prev.filter((s) => s.id !== e.id));
      return;
    }
    const next = [...schedEvents, e].sort((a, b) => a.date.localeCompare(b.date));
    setSchedEvents(next);
    saveEvents(currentIdol.id, next);
    setSuggestions((prev) => prev.filter((s) => s.id !== e.id));
  }
  function addEvent() {
    if (!currentIdol || !evtDate) return;
    const e: IdolEvent = { id: genId(), type: evtType, title: evtTitle.trim() || EVENT_META[evtType].label, date: evtDate };
    const next = [...schedEvents, e].sort((a, b) => a.date.localeCompare(b.date));
    setSchedEvents(next);
    saveEvents(currentIdol.id, next);
    setEvtTitle(""); setEvtDate("");
  }
  function removeEvent(id: string) {
    if (!currentIdol) return;
    const next = schedEvents.filter((e) => e.id !== id);
    setSchedEvents(next);
    saveEvents(currentIdol.id, next);
  }

  // 手动"戳一下" → 让当前爱豆立刻主动发一轮（便于即时体验）
  async function pokeNow() {
    if (!currentIdol) return;
    const h = currentIdol.habits || defaultHabits();
    const ev = nextEvent(loadEvents(currentIdol.id));
    const base = ev && ev.d <= 7 ? eventPlan(ev.e, ev.d) : null;
    const plan: ProactivePlan = base
      ? { ...base, min: h.burstMin, max: h.burstMax }
      : { key: `poke_${Date.now()}`, context: CTX_POKE, min: h.burstMin, max: h.burstMax };
    setShowDrawer(false);
    await generateAndDeliver(currentIdol, plan);
  }

  // ── Navigation ───────────────────────────────────────────────

  function openChat(idol: Idol) {
    setCurrentIdol(idol);
    const hist = loadHistory(idol.id);
    setMessages(hist);
    setScreen("chat");
    // 进入即清除该爱豆的未读角标、刷新在线时间
    setUnread((prev) => { const c = { ...prev }; delete c[idol.id]; return c; });
    localStorage.setItem("lastSeen_v1", String(Date.now()));
    // 每次进入都触发爱豆主动连发消息
    setTimeout(() => triggerIdolGreeting(idol, hist), 300);
  }

  async function triggerIdolGreeting(idol: Idol, existingHistory: Message[]) {
    const todayKey = `greeting_${idol.id}_${new Date().toDateString()}`;
    const alreadySent = localStorage.getItem(todayKey);

    const h = idol.habits || defaultHabits();
    const prompt = alreadySent
      ? `你是K-pop偶像「${idol.name}」，粉丝刚刚打开了你的专属频道。
你们今天已经聊过了，现在是再次上线。
像真实 Bubble 那样连续发消息，发 ${h.burstMin}-${h.burstMax} 条，每条都很短（1-2句），有的就是一个emoji或一个感叹词。
表达看到粉丝在线的开心，随便聊聊你现在在做什么。
每条消息单独一行，直接输出，不要编号，韩文为主。`
      : `你是K-pop偶像「${idol.name}」，粉丝刚打开你的专属频道。
像真实 Bubble 那样连发消息，发 ${h.burstMin + 1}-${h.burstMax + 3} 条，每条都极短（有时就一个词、一个emoji、一串ㅋㅋㅋ）。
内容随意自然：打招呼、问粉丝在干嘛、说说你今天发生的事、突然问一个问题、发个无厘头的感叹。
节奏要有真实感，像人在手机上一条一条快速发。
每条消息单独一行，直接输出，不要编号，韩文为主。`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "__greeting__",
          history: [],
          systemPrompt: idol.systemPrompt + "\n\n" + prompt,
        }),
      });
      const data = await res.json();
      if (!data.text) return;

      const lines = data.text
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      for (let i = 0; i < lines.length; i++) {
        // 短消息间隔短，长消息间隔稍长，模拟真实打字节奏
        const delay = lines[i].length < 5 ? 400 : lines[i].length < 15 ? 700 : 1000;
        await sleep(i === 0 ? 500 : delay);
        const msgId = genId();
        setMessages((prev) => [
          ...prev,
          { id: msgId, sender: "idol" as const, text: lines[i], time: formatTime(), showTranslation: false },
        ]);
        autoTranslate(msgId, lines[i]);
      }

      localStorage.setItem(todayKey, "1");
    } catch (e) {
      console.warn("greeting 失败:", e);
    }
  }

  function goHome() {
    setScreen("home");
    setCurrentIdol(null);
    setMessages([]);
  }

  function startDistill() {
    setDistillSource("image");
    setDistillImages([]);
    setDistillText("");
    setDistillYT("");
    setProgressStep(0);
    setOcrProgress(0);
    setShowSetupCard(false);
    setSetupName("");
    setSetupAvatar("");
    setSetupPlatform("bubble");
    setSetupRealName("");
    setScreen("distill");
  }

  // ── OCR in browser ───────────────────────────────────────────

  async function runOCR(images: string[]): Promise<string> {
    const results: string[] = [];
    for (let i = 0; i < images.length; i++) {
      setOcrProgress(Math.round((i / images.length) * 100));
      try {
        const { data: { text } } = await Tesseract.recognize(
          images[i],
          "kor+chi_sim",
          { logger: () => {} }
        );
        if (text.trim()) results.push(text.trim());
      } catch (e) {
        console.warn("OCR 单张失败:", e);
      }
    }
    setOcrProgress(100);
    return results.join("\n");
  }

  // ── Distill flow ─────────────────────────────────────────────

  async function handleDistill() {
    setScreen("progress");
    setProgressStep(0);
    setShowSetupCard(false);

    try {
      // Step 1
      setProgressStep(1);
      setProgressLabel("读取素材中…");
      await sleep(400);

      let material = "";

      // Step 2 — OCR or text
      setProgressStep(2);
      setProgressLabel("提取文字中…");

      if (distillSource === "image" && distillImages.length > 0) {
        material = await runOCR(distillImages);
      } else if (distillSource === "text") {
        material = distillText;
        await sleep(400);
      } else if (distillSource === "youtube") {
        const res = await fetch("/api/subtitle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: distillYT }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        material = data.text || "";
      }

      // Step 3 — 从素材里猜爱豆名字
      setProgressStep(3);
      setProgressLabel("识别爱豆名字…");

      if (material.trim()) {
        try {
          const nameRes = await fetch("/api/distill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idolName: "__detect__",
              material,
              detectNameOnly: true,
            }),
          });
          const nameData = await nameRes.json();
          if (nameData.idolName && nameData.idolName !== "__detect__") {
            setSetupName(nameData.idolName);
          }
        } catch {
          // 猜不出来没关系，用户手动填
        }
      }

      await sleep(300);

      // Step 4 — Distill
      setProgressStep(4);
      setProgressLabel("生成专属 SKILL…");

      const res = await fetch("/api/distill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idolName: setupName || "爱豆", material }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setPendingSystemPrompt(data.systemPrompt || "");
      await sleep(300);
      setShowSetupCard(true);
    } catch (err: any) {
      alert("蒸馏失败：" + err.message);
      setScreen("distill");
    }
  }

  function handleSetupConfirm() {
    if (!setupName.trim()) return;
    const idol: Idol = {
      id: genId(),
      name: setupName.trim(),
      avatar: setupAvatar,
      platform: setupPlatform,
      systemPrompt: pendingSystemPrompt,
      createdAt: Date.now(),
      realName: setupRealName.trim() || undefined,
      habits: defaultHabits(),
    };
    setIdols((prev) => [idol, ...prev]);
    openChat(idol);
  }

  // ── Chat ─────────────────────────────────────────────────────

  async function sendMessage(text?: string) {
    const txt = text || inputText;
    if (!txt.trim() || isLoading || !currentIdol) return;
    setInputText("");
    localStorage.setItem("lastSeen_v1", String(Date.now()));

    const userMsg: Message = { id: genId(), sender: "user", text: txt.trim(), time: formatTime(), isUnread: true };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, history: messages, systemPrompt: currentIdol.systemPrompt }),
      });
      const data = await res.json();
      const idolMsgId = genId();
      setMessages((prev) => {
        const updated = prev.map((m) => m.id === userMsg.id ? { ...m, isUnread: false } : m);
        return [...updated, { id: idolMsgId, sender: "idol" as const, text: data.text || "...", time: formatTime(), showTranslation: false }];
      });
      autoTranslate(idolMsgId, data.text || "");
    } catch {
      setMessages((prev) => prev.map((m) => m.id === userMsg.id ? { ...m, isUnread: false } : m));
    } finally {
      setIsLoading(false);
    }
  }

  // 爱豆消息发出后立即自动翻译，默认显示中文译文
  async function autoTranslate(msgId: string, text: string) {
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      // showTranslation: true = 显示译文（默认）
      setMessages((prev) => prev.map((m) =>
        m.id === msgId
          ? { ...m, translation: data.translated || text, showTranslation: true }
          : m
      ));
    } catch {
      // 翻译失败就直接显示原文
    }
  }

  // 点「查看原文」切换显示原文/译文
  function toggleTranslation(msgId: string) {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, showTranslation: !m.showTranslation } : m
    ));
  }

  function deleteIdol(id: string) {
    if (!confirm("确定删除这位爱豆吗？")) return;
    setIdols((prev) => prev.filter((i) => i.id !== id));
    localStorage.removeItem(`history_${id}`);
  }

  function handleImageFiles(files: FileList | null) {
    if (!files) return;
    const newImgs: string[] = [];
    let count = 0;
    Array.from(files).slice(0, 20).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        newImgs.push(reader.result as string);
        count++;
        if (count === Math.min(files.length, 20)) {
          setDistillImages((prev) => [...prev, ...newImgs].slice(0, 20));
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  // ── Home ─────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={S.frame}>
      <div style={S.homeNav}>
        <span style={{ fontSize: 18, fontWeight: 500, color: "#111" }}>消息</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={toggleNotif} style={S.iconBtn} aria-label="通知" title={notifOn ? "通知已开启" : "开启主动消息通知"}>
            <Bell size={20} color={notifOn ? "#7C6FD4" : "#bbb"} fill={notifOn ? "#7C6FD4" : "none"} />
          </button>
          <button onClick={startDistill} style={S.iconBtn} aria-label="添加"><Plus size={22} color="#555" /></button>
        </div>
      </div>
      <div style={S.scroll}>
        {idols.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
            <div style={{ fontSize: 15, color: "#333", fontWeight: 500 }}>蒸馏你的第一位爱豆</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 6 }}>上传泡泡截图，让 AI 还原爱豆的说话方式</div>
            <button onClick={startDistill} style={{ ...S.primaryBtn, marginTop: 20 }}>开始蒸馏</button>
          </div>
        ) : idols.map((idol) => {
          const pv = preview(idol.id);
          const nEvt = nextEvent(loadEvents(idol.id));
          const unreadN = unread[idol.id] || 0;
          return (
          <div key={idol.id} style={S.idolRow} onClick={() => openChat(idol)}>
            <Avatar idol={idol} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>{idol.name}</span>
                {nEvt && nEvt.d <= 7 && (
                  <span style={{ fontSize: 10, background: "#EEEDFE", color: "#5B50B0", borderRadius: 8, padding: "1px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {(EVENT_META[nEvt.e.type] || EVENT_META.custom).emoji} {nEvt.d === 0 ? "D-DAY" : `D-${nEvt.d}`}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: unreadN ? "#555" : "#999", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: unreadN ? 500 : 400 }}>
                {pv ? pv.text : (idol.platform === "bubble" ? "Bubble 风格" : "Weverse DM 风格")}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pv && <span style={{ fontSize: 10, color: "#bbb", whiteSpace: "nowrap" }}>{pv.time}</span>}
              {unreadN > 0 ? (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#FF5A79", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {unreadN > 99 ? "99+" : unreadN}
                </span>
              ) : (
                <ChevronRight size={16} color="#ccc" />
              )}
              <button onClick={(e) => { e.stopPropagation(); deleteIdol(idol.id); }} style={{ ...S.iconBtn, padding: 4 }} aria-label="删除">
                <Trash2 size={15} color="#ccc" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );

  // ── Distill ───────────────────────────────────────────────────
  if (screen === "distill") {
    const canStart =
      (distillSource === "image" && distillImages.length > 0) ||
      (distillSource === "text" && distillText.trim().length >= 30) ||
      (distillSource === "youtube" && distillYT.trim().startsWith("http"));

    return (
      <div style={S.frame}>
        <div style={S.navBar}>
          <button onClick={goHome} style={S.iconBtn}><ArrowLeft size={20} color="#333" /></button>
          <span style={S.navTitle}>蒸馏爱豆</span>
          <div style={{ width: 32 }} />
        </div>
        <div style={S.scroll}>
          <div style={S.hero}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#333" }}>上传素材，蒸馏爱豆人格</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>截图 / 文字 / YouTube 链接均可</div>
          </div>

          <div style={S.tabs}>
            {(["image", "text", "youtube"] as DistillSource[]).map((src) => (
              <button key={src} onClick={() => setDistillSource(src)}
                style={{ ...S.tab, ...(distillSource === src ? S.tabActive : {}) }}>
                {src === "image" ? "📸 截图" : src === "text" ? "📝 文字" : "▶️ YouTube"}
              </button>
            ))}
          </div>

          {distillSource === "image" && (
            <div>
              <input type="file" ref={fileInputRef} accept="image/*" multiple style={{ display: "none" }} onChange={(e) => handleImageFiles(e.target.files)} />
              <div style={S.uploadZone} onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleImageFiles(e.dataTransfer.files); }}>
                {distillImages.length > 0 ? (
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                      {distillImages.slice(0, 9).map((img, i) => (
                        <img key={i} src={img} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "0.5px solid #eee" }} />
                      ))}
                      {distillImages.length > 9 && (
                        <div style={{ width: 56, height: 56, borderRadius: 8, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#999" }}>
                          +{distillImages.length - 9}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>已选 {distillImages.length} 张（最多20张）· 点击继续添加</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
                    <div style={{ fontSize: 13, color: "#555" }}>点击或拖拽上传泡泡截图</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>支持 1–20 张，OCR 在浏览器本地运行</div>
                  </div>
                )}
              </div>
              {distillImages.length > 0 && (
                <button onClick={() => setDistillImages([])} style={{ ...S.ghostBtn, marginTop: 6 }}>清空重选</button>
              )}
            </div>
          )}

          {distillSource === "text" && (
            <div>
              <textarea value={distillText} onChange={(e) => setDistillText(e.target.value)}
                placeholder={"粘贴爱豆的泡泡消息、直播文字记录、访谈内容…\n建议 200 字以上效果更好"}
                style={S.textarea} rows={8} />
              <div style={{ fontSize: 11, color: distillText.length < 100 ? "#e88" : "#aaa", marginTop: 4, textAlign: "right" }}>
                {distillText.length} 字{distillText.length < 100 ? "（建议至少 100 字）" : ""}
              </div>
            </div>
          )}

          {distillSource === "youtube" && (
            <div>
              <input type="text" value={distillYT} onChange={(e) => setDistillYT(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..." style={S.input} />
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 6, lineHeight: 1.6 }}>
                自动下载字幕（支持韩/日/中文）。无字幕视频请改用文字粘贴。
              </div>
            </div>
          )}

          <button onClick={handleDistill} disabled={!canStart}
            style={{ ...S.primaryBtn, opacity: canStart ? 1 : 0.4, marginTop: 16 }}>
            开始蒸馏 ✨
          </button>
        </div>
      </div>
    );
  }

  // ── Progress ──────────────────────────────────────────────────
  if (screen === "progress") {
    const pct = Math.round((progressStep / 4) * 100);
    const stepLabels = ["读取素材", "提取文字", "分析风格", "生成 SKILL"];

    return (
      <div style={{ ...S.frame, position: "relative" }}>
        <div style={S.navBar}>
          <div style={{ width: 32 }} />
          <span style={S.navTitle}>蒸馏中</span>
          <div style={{ width: 32 }} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 20 }}>
          <div style={{ fontSize: 56 }}>🧪</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#333", textAlign: "center" }}>{progressLabel || "准备中…"}</div>

          <div style={{ width: "100%", background: "#f0f0f0", borderRadius: 8, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#7C6FD4", borderRadius: 8, transition: "width .4s ease" }} />
          </div>

          {/* OCR 进度（只有图片模式显示）*/}
          {distillSource === "image" && progressStep === 2 && ocrProgress > 0 && (
            <div style={{ width: "100%" }}>
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4, textAlign: "center" }}>
                OCR 识别进度 {ocrProgress}%
              </div>
              <div style={{ width: "100%", background: "#f0f0f0", borderRadius: 4, height: 3, overflow: "hidden" }}>
                <div style={{ width: `${ocrProgress}%`, height: "100%", background: "#5CC8C2", transition: "width .2s ease" }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            {stepLabels.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: progressStep > i ? "#7C6FD4" : progressStep === i + 1 ? "#EEEDFE" : "#f5f5f5",
                  border: progressStep === i + 1 ? "2px solid #7C6FD4" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {progressStep > i ? <Check size={12} color="#fff" /> : null}
                </div>
                <div style={{ fontSize: 13, color: progressStep > i ? "#333" : progressStep === i + 1 ? "#7C6FD4" : "#bbb", fontWeight: progressStep === i + 1 ? 500 : 400 }}>
                  {s}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Setup card overlay */}
        {showSetupCard && (
          <div style={S.overlay}>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 16 }}>蒸馏完成 🎉 为爱豆建档</div>

              <input type="file" ref={avatarInputRef} accept="image/*" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setSetupAvatar(reader.result as string);
                  reader.readAsDataURL(file);
                }} />

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
                <div onClick={() => avatarInputRef.current?.click()} style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: setupAvatar ? "transparent" : "#f0f0f0",
                  border: "2px dashed #ddd", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                }}>
                  {setupAvatar ? <img src={setupAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Camera size={22} color="#aaa" />}
                </div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>点击上传头像</div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={S.label}>爱豆名字（可含 emoji）</div>
                <input type="text" value={setupName} onChange={(e) => setSetupName(e.target.value)}
                  placeholder="例如：mocha ☕ 或 令💜" style={S.fieldInput} autoFocus />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={S.label}>现实原型（选填，用于自动获取回归/演唱会行程）</div>
                <input type="text" value={setupRealName} onChange={(e) => setSetupRealName(e.target.value)}
                  placeholder="真实艺名/组合名，例如：IVE、Karina" style={S.fieldInput} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={S.label}>平台风格</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["bubble", "weverse"] as Platform[]).map((p) => (
                    <button key={p} onClick={() => setSetupPlatform(p)} style={{
                      flex: 1, padding: "10px 8px", borderRadius: 12,
                      border: setupPlatform === p ? `2px solid ${p === "bubble" ? "#7C6FD4" : "#5CC8C2"}` : "1px solid #eee",
                      background: setupPlatform === p ? (p === "bubble" ? "#EEEDFE" : "#E1F5F5") : "#fafafa",
                      cursor: "pointer", fontSize: 12, fontWeight: 500,
                      color: setupPlatform === p ? (p === "bubble" ? "#3C3489" : "#0F6E6E") : "#666",
                    }}>
                      {p === "bubble" ? "Bubble" : "Weverse DM"}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleSetupConfirm} disabled={!setupName.trim()}
                style={{ ...S.primaryBtn, opacity: setupName.trim() ? 1 : 0.4 }}>
                开始聊天 →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Chat ──────────────────────────────────────────────────────
  if (screen === "chat" && currentIdol) {
    const isBubble = currentIdol.platform === "bubble";
    const accent = isBubble ? "#7C6FD4" : "#5CC8C2";
    const idolBg = isBubble ? "#FFFFFF" : "#A8E6E2";
    const userBg = "#F0F0F0";
    const chatBg = chatBgImage
      ? undefined
      : "#F7F7F7";

    return (
      <div style={{ ...S.frame, background: "#F7F7F7" }}>

        <div style={{ ...S.navBar, background: "#fff", borderBottom: "0.5px solid #eee" }}>
          <button onClick={goHome} style={S.iconBtn}><ArrowLeft size={20} color="#333" /></button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111", flex: 1, textAlign: "center" }}>
            {currentIdol.name}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button style={S.iconBtn} aria-label="通知"><Bell size={20} color="#333" /></button>
            <button style={S.iconBtn} aria-label="菜单" onClick={() => setShowDrawer(true)}>
              <Star size={20} color="#f5c518" fill="#f5c518" />
            </button>
          </div>
        </div>

        {(() => {
          const nEvt = nextEvent(loadEvents(currentIdol.id));
          if (nEvt && nEvt.d <= 14) {
            const meta = EVENT_META[nEvt.e.type] || EVENT_META.custom;
            return (
              <div onClick={openSchedule} style={{ background: "#F3F1FD", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid #eee", cursor: "pointer" }}>
                <span style={{ fontSize: 13 }}>{meta.emoji}</span>
                <span style={{ fontSize: 12, color: "#5B50B0", fontWeight: 500 }}>
                  {meta.label} · {nEvt.e.title} {nEvt.d === 0 ? "· 就在今天!" : `· 还有 ${nEvt.d} 天`}
                </span>
              </div>
            );
          }
          if (isBubble) return (
            <div style={{ background: "#F5F5F5", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid #eee" }}>
              <Heart size={13} color="#aaa" />
              <span style={{ fontSize: 12, color: "#888" }}>오늘도 함께해줘서 고마워 💜</span>
            </div>
          );
          return null;
        })()}

        {/* 聊天消息区 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 12, background: chatBg, backgroundImage: chatBgImage ? `url(${chatBgImage})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
          {messages.map((msg) => {
            if (msg.sender === "idol") return (
              <div key={msg.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 48 }}>
                <Avatar idol={currentIdol} size={36} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {isBubble && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 9, background: accent, color: "#fff", borderRadius: 10, padding: "1px 5px", fontWeight: 600 }}>ARTIST</span>
                      <span style={{ fontSize: 12, color: "#555" }}>{currentIdol.name}</span>
                      <span style={{ fontSize: 11 }}>💜</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ background: idolBg, color: "#111", padding: msg.image ? "6px 6px 10px" : "10px 14px", borderRadius: "4px 18px 18px 18px", fontSize: 14, lineHeight: 1.55, border: isBubble ? "0.5px solid #eee" : "none", maxWidth: 240, boxShadow: isBubble ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
                      {msg.image && (
                        <img src={msg.image} alt="" style={{ width: "100%", maxWidth: 220, borderRadius: 12, display: "block", marginBottom: msg.text ? 8 : 0 }} />
                      )}
                      {msg.text && (
                        <div style={{ padding: msg.image ? "0 8px" : 0 }}>
                          {msg.showTranslation === false ? msg.text : (msg.translation || msg.text)}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: "#bbb", whiteSpace: "nowrap", paddingBottom: 2 }}>{msg.time}</span>
                    {/* A 翻译圆形按钮 */}
                    <button
                      onClick={() => toggleTranslation(msg.id)}
                      title={msg.showTranslation === false ? "查看译文" : "查看原文"}
                      style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: "#f0f0f0", border: "0.5px solid #ddd",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", flexShrink: 0, paddingBottom: 2,
                        fontSize: 11, fontWeight: 700, color: "#666",
                      }}>
                      A
                    </button>
                  </div>
                </div>
              </div>
            );

            return (
              <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 6, paddingLeft: 48 }}>
                {msg.isUnread && <span style={{ fontSize: 10, color: "#f7c600", fontWeight: 700, paddingBottom: 2 }}>1</span>}
                <span style={{ fontSize: 10, color: "#bbb", paddingBottom: 2, whiteSpace: "nowrap" }}>{msg.time}</span>
                <div style={{ background: userBg, color: "#111", padding: "10px 14px", borderRadius: "18px 4px 18px 18px", fontSize: 14, lineHeight: 1.55, border: "0.5px solid #eee", maxWidth: 240 }}>
                  {msg.text}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 48 }}>
              <Avatar idol={currentIdol} size={36} />
              <div style={{ background: idolBg, border: isBubble ? "0.5px solid #eee" : "none", padding: "12px 16px", borderRadius: "4px 18px 18px 18px", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: accent, animation: `bounce 1.2s ${i * 0.15}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入栏 */}
        <div style={{ background: "#fff", borderTop: "0.5px solid #eee", padding: "8px 12px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <input type="text" value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="请输入消息。"
            style={{ flex: 1, background: "#F7F7F7", border: "0.5px solid #eee", borderRadius: 24, padding: "10px 16px", fontSize: 14, color: "#111", outline: "none", fontFamily: "inherit" }}
            disabled={isLoading} />
          <button onClick={() => sendMessage()} disabled={!inputText.trim() || isLoading}
            style={{ width: 38, height: 38, borderRadius: "50%", background: inputText.trim() && !isLoading ? accent : "#eee", border: "none", cursor: inputText.trim() && !isLoading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label="发送">
            <Send size={16} color={inputText.trim() && !isLoading ? "#fff" : "#bbb"} />
          </button>
        </div>

        {/* 右侧抽屉 — 对应第二张截图 */}
        {showDrawer && (
          <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex" }} onClick={() => setShowDrawer(false)}>
            <div style={{ flex: 1, background: "rgba(0,0,0,0.3)" }} />
            <div style={{ width: "75%", background: "#fff", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              {/* 抽屉顶部 */}
              <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "flex-end", gap: 12, borderBottom: "0.5px solid #eee" }}>
                <button style={S.iconBtn}><Bell size={20} color="#333" /></button>
                <button style={S.iconBtn}><Star size={20} color="#f5c518" fill="#f5c518" /></button>
              </div>

              {/* me 行 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 500 }}>me</div>
                <span style={{ fontSize: 15, color: "#111" }}>T_T</span>
              </div>

              {/* 爱豆行 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px 16px", borderBottom: "0.5px solid #eee" }}>
                <div style={{ position: "relative" }}>
                  <Avatar idol={currentIdol} size={44} />
                  <span style={{ position: "absolute", top: -4, left: -4, fontSize: 8, background: accent, color: "#fff", borderRadius: 8, padding: "1px 4px", fontWeight: 600 }}>ARTIST</span>
                </div>
                <span style={{ fontSize: 15, color: "#111" }}>{currentIdol.name}</span>
              </div>

              {/* OUR BOX */}
              <div style={{ margin: 16, background: "#EEF6FF", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🏷️</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>OUR BOX</span>
              </div>

              {/* 戳一下 → 立刻让爱豆主动发消息 */}
              <div style={{ margin: "0 16px 12px" }}>
                <button onClick={pokeNow} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: accent, color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  💬 戳一下 {currentIdol.name}
                </button>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 6, textAlign: "center" }}>让 ta 现在就主动发条消息给你</div>
              </div>

              {/* 底部操作 */}
              <div style={{ marginTop: "auto", borderTop: "0.5px solid #eee", padding: "12px 16px", display: "flex", justifyContent: "space-around" }}>
                <button onClick={openSettings} style={{ ...S.iconBtn, flexDirection: "column" as any, gap: 4, fontSize: 10, color: "#555" }}>
                  <Grid size={22} color="#555" />
                  设置
                </button>
                <button onClick={openSchedule} style={{ ...S.iconBtn, flexDirection: "column" as any, gap: 4, fontSize: 10, color: "#555" }}>
                  <Bell size={22} color="#555" />
                  行程
                </button>
              </div>
              <div style={{ padding: "0 16px 24px", textAlign: "right" }}>
                <button onClick={goHome} style={{ fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer" }}>退出聊天室 →</button>
              </div>
            </div>
          </div>
        )}

        {/* 设置页 — 对应第一张截图 */}
        {showSettings && (
          <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ ...S.navBar, borderBottom: "0.5px solid #eee" }}>
              <button onClick={() => setShowSettings(false)} style={S.iconBtn}><ArrowLeft size={20} color="#333" /></button>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>设置聊天室</span>
              <div style={{ width: 32 }} />
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* 作息 · 发消息习惯 */}
              <div style={{ padding: 16, borderBottom: "8px solid #f5f5f5" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 4 }}>作息 · 发消息习惯</div>
                <div style={{ fontSize: 11, color: "#aaa", marginBottom: 16, lineHeight: 1.5 }}>ta 会照这些习惯主动给你发泡泡——越贴近真人，越像她本人 💜</div>

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <label style={{ flex: 1 }}>
                    <div style={S.label}>🌅 起床时间</div>
                    <select value={habits.wakeHour} onChange={(e) => saveHabits({ ...habits, wakeHour: Number(e.target.value) })} style={S.fieldInput}>
                      {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    <div style={S.label}>🌙 睡觉时间</div>
                    <select value={habits.sleepHour} onChange={(e) => saveHabits({ ...habits, sleepHour: Number(e.target.value) })} style={S.fieldInput}>
                      {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={S.label}>💬 爱发消息的时段（可多选）</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {TIME_BUCKETS.map((b) => {
                      const on = habits.activeBuckets.includes(b.id);
                      return (
                        <button key={b.id} onClick={() => saveHabits({ ...habits, activeBuckets: on ? habits.activeBuckets.filter((x) => x !== b.id) : [...habits.activeBuckets, b.id] })}
                          style={{ padding: "6px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: on ? `1.5px solid ${accent}` : "0.5px solid #ddd", background: on ? "#EEEDFE" : "#fff", color: on ? "#3C3489" : "#666", fontWeight: on ? 600 : 400 }}>
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={S.label}>✍️ 每次发几句</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" min={1} max={20} value={habits.burstMin} onChange={(e) => saveHabits({ ...habits, burstMin: Math.max(1, Number(e.target.value) || 1) })} style={{ ...S.fieldInput, width: 64 }} />
                    <span style={{ color: "#999" }}>~</span>
                    <input type="number" min={1} max={20} value={habits.burstMax} onChange={(e) => saveHabits({ ...habits, burstMax: Math.max(1, Number(e.target.value) || 1) })} style={{ ...S.fieldInput, width: 64 }} />
                    <span style={{ fontSize: 12, color: "#999" }}>句</span>
                  </div>
                </div>

                <div>
                  <div style={S.label}>🗯️ 话痨程度</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([["low", "文静"], ["med", "适中"], ["high", "话痨"]] as const).map(([v, label]) => (
                      <button key={v} onClick={() => saveHabits({ ...habits, chattiness: v })}
                        style={{ flex: 1, padding: "9px", borderRadius: 10, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: habits.chattiness === v ? `1.5px solid ${accent}` : "0.5px solid #ddd", background: habits.chattiness === v ? "#EEEDFE" : "#fff", color: habits.chattiness === v ? "#3C3489" : "#666", fontWeight: habits.chattiness === v ? 600 : 400 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 聊天室名称 */}
              <div style={S.settingRow}>
                <span style={S.settingLabel}>聊天室名称</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, color: accent }}>{currentIdol.name}</span>
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>

              {/* 设置爱称 */}
              <div style={S.settingRow}>
                <div>
                  <div style={S.settingLabel}>设置爱称</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>您可以设置 ARTIST 称呼您的爱称。</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#aaa" }}>OFF</span>
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>

              <div style={{ height: 8, background: "#f5f5f5" }} />

              {/* 设置背景 */}
              <div style={S.settingRow} onClick={() => bgInputRef.current?.click()}>
                <span style={S.settingLabel}>设置背景</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {chatBgImage && <div style={{ width: 24, height: 24, borderRadius: 4, background: `url(${chatBgImage}) center/cover`, border: "0.5px solid #eee" }} />}
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>
              <input type="file" ref={bgInputRef} accept="image/*" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setChatBgImage(reader.result as string);
                  reader.readAsDataURL(file);
                }} />

              {/* 设置 ARTIST 徽章 */}
              <div style={S.settingRow}>
                <span style={S.settingLabel}>设置 ARTIST 徽章</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: accent, fontWeight: 500 }}>ON</span>
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>

              {/* 设置 bubble FONT 效果 */}
              <div style={S.settingRow}>
                <span style={S.settingLabel}>设置 bubble FONT 效果</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: accent, fontWeight: 500 }}>ON</span>
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>

              <div style={{ height: 8, background: "#f5f5f5" }} />

              {/* 翻译 */}
              <div style={S.settingRow}>
                <span style={S.settingLabel}>翻译</span>
                <div style={{ width: 24, height: 24, borderRadius: 4, background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={14} color="#fff" />
                </div>
              </div>

              {/* 目标翻译语言 */}
              <div style={S.settingRow}>
                <div>
                  <div style={S.settingLabel}>目标翻译语言</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>不支持泡状框内 1,000 字以上聊天内容的翻译。</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: accent }}>中文 (简体)</span>
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>

              {/* 翻译软件 */}
              <div style={S.settingRow}>
                <div>
                  <div style={S.settingLabel}>翻译软件</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2, lineHeight: 1.5 }}>设置翻译软件后，共同适用于设置相同目标翻译语言的 bubble 聊天室。</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: accent }}>DeepSeek</span>
                  <ChevronRight size={16} color="#ccc" />
                </div>
              </div>
            </div>

            {/* 退出按钮 */}
            <button onClick={goHome} style={{ margin: 16, padding: "14px", borderRadius: 0, border: "none", background: accent, color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              退出聊天室
            </button>
          </div>
        )}

        {/* 行程表 — 添加回归/演唱会等事件，爱豆会据此主动发消息 */}
        {showSchedule && (
          <div style={{ position: "absolute", inset: 0, zIndex: 55, background: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ ...S.navBar, borderBottom: "0.5px solid #eee" }}>
              <button onClick={() => setShowSchedule(false)} style={S.iconBtn}><ArrowLeft size={20} color="#333" /></button>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{currentIdol.name} 的行程</span>
              <div style={{ width: 32 }} />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 14, lineHeight: 1.6 }}>
                添加爱豆的回归、演唱会、生日等日程。临近时（D-3 / D-1 / 当天），ta 会主动发相关的消息给你 💜
              </div>

              {/* 自动获取行程 */}
              <div style={{ background: "#F3F1FD", border: "0.5px solid #E1DCF7", borderRadius: 14, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#5B50B0", marginBottom: 8 }}>🔎 自动获取行程</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={fetchName} onChange={(e) => setFetchName(e.target.value)}
                    placeholder="真实艺名/组合名，如 IVE" style={{ ...S.fieldInput, flex: 1 }} />
                  <button onClick={autoFetch} disabled={fetching || !fetchName.trim()}
                    style={{ padding: "0 16px", borderRadius: 12, border: "none", background: fetching || !fetchName.trim() ? "#ccc" : "#7C6FD4", color: "#fff", fontSize: 13, fontWeight: 500, cursor: fetching ? "wait" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {fetching ? "获取中…" : "获取"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#9a92c9", marginTop: 6, lineHeight: 1.5 }}>
                  从公开日程源获取，结果作为建议，确认后再导入。抓不到时可手动添加。
                </div>

                {suggestions.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {suggestions.map((e) => {
                      const meta = EVENT_META[e.type] || EVENT_META.custom;
                      const d = daysUntil(e.date);
                      return (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 10, padding: "8px 10px" }}>
                          <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                            <div style={{ fontSize: 11, color: "#999" }}>{meta.label} · {e.date}{isNaN(d) ? "" : d >= 0 ? ` · D-${d}` : ""}</div>
                          </div>
                          <button onClick={() => importSuggestion(e)}
                            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #7C6FD4", background: "#fff", color: "#5B50B0", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            导入
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Instagram 同步 */}
              <div style={{ background: "#FFF3F8", border: "0.5px solid #FAD9E8", borderRadius: 14, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#C13B7A", marginBottom: 8 }}>📸 Instagram 同步</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={igHandle} onChange={(e) => setIgHandle(e.target.value)} onBlur={saveIgHandle}
                    placeholder="爱豆 IG 主页链接或 @用户名" style={{ ...S.fieldInput, flex: 1 }} />
                  <button onClick={syncIgNow} disabled={igSyncing || !igHandle.trim()}
                    style={{ padding: "0 16px", borderRadius: 12, border: "none", background: igSyncing || !igHandle.trim() ? "#ddd" : "#E7568F", color: "#fff", fontSize: 13, fontWeight: 500, cursor: igSyncing ? "wait" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {igSyncing ? "同步中…" : "立即同步"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#c98aa9", marginTop: 6, lineHeight: 1.5 }}>
                  连接后，ta 一更新 IG，照片和文案会自动同步成消息发给你（App 开着时约 5 分钟内）。需在部署时配置 IG 数据源（见 README）。
                </div>
              </div>

              {/* 手动添加表单 */}
              <div style={{ background: "#FAFAFA", border: "0.5px solid #eee", borderRadius: 14, padding: 14, marginBottom: 18 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {(Object.keys(EVENT_META) as IdolEventType[]).map((t) => (
                    <button key={t} onClick={() => setEvtType(t)} style={{
                      padding: "6px 10px", borderRadius: 10, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      border: evtType === t ? "1.5px solid #7C6FD4" : "0.5px solid #ddd",
                      background: evtType === t ? "#EEEDFE" : "#fff",
                      color: evtType === t ? "#3C3489" : "#666", fontWeight: evtType === t ? 600 : 400,
                    }}>
                      {EVENT_META[t].emoji} {EVENT_META[t].label}
                    </button>
                  ))}
                </div>
                <input type="text" value={evtTitle} onChange={(e) => setEvtTitle(e.target.value)}
                  placeholder="标题，例如：正规三辑《XXX》回归" style={{ ...S.fieldInput, marginBottom: 8 }} />
                <input type="date" value={evtDate} onChange={(e) => setEvtDate(e.target.value)}
                  style={{ ...S.fieldInput, marginBottom: 10 }} />
                <button onClick={addEvent} disabled={!evtDate}
                  style={{ ...S.primaryBtn, opacity: evtDate ? 1 : 0.4 }}>添加行程</button>
              </div>

              {/* 行程列表 */}
              {schedEvents.length === 0 ? (
                <div style={{ textAlign: "center", color: "#bbb", fontSize: 13, paddingTop: 20 }}>还没有行程，添加一个试试</div>
              ) : schedEvents.map((e) => {
                const d = daysUntil(e.date);
                const meta = EVENT_META[e.type] || EVENT_META.custom;
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "0.5px solid #f2f2f2" }}>
                    <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "#111", fontWeight: 500 }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                        {meta.label} · {e.date} · {isNaN(d) ? "" : d === 0 ? "就是今天" : d > 0 ? `还有 ${d} 天` : `已过 ${-d} 天`}
                      </div>
                    </div>
                    <button onClick={() => removeEvent(e.id)} style={{ ...S.iconBtn, padding: 4 }} aria-label="删除">
                      <Trash2 size={15} color="#ccc" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
      </div>
    );
  }

  return null;
}

function StatusBar() {
  const [time, setTime] = useState(formatTime());
  useEffect(() => { const t = setInterval(() => setTime(formatTime()), 10000); return () => clearInterval(t); }, []);
  return (
    <div style={{ height: 28, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 18px", background: "#fff", fontSize: 12, color: "#333", fontWeight: 500, flexShrink: 0 }}>
      <span>{time}</span><span style={{ fontSize: 11 }}>●●● ▲ 🔋</span>
    </div>
  );
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const S: Record<string, React.CSSProperties> = {
  frame: { width: "100%", maxWidth: 430, minHeight: "100dvh", margin: "0 auto", background: "#fff", display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", position: "relative", overflow: "hidden" },
  homeNav: { height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "0.5px solid #eee", flexShrink: 0 },
  navBar: { height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", borderBottom: "0.5px solid #eee", flexShrink: 0, background: "#fff" },
  navTitle: { fontSize: 15, fontWeight: 500, color: "#111" },
  scroll: { flex: 1, overflowY: "auto", padding: "16px" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 },
  idolRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "0.5px solid #f5f5f5", cursor: "pointer" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, textAlign: "center" },
  primaryBtn: { width: "100%", padding: "13px", borderRadius: 14, border: "none", background: "#7C6FD4", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "opacity .15s" },
  ghostBtn: { width: "100%", padding: "9px", borderRadius: 10, border: "0.5px solid #ddd", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  hero: { background: "#FAFAFA", border: "0.5px solid #eee", borderRadius: 16, padding: "20px", textAlign: "center", marginBottom: 16 },
  tabs: { display: "flex", gap: 6, marginBottom: 14 },
  tab: { flex: 1, padding: "8px 4px", borderRadius: 10, border: "0.5px solid #eee", background: "#fafafa", color: "#777", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" },
  tabActive: { background: "#EEEDFE", borderColor: "#AFA9EC", color: "#3C3489", fontWeight: 500 },
  uploadZone: { border: "1.5px dashed #ddd", borderRadius: 14, padding: "28px 16px", textAlign: "center", cursor: "pointer", background: "#fafafa" },
  textarea: { width: "100%", padding: "12px", borderRadius: 12, border: "0.5px solid #ddd", background: "#fafafa", color: "#111", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" },
  input: { width: "100%", padding: "11px 14px", borderRadius: 12, border: "0.5px solid #ddd", background: "#fafafa", color: "#111", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  overlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 50 },
  card: { background: "#fff", borderRadius: 20, padding: "24px 20px", width: "100%", maxWidth: 360 },
  label: { fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 },
  fieldInput: { width: "100%", padding: "11px 14px", borderRadius: 12, border: "0.5px solid #ddd", background: "#fafafa", color: "#111", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  settingRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px", borderBottom: "0.5px solid #f0f0f0", cursor: "pointer" },
  settingLabel: { fontSize: 15, color: "#111" },
};
