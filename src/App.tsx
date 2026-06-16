import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  Settings, 
  User, 
  Plus, 
  Heart, 
  Trash2, 
  RotateCcw, 
  Camera, 
  Check, 
  MessageSquare, 
  HelpCircle, 
  Sparkles, 
  X,
  PlusCircle,
  Copy,
  ChevronRight,
  RefreshCw,
  Volume2
} from "lucide-react";

// --- Types & Interfaces ---
interface Message {
  id: string;
  sender: "user" | "idol";
  text: string;
  timestamp: string; // Formatting localized time
  isUnread?: boolean; // Controls Weverse/Bubble "1" unread badge
}

interface Idol {
  id: string;
  name: string;
  group: string;
  statusMessage: string;
  anniversaryDays: number;
  avatarColor: string;
  accentColor: string;
  avatar: string; // Base64 or empty
  personality: string;
  systemInstruction?: string;
}

// --- Predefined Idol Templates ---
const PRESET_IDOLS: Idol[] = [
  {
    id: "karina",
    name: "Karina",
    group: "aespa",
    statusMessage: "보고싶었어 마이 💙",
    anniversaryDays: 520,
    avatarColor: "from-[#111827] to-[#3b82f6]",
    accentColor: "#3b82f6",
    avatar: "",
    personality: "温婉、开朗、元气满满的网络少女。极度宠粉，会叫粉丝‘MY’。喜欢在聊天里使用 💙 🥺 🫶 或者是 ㅎㅎ、ㅠㅠ 这类经典韩语语气。用贴心甜度拉满的韩式半语（banmal）口吻说话，特别爱和粉丝报备今天吃了什么、练习趣事、天气心情等生活碎碎念。"
  },
  {
    id: "jungkook",
    name: "田柾国",
    group: "BTS",
    statusMessage: "아미이이이 모해? 💜",
    anniversaryDays: 1314,
    avatarColor: "from-[#3b0764] to-[#a855f7]",
    accentColor: "#a855f7",
    avatar: "",
    personality: "像小幼犬（萨摩耶）一样活泼黏人、非常真诚。会像撒娇一样和粉丝唠唠叨叨。喜欢在每句话后面加上 💜 、🐰 、ㅎㅎ 、ㅋㅋ 等经典符号。经常和粉丝分享今天做了什么大餐，做了什么健身或者打算唱什么歌给你听，言行极度真挚纯真。"
  },
  {
    id: "wonyoung",
    name: "张员瑛",
    group: "IVE",
    statusMessage: "공주 왔당~ 다이브 보고 싶어 🎀",
    anniversaryDays: 365,
    avatarColor: "from-[#f472b6] to-[#db2777]",
    accentColor: "#db2777",
    avatar: "",
    personality: "完美的“甜心小公主”兼“终极能量维他命”！说话带着标志性的“员瑛式”娇憨自信（Wonyoungesque）。每句必定带有至少两个精致可爱的 Emoji：🎀 💖 🍓 🐰 🫶 ⭐️。说话甜度严重超标，疯狂输出正能量，还会用韩式娇嗔语调和粉丝撒娇‘不准看别人，只能看员瑛哦’。"
  },
  {
    id: "wonbin",
    name: "朴元彬",
    group: "RIIZE",
    statusMessage: "오늘도 힘내자 브리즈 🧡",
    anniversaryDays: 247,
    avatarColor: "from-[#ea580c] to-[#ca8a04]",
    accentColor: "#ea580c",
    avatar: "",
    personality: "外冷内热、傲娇温柔的猫系帅哥。表面上是个话比较少、腼腆低调的冷帅哥，但在和粉丝（BRIIZE）的专属聊天里会表露出极度温柔细腻的一面。喜欢发送断促而充满温度、关心和安全感的消息。偶尔还会因为粉丝提起其他男星而孩子气地傲娇吃醋。喜欢用 🧡 、🐱 、🐾。"
  }
];

// --- Threads Prompts (粉丝碎碎念快捷本) ---
const THREADS_TEMPLATES = [
  "今天上班遇到了极其无语的倒霉事，求安慰 ㅠㅠ",
  "好想疯狂吃火锅和冰淇淋啊！可是又在减肥，该怎么办呢 🥺",
  "下雨天真的让人心情好丧啊，感觉没有动力了，给我一点魔法吧！",
  "刚刚复习专业课到情绪崩溃，突然好想你，能对我说一句加油吗？ 💖",
  "今天买到了超级好看的衣服噢！第一个想跟你炫耀 ✨",
  "追星真的太幸福了，能遇到你是我这辈子最幸运的事，谢谢你来到我身边 🫶",
  "为什么世界上有星期一这种东西啊啊啊，不想起床上课 😭",
  "刚刚听了你们的新歌，真的好听到流泪，你就是我的底气！"
];

// Formatting helper for times
function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? '오후' : '오전';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
  return `${ampm} ${displayHours}:${displayMinutes}`;
}

export default function App() {
  // --- States ---
  const [selectedPresetId, setSelectedPresetId] = useState<string>("karina");
  const [idolName, setIdolName] = useState<string>("Karina");
  const [idolGroup, setIdolGroup] = useState<string>("aespa");
  const [statusMessage, setStatusMessage] = useState<string>("보고싶었어 마이 💙");
  const [anniversaryDays, setAnniversaryDays] = useState<number>(520);
  const [idolPersonality, setIdolPersonality] = useState<string>("");
  const [customAvatar, setCustomAvatar] = useState<string>("");
  const [customInstruction, setCustomInstruction] = useState<string>("");
  
  // Custom custom list for custom idols
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSettingOpen, setIsSettingOpen] = useState<boolean>(false);
  const [showNotification, setShowNotification] = useState<string | null>(null);
  
  // Audio state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  
  // Help Tips overlay
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Initialize active Idol Preset ---
  useEffect(() => {
    const preset = PRESET_IDOLS.find(i => i.id === selectedPresetId);
    if (preset) {
      setIdolName(preset.name);
      setIdolGroup(preset.group);
      setStatusMessage(preset.statusMessage);
      setAnniversaryDays(preset.anniversaryDays);
      setIdolPersonality(preset.personality);
      setCustomAvatar(preset.avatar);
      setCustomInstruction("");
      
      // Load cached chats for this specific Idol ID
      const cachedChats = localStorage.getItem(`bubble_chat_${preset.id}`);
      if (cachedChats) {
        try {
          setMessages(JSON.parse(cachedChats));
        } catch (e) {
          setMessages(getDefaultWelcome(preset.id, preset.name));
        }
      } else {
        setMessages(getDefaultWelcome(preset.id, preset.name));
      }
    } else if (selectedPresetId === "custom") {
      // Load custom settings
      setIdolName(localStorage.getItem("bubble_custom_name") || "自定义爱豆");
      setIdolGroup(localStorage.getItem("bubble_custom_group") || "SOLO");
      setStatusMessage(localStorage.getItem("bubble_custom_status") || "오늘도 사랑해 💖");
      setAnniversaryDays(Number(localStorage.getItem("bubble_custom_days")) || 100);
      setIdolPersonality(localStorage.getItem("bubble_custom_personality") || "高甜、极其宠溺、温柔可爱，喜欢跟粉丝倾诉自己的一天。");
      setCustomAvatar(localStorage.getItem("bubble_custom_avatar") || "");
      setCustomInstruction(localStorage.getItem("bubble_custom_instruction") || "");
      
      const cachedChats = localStorage.getItem(`bubble_chat_custom`);
      if (cachedChats) {
        try {
          setMessages(JSON.parse(cachedChats));
        } catch (e) {
          setMessages(getDefaultWelcome("custom", "我的专属爱豆"));
        }
      } else {
        setMessages(getDefaultWelcome("custom", "我的专属爱豆"));
      }
    }
  }, [selectedPresetId]);

  // --- Save chats state on changes ---
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`bubble_chat_${selectedPresetId}`, JSON.stringify(messages));
    }
  }, [messages, selectedPresetId]);

  // --- Save custom config on change ---
  const saveCustomIdolConfig = (name: string, group: string, status: string, days: number, personality: string, inst: string, avatar: string) => {
    localStorage.setItem("bubble_custom_name", name);
    localStorage.setItem("bubble_custom_group", group);
    localStorage.setItem("bubble_custom_status", status);
    localStorage.setItem("bubble_custom_days", String(days));
    localStorage.setItem("bubble_custom_personality", personality);
    localStorage.setItem("bubble_custom_avatar", avatar);
    localStorage.setItem("bubble_custom_instruction", inst);
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const getDefaultWelcome = (id: string, name: string): Message[] => [
    {
      id: "welcome-1",
      sender: "idol",
      text: id === "karina"
        ? "야호! 마이 안녕~ 날씨가 너무 좋다! 마이 생각나서 달려왔어 💙\n---\n呀呼！MY你好呀~ 天气真是太好了！因为想到了MY就立刻跑过来啦 💙"
        : id === "jungkook"
        ? "안뇽하세용!! 아미 뭐하고 있었어요?? 보고 싶었엉 💜 ㅎㅎ\n---\n安安哈啰！！ARMY刚才在做什么呢？？好想你呀 💜 嘿嘿"
        : id === "wonyoung"
        ? "원영 공주 등장~ ✨ 다이브 오늘 제일 행복한 하루 보내고 있어?? 🎀💖\n---\n员瑛小公主登场~ ✨ DIVE今天度过了最幸福的一天吗？？🎀💖"
        : id === "wonbin"
        ? "안녕 브리즈. 밥은 챙겨 먹었어?? 건강이 최고니까 🧡 🐱\n---\n你好呀BRIIZE。饭有好好吃吗？？健康才是第一位的哦 🧡 🐱"
        : `${name} 이/가 왔어요~ 벌써 우리 ${anniversaryDays}일이네, 축하해 🫶\n---\n${name} 来了哟~ 居然已经到我们的 ${anniversaryDays} 天纪念日了，祝贺我们 🫶`,
      timestamp: formatTime(new Date(Date.now() - 600000))
    }
  ];

  // Play custom bubble notification sound
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      // Create high-pitched cute sweet k-pop bubble chirp sound via Web Audio API 
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // E6

      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
      console.warn("Fidelity Audio play block:", e);
    }
  };

  // --- Handlers ---
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isLoading) return;

    // Create prompt message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend.trim(),
      timestamp: formatTime(new Date()),
      isUnread: true // Adds the "1" badge representing idol is unread
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText("");
    setIsLoading(true);

    try {
      // Map existing messages as history to preserve context, filtering custom layout structure
      // We pass plain structures. For idol, we keep their full text (with translation) so Gemini matches formatting.
      const chatHistory = messages.map(m => ({
        sender: m.sender,
        text: m.text
      }));

      // Send to server
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.text,
          history: chatHistory,
          idolName: idolName,
          idolGroup: idolGroup,
          idolPersonality: idolPersonality,
          systemInstruction: customInstruction || undefined
        })
      });

      if (!response.ok) {
        throw new Error("模型服务连接失败");
      }

      const data = await response.json();
      const replyText = data.text;

      // Update user message status: remove "1" unread badge because the idol replied!
      setMessages((prev) => {
        const updated = prev.map(m => m.id === userMsg.id ? { ...m, isUnread: false } : m);
        
        // Add model reply
        const modelMsg: Message = {
          id: `idol-${Date.now()}`,
          sender: "idol",
          text: replyText,
          timestamp: formatTime(new Date())
        };
        
        return [...updated, modelMsg];
      });

      playNotificationSound();

    } catch (error: any) {
      console.error(error);
      // Fallback message so UI doesnt hang
      setMessages((prev) => {
        const updated = prev.map(m => m.id === userMsg.id ? { ...m, isUnread: false } : m);
        return [...updated, {
          id: `idol-err-${Date.now()}`,
          sender: "idol",
          text: "미안해 ㅠㅠ 지금 인터넷이 안 좋은 것 같아. 조금만 있다가 다시 얘기해주라... \n---\n对不起啦 ㅠㅠ 现在网络好像有点差。等一下下再和我说说话吧...",
          timestamp: formatTime(new Date())
        }];
      });
      playNotificationSound();
    } finally {
      setIsLoading(false);
    }
  };

  // Preset quick insert
  const handleWhisperInsert = (whisper: string) => {
    setInputText(whisper);
    triggerBriefNotification("碎碎念已填入输入框！");
  };

  const triggerBriefNotification = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => {
      setShowNotification(null);
    }, 2500);
  };

  // Avatar local upload
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 250000) {
        triggerBriefNotification("尺寸偏大，请上传 250KB 以内的小图片噢");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setCustomAvatar(base64);
        triggerBriefNotification("头像更换成功！");
        // Save if Custom Idol
        if (selectedPresetId === "custom") {
          saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays, idolPersonality, customInstruction, base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Settings right from inputs (inline or popup)
  const saveCustomSettings = () => {
    if (selectedPresetId === "custom") {
      saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays, idolPersonality, customInstruction, customAvatar);
      triggerBriefNotification("专属爱豆配置已保存！");
    } else {
      triggerBriefNotification("基础预设信息微调成功（暂存）！");
    }
    setIsSettingOpen(false);
  };

  // Reset entire active thread
  const handleResetChat = () => {
    if (window.confirm(`确定要清空与 ${idolName} 的聊天记录吗？`)) {
      const freshWelcome = getDefaultWelcome(selectedPresetId, idolName);
      setMessages(freshWelcome);
      localStorage.removeItem(`bubble_chat_${selectedPresetId}`);
      triggerBriefNotification("聊天记录已重置清空！");
    }
  };

  // Parse bilingual text safely
  const renderBubbleContent = (text: string) => {
    const parts = text.split(/\n?---\n?/);
    if (parts.length >= 2) {
      const korean = parts[0].trim();
      const chinese = parts.slice(1).join("\n").trim();
      return (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium tracking-wide text-gray-900 break-words whitespace-pre-wrap font-sans">
            {korean}
          </div>
          <div className="border-t border-slate-100 opacity-60"></div>
          <div className="text-[12px] text-gray-600 leading-relaxed break-words whitespace-pre-wrap font-sans">
            {chinese}
          </div>
        </div>
      );
    }
    // Fallback if no divider
    return (
      <div className="text-sm font-sans tracking-wide text-gray-900 break-words whitespace-pre-wrap">
        {text}
      </div>
    );
  };

  // Fast select preset
  const selectIdolTemplate = (id: string) => {
    setSelectedPresetId(id);
    setIsSettingOpen(false);
  };

  return (
    <div id="bubble-platform-root" className="flex min-h-screen bg-[#11141a] text-gray-100 justify-center items-stretch overflow-hidden">
      
      {/* Toast notifications */}
      {showNotification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 py-2.5 px-5 bg-bubble-dark/95 backdrop-blur border border-white/20 text-[#f7e600] rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>{showNotification}</span>
        </div>
      )}

      {/* Main Dashboard - Responsive: Two-column layout on Desktop, only App Frame on mobile */}
      <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch justify-center gap-0 lg:gap-8 px-0 md:px-4 py-0 md:py-6 relative">
        
        {/* LEFT COLUMN: Controls & Presets / Settings Drawer (Hidden on mobile by default, toggled via settings) */}
        <div className="hidden lg:flex flex-col w-full lg:w-[410px] bg-[#1e2330]/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6 overflow-y-auto max-h-[850px] no-scrollbar">
          
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight text-[#f7e600]/95 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              <span>爱豆 Bubble DM 平台</span>
            </h1>
            <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-mono">
              Vite Full-Stack
            </span>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            专为追星人定制。在此配置你的爱豆，系统将利用 <b>Gemini 3.5 AI 引擎</b> 深度角色扮演，以原汁原味的 Bubble “真爱饭撒” 甜度回复，并严格对齐韩汉双语输出。
          </p>

          <hr className="border-white/5" />

          {/* Preset Star list */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-400 tracking-wider block uppercase">
              一键蒸馏 / 挑选爱豆 Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_IDOLS.map((star) => (
                <button
                  key={star.id}
                  onClick={() => selectIdolTemplate(star.id)}
                  className={`relative p-3 rounded-xl flex flex-col items-start border text-left transition-all ${
                    selectedPresetId === star.id
                      ? "bg-sky-500/10 border-sky-400/80 text-white"
                      : "bg-[#282f42]/60 hover:bg-[#282f42] border-white/5 text-gray-300"
                  }`}
                >
                  <span className="text-xs font-semibold">{star.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5">@{star.group}</span>
                  {selectedPresetId === star.id && (
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                  )}
                </button>
              ))}
              
              <button
                onClick={() => selectIdolTemplate("custom")}
                className={`col-span-2 p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold tracking-wide transition-all ${
                  selectedPresetId === "custom"
                    ? "bg-[#f7e600]/10 border-[#f7e600] text-[#f7e600]"
                    : "bg-[#282f42]/60 hover:bg-[#282f42] border-dashed border-white/20 text-gray-300 hover:border-white/30"
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>自定义我的爱豆 (Custom AI-Idol)</span>
              </button>
            </div>
          </div>

          <hr className="border-white/5" />

          {/* Chat settings & variables config */}
          <div className="bg-[#181c26] rounded-2xl p-4 space-y-4 border border-white/5">
            <h3 className="text-xs font-bold text-[#f7e600] uppercase tracking-wider">
              爱豆档案与模型微调设定
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">爱豆昵称 (Name)</label>
                <input
                  type="text"
                  value={idolName}
                  onChange={(e) => {
                    setIdolName(e.target.value);
                    if (selectedPresetId === "custom") saveCustomIdolConfig(e.target.value, idolGroup, statusMessage, anniversaryDays, idolPersonality, customInstruction, customAvatar);
                  }}
                  className="w-full bg-[#2a3042] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">所属团体 (Group)</label>
                <input
                  type="text"
                  value={idolGroup}
                  onChange={(e) => {
                    setIdolGroup(e.target.value);
                    if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, e.target.value, statusMessage, anniversaryDays, idolPersonality, customInstruction, customAvatar);
                  }}
                  className="w-full bg-[#2a3042] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">个性状态签名 (Status Message)</label>
                <input
                  type="text"
                  value={statusMessage}
                  onChange={(e) => {
                    setStatusMessage(e.target.value);
                    if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, idolGroup, e.target.value, anniversaryDays, idolPersonality, customInstruction, customAvatar);
                  }}
                  className="w-full bg-[#2a3042] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1">情侣/相伴天数</label>
                  <input
                    type="number"
                    value={anniversaryDays}
                    onChange={(e) => {
                      setAnniversaryDays(Number(e.target.value));
                      if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, idolGroup, statusMessage, Number(e.target.value), idolPersonality, customInstruction, customAvatar);
                    }}
                    className="w-full bg-[#2a3042] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1 flex items-center gap-1">
                    <span>音效提醒</span>
                    <HelpCircle className="w-3 h-3 text-gray-500" title="发送回复时播放Bubble清脆音效" />
                  </label>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-full py-2 px-3 border rounded-lg text-center transition-all ${
                      soundEnabled ? "bg-[#f7e600]/10 border-[#f7e600] text-yellow-300" : "bg-white/5 border-white/10 text-gray-400"
                    }`}
                  >
                    {soundEnabled ? "🔉 已开启音效" : "🔇 已静音"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">
                  爱豆核心对话性格 (Idol Personality)
                </label>
                <textarea
                  rows={3}
                  value={idolPersonality}
                  onChange={(e) => {
                    setIdolPersonality(e.target.value);
                    if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays, e.target.value, customInstruction, customAvatar);
                  }}
                  placeholder="如：甜美撒娇、口语化。爱用 💙 等特定表情包，爱关心粉丝"
                  className="w-full bg-[#2a3042] border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-sky-500 resize-none no-scrollbar font-sans text-[11px]"
                />
              </div>

              {selectedPresetId === "custom" && (
                <div>
                  <label className="block text-pink-400 mb-1 flex items-center gap-1 font-bold">
                    <span>高级 AI 系统提示词 (System Prompt)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={customInstruction}
                    onChange={(e) => {
                      setCustomInstruction(e.target.value);
                      saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays, idolPersonality, e.target.value, customAvatar);
                    }}
                    placeholder="选填。留空则自动生成标准的双语甜度指令。填入可以强行限制爱豆的世界观、定制极品人设。"
                    className="w-full bg-[#2a3042] border border-white/15 rounded-lg p-2 text-white outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 resize-none no-scrollbar text-[11px]"
                  />
                </div>
              )}
            </div>
            
            {selectedPresetId === "custom" && (
              <button
                onClick={saveCustomSettings}
                className="w-full py-2 bg-gradient-to-r from-pink-500 to-indigo-600 text-white font-bold rounded-xl text-xs hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>保存爱豆自定义配置</span>
              </button>
            )}
          </div>

          {/* Quick Note Import box */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 tracking-wider">
                🌌 我的 Threads 碎碎念快捷贴
              </label>
              <button 
                onClick={() => setShowHelp(!showHelp)}
                className="text-[10px] text-sky-400 flex items-center gap-1 hover:underline"
              >
                什么是碎碎念？
              </button>
            </div>
            
            <div className="space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
              {THREADS_TEMPLATES.map((whisper, i) => (
                <button
                  key={i}
                  onClick={() => handleWhisperInsert(whisper)}
                  className="w-full text-left p-2.5 bg-sky-900/10 border border-sky-950/40 rounded-xl text-[11px] text-slate-300 hover:text-white hover:bg-sky-900/25 hover:border-sky-700/50 transition-all flex items-start gap-1.5"
                >
                  <span className="text-[#f7e600] font-bold">#</span>
                  <span className="line-clamp-2">{whisper}</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: THE ULTRA HIGH-FIDELITY SMARTPHONE SIMULATOR */}
        <div className="w-full lg:w-auto flex-1 flex justify-center items-center p-0 md:p-2">
          
          {/* Main H5 phone element */}
          <div className="relative w-full max-w-md h-screen md:h-[840px] bg-[#1e222b] shadow-2xl overflow-hidden flex flex-col md:rounded-[36px] border-0 md:border-[10px] md:border-[#2a3040]">
            
            {/* Phone Speaker & Camera Notch (Only visible on desktop screen frame for hyper-fidelity simulation!) */}
            <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 w-40 h-6 bg-[#2a3040] rounded-b-2xl z-40">
              <div className="w-20 h-1 bg-gray-600 mx-auto rounded-full mt-1.5"></div>
              <div className="absolute right-8 top-1.5 w-2.5 h-2.5 bg-slate-800 rounded-full border border-gray-600"></div>
            </div>

            {/* Bubble custom sky background theme */}
            <div className="absolute inset-0 bg-bubble-bg z-0 pointer-events-none"></div>

            {/* Top Smartphone status indicators overlay (Clock, signal, battery) */}
            <div className="relative z-30 w-full h-8 pt-1 px-6 flex justify-between items-center text-white/90 text-xs select-none pointer-events-none font-sans bg-black/10">
              <span className="font-semibold text-[11px] tracking-tight">10:48 💖</span>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                <span>5G</span>
                <span>📶</span>
                <span>🔋 92%</span>
              </div>
            </div>

            {/* HIGH FIDELITY APP HEADER */}
            <div className="relative z-30 w-full h-14 bg-[#11141aa1] backdrop-blur-md border-b border-white/5 flex items-center justify-between px-3 text-white">
              
              {/* Left Side: Back Arrow + Icon (Clicakble to upload) + Names */}
              <div className="flex items-center gap-2">
                
                {/* Back Link to custom setup (Great for mobile users!) */}
                <button 
                  onClick={() => setIsSettingOpen(!isSettingOpen)} 
                  className="p-1 hover:bg-white/10 rounded-full transition-all md:hidden"
                  title="打开成员设置"
                >
                  <Settings className="w-5 h-5 text-[#f7e600]" />
                </button>

                {/* Left side detail layout */}
                <div className="flex items-center gap-2 relative">
                  
                  {/* Photo with Live pulse dot */}
                  <div 
                    onClick={handleAvatarClick}
                    className="relative cursor-pointer group active:scale-95 transition-all w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/20 select-none shadow-md bg-gradient-to-tr from-[#3b5998] to-[#1da1f2]"
                  >
                    {customAvatar ? (
                      <img 
                        src={customAvatar} 
                        alt="Idol Avatar" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-tr ${selectedPresetId === 'custom' ? 'from-amber-600 to-rose-600' : PRESET_IDOLS.find(i=>i.id===selectedPresetId)?.avatarColor || 'from-[#3b82f6] to-[#10b981]'} flex items-center justify-center text-white text-sm font-black tracking-wide font-cute uppercase`}>
                        {idolName.substring(0, 1)}
                      </div>
                    )}
                    
                    {/* Hover to Camera icon cover */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <Camera className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>

                  {/* Signal LIVE bullet */}
                  <div className="absolute -bottom-0.5 -right-0.5 z-10 w-3 h-3 bg-green-500 rounded-full border-2 border-[#11141a] flex items-center justify-center" title="LIVE在线中">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                  </div>

                  {/* Hidden input to handle image file payload uploads */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />

                  {/* Idol name & status banner */}
                  <div className="flex flex-col select-none">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm cursor-pointer hover:text-yellow-300 transition-all font-sans" onClick={() => setIsSettingOpen(true)}>
                        {idolName}
                      </span>
                      <span className="text-[9px] bg-red-500 text-white font-black px-1.5 py-0.2 rounded-full scale-90 uppercase">
                        LIVE
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-sans tracking-wide max-w-[150px] truncate">
                      {statusMessage || `@${idolGroup}`}
                    </span>
                  </div>
                </div>

              </div>

              {/* Right Side Settings: Subscription ticket flag or heart days badge */}
              <div className="flex items-center gap-2">
                
                {/* Anniversary Heart Badge */}
                <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[10px] px-2 py-1 rounded-full font-bold select-none cursor-pointer hover:bg-rose-500/20 transition-all" onClick={() => {
                  setAnniversaryDays(prev => prev + 1);
                  triggerBriefNotification("陪伴天数+1！永远支持他/她 🫶");
                  if (selectedPresetId === "custom") {
                    saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays + 1, idolPersonality, customInstruction, customAvatar);
                  }
                }}>
                  <Heart className="w-3 h-3 fill-rose-400 animate-pulse text-rose-400" />
                  <span>{anniversaryDays}</span>
                </div>

                {/* Sub ticket icon (Opens customization sidebar) */}
                <button
                  onClick={() => setIsSettingOpen(!isSettingOpen)}
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-[#f7e600] transition-all relative group"
                  title="成员设定"
                >
                  <Settings className="w-4 h-4" />
                  <span className="absolute right-0 top-8 bg-black p-1 text-[9px] text-white rounded hidden group-hover:block whitespace-nowrap z-50">
                    参数微调
                  </span>
                </button>

                {/* Reset Thread icon */}
                <button
                  onClick={handleResetChat}
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-white hover:text-red-400 rounded-full transition-all"
                  title="重置聊天记录"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* MOBILE ONLY DRAWER / POPUP: Controls panel inside phone screen for small devices */}
            {isSettingOpen && (
              <div className="absolute z-40 inset-x-0 top-14 bottom-0 bg-[#161a25]/95 backdrop-blur-md p-5 flex flex-col justify-between overflow-y-auto font-sans transition-all duration-300">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#f7e600] uppercase tracking-wider flex items-center gap-1.5">
                      <Settings className="w-4 h-4" />
                      <span>微调爱豆 & 平台选项</span>
                    </h2>
                    <button onClick={() => setIsSettingOpen(false)} className="p-1 text-gray-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Preset Star selector */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gray-400 block uppercase">挑选爱豆预设角色模板</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_IDOLS.map((star) => (
                        <button
                          key={star.id}
                          onClick={() => selectIdolTemplate(star.id)}
                          className={`p-2.5 rounded-lg flex flex-col items-start border text-left text-xs ${
                            selectedPresetId === star.id
                              ? "bg-sky-500/10 border-sky-400 text-white"
                              : "bg-[#282f42]/60 border-white/5 text-gray-300"
                          }`}
                        >
                          <span className="font-semibold">{star.name}</span>
                          <span className="text-[9px] text-gray-400">@{star.group}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => selectIdolTemplate("custom")}
                        className={`col-span-2 p-2 rounded-lg border text-xs flex items-center justify-center gap-1 font-bold ${
                          selectedPresetId === "custom"
                            ? "bg-[#f7e600]/10 border-[#f7e600] text-[#f7e600]"
                            : "bg-[#222836] border-dashed border-white/20 text-gray-300"
                        }`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>自定义专属爱豆</span>
                      </button>
                    </div>
                  </div>

                  {/* Mini Input Controls */}
                  <div className="space-y-3.5 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-gray-400 mb-1">爱豆昵称</label>
                        <input
                          type="text"
                          value={idolName}
                          onChange={(e) => {
                            setIdolName(e.target.value);
                            if (selectedPresetId === "custom") saveCustomIdolConfig(e.target.value, idolGroup, statusMessage, anniversaryDays, idolPersonality, customInstruction, customAvatar);
                          }}
                          className="w-full bg-[#202636] border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 mb-1">所属团体</label>
                        <input
                          type="text"
                          value={idolGroup}
                          onChange={(e) => {
                            setIdolGroup(e.target.value);
                            if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, e.target.value, statusMessage, anniversaryDays, idolPersonality, customInstruction, customAvatar);
                          }}
                          className="w-full bg-[#202636] border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-gray-400 mb-1">个性状态签名</label>
                      <input
                        type="text"
                        value={statusMessage}
                        onChange={(e) => {
                          setStatusMessage(e.target.value);
                          if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, idolGroup, e.target.value, anniversaryDays, idolPersonality, customInstruction, customAvatar);
                        }}
                        className="w-full bg-[#202636] border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-400 mb-1">陪伴相恋天数</label>
                      <input
                        type="number"
                        value={anniversaryDays}
                        onChange={(e) => {
                          setAnniversaryDays(Number(e.target.value));
                          if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, idolGroup, statusMessage, Number(e.target.value), idolPersonality, customInstruction, customAvatar);
                        }}
                        className="w-full bg-[#202636] border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-400 mb-1">爱豆核心性格微调</label>
                      <textarea
                        rows={2}
                        value={idolPersonality}
                        onChange={(e) => {
                          setIdolPersonality(e.target.value);
                          if (selectedPresetId === "custom") saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays, e.target.value, customInstruction, customAvatar);
                        }}
                        className="w-full bg-[#202636] border border-white/10 rounded-lg p-2 text-white outline-none text-[11px]"
                      />
                    </div>

                    {selectedPresetId === "custom" && (
                      <div>
                        <label className="block text-pink-400 mb-1 font-bold">高级 System Prompt (支持指令输入)</label>
                        <textarea
                          rows={3}
                          value={customInstruction}
                          onChange={(e) => {
                            setCustomInstruction(e.target.value);
                            saveCustomIdolConfig(idolName, idolGroup, statusMessage, anniversaryDays, idolPersonality, e.target.value, customAvatar);
                          }}
                          className="w-full bg-[#202636] border border-white/10 rounded-lg p-2 text-white outline-none text-[11px]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Threads note quick picker for mobile devices */}
                  <div className="pt-2">
                    <label className="text-[11px] font-bold text-gray-400 block mb-1">🌠 Threads 碎碎念导入快捷框</label>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {THREADS_TEMPLATES.map((whisper, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInputText(whisper);
                            setIsSettingOpen(false);
                            triggerBriefNotification("碎碎念加载成功");
                          }}
                          className="flex-shrink-0 bg-sky-900/20 border border-sky-800/40 rounded-full px-3 py-1 text-[10px] text-gray-300"
                        >
                          #{whisper.substring(0, 10)}...
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="pt-4 flex gap-2">
                  <button
                    onClick={saveCustomSettings}
                    className="flex-1 py-2 bg-[#f7e600] text-black font-bold rounded-xl text-xs flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    <span>应用修改并关闭</span>
                  </button>
                  <button
                    onClick={() => {
                      setSoundEnabled(!soundEnabled);
                      triggerBriefNotification(soundEnabled ? "音效已停用" : "音效已启用");
                    }}
                    className={`p-2 border rounded-xl text-xs flex items-center justify-center ${
                      soundEnabled ? "bg-[#f7e600]/10 border-[#f7e600] text-yellow-300" : "bg-white/5 border-white/10 text-gray-400"
                    }`}
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* BUBBLE CHAT BODY (SCROLLABLE PORTION) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar z-10 select-text flex flex-col">
              
              {/* Top banner: Welcome banner indicating anniversary */}
              <div className="flex flex-col items-center justify-center py-2 mb-2 select-none">
                <span className="text-[10px] bg-black/25 text-white/70 px-3 py-1 rounded-full text-center tracking-normal font-sans">
                  💕 守护开始的第 {anniversaryDays} 天
                </span>
                <span className="text-[10px] text-white/50 text-center mt-1 font-sans">
                  Bubble 1인권 订阅用户 · 双语自动英汉对齐
                </span>
              </div>

              {/* Chat timeline items */}
              <div className="flex-1 space-y-4 flex flex-col justify-end">
                {messages.map((msg, index) => {
                  const isIdol = msg.sender === "idol";

                  if (isIdol) {
                    return (
                      <div key={msg.id} className="flex items-start gap-2.5 animate-fade-in pr-8">
                        {/* Avatar */}
                        <div className="relative w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10 select-none bg-gradient-to-tr from-[#3b5998] to-[#1da1f2]">
                          {customAvatar ? (
                            <img src={customAvatar} alt="Idol mini Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-tr ${selectedPresetId === 'custom' ? 'from-amber-600 to-rose-600' : PRESET_IDOLS.find(i=>i.id===selectedPresetId)?.avatarColor || 'from-[#3b82f6] to-[#10b981]'} flex items-center justify-center text-white text-[11px] font-extrabold uppercase font-cute`}>
                              {idolName.substring(0, 1)}
                            </div>
                          )}
                        </div>

                        {/* Speech bubble bundle */}
                        <div className="flex flex-col items-start gap-1">
                          {/* Name indicator */}
                          <span className="text-[11px] text-white/60 font-sans tracking-tight ml-0.5 select-none">
                            {idolName}
                          </span>

                          {/* Bubble message balloon */}
                          <div className="flex items-end gap-1.5">
                            {/* The bubble box */}
                            <div className="relative bg-white text-black py-2.5 px-3.5 rounded-r-2xl rounded-bl-2xl rounded-tl-sm shadow-[0_2px_4px_rgba(0,0,0,0.08)] max-w-full">
                              {/* Small triangle shadow caret for real Bubble look */}
                              <div className="absolute top-0 -left-1.5 w-0 h-0 border-t-[8px] border-t-white border-l-[8px] border-l-transparent"></div>
                              
                              {renderBubbleContent(msg.text)}
                            </div>

                            {/* Timestamp */}
                            <span className="text-[9px] text-white/50 font-sans scale-90 origin-bottom-left select-none pb-0.5 whitespace-nowrap">
                              {msg.timestamp}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div key={msg.id} className="flex justify-end items-end gap-1.5 animate-fade-in pl-12 font-sans">
                        
                        {/* Weverse / Bubble unread "1" badge! Highly premium lore detail */}
                        {msg.isUnread && (
                          <span className="text-[10px] text-yellow-300 font-extrabold font-mono select-none pr-1 animate-pulse mb-1">
                            1
                          </span>
                        )}

                        {/* Timestamp */}
                        <span className="text-[9px] text-white/50 scale-90 origin-bottom-right select-none pb-0.5 whitespace-nowrap">
                          {msg.timestamp}
                        </span>

                        {/* User custom speech bubble */}
                        <div className="bg-[#f7e600] text-black py-2 px-3.5 rounded-l-2xl rounded-br-2xl rounded-tr-sm shadow-[0_2px_4px_rgba(0,0,0,0.1)] text-sm font-medium tracking-wide leading-relaxed break-all max-w-[80%]">
                          {msg.text}
                        </div>
                      </div>
                    );
                  }
                })}

                {/* Gemini Model Is Loading typing bubble animation */}
                {isLoading && (
                  <div className="flex items-start gap-2.5 animate-pulse-slow pr-8">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10 select-none bg-gradient-to-tr from-[#3b5998] to-[#1da1f2]">
                      {customAvatar ? (
                        <img src={customAvatar} alt="Idol typed Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-tr ${selectedPresetId === 'custom' ? 'from-amber-600 to-rose-600' : PRESET_IDOLS.find(i=>i.id===selectedPresetId)?.avatarColor || 'from-[#3b82f6] to-[#10b981]'} flex items-center justify-center text-white text-[11px] font-extrabold uppercase font-cute`}>
                          {idolName.substring(0, 1)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[11px] text-white/60 font-mono tracking-tight ml-0.5">
                        {idolName} <span className="text-yellow-400 font-bold">正在输入中...</span>
                      </span>

                      <div className="relative bg-white text-black py-3 px-4 rounded-r-2xl rounded-bl-2xl rounded-tl-sm shadow-md">
                        {/* Caret */}
                        <div className="absolute top-0 -left-1.5 w-0 h-0 border-t-[8px] border-t-white border-l-[8px] border-l-transparent"></div>
                        
                        {/* Beautiful dot bouncing animation */}
                        <div className="flex items-center gap-1.5 py-1 px-1">
                          <div className="w-2 h-2 bg-sky-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 bg-sky-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 bg-sky-600 rounded-full animate-bounce"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

            </div>

            {/* FLOATING QUICK BAR FOR MOBILE: Threads note shortcut on top of input (only on mobile) */}
            <div className="lg:hidden relative z-20 px-3 py-1.5 bg-[#00000045] backdrop-blur-sm border-t border-white/5 flex gap-2 overflow-x-auto no-scrollbar font-sans">
              <span className="text-[10px] text-[#f7e600] font-bold py-1 whitespace-nowrap">✨ 碎碎念库:</span>
              {THREADS_TEMPLATES.slice(0, 5).map((whisper, i) => (
                <button
                  key={i}
                  onClick={() => handleWhisperInsert(whisper)}
                  className="flex-shrink-0 bg-[#2b354e]/85 hover:bg-[#344160] border border-white/5 rounded-full px-2.5 py-0.5 text-[9px] text-[#e2e8f0] font-medium whitespace-nowrap transition-all"
                >
                  #{whisper.substring(0, 12)}...
                </button>
              ))}
            </div>

            {/* CORE CHAT INPUT CONTAINER */}
            <div className="relative z-30 w-full p-3 bg-[#11141aa1] backdrop-blur-md border-t border-white/5 flex flex-col gap-1 bottom-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="w-full flex items-center gap-2"
              >
                {/* Text area input circle */}
                <div className="flex-1 bg-white hover:bg-gray-50 border border-gray-100 rounded-full px-4 py-2 transition-all flex items-center justify-between shadow-inner">
                  <input
                    type="text"
                    value={inputText}
                    maxLength={150}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`发送给 ${idolName} 的独家信息 (Threads 碎碎念)...`}
                    className="w-full bg-transparent border-none text-black outline-none text-xs font-medium placeholder-gray-400 py-0.5"
                  />
                  {inputText.length > 0 && (
                    <span className="text-[9px] bg-red-100 text-red-500 font-extrabold px-1.5 py-0.5 rounded-full scale-90 origin-right transition-all font-sans">
                      {inputText.length}/150
                    </span>
                  )}
                </div>

                {/* Send action arrow */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isLoading}
                  className={`p-2.5 rounded-full transition-all flex items-center justify-center shadow-md ${
                    inputText.trim() && !isLoading
                      ? "bg-[#f7e600] hover:bg-yellow-400 text-black active:scale-[0.9] cursor-pointer"
                      : "bg-[#252a36] text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Little regulatory helper */}
              <div className="flex justify-between items-center px-1 text-[9.5px] text-gray-400 select-none pointer-events-none mt-1">
                <span>Weverse DM · AI Engine Chat Room</span>
                <span className="text-[#f7e600] font-bold">1:1 DM Only</span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* FOOTER HELPER OVERLAY (Only visible when clicking "什么是碎碎念" help guide) */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-sm bg-[#1e2330] border border-white/10 rounded-3xl p-6 text-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#f7e600] flex items-center gap-1.5">
                <HelpCircle className="w-5 h-5 text-yellow-400" />
                <span>什么是 Threads 碎碎念互动？</span>
              </h3>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 font-sans text-xs text-gray-300 leading-relaxed">
              <p>
                <b>1. 日常化表达：</b>Threads (粉丝俗称“脆”) 的发言往往更加富有生活化、意识流，比如今天吃什么、发呆时的牢骚、考砸时的失落等。
              </p>
              <p>
                <b>2. 偶像亲近互补：</b>当粉丝将这些生活琐屑倾诉出来后，爱豆会用同样非常日常生活的小细节和极其温柔的心意来回应。
              </p>
              <p>
                <b>3. 完美还原聊天范：</b>点击左侧（或手机端菜单中）的碎碎念列表可以直接加载预设的粉丝小碎碎念，体验甜度爆裂、完美对齐的韩汉双语互动饭撒！
              </p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full py-2 bg-sky-600 text-white font-bold rounded-xl text-xs hover:bg-sky-500 transition-all"
            >
              我知道啦
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
