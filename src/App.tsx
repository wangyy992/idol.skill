import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Search, MoreVertical, Send, Plus,
  Trash2, RotateCcw, Camera, X, Check, ChevronRight,
  RefreshCw, Heart
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "bubble" | "weverse";

interface Idol {
  id: string;
  name: string;          // 含 emoji，如 "mocha ☕"
  avatar: string;        // base64 或空字符串
  platform: Platform;
  systemPrompt: string;
  createdAt: number;
}

interface Message {
  id: string;
  sender: "user" | "idol";
  text: string;
  time: string;
  isUnread?: boolean;
  translation?: string;
  showTranslation?: boolean;
}

type Screen = "home" | "distill" | "progress" | "chat";
type DistillSource = "image" | "text" | "youtube";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d = new Date()) {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadIdols(): Idol[] {
  try {
    return JSON.parse(localStorage.getItem("idols_v1") || "[]");
  } catch {
    return [];
  }
}

function saveIdols(idols: Idol[]) {
  localStorage.setItem("idols_v1", JSON.stringify(idols));
}

function loadHistory(idolId: string): Message[] {
  try {
    return JSON.parse(localStorage.getItem(`history_${idolId}`) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(idolId: string, msgs: Message[]) {
  localStorage.setItem(`history_${idolId}`, JSON.stringify(msgs.slice(-100)));
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({
  idol, size = 40, platform,
}: { idol: Idol; size?: number; platform?: Platform }) {
  const p = platform || idol.platform;
  const border = p === "bubble"
    ? "2px solid #7C6FD4"
    : "2px solid #5CC8C2";
  if (idol.avatar) {
    return (
      <img
        src={idol.avatar}
        alt={idol.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border, flexShrink: 0 }}
      />
    );
  }
  const initials = idol.name.replace(/\p{Emoji}/gu, "").trim().slice(0, 1).toUpperCase() || "?";
  const bg = p === "bubble" ? "#7C6FD4" : "#5CC8C2";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", border,
      background: bg, color: "#fff", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 500, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [idols, setIdols] = useState<Idol[]>(loadIdols);
  const [currentIdol, setCurrentIdol] = useState<Idol | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Distill state
  const [distillSource, setDistillSource] = useState<DistillSource>("image");
  const [distillImages, setDistillImages] = useState<string[]>([]);
  const [distillText, setDistillText] = useState("");
  const [distillYT, setDistillYT] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [showSetupCard, setShowSetupCard] = useState(false);
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState("");

  // Setup card state
  const [setupName, setSetupName] = useState("");
  const [setupAvatar, setSetupAvatar] = useState("");
  const [setupPlatform, setSetupPlatform] = useState<Platform>("bubble");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveIdols(idols);
  }, [idols]);

  useEffect(() => {
    if (currentIdol) {
      saveHistory(currentIdol.id, messages);
    }
  }, [messages, currentIdol]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Navigation ───────────────────────────────────────────────

  function openChat(idol: Idol) {
    setCurrentIdol(idol);
    const hist = loadHistory(idol.id);
    if (hist.length === 0) {
      const welcome: Message = {
        id: genId(),
        sender: "idol",
        text: "안녕~ 나야 나! 보고 싶었어 🫶",
        time: formatTime(),
      };
      setMessages([welcome]);
    } else {
      setMessages(hist);
    }
    setScreen("chat");
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
    setShowSetupCard(false);
    setSetupName("");
    setSetupAvatar("");
    setSetupPlatform("bubble");
    setScreen("distill");
  }

  // ── Distill flow ─────────────────────────────────────────────

  async function handleDistill() {
    setScreen("progress");
    setProgressStep(0);
    setShowSetupCard(false);

    const steps = [
      "读取素材中…",
      "OCR 提取爱豆原话…",
      "分析说话风格…",
      "生成专属 SKILL…",
    ];

    try {
      // Step 1
      setProgressStep(1);
      setProgressLabel(steps[0]);
      await sleep(600);

      let material = "";

      // Step 2 — OCR or text
      setProgressStep(2);
      setProgressLabel(steps[1]);

      if (distillSource === "image" && distillImages.length > 0) {
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: distillImages }),
        });
        const data = await res.json();
        material = data.text || "";
      } else if (distillSource === "text") {
        material = distillText;
        await sleep(500);
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

      // Step 3
      setProgressStep(3);
      setProgressLabel(steps[2]);
      await sleep(500);

      // Step 4 — Distill
      setProgressStep(4);
      setProgressLabel(steps[3]);
      const res = await fetch("/api/distill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idolName: "爱豆", material }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setPendingSystemPrompt(data.systemPrompt || "");
      await sleep(400);
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
    };
    const next = [idol, ...idols];
    setIdols(next);
    openChat(idol);
  }

  // ── Chat ─────────────────────────────────────────────────────

  async function sendMessage(text?: string) {
    const txt = text || inputText;
    if (!txt.trim() || isLoading || !currentIdol) return;
    setInputText("");

    const userMsg: Message = {
      id: genId(),
      sender: "user",
      text: txt.trim(),
      time: formatTime(),
      isUnread: true,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.text,
          history: messages,
          systemPrompt: currentIdol.systemPrompt,
        }),
      });
      const data = await res.json();

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === userMsg.id ? { ...m, isUnread: false } : m
        );
        return [
          ...updated,
          {
            id: genId(),
            sender: "idol" as const,
            text: data.text || "...",
            time: formatTime(),
          },
        ];
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsg.id ? { ...m, isUnread: false } : m))
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function translateMessage(msgId: string, text: string) {
    setMessages((prev) =>
      prev.map((m) => m.id === msgId ? { ...m, translation: "翻译中…", showTranslation: true } : m)
    );
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, translation: data.translated || "翻译失败", showTranslation: true }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, translation: "翻译失败" } : m)
      );
    }
  }

  function toggleTranslation(msgId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, showTranslation: !m.showTranslation } : m
      )
    );
  }

  function deleteIdol(id: string) {
    if (!confirm("确定删除这位爱豆吗？")) return;
    setIdols((prev) => prev.filter((i) => i.id !== id));
    localStorage.removeItem(`history_${id}`);
  }

  // ── Image upload handlers ─────────────────────────────────────

  function handleImageFiles(files: FileList | null) {
    if (!files) return;
    const newImgs: string[] = [];
    let count = 0;
    Array.from(files).slice(0, 50).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        newImgs.push(reader.result as string);
        count++;
        if (count === Math.min(files.length, 50)) {
          setDistillImages((prev) => [...prev, ...newImgs].slice(0, 50));
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function handleAvatarFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSetupAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ─────────────────────────────────────────────────────────────
  // Screens
  // ─────────────────────────────────────────────────────────────

  // ── Home ─────────────────────────────────────────────────────
  if (screen === "home") {
    return (
      <div style={styles.phoneFrame}>
        <StatusBar />
        <div style={styles.homeNav}>
          <span style={styles.homeNavTitle}>消息</span>
          <button onClick={startDistill} style={styles.iconBtn} aria-label="添加爱豆">
            <Plus size={22} color="#555" />
          </button>
        </div>

        <div style={styles.scrollArea}>
          {idols.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
              <div style={{ fontSize: 15, color: "#333", fontWeight: 500 }}>蒸馏你的第一位爱豆</div>
              <div style={{ fontSize: 13, color: "#999", marginTop: 6 }}>上传泡泡截图，让 AI 还原爱豆的说话方式</div>
              <button onClick={startDistill} style={styles.primaryBtn}>
                开始蒸馏
              </button>
            </div>
          ) : (
            idols.map((idol) => (
              <div key={idol.id} style={styles.idolRow} onClick={() => openChat(idol)}>
                <Avatar idol={idol} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>{idol.name}</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                    {idol.platform === "bubble" ? "Bubble 风格" : "Weverse DM 风格"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ChevronRight size={16} color="#ccc" />
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteIdol(idol.id); }}
                    style={{ ...styles.iconBtn, padding: 4 }}
                    aria-label="删除"
                  >
                    <Trash2 size={15} color="#ccc" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Distill ───────────────────────────────────────────────────
  if (screen === "distill") {
    const canStart =
      (distillSource === "image" && distillImages.length > 0) ||
      (distillSource === "text" && distillText.trim().length >= 30) ||
      (distillSource === "youtube" && distillYT.trim().startsWith("http"));

    return (
      <div style={styles.phoneFrame}>
        <StatusBar />
        <div style={styles.navBar}>
          <button onClick={goHome} style={styles.iconBtn} aria-label="返回">
            <ArrowLeft size={20} color="#333" />
          </button>
          <span style={styles.navTitle}>蒸馏爱豆</span>
          <div style={{ width: 32 }} />
        </div>

        <div style={styles.scrollArea}>
          <div style={styles.distillHero}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#333" }}>上传素材，蒸馏爱豆人格</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 4, lineHeight: 1.6 }}>
              截图 / 文字 / YouTube 链接均可
            </div>
          </div>

          {/* Source tabs */}
          <div style={styles.sourceTabs}>
            {(["image", "text", "youtube"] as DistillSource[]).map((src) => (
              <button
                key={src}
                onClick={() => setDistillSource(src)}
                style={{
                  ...styles.sourceTab,
                  ...(distillSource === src ? styles.sourceTabActive : {}),
                }}
              >
                {src === "image" ? "📸 截图" : src === "text" ? "📝 文字" : "▶️ YouTube"}
              </button>
            ))}
          </div>

          {/* Source input */}
          {distillSource === "image" && (
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleImageFiles(e.target.files)}
              />
              <div
                style={styles.uploadZone}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleImageFiles(e.dataTransfer.files); }}
              >
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
                    <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                      已选 {distillImages.length} 张 · 点击继续添加
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
                    <div style={{ fontSize: 13, color: "#555" }}>点击或拖拽上传泡泡截图</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>支持 1–50 张，jpg / png / webp</div>
                  </div>
                )}
              </div>
              {distillImages.length > 0 && (
                <button
                  onClick={() => setDistillImages([])}
                  style={{ ...styles.ghostBtn, marginTop: 6 }}
                >
                  清空重选
                </button>
              )}
            </div>
          )}

          {distillSource === "text" && (
            <div>
              <textarea
                value={distillText}
                onChange={(e) => setDistillText(e.target.value)}
                placeholder={"粘贴爱豆的泡泡消息、直播文字记录、访谈内容…\n建议 200 字以上效果更好"}
                style={styles.textArea}
                rows={8}
              />
              <div style={{ fontSize: 11, color: distillText.length < 100 ? "#e88" : "#aaa", marginTop: 4, textAlign: "right" }}>
                {distillText.length} 字{distillText.length < 100 ? "（建议至少 100 字）" : ""}
              </div>
            </div>
          )}

          {distillSource === "youtube" && (
            <div>
              <input
                type="text"
                value={distillYT}
                onChange={(e) => setDistillYT(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                style={styles.textInput}
              />
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 6, lineHeight: 1.6 }}>
                系统会自动下载字幕（优先韩语/日语/中文）。无字幕的视频可能无法处理。
              </div>
            </div>
          )}

          <button
            onClick={handleDistill}
            disabled={!canStart}
            style={{ ...styles.primaryBtn, opacity: canStart ? 1 : 0.4, marginTop: 16 }}
          >
            开始蒸馏 ✨
          </button>
        </div>
      </div>
    );
  }

  // ── Progress ──────────────────────────────────────────────────
  if (screen === "progress") {
    const totalSteps = 4;
    const pct = Math.round((progressStep / totalSteps) * 100);

    return (
      <div style={{ ...styles.phoneFrame, position: "relative" }}>
        <StatusBar />
        <div style={styles.navBar}>
          <div style={{ width: 32 }} />
          <span style={styles.navTitle}>蒸馏中</span>
          <div style={{ width: 32 }} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 24 }}>
          <div style={{ fontSize: 56 }}>🧪</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#333", textAlign: "center" }}>
            {progressLabel || "准备中…"}
          </div>

          {/* Progress bar */}
          <div style={{ width: "100%", background: "#f0f0f0", borderRadius: 8, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#7C6FD4", borderRadius: 8, transition: "width .4s ease" }} />
          </div>

          <div style={{ fontSize: 12, color: "#aaa" }}>步骤 {progressStep} / {totalSteps}</div>

          {/* Step indicators */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 8 }}>
            {["读取素材", "OCR 提取原话", "分析说话风格", "生成专属 SKILL"].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: progressStep > i ? "#7C6FD4" : progressStep === i + 1 ? "#EEEDFE" : "#f5f5f5",
                  border: progressStep === i + 1 ? "2px solid #7C6FD4" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
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
          <div style={styles.overlay}>
            <div style={styles.setupCard}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 16 }}>
                蒸馏完成 🎉 为爱豆建档
              </div>

              {/* Avatar upload */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
                <input
                  type="file"
                  ref={avatarInputRef}
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleAvatarFile(e.target.files?.[0] || null)}
                />
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: setupAvatar ? "transparent" : "#f0f0f0",
                    border: "2px dashed #ddd", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", position: "relative",
                  }}
                >
                  {setupAvatar
                    ? <img src={setupAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Camera size={22} color="#aaa" />
                  }
                </div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>点击上传头像</div>
              </div>

              {/* Name input */}
              <div style={{ marginBottom: 12 }}>
                <div style={styles.fieldLabel}>爱豆名字（可含 emoji）</div>
                <input
                  type="text"
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="例如：mocha ☕ 或 令💜"
                  style={styles.fieldInput}
                  autoFocus
                />
              </div>

              {/* Platform select */}
              <div style={{ marginBottom: 20 }}>
                <div style={styles.fieldLabel}>平台风格</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["bubble", "weverse"] as Platform[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSetupPlatform(p)}
                      style={{
                        flex: 1, padding: "10px 8px", borderRadius: 12,
                        border: setupPlatform === p ? "2px solid " + (p === "bubble" ? "#7C6FD4" : "#5CC8C2") : "1px solid #eee",
                        background: setupPlatform === p ? (p === "bubble" ? "#EEEDFE" : "#E1F5F5") : "#fafafa",
                        cursor: "pointer", fontSize: 12, fontWeight: 500,
                        color: setupPlatform === p ? (p === "bubble" ? "#3C3489" : "#0F6E6E") : "#666",
                        transition: "all .15s",
                      }}
                    >
                      {p === "bubble" ? "Bubble" : "Weverse DM"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSetupConfirm}
                disabled={!setupName.trim()}
                style={{ ...styles.primaryBtn, opacity: setupName.trim() ? 1 : 0.4 }}
              >
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
    const accentColor = isBubble ? "#7C6FD4" : "#5CC8C2";
    const idolBubbleBg = isBubble ? "#FFFFFF" : "#A8E6E2";
    const idolBubbleColor = isBubble ? "#111" : "#111";
    const userBubbleBg = isBubble ? "#FFFFFF" : "#F0F0F0";
    const chatBg = "#F7F7F7";

    return (
      <div style={{ ...styles.phoneFrame, background: chatBg }}>
        <StatusBar />

        {/* Nav */}
        <div style={{ ...styles.navBar, background: "#fff", borderBottom: "0.5px solid #eee" }}>
          <button onClick={goHome} style={styles.iconBtn} aria-label="返回">
            <ArrowLeft size={20} color="#333" />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
            <Avatar idol={currentIdol} size={32} />
            <div style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>
              {currentIdol.name}
            </div>
            {isBubble && (
              <div style={{ fontSize: 9, background: accentColor, color: "#fff", borderRadius: 10, padding: "1px 5px", fontWeight: 600 }}>
                ARTIST
              </div>
            )}
            {!isBubble && (
              <div style={{ color: accentColor, fontSize: 14 }}>✓</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            {!isBubble && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#f0f0f0", borderRadius: 20, padding: "3px 8px" }}>
                <Heart size={11} fill={accentColor} color={accentColor} />
                <span style={{ fontSize: 11, color: "#555", fontWeight: 500 }}>+84</span>
              </div>
            )}
            <button style={styles.iconBtn} aria-label="搜索"><Search size={18} color="#555" /></button>
            <button style={styles.iconBtn} aria-label="更多"><MoreVertical size={18} color="#555" /></button>
          </div>
        </div>

        {/* Pinned banner — Bubble only */}
        {isBubble && (
          <div style={{ background: "#F5F5F5", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid #eee" }}>
            <Heart size={13} color="#aaa" />
            <span style={{ fontSize: 12, color: "#888" }}>오늘도 함께해줘서 고마워 💜</span>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px", display: "flex", flexDirection: "column", gap: 12 }}>

          {messages.map((msg) => {
            const isIdol = msg.sender === "idol";

            if (isIdol) {
              return (
                <div key={msg.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 48 }}>
                  <Avatar idol={currentIdol} size={36} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {/* Name row — Bubble only */}
                    {isBubble && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                        <span style={{ fontSize: 9, background: accentColor, color: "#fff", borderRadius: 10, padding: "1px 5px", fontWeight: 600 }}>ARTIST</span>
                        <span style={{ fontSize: 12, color: "#555" }}>{currentIdol.name}</span>
                        <span style={{ fontSize: 11 }}>💜</span>
                      </div>
                    )}
                    {/* Bubble */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                      <div style={{
                        background: idolBubbleBg,
                        color: idolBubbleColor,
                        padding: "10px 14px",
                        borderRadius: isBubble ? "4px 18px 18px 18px" : "4px 18px 18px 18px",
                        fontSize: 14, lineHeight: 1.55,
                        border: isBubble ? "0.5px solid #eee" : "none",
                        maxWidth: 240,
                        boxShadow: isBubble ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}>
                        {msg.text}
                      </div>
                      <span style={{ fontSize: 10, color: "#bbb", whiteSpace: "nowrap", paddingBottom: 2 }}>{msg.time}</span>
                    </div>

                    {/* Translation */}
                    {msg.showTranslation && msg.translation && (
                      <div style={{ fontSize: 12, color: isBubble ? "#7C6FD4" : "#5CC8C2", fontStyle: "italic", marginTop: 2, paddingLeft: 2 }}>
                        {msg.translation}
                      </div>
                    )}

                    {/* Translate button */}
                    <button
                      onClick={() => msg.translation ? toggleTranslation(msg.id) : translateMessage(msg.id, msg.text)}
                      style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontSize: 11, color: "#aaa" }}
                    >
                      <RefreshCw size={10} />
                      {isBubble ? "A  查看翻译" : "查看原文"}
                    </button>
                  </div>
                </div>
              );
            } else {
              // User message
              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 6, paddingLeft: 48 }}>
                  {msg.isUnread && (
                    <span style={{ fontSize: 10, color: "#f7c600", fontWeight: 700, paddingBottom: 2 }}>1</span>
                  )}
                  <span style={{ fontSize: 10, color: "#bbb", paddingBottom: 2, whiteSpace: "nowrap" }}>{msg.time}</span>
                  <div style={{
                    background: userBubbleBg,
                    color: "#111",
                    padding: "10px 14px",
                    borderRadius: "18px 4px 18px 18px",
                    fontSize: 14, lineHeight: 1.55,
                    border: "0.5px solid #eee",
                    maxWidth: 240,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                  }}>
                    {msg.text}
                  </div>
                </div>
              );
            }
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 48 }}>
              <Avatar idol={currentIdol} size={36} />
              <div style={{ background: idolBubbleBg, border: isBubble ? "0.5px solid #eee" : "none", padding: "12px 16px", borderRadius: "4px 18px 18px 18px", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: accentColor, animation: `bounce 1.2s ${i * 0.15}s infinite` }} />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ background: "#fff", borderTop: "0.5px solid #eee", padding: "8px 12px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="请输入消息。"
            style={{
              flex: 1, background: "#F7F7F7", border: "0.5px solid #eee",
              borderRadius: 24, padding: "10px 16px",
              fontSize: 14, color: "#111", outline: "none",
              fontFamily: "inherit",
            }}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputText.trim() || isLoading}
            style={{
              width: 38, height: 38, borderRadius: "50%",
              background: inputText.trim() && !isLoading ? accentColor : "#eee",
              border: "none", cursor: inputText.trim() && !isLoading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background .15s",
            }}
            aria-label="发送"
          >
            <Send size={16} color={inputText.trim() && !isLoading ? "#fff" : "#bbb"} />
          </button>
        </div>

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-6px); }
          }
        `}</style>
      </div>
    );
  }

  return null;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function StatusBar() {
  const [time, setTime] = useState(formatTime());
  useEffect(() => {
    const t = setInterval(() => setTime(formatTime()), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ height: 28, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 18px", background: "#fff", fontSize: 12, color: "#333", fontWeight: 500, flexShrink: 0 }}>
      <span>{time}</span>
      <span style={{ fontSize: 11, color: "#555" }}>●●● ▲ 🔋</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  phoneFrame: {
    width: "100%",
    maxWidth: 430,
    minHeight: "100dvh",
    margin: "0 auto",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  homeNav: {
    height: 52,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    borderBottom: "0.5px solid #eee",
    flexShrink: 0,
  },
  homeNavTitle: {
    fontSize: 18,
    fontWeight: 500,
    color: "#111",
  },
  navBar: {
    height: 52,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 12px",
    borderBottom: "0.5px solid #eee",
    flexShrink: 0,
    background: "#fff",
  },
  navTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: "#111",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  idolRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 4px",
    borderBottom: "0.5px solid #f5f5f5",
    cursor: "pointer",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    textAlign: "center",
    gap: 4,
  },
  primaryBtn: {
    width: "100%",
    padding: "13px",
    borderRadius: 14,
    border: "none",
    background: "#7C6FD4",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    marginTop: 8,
    fontFamily: "inherit",
    transition: "opacity .15s",
  },
  ghostBtn: {
    width: "100%",
    padding: "9px",
    borderRadius: 10,
    border: "0.5px solid #ddd",
    background: "transparent",
    color: "#888",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  distillHero: {
    background: "#FAFAFA",
    border: "0.5px solid #eee",
    borderRadius: 16,
    padding: "20px",
    textAlign: "center",
    marginBottom: 16,
  },
  sourceTabs: {
    display: "flex",
    gap: 6,
    marginBottom: 14,
  },
  sourceTab: {
    flex: 1,
    padding: "8px 4px",
    borderRadius: 10,
    border: "0.5px solid #eee",
    background: "#fafafa",
    color: "#777",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all .15s",
  },
  sourceTabActive: {
    background: "#EEEDFE",
    borderColor: "#AFA9EC",
    color: "#3C3489",
    fontWeight: 500,
  },
  uploadZone: {
    border: "1.5px dashed #ddd",
    borderRadius: 14,
    padding: "28px 16px",
    textAlign: "center",
    cursor: "pointer",
    background: "#fafafa",
    transition: "border-color .15s",
  },
  textArea: {
    width: "100%",
    padding: "12px",
    borderRadius: 12,
    border: "0.5px solid #ddd",
    background: "#fafafa",
    color: "#111",
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
  },
  textInput: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: "0.5px solid #ddd",
    background: "#fafafa",
    color: "#111",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 50,
  },
  setupCard: {
    background: "#fff",
    borderRadius: 20,
    padding: "24px 20px",
    width: "100%",
    maxWidth: 360,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  fieldLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 6,
    fontWeight: 500,
  },
  fieldInput: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: "0.5px solid #ddd",
    background: "#fafafa",
    color: "#111",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
};
