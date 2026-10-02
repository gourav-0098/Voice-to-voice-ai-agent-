"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { API_BASE } from "../config";
import VisualizerCanvas, { VisualizerState } from "./components/VisualizerCanvas";
import { ThemeToggle } from "../components/ThemeToggle";
import GroundingSourceDrawer, { GroundingDrawerData } from "./components/GroundingSourceDrawer";
import DebateArenaModal from "./components/DebateArenaModal";
import SettingsPanel from "./components/SettingsPanel";
import { exportConversationTranscript, exportAudioFile } from "./utils/exportUtils";
import { FactCheckHUD, FactCheckData } from "./components/FactCheckHUD";
import { ThinkingLiveStepper, ThinkingAccordion, ThinkingStep } from "./components/ThinkingHUD";

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
  dob?: string;
  bio?: string;
  gender?: string;
  phone?: string;
  location?: string;
  jobTitle?: string;
  preferredLanguage?: string;
  voicePersonaPreference?: string;
  quota?: {
    isAdmin: boolean;
    remainingHourly: number | string;
    remainingDaily: number | string;
    totalHourly: number | string;
    totalDaily: number | string;
  };
}

export interface ToolCallInfo {
  name: string;
  label?: string;
  detail?: string;
  args?: any;
  queryOrUrl?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string | Date;
  model?: string;
  audio?: string;
  toolUsed?: ToolCallInfo | null;
  ragSource?: string | null;
  groundingDetails?: any;
  factCheck?: FactCheckData | null;
  thinkingSteps?: ThinkingStep[];
}

// Gemini & ChatGPT Inspired Tool Usage Helper
const getToolIndicatorMeta = (toolUsed?: ToolCallInfo | null) => {
  if (!toolUsed) return null;
  const name = toolUsed.name || "";
  const detail =
    toolUsed.detail ||
    toolUsed.queryOrUrl ||
    toolUsed.args?.query ||
    toolUsed.args?.location ||
    toolUsed.args?.url ||
    "";

  switch (name) {
    case "web_search":
      return {
        badgeText: "Searched the web",
        detailText: detail ? `"${detail}"` : null,
        icon: "🌐",
      };
    case "get_weather":
      return {
        badgeText: "Checked live weather",
        detailText: detail ? `for ${detail}` : null,
        icon: "🌤️",
      };
    case "scrape_web_page":
      return {
        badgeText: "Browsed webpage",
        detailText: detail ? `"${detail}"` : null,
        icon: "📄",
      };
    case "get_current_time":
      return {
        badgeText: "Checked live clock",
        detailText: null,
        icon: "🕒",
      };
    case "calculate_expression":
      return {
        badgeText: "Calculated result",
        detailText: detail ? `"${detail}"` : null,
        icon: "🧮",
      };
    default:
      return {
        badgeText: "Used tool",
        detailText: null,
        icon: "⚡",
      };
  }
};

const PERSONA_OPTIONS = [
  { id: "conversational", label: "Conversational", desc: "Warm & Natural", icon: "🎙️" },
  { id: "concise", label: "Ultra Concise", desc: "1-sentence direct answers", icon: "⚡" },
  { id: "technical", label: "Tech Specialist", desc: "Architectural & precise", icon: "👨‍💻" },
  { id: "tutor", label: "Patient Tutor", desc: "Analogies & easy explanations", icon: "🎓" },
  { id: "rational", label: "Rationalist", desc: "Fact-checks & objective debate", icon: "⚖️" },
  { id: "andhbhakt", label: "Saffron Debater", desc: "Hyper-nationalist & GraphRAG", icon: "🚩" },
];

export interface VoiceOption {
  id: string;
  label: string;
  desc: string;
  lang: "hi" | "en" | "all";
  provider: "Sarvam Bulbul" | "Deepgram Aura" | "Deepgram Flux" | "Edge Neural" | "Auto Engine";
  gender: "Male" | "Female" | "Dynamic";
  badge: string;
}

const VOICE_OPTIONS: VoiceOption[] = [
  // 🌐 Smart Automatic Voice Routing (Deepgram for English, Sarvam for Hindi/Hinglish)
  {
    id: "auto",
    label: "🌐 Auto-Adaptive (Smart Switch)",
    desc: "English -> Deepgram Flux | Hindi/Hinglish -> Sarvam Bulbul",
    lang: "all",
    provider: "Auto Engine",
    gender: "Dynamic",
    badge: "SMART AUTO",
  },

  // 🇮🇳 Hindi / Hinglish Voices (Sarvam Bulbul SOTA + Edge Neural Backup)
  {
    id: "sarvam-aditya",
    label: "🇮🇳 Sarvam Aditya (Hindi Male 🔥)",
    desc: "SOTA Authentic Indian Inflection & Saffron Debater",
    lang: "hi",
    provider: "Sarvam Bulbul",
    gender: "Male",
    badge: "BULBUL-V3",
  },
  {
    id: "sarvam-shubh",
    label: "🇮🇳 Sarvam Shubh (Hindi Male)",
    desc: "Authoritative & Clear Hindi News Cadence",
    lang: "hi",
    provider: "Sarvam Bulbul",
    gender: "Male",
    badge: "BULBUL-V3",
  },
  {
    id: "sarvam-ashutosh",
    label: "🇮🇳 Sarvam Ashutosh (Hindi Male)",
    desc: "Deep, Confident & Powerful Debate Tone",
    lang: "hi",
    provider: "Sarvam Bulbul",
    gender: "Male",
    badge: "BULBUL-V3",
  },
  {
    id: "sarvam-priya",
    label: "🇮🇳 Sarvam Priya (Hindi Female)",
    desc: "Warm, Friendly & Natural Conversational Hindi",
    lang: "hi",
    provider: "Sarvam Bulbul",
    gender: "Female",
    badge: "BULBUL-V3",
  },
  {
    id: "sarvam-ritu",
    label: "🇮🇳 Sarvam Ritu (Hindi Female)",
    desc: "Expressive & Conversational Hindi Female",
    lang: "hi",
    provider: "Sarvam Bulbul",
    gender: "Female",
    badge: "BULBUL-V3",
  },
  {
    id: "hi-IN-MadhurNeural",
    label: "🇮🇳 Madhur (Edge Neural Male)",
    desc: "Microsoft Edge Neural Hindi Backup (Free)",
    lang: "hi",
    provider: "Edge Neural",
    gender: "Male",
    badge: "EDGE NEURAL",
  },
  {
    id: "hi-IN-SwaraNeural",
    label: "🇮🇳 Swara (Edge Neural Female)",
    desc: "Microsoft Edge Neural Hindi Female (Free)",
    lang: "hi",
    provider: "Edge Neural",
    gender: "Female",
    badge: "EDGE NEURAL",
  },

  // 🇬🇧 English Voices (Deepgram Flux & Aura Models)
  {
    id: "flux-alexis-en",
    label: "Alexis (English)",
    desc: "Expressive & Highly Conversational (Deepgram Flux)",
    lang: "en",
    provider: "Deepgram Flux",
    gender: "Female",
    badge: "DEEPGRAM",
  },
  {
    id: "aura-asteria-en",
    label: "Asteria (English Female)",
    desc: "Warm & Natural Female Voice (Deepgram Aura)",
    lang: "en",
    provider: "Deepgram Aura",
    gender: "Female",
    badge: "DEEPGRAM",
  },
  {
    id: "aura-orion-en",
    label: "Orion (English Male)",
    desc: "Confident English Male Cadence (Deepgram Aura)",
    lang: "en",
    provider: "Deepgram Aura",
    gender: "Male",
    badge: "DEEPGRAM",
  },
  {
    id: "aura-luna-en",
    label: "Luna (English Female)",
    desc: "Gentle, Calm & Natural Female (Deepgram Aura)",
    lang: "en",
    provider: "Deepgram Aura",
    gender: "Female",
    badge: "DEEPGRAM",
  },
  {
    id: "aura-arcas-en",
    label: "Arcas (English Male)",
    desc: "Authoritative & Deep Tone (Deepgram Aura)",
    lang: "en",
    provider: "Deepgram Aura",
    gender: "Male",
    badge: "DEEPGRAM",
  },
];

interface AudioChunkItem {
  audio: HTMLAudioElement;
  text: string;
  index: number;
  format: string;
}

/**
 * Pipelined Audio Stream Queue for Sub-300ms Seamless Voice Playback.
 * Ensures strict in-order sequential playback, zero freezing via playback watchdogs,
 * dynamic format handling (MP3 vs WAV), and smooth audio gap bridging.
 */
class AudioStreamQueue {
  private chunksMap = new Map<number, AudioChunkItem>();
  private nextPlayIndex = 0;
  private isPlaying = false;
  private currentAudio: HTMLAudioElement | null = null;
  private watchdogTimer: any = null;
  private waitMissingTimer: any = null;
  public onStartSpeaking?: () => void;
  public onStopSpeaking?: () => void;
  public onChunkStart?: (chunk: { index: number; text: string }) => void;

  private volume: number = 1.0;

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.currentAudio) {
      try {
        this.currentAudio.volume = this.volume;
      } catch (_) {}
    }
    for (const item of this.chunksMap.values()) {
      try {
        item.audio.volume = this.volume;
      } catch (_) {}
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public reset(startIndex = 0) {
    this.stop();
    this.nextPlayIndex = startIndex;
    this.chunksMap.clear();
  }

  enqueue(base64Audio: string, format: string = "audio/wav", text: string = "", index: number = 0) {
    if (!base64Audio) return;

    try {
      let mime = format;
      if (!mime || mime === "linear16") mime = "audio/wav";
      if (base64Audio.startsWith("//u") || base64Audio.startsWith("/+M") || base64Audio.startsWith("SUQz")) {
        mime = "audio/mp3";
      }

      const audioSrc = `data:${mime};base64,${base64Audio}`;
      const audio = new Audio(audioSrc);
      audio.preload = "auto";
      audio.volume = this.volume;

      this.chunksMap.set(index, { audio, text, index, format: mime });

      if (!this.isPlaying) {
        this.checkAndPlayNext();
      }
    } catch (e) {
      console.warn("Failed to enqueue audio chunk:", e);
    }
  }

  private clearWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private clearWaitMissingTimer() {
    if (this.waitMissingTimer) {
      clearTimeout(this.waitMissingTimer);
      this.waitMissingTimer = null;
    }
  }

  private checkAndPlayNext() {
    this.clearWatchdog();
    this.clearWaitMissingTimer();

    // 1. If exact next expected chunk is present, play immediately
    if (this.chunksMap.has(this.nextPlayIndex)) {
      const nextItem = this.chunksMap.get(this.nextPlayIndex)!;
      this.chunksMap.delete(this.nextPlayIndex);
      this.playChunk(nextItem);
      return;
    }

    // 2. If map has future chunks but current index hasn't arrived
    const availableIndices = Array.from(this.chunksMap.keys()).sort((a, b) => a - b);
    if (availableIndices.length > 0) {
      const lowestIndex = availableIndices[0];
      if (lowestIndex > this.nextPlayIndex) {
        // Wait up to 1.2s for missing chunk, then skip forward to avoid freeze
        this.waitMissingTimer = setTimeout(() => {
          console.warn(`⚠️ [AUDIO QUEUE] Skipped missing chunk #${this.nextPlayIndex} -> jumping to #${lowestIndex}`);
          this.nextPlayIndex = lowestIndex;
          this.checkAndPlayNext();
        }, 1200);
        return;
      }
    }

    // 3. Queue is currently empty or waiting for further chunks
    this.isPlaying = false;
    this.currentAudio = null;
    if (this.onStopSpeaking) this.onStopSpeaking();
  }

  private playChunk(item: AudioChunkItem) {
    this.isPlaying = true;
    item.audio.volume = this.volume;
    this.currentAudio = item.audio;

    if (this.onStartSpeaking) this.onStartSpeaking();
    if (this.onChunkStart) this.onChunkStart({ index: item.index, text: item.text });

    const advance = () => {
      this.clearWatchdog();
      item.audio.onended = null;
      item.audio.onerror = null;
      this.nextPlayIndex++;
      this.checkAndPlayNext();
    };

    item.audio.onended = advance;
    item.audio.onerror = (e) => {
      console.warn(`⚠️ [AUDIO PLAYBACK] Chunk #${item.index} error:`, e);
      advance();
    };

    // Watchdog: If audio stalls, freezes or doesn't fire onended within 12 seconds
    this.watchdogTimer = setTimeout(() => {
      console.warn(`⚠️ [AUDIO WATCHDOG] Chunk #${item.index} timed out, forcing advance`);
      try {
        item.audio.pause();
      } catch (_) {}
      advance();
    }, 12000);

    const playPromise = item.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn(`⚠️ [AUDIO PLAYBACK] Chunk #${item.index} play catch:`, err?.message || err);
        advance();
      });
    }
  }

  stop() {
    this.clearWatchdog();
    this.clearWaitMissingTimer();
    this.chunksMap.clear();

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = "";
      } catch (_) {}
      this.currentAudio = null;
    }
    this.isPlaying = false;
    this.nextPlayIndex = 0;
    if (this.onStopSpeaking) this.onStopSpeaking();
  }
}

export default function VoicePage() {
  const router = useRouter();

  // Modals & Initialization
  const [showStartPopup, setShowStartPopup] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [isSupported, setIsSupported] = useState(true);

  // AI vs AI Debate Arena & Grounding Source Drawer states
  const [isDebateModalOpen, setIsDebateModalOpen] = useState(false);
  const [isGroundingDrawerOpen, setIsGroundingDrawerOpen] = useState(false);
  const [groundingDrawerData, setGroundingDrawerData] = useState<GroundingDrawerData | null>(null);

  // Real-time Truth Meter & Fallacy HUD states
  const [activeFactCheck, setActiveFactCheck] = useState<FactCheckData | null>(null);
  const [isFactCheckHudEnabled, setIsFactCheckHudEnabled] = useState<boolean>(true);

  // Thinking Mode State (Autonomous Multi-Step Cognitive Loop)
  const [isThinkingMode, setIsThinkingMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chatly_thinking_mode") === "true";
    }
    return false;
  });
  const isThinkingModeRef = useRef(isThinkingMode);
  const [currentThinkingSteps, setCurrentThinkingSteps] = useState<ThinkingStep[]>([]);

  // Thinking Level & Dynamic Iteration Depth: "quick" (1-2), "standard" (3-5), "deep" (6-8)
  const [thinkingLevel, setThinkingLevel] = useState<"quick" | "standard" | "deep">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("chatly_thinking_level") as any) || "standard";
    }
    return "standard";
  });
  const thinkingLevelRef = useRef(thinkingLevel);

  useEffect(() => {
    thinkingLevelRef.current = thinkingLevel;
  }, [thinkingLevel]);

  const handleSetThinkingLevel = useCallback((lvl: "quick" | "standard" | "deep") => {
    setThinkingLevel(lvl);
    try {
      localStorage.setItem("chatly_thinking_level", lvl);
    } catch (_) {}
  }, []);

  useEffect(() => {
    isThinkingModeRef.current = isThinkingMode;
  }, [isThinkingMode]);

  const toggleThinkingMode = useCallback(() => {
    setIsThinkingMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("chatly_thinking_mode", String(next));
      } catch (_) {}
      return next;
    });
  }, []);

  // Responsive Drawer & Sidebar states
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  // User & Quota states
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<UserProfile["quota"] | null>(null);

  // Settings & Modes
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = mounted ? resolvedTheme === "dark" : true;
  const [conversationMode, setConversationMode] = useState<"voice-only" | "voice-chat" | "text-only">("voice-chat");
  const [selectedLanguage, setSelectedLanguage] = useState<"all" | "hi" | "en">("all");
  const [selectedVoice, setSelectedVoice] = useState<string>("sarvam-aditya");
  const [selectedPersona, setSelectedPersona] = useState<string>("conversational");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [volume, setVolume] = useState<number>(1.0);
  const volumeRef = useRef<number>(1.0);
  const [handsFree, setHandsFree] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("Chatly Ultra");

  // Recognition & Pipeline states
  const [interimText, setInterimText] = useState("");
  const [finalisedText, setFinalisedText] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [listening, setListening] = useState(false);
  const [pipelineState, setPipelineState] = useState<VisualizerState>("idle");
  const [manualInput, setManualInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Curated Quick Debate & Deep Thinking Starter Prompts
  const QUICK_DEBATE_PROMPTS = useMemo(() => [
    { label: "🧠 GDP Deep Compare", prompt: "Compare India's GDP growth rate with China in 2025 and 2026 and calculate the percentage difference" },
    { label: "🔍 Modi Father Research", prompt: "Who was Narendra Modi's father, what was his date of birth and background?" },
    { label: "🚩 Article 370", prompt: "Explain why Article 370 abrogation was legally justified and constitutional." },
    { label: "📈 Economic Record", prompt: "What is the true economic track record, GDP growth and poverty reduction under Modi?" },
    { label: "⚡ Infrastructure", prompt: "How has Vande Bharat, UPI, and highway expansion transformed India?" },
    { label: "⚖️ Uniform Civil Code", prompt: "Why is Uniform Civil Code necessary under Article 44 for gender equality?" },
  ], []);

  // Conversation history stream
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Web Audio Visualizer & Interruption / Barge-in Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null);
  const [activeAnalyser, setActiveAnalyser] = useState<AnalyserNode | null>(null);
  const bargeInCheckIntervalRef = useRef<number | null>(null);

  // Core recognition & audio refs
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const manuallyStoppedRef = useRef(false);
  const hadErrorRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Streaming Voice & Audio Queue Refs
  const audioQueueRef = useRef<AudioStreamQueue>(new AudioStreamQueue());
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const [lastTtfa, setLastTtfa] = useState<number | null>(null);
  const currentStreamTextRef = useRef<string>("");
  const activeAiMsgIdRef = useRef<string | null>(null);

  // Smart VAD (Voice Activity Detection) Refs
  const noiseFloorRef = useRef<number>(0.012);
  const vadIntervalRef = useRef<any>(null);
  const isVocalizingRef = useRef<boolean>(false);

  const voiceMutedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const isStartedRef = useRef(false);
  const currentUserRef = useRef<UserProfile | null>(null);
  const isAiSpeakingRef = useRef(false);
  const selectedVoiceRef = useRef(selectedVoice);
  const selectedPersonaRef = useRef(selectedPersona);
  const selectedLanguageRef = useRef(selectedLanguage);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  useEffect(() => {
    selectedPersonaRef.current = selectedPersona;
  }, [selectedPersona]);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // User speech accumulation & silence debouncing refs
  const silenceTimeoutRef = useRef<any>(null);
  const currentQueryRef = useRef<string>("");
  const stopListeningRef = useRef<(shouldFlush?: boolean) => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    voiceMutedRef.current = voiceMuted;
  }, [voiceMuted]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    isStartedRef.current = isStarted;
  }, [isStarted]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  // Compute dynamic pipeline state for chips and visualizer
  useEffect(() => {
    if (isAiSpeaking) {
      setPipelineState("speaking");
      setActiveAnalyser(speakerAnalyserRef.current || micAnalyserRef.current);
    } else if (isAiLoading) {
      setPipelineState("synthesizing");
      setActiveAnalyser(null);
    } else if (interimText) {
      setPipelineState("transcribing");
      setActiveAnalyser(micAnalyserRef.current);
    } else if (listening) {
      setPipelineState("listening");
      setActiveAnalyser(micAnalyserRef.current);
    } else {
      setPipelineState("idle");
      setActiveAnalyser(null);
    }
  }, [isAiSpeaking, isAiLoading, interimText, listening]);

  // Audio Stream Queue speaking listeners
  useEffect(() => {
    const queue = audioQueueRef.current;
    queue.onStartSpeaking = () => {
      setIsAiSpeaking(true);
      stopListeningRef.current(false);
    };
    queue.onStopSpeaking = () => {
      setIsAiSpeaking(false);
      if (handsFreeRef.current && isStartedRef.current) {
        setTimeout(() => {
          startListeningRef.current();
        }, 450);
      }
    };
    return () => {
      queue.stop();
    };
  }, []);

  // Preferences synchronization
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("chatly_mode") as any;
      if (savedMode && ["voice-only", "voice-chat", "text-only"].includes(savedMode)) {
        setConversationMode(savedMode);
      }
      const savedLang = localStorage.getItem("chatly_voice_language") as any;
      if (savedLang && ["all", "hi", "en"].includes(savedLang)) {
        setSelectedLanguage(savedLang);
      }
      const savedVoice = localStorage.getItem("chatly_voice");
      if (savedVoice) {
        setSelectedVoice(savedVoice);
      }
      const savedPersona = localStorage.getItem("chatly_persona");
      if (savedPersona) {
        setSelectedPersona(savedPersona);
      }
      const savedVol = localStorage.getItem("chatly_voice_volume");
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed)) {
          const clamped = Math.max(0, Math.min(1, parsed));
          setVolume(clamped);
          volumeRef.current = clamped;
          audioQueueRef.current.setVolume(clamped);
          if (clamped === 0) {
            setVoiceMuted(true);
            voiceMutedRef.current = true;
          }
        }
      }
    }
  }, []);

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const handleLanguageFilterChange = (lang: "all" | "hi" | "en") => {
    setSelectedLanguage(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("chatly_voice_language", lang);
    }
    const matching = VOICE_OPTIONS.filter((v) => lang === "all" || v.lang === lang || v.lang === "all");
    if (!matching.some((v) => v.id === selectedVoice)) {
      const defaultVoiceForLang =
        lang === "hi"
          ? "sarvam-aditya"
          : lang === "en"
          ? "flux-alexis-en"
          : "auto";
      setSelectedVoice(defaultVoiceForLang);
      if (typeof window !== "undefined") {
        localStorage.setItem("chatly_voice", defaultVoiceForLang);
      }
    }
  };

  const filteredVoices = useMemo(() => {
    if (selectedLanguage === "all") return VOICE_OPTIONS;
    return VOICE_OPTIONS.filter((v) => v.lang === selectedLanguage || v.lang === "all");
  }, [selectedLanguage]);

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoice(voiceId);
    selectedVoiceRef.current = voiceId;
    if (typeof window !== "undefined") {
      localStorage.setItem("chatly_voice", voiceId);
    }
  };

  const handlePersonaChange = (personaId: string) => {
    setSelectedPersona(personaId);
    if (typeof window !== "undefined") {
      localStorage.setItem("chatly_persona", personaId);
    }
  };

  const handleModeChange = (mode: "voice-only" | "voice-chat" | "text-only") => {
    setConversationMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("chatly_mode", mode);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    volumeRef.current = clamped;
    if (typeof window !== "undefined") {
      localStorage.setItem("chatly_voice_volume", clamped.toString());
    }

    if (clamped === 0) {
      setVoiceMuted(true);
      voiceMutedRef.current = true;
      audioQueueRef.current.setVolume(0);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.volume = 0;
      }
    } else {
      if (voiceMutedRef.current) {
        setVoiceMuted(false);
        voiceMutedRef.current = false;
      }
      audioQueueRef.current.setVolume(clamped);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.volume = clamped;
      }
    }
  };

  const handleToggleMute = () => {
    if (voiceMuted) {
      const restoreVol = volume > 0 ? volume : 0.8;
      setVoiceMuted(false);
      voiceMutedRef.current = false;
      setVolume(restoreVol);
      volumeRef.current = restoreVol;
      audioQueueRef.current.setVolume(restoreVol);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.volume = restoreVol;
      }
    } else {
      if (isAiSpeaking) stopAiSpeaking();
      setVoiceMuted(true);
      voiceMutedRef.current = true;
      audioQueueRef.current.setVolume(0);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.volume = 0;
      }
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, interimText, isAiLoading]);

  // Load authenticated user, live quota, and persistent conversation history
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("chatly_user");
      const token = localStorage.getItem("chatly_token");

      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          setCurrentUser(parsed);
          if (parsed.quota) setQuota(parsed.quota);
        } catch (_) {}
      }

      if (token) {
        // Fetch User Profile
        fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: "Bearer " + token },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.user) {
              setCurrentUser(data.user);
              if (data.user.quota) setQuota(data.user.quota);
              localStorage.setItem("chatly_user", JSON.stringify(data.user));
            }
          })
          .catch(() => {});

        // Fetch Conversation History
        fetch(`${API_BASE}/api/voice/history`, {
          headers: { Authorization: "Bearer " + token },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.messages && Array.isArray(data.messages)) {
              setMessages(
                data.messages.map((m: any, idx: number) => ({
                  id: `history-${idx}-${Date.now()}`,
                  sender: m.sender || (m.role === "user" ? "user" : "ai"),
                  text: m.text,
                  timestamp: m.timestamp || new Date(),
                  toolUsed: m.toolUsed || null,
                }))
              );
            }
          })
          .catch(() => {});
      }

      // Always fetch live quota status (Logged-in or Guest free tier)
      fetch(`${API_BASE}/api/voice/quota`, {
        headers: token ? { Authorization: "Bearer " + token } : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.quota) {
            setQuota(data.quota);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chatly_token");
      localStorage.removeItem("chatly_user");
    }
    setCurrentUser(null);
    setQuota(null);
    setMessages([]);
  };

  // Check browser speech recognition support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  // Web Audio Context Setup
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Initialize Microphone Web Audio Analyzer
  // Initialize Microphone Web Audio Analyzer & Smart Energy VAD Loop
  const initMicAnalyser = useCallback(
    (stream: MediaStream) => {
      try {
        const audioCtx = getAudioContext();
        if (!audioCtx) return;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        micAnalyserRef.current = analyser;
        setActiveAnalyser(analyser);

        // Smart VAD Loop: Continuously measure RMS and speech frequency band energy
        if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
        const buffer = new Uint8Array(analyser.frequencyBinCount);

        vadIntervalRef.current = setInterval(() => {
          if (isAiSpeakingRef.current || !listeningRef.current) return;

          analyser.getByteTimeDomainData(buffer);
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i++) {
            const norm = (buffer[i] - 128) / 128;
            sumSquares += norm * norm;
          }
          const rms = Math.sqrt(sumSquares / buffer.length);

          // Calibrate background noise floor when quiet
          if (rms < noiseFloorRef.current * 1.5) {
            noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
          }

          // Vocalization threshold for visualizer & barge-in detection
          const isVocalizing = rms > (noiseFloorRef.current * 2.2 + 0.015);
          isVocalizingRef.current = isVocalizing;
        }, 50);
      } catch (err) {
        console.warn("Could not attach mic audio analyzer:", err);
      }
    },
    [getAudioContext]
  );

  // Text-To-Speech Interruption
  const stopAiSpeaking = useCallback(() => {
    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch (_) {}
      activeAbortControllerRef.current = null;
    }
    audioQueueRef.current.stop();
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch (_) {}
      audioPlayerRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
  }, []);

  // Push-To-Talk (Hold Spacebar to speak) & Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        if (!listeningRef.current) {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
          startListeningRef.current?.();
        }
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === "Escape") {
        e.preventDefault();
        stopAiSpeaking();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (listeningRef.current) {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
          stopListeningRef.current?.(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleToggleMute, stopAiSpeaking]);

  const playDeepgramAudio = useCallback(
    (base64Audio: string, format: string = "audio/wav", fallbackText?: string) => {
      // 1. Halt any previous speech
      stopAiSpeaking();

      // 2. Stop listening to prevent laptop speaker audio from echoing back into microphone
      stopListeningRef.current(false);

      if (voiceMutedRef.current) return;

      try {
        const audioSrc = `data:${format};base64,${base64Audio}`;
        const audio = new Audio(audioSrc);
        audio.volume = voiceMutedRef.current ? 0 : volumeRef.current;
        audioPlayerRef.current = audio;

        audio.onplay = () => {
          setIsAiSpeaking(true);
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            try {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: fallbackText ? (fallbackText.length > 45 ? fallbackText.slice(0, 45) + "..." : fallbackText) : "Chatly AI Voice",
                artist: "Chatly Voice AI",
                album: "Voice Assistant",
                artwork: [{ src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" }],
              });
              navigator.mediaSession.setActionHandler("pause", () => {
                stopAiSpeaking();
              });
              navigator.mediaSession.setActionHandler("stop", () => {
                stopAiSpeaking();
              });
            } catch (_) {}
          }
        };

        audio.onended = () => {
          setIsAiSpeaking(false);
          audioPlayerRef.current = null;
          // When AI finishes speaking, auto reopen microphone if Hands-Free is active
          if (handsFreeRef.current && isStartedRef.current) {
            setTimeout(() => {
              startListeningRef.current();
            }, 500);
          }
        };

        audio.onerror = (e) => {
          console.warn("Audio playback error, falling back to speech synthesis:", e);
          setIsAiSpeaking(false);
          audioPlayerRef.current = null;
          if (fallbackText) {
            speakAiResponse(fallbackText);
          }
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("Audio autoplay notice:", err);
            setIsAiSpeaking(false);
            audioPlayerRef.current = null;
            if (fallbackText) {
              speakAiResponse(fallbackText);
            }
          });
        }
      } catch (err) {
        console.error("Failed to initialize audio:", err);
        if (fallbackText) {
          speakAiResponse(fallbackText);
        }
      }
    },
    [stopAiSpeaking]
  );

  const speakAiResponse = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      if (voiceMutedRef.current) return;

      const cleanText = text
        .replace(/[*_#`~>]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .trim();

      if (!cleanText) return;

      stopAiSpeaking();
      stopListeningRef.current(false);

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.volume = voiceMutedRef.current ? 0 : volumeRef.current;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const isHindiScript = /[\u0900-\u097F]/.test(cleanText);
      const voices = window.speechSynthesis.getVoices();
      let selectedBrowserVoice = null;

      if (isHindiScript) {
        selectedBrowserVoice =
          voices.find((v) => v.lang.startsWith("hi") || v.name.includes("Hindi") || v.name.includes("हिन्दी")) ||
          voices.find((v) => v.lang === "hi-IN" || v.lang.startsWith("en-IN") || v.name.includes("India"));
        utterance.lang = "hi-IN";
      } else {
        selectedBrowserVoice =
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Google") ||
                v.name.includes("Natural") ||
                v.name.includes("Samantha") ||
                v.name.includes("Jenny") ||
                v.name.includes("Daniel") ||
                v.name.includes("Zira"))
          ) || voices.find((v) => v.lang.startsWith("en"));
      }

      if (selectedBrowserVoice) {
        utterance.voice = selectedBrowserVoice;
      }

      utterance.onstart = () => {
        setIsAiSpeaking(true);
      };

      utterance.onend = () => {
        setIsAiSpeaking(false);
        if (handsFreeRef.current && isStartedRef.current) {
          setTimeout(() => {
            startListeningRef.current();
          }, 500);
        }
      };

      utterance.onerror = () => {
        setIsAiSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [stopAiSpeaking]
  );

  // Setup microphone stream & Web Audio node with hardware echo cancellation
  const setupAudioProbe = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      initMicAnalyser(stream);
      return true;
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError(
          "Microphone permission was denied. Please allow microphone access in your browser address bar."
        );
      } else {
        setError("Could not access microphone. Please ensure an audio input device is connected.");
      }
      return false;
    }
  };

  // Send speech or text to backend using Real-Time Streaming Pipeline
  const sendVoiceToBackend = async (text: string) => {
    if (!text || !text.trim()) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      reqHeaders["Authorization"] = `Bearer ${token}`;
    }

    // 1. Halt any previous speech & stop listening
    stopAiSpeaking();
    audioQueueRef.current.reset(0);

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const promptText = text.trim();
    setCurrentThinkingSteps([]);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: promptText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsAiLoading(true);

    const aiMsgId = `ai-${Date.now()}`;
    activeAiMsgIdRef.current = aiMsgId;
    currentStreamTextRef.current = "";
    let ragSourceBadge: string | null = null;
    let currentGroundingDetails: any = null;
    let turnAudioBase64: string | null = null;
    let currentFactCheck: FactCheckData | null = null;
    let turnThinkingSteps: ThinkingStep[] | undefined = undefined;
    const startTurnTime = Date.now();

    const appendOrUpdateAiMessage = (
      newText: string,
      ragSource?: string | null,
      groundingDetails?: any,
      audioBase64?: string,
      factCheck?: FactCheckData | null,
      thinkingSteps?: ThinkingStep[]
    ) => {
      if (groundingDetails) currentGroundingDetails = groundingDetails;
      if (audioBase64) turnAudioBase64 = audioBase64;
      if (factCheck) currentFactCheck = factCheck;
      if (thinkingSteps) turnThinkingSteps = thinkingSteps;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === aiMsgId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: aiMsgId,
              sender: "ai",
              text: newText,
              timestamp: new Date(),
              model: activeModel,
              ragSource: ragSource || ragSourceBadge,
              groundingDetails: groundingDetails || currentGroundingDetails,
              audio: audioBase64 || turnAudioBase64 || undefined,
              factCheck: factCheck || currentFactCheck || undefined,
              thinkingSteps: thinkingSteps || turnThinkingSteps || undefined,
            },
          ];
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          text: newText,
          ragSource: ragSource || updated[idx].ragSource || ragSourceBadge,
          groundingDetails: groundingDetails || updated[idx].groundingDetails || currentGroundingDetails,
          audio: audioBase64 || updated[idx].audio || turnAudioBase64 || undefined,
          factCheck: factCheck || updated[idx].factCheck || currentFactCheck || undefined,
          thinkingSteps: thinkingSteps || turnThinkingSteps || updated[idx].thinkingSteps || undefined,
        };
        return updated;
      });
      setAiResponse(newText);
    };

    const handleAudioChunk = (chunk: { audio: string; format: string; text: string; index: number; latencyMs?: number; totalElapsedMs?: number }) => {
      setIsAiLoading(false);
      if (!lastTtfa && chunk.totalElapsedMs) {
        setLastTtfa(chunk.totalElapsedMs);
      }
      audioQueueRef.current.enqueue(chunk.audio, chunk.format || "audio/wav", chunk.text, chunk.index);
    };

    // Prepare recent conversational dialogue history to maintain multi-turn memory
    const historyPayload = (messagesRef.current || messages)
      .filter((m) => m.text && m.text.trim())
      .slice(-8)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        sender: m.sender,
        text: m.text.trim(),
      }));

    // 1. Try WebSocket Duplex Connection (Lowest Latency < 280ms)
    const activeVoice = selectedVoiceRef.current || selectedVoice;
    const activePersona = selectedPersonaRef.current || selectedPersona;
    const activeLanguage = selectedLanguageRef.current || selectedLanguage;

    const ws = voiceWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: "user_speech",
          text: promptText,
          persona: activePersona,
          voiceModel: activeVoice,
          history: historyPayload,
          token,
          thinkingMode: isThinkingModeRef.current,
          thinkingLevel: thinkingLevelRef.current,
        }));
        return;
      } catch (wsErr) {
        console.warn("WebSocket send warning, falling back to SSE stream:", wsErr);
      }
    }

    // 2. Try Server-Sent Events (SSE) Token-to-Audio Streaming Pipeline
    try {
      const response = await fetch(`${API_BASE}/api/voice/stream`, {
        method: "POST",
        headers: reqHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          text: promptText,
          message: promptText,
          voiceModel: activeVoice,
          persona: activePersona,
          language: activeLanguage,
          history: historyPayload,
          thinkingMode: isThinkingModeRef.current,
          thinkingLevel: thinkingLevelRef.current,
        }),
      });

      if (response.status === 429) {
        const errData = await response.json().catch(() => ({}));
        const limitMsg = errData.error || "Rate limit reached. Please wait before making more calls.";
        if (errData?.quota) setQuota(errData.quota);
        setError(limitMsg);
        setAiResponse(limitMsg);
        speakAiResponse(errData?.quota?.isGuest ? "You've reached your free guest limit. Sign up for 30 calls per hour and unlimited daily calls!" : "You have reached your voice call limit.");
        setIsAiLoading(false);
        return;
      }

      if (response.status === 401 && token) {
        setError("Your session has expired. Please sign in again.");
        setShowLoginModal(true);
        setIsAiLoading(false);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Streaming failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() || "";

        for (const rawEv of events) {
          const lines = rawEv.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }

          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "thinking_step") {
              setCurrentThinkingSteps((prev) => {
                const existingIdx = prev.findIndex((s) => s.stepIndex === data.stepIndex);
                if (existingIdx !== -1) {
                  const updated = [...prev];
                  updated[existingIdx] = data;
                  return updated;
                }
                return [...prev, data];
              });
            } else if (eventType === "rag") {
              ragSourceBadge = data.ragSource;
              if (data.groundingDetails) currentGroundingDetails = data.groundingDetails;
              appendOrUpdateAiMessage(currentStreamTextRef.current, ragSourceBadge, currentGroundingDetails);
            } else if (eventType === "factcheck") {
              setActiveFactCheck(data);
              currentFactCheck = data;
              appendOrUpdateAiMessage(currentStreamTextRef.current, ragSourceBadge, currentGroundingDetails, turnAudioBase64 || undefined, data);
            } else if (eventType === "token") {
              currentStreamTextRef.current += data.token;
              appendOrUpdateAiMessage(currentStreamTextRef.current, ragSourceBadge, currentGroundingDetails, turnAudioBase64 || undefined, currentFactCheck);
            } else if (eventType === "audio") {
              handleAudioChunk(data);
              if (data.audio && !turnAudioBase64) {
                turnAudioBase64 = data.audio;
              }
            } else if (eventType === "done") {
              if (data.groundingDetails) currentGroundingDetails = data.groundingDetails;
              if (data.audio) turnAudioBase64 = data.audio;
              if (data.factCheck) {
                setActiveFactCheck(data.factCheck);
                currentFactCheck = data.factCheck;
              }
              const finalSteps = data.thinkingSteps || undefined;
              if (data.reply) {
                appendOrUpdateAiMessage(data.reply, data.ragSource, currentGroundingDetails, turnAudioBase64 || undefined, currentFactCheck, finalSteps);
              } else if (finalSteps) {
                appendOrUpdateAiMessage(currentStreamTextRef.current, data.ragSource, currentGroundingDetails, turnAudioBase64 || undefined, currentFactCheck, finalSteps);
              }
              if (data.firstAudioTimeMs) setLastTtfa(data.firstAudioTimeMs);
              if (data.quota) setQuota(data.quota);
              setIsAiLoading(false);
            }
          } catch (_) {}
        }
      }
    } catch (streamErr: any) {
      if (streamErr?.name === "AbortError") {
        console.log("⏹️ [STREAMING] Voice stream aborted by user interruption");
        setIsAiLoading(false);
        return;
      }
      console.warn("Streaming voice pipeline warning, trying legacy fallback:", streamErr);

      // 3. Fallback to Legacy /api/voice endpoint
      try {
        const legacyRes = await fetch(`${API_BASE}/api/voice`, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify({
            text: promptText,
            message: promptText,
            voiceModel: activeVoice,
            persona: activePersona,
            language: activeLanguage,
            history: historyPayload,
          }),
        });

        if (!legacyRes.ok) throw new Error(`Server returned ${legacyRes.status}`);

        const data = await legacyRes.json();
        const reply = data.reply || "I heard you!";
        if (data.factCheck) {
          setActiveFactCheck(data.factCheck);
          currentFactCheck = data.factCheck;
        }
        appendOrUpdateAiMessage(reply, data.ragSource, data.groundingDetails, data.audio, data.factCheck);
        if (data.quota) setQuota(data.quota);

        if (data.audio) {
          playDeepgramAudio(data.audio, data.audioFormat || "audio/wav", reply);
        } else {
          speakAiResponse(reply);
        }
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || "Failed to process voice turn.");
      } finally {
        setIsAiLoading(false);
      }
    }
  };

  const sendVoiceToBackendRef = useRef(sendVoiceToBackend);
  useEffect(() => {
    sendVoiceToBackendRef.current = sendVoiceToBackend;
  });

  // Start auxiliary MediaRecorder alongside SpeechRecognition for 100% resilient transcription
  const startMediaRecording = useCallback(() => {
    if (!micStreamRef.current || typeof window === "undefined") return;
    try {
      const MR = (window as any).MediaRecorder;
      if (!MR) return;
      recordedAudioChunksRef.current = [];
      const mime = MR.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MR.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MR(micStreamRef.current, { mimeType: mime });
      recorder.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) {
          recordedAudioChunksRef.current.push(e.data);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
    } catch (e) {
      console.warn("Could not start MediaRecorder:", e);
    }
  }, []);

  const stopMediaRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        const chunks = recordedAudioChunksRef.current;
        if (chunks.length > 0) {
          resolve(new Blob(chunks, { type: chunks[0].type || "audio/webm" }));
        } else {
          resolve(null);
        }
        return;
      }
      recorder.onstop = () => {
        const chunks = recordedAudioChunksRef.current;
        if (chunks.length > 0) {
          resolve(new Blob(chunks, { type: chunks[0].type || "audio/webm" }));
        } else {
          resolve(null);
        }
      };
      try {
        recorder.stop();
      } catch (_) {
        resolve(null);
      }
    });
  }, []);

  // Finalize full user query and dispatch to backend
  const finalizeAndSendSpeech = useCallback(async () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    let queryToSend = currentQueryRef.current.trim();
    currentQueryRef.current = "";
    setInterimText("");

    // Stop recognition while waiting for AI response so ambient noises aren't captured
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    // Stop media recording and obtain audio blob
    const audioBlob = await stopMediaRecording();

    // If client Web Speech API missed the audio or produced empty text, use Server-Side Groq Whisper!
    if (!queryToSend && audioBlob && audioBlob.size > 2000) {
      try {
        setPipelineState("transcribing");
        const activeLang = selectedLanguageRef.current;
        const formData = new FormData();
        formData.append("audio", audioBlob, "user_speech.webm");
        formData.append("language", activeLang === "hi" ? "hi" : activeLang === "en" ? "en" : "hi");

        const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text && data.text.trim()) {
            queryToSend = data.text.trim();
            console.log(`🎙️ [SERVER STT] Transcribed via ${data.provider} in ${data.latencyMs}ms: "${queryToSend}"`);
          }
        }
      } catch (sttErr: any) {
        console.warn("Server STT fallback notice:", sttErr.message || sttErr);
      }
    }

    setListening(false);
    listeningRef.current = false;

    if (!queryToSend) return;

    setFinalisedText((prev) => [queryToSend, ...prev]);
    sendVoiceToBackendRef.current(queryToSend);
  }, [stopMediaRecording]);

  // Speech Recognition Initializer with Smart VAD Turn-Taking Cadence
  const createRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      const activeLang = selectedLanguageRef.current;
      recognition.lang =
        activeLang === "hi"
          ? "hi-IN"
          : activeLang === "en"
          ? "en-IN"
          : (typeof navigator !== "undefined" && navigator.language?.startsWith("hi") ? "hi-IN" : "en-IN");
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setListening(true);
        listeningRef.current = true;
        setError(null);
        getAudioContext();
      };

      recognition.onresult = (event: any) => {
        // Ignore any microphone sound while AI is actively speaking aloud
        if (isAiSpeakingRef.current) {
          return;
        }

        let fullFinal = "";
        let currentInterim = "";

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || "";

          if (result.isFinal) {
            fullFinal += transcript + " ";
          } else {
            currentInterim += transcript;
          }
        }

        const combinedText = `${fullFinal} ${currentInterim}`.replace(/\s+/g, " ").trim();
        if (combinedText) {
          currentQueryRef.current = combinedText;
          setInterimText(combinedText);

          // Reset silence timer on every new word or vocal chunk
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }

          // Smart Turn-Taking Tuning:
          // 1. If sentence ends with terminal punctuation (. ? !) or isFinal is true: user finished thought -> 700ms
          // 2. If mid-clause pause: allow user time to think without cutting them off -> 1200ms
          const lastResult = event.results[event.results.length - 1];
          const isTerminal = /[.?!]$/.test(combinedText) || (lastResult && lastResult.isFinal);
          const dynamicSilenceMs = isTerminal ? 700 : 1200;

          silenceTimeoutRef.current = setTimeout(() => {
            finalizeAndSendSpeech();
          }, dynamicSilenceMs);
        }
      };

      recognition.onerror = (event: any) => {
        hadErrorRef.current = true;
        switch (event.error) {
          case "no-speech":
            hadErrorRef.current = false;
            break;
          case "not-allowed":
          case "service-not-allowed":
            setError("Microphone permission denied. Please allow microphone access in your browser settings.");
            setListening(false);
            listeningRef.current = false;
            break;
          case "audio-capture":
            setError("No microphone found. Please connect an audio input device.");
            setListening(false);
            listeningRef.current = false;
            break;
          case "network":
            console.warn("Speech recognition network notice; server STT fallback will handle audio.");
            break;
          default:
            console.warn("Speech recognition notice:", event.error);
            break;
        }
      };

      recognition.onend = () => {
        // If text was collected, trigger finalization now
        if (currentQueryRef.current.trim()) {
          finalizeAndSendSpeech();
          return;
        }

        if (listeningRef.current && !manuallyStoppedRef.current && !hadErrorRef.current) {
          try {
            recognition.start();
            return;
          } catch (_) {}
        }
        setListening(false);
        listeningRef.current = false;
      };

      return recognition;
    } catch (err: any) {
      console.error("Failed to create SpeechRecognition:", err);
      return null;
    }
  }, [getAudioContext, finalizeAndSendSpeech]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAiSpeaking();
      audioQueueRef.current.stop();
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (bargeInCheckIntervalRef.current) {
        window.clearInterval(bargeInCheckIntervalRef.current);
      }
    };
  }, [stopAiSpeaking]);

  // Setup Real-Time Streaming WebSocket & Pipelined Audio Queue Hook
  useEffect(() => {
    // 1. AudioQueue event listeners
    audioQueueRef.current.onStartSpeaking = () => {
      setIsAiSpeaking(true);
      setPipelineState("speaking");
    };

    audioQueueRef.current.onStopSpeaking = () => {
      setIsAiSpeaking(false);
      if (handsFreeRef.current && isStartedRef.current) {
        setTimeout(() => {
          startListeningRef.current();
        }, 400);
      }
    };

    // 2. Establish Voice WebSocket duplex connection
    if (typeof window === "undefined") return;

    let ws: WebSocket | null = null;
    try {
      const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      let host = window.location.hostname + ":5000";
      if (API_BASE && API_BASE.startsWith("http")) {
        host = API_BASE.replace(/^https?:\/\//, "");
      }
      const isVercel = host.includes("vercel.app");
      if (isVercel) {
        console.log("ℹ️ [VOICE PIPELINE] Vercel cloud environment detected; streaming via real-time SSE pipeline.");
        return;
      }

      const wsUrl = `${wsProto}//${host}/ws/voice`;
      ws = new WebSocket(wsUrl);
      voiceWsRef.current = ws;

      ws.onopen = () => {
        console.log("⚡ [FRONTEND WS] Connected to Chatly Voice WebSocket:", wsUrl);
        const token = localStorage.getItem("chatly_token");
        if (token) {
          ws?.send(JSON.stringify({ type: "auth", token }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "rag_grounded") {
            setMessages((prev) => {
              const activeId = activeAiMsgIdRef.current;
              if (!activeId) return prev;
              return prev.map((m) => (m.id === activeId ? { ...m, ragSource: msg.ragSource, groundingDetails: msg.groundingDetails } : m));
            });
          } else if (msg.type === "factcheck") {
            setActiveFactCheck(msg);
            setMessages((prev) => {
              const activeId = activeAiMsgIdRef.current;
              if (!activeId) return prev;
              return prev.map((m) => (m.id === activeId ? { ...m, factCheck: msg } : m));
            });
          } else if (msg.type === "token_delta") {
            currentStreamTextRef.current += msg.token;
            const full = currentStreamTextRef.current;
            setMessages((prev) => {
              const activeId = activeAiMsgIdRef.current;
              if (!activeId) return prev;
              const idx = prev.findIndex((m) => m.id === activeId);
              if (idx === -1) {
                return [
                  ...prev,
                  {
                    id: activeId,
                    sender: "ai",
                    text: full,
                    timestamp: new Date(),
                    model: activeModel,
                  },
                ];
              }
              const updated = [...prev];
              updated[idx] = { ...updated[idx], text: full };
              return updated;
            });
            setAiResponse(full);
          } else if (msg.type === "thinking_step") {
            setCurrentThinkingSteps((prev) => {
              const existingIdx = prev.findIndex((s) => s.stepIndex === msg.stepIndex);
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = msg;
                return updated;
              }
              return [...prev, msg];
            });
          } else if (msg.type === "audio_chunk") {
            setIsAiLoading(false);
            if (!lastTtfa && msg.totalElapsedMs) {
              setLastTtfa(msg.totalElapsedMs);
            }
            audioQueueRef.current.enqueue(msg.audio, msg.format || "audio/wav", msg.text, msg.index);
          } else if (msg.type === "turn_complete") {
            setIsAiLoading(false);
            if (msg.firstAudioTimeMs) {
              setLastTtfa(msg.firstAudioTimeMs);
            }
            if (msg.factCheck) {
              setActiveFactCheck(msg.factCheck);
            }
            if (msg.thinkingSteps) {
              setCurrentThinkingSteps(msg.thinkingSteps);
            }
            setMessages((prev) => {
              const activeId = activeAiMsgIdRef.current;
              if (!activeId) return prev;
              return prev.map((m) =>
                m.id === activeId
                  ? {
                      ...m,
                      factCheck: msg.factCheck || m.factCheck,
                      thinkingSteps: msg.thinkingSteps || m.thinkingSteps,
                    }
                  : m
              );
            });
          }
        } catch (_) {}
      };

      ws.onerror = (err) => {
        console.warn("WebSocket stream fallback to SSE active:", err);
      };
    } catch (err) {
      console.warn("Voice WebSocket init warning:", err);
    }

    return () => {
      if (ws) {
        try {
          ws.close();
        } catch (_) {}
      }
      audioQueueRef.current.stop();
    };
  }, [activeModel]);

  const stopListening = useCallback(
    (shouldFlush: boolean = true) => {
      manuallyStoppedRef.current = true;
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setListening(false);
      listeningRef.current = false;

      if (shouldFlush && currentQueryRef.current.trim()) {
        finalizeAndSendSpeech();
      } else {
        currentQueryRef.current = "";
        setInterimText("");
      }
    },
    [finalizeAndSendSpeech]
  );

  const startListening = useCallback(() => {
    stopAiSpeaking();

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    currentQueryRef.current = "";
    setInterimText("");

    if (!micStreamRef.current) {
      setupAudioProbe().then((ok) => {
        if (ok) startListening();
      });
      return;
    }

    try {
      // 1. Always start MediaRecorder audio stream (for server-side Groq Whisper fallback)
      startMediaRecording();

      // 2. Start browser SpeechRecognition if supported
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      const rec = createRecognition();
      if (rec) {
        recognitionRef.current = rec;
        manuallyStoppedRef.current = false;
        hadErrorRef.current = false;
        try {
          rec.start();
        } catch (recStartErr) {
          console.warn("SpeechRecognition start notice; server STT active:", recStartErr);
          setListening(true);
          listeningRef.current = true;
        }
      } else {
        // Universal fallback for browsers without Web Speech API (Firefox, Brave default)
        setListening(true);
        listeningRef.current = true;
        setError(null);
      }
    } catch (err: any) {
      console.error("Error starting recognition:", err);
      setListening(true);
      listeningRef.current = true;
    }
  }, [stopAiSpeaking, createRecognition, startMediaRecording]);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const toggleListening = () => {
    if (listening) {
      stopListening(true);
    } else {
      startListening();
    }
  };

  const handleStartVoice = async () => {
    const micReady = await setupAudioProbe();
    if (micReady) {
      setShowStartPopup(false);
      setIsStarted(true);
    }
  };

  const clearHistory = async () => {
    setMessages([]);
    setFinalisedText([]);
    setInterimText("");
    setAiResponse("");
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (token) {
      try {
        await fetch(`${API_BASE}/api/voice/history`, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token },
        });
      } catch (_) {}
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const isAdmin = currentUser?.role === "admin";

  // =========================================================
  // SHARED SETTINGS PANEL PROPS
  // =========================================================
  const settingsPanelProps = {
    currentUser,
    quota,
    isAdmin,
    onSignIn: () => setShowLoginModal(true),
    onSignOut: handleLogout,
    conversationMode,
    onModeChange: handleModeChange,
    selectedPersona,
    onPersonaChange: handlePersonaChange,
    selectedLanguage,
    onLanguageChange: handleLanguageFilterChange,
    selectedVoice,
    onVoiceChange: handleVoiceChange,
    filteredVoices,
    voiceMuted,
    volume,
    onToggleMute: handleToggleMute,
    onVolumeChange: handleVolumeChange,
    handsFree,
    onHandsFreeChange: setHandsFree,
    isDark,
    activeModel,
    hasMessages: messages.length > 0,
    onClearHistory: clearHistory,
    onOpenDebateArena: () => setIsDebateModalOpen(true),
    lastTtfa,
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        isDark
          ? "bg-[#07080a] text-white selection:bg-emerald-500 selection:text-white"
          : "bg-slate-50 text-slate-900 selection:bg-emerald-600 selection:text-white"
      }`}
    >
      {/* =====================================================
          LOGIN REQUIRED MODAL
      ===================================================== */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
          <div
            className={`w-full max-w-md rounded-3xl p-8 shadow-2xl relative overflow-hidden border ${
              isDark ? "bg-zinc-950/95 border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

            <div className="mb-6 text-center relative">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-3xl shadow-inner shadow-emerald-500/20">
                🔒
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Sign in to Talk to AI</h2>
              <p className={`mt-3 text-sm leading-6 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                Talking to Chatly Voice AI requires an account. Free accounts get:
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                <div className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-100/70"}`}>
                  <p className="text-xs text-zinc-500">Hourly Limit</p>
                  <p className={`text-sm font-semibold mt-0.5 ${isDark ? "text-white" : "text-slate-900"}`}>5 calls / hr</p>
                </div>
                <div className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-100/70"}`}>
                  <p className="text-xs text-zinc-500">Daily Limit</p>
                  <p className={`text-sm font-semibold mt-0.5 ${isDark ? "text-white" : "text-slate-900"}`}>10 calls / day</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href="/login"
                className={`block w-full text-center rounded-xl py-3.5 font-semibold transition active:scale-[0.98] shadow-lg ${
                  isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                Sign In →
              </Link>
              <Link
                href="/signup"
                className={`block w-full text-center rounded-xl border py-3.5 font-semibold transition ${
                  isDark ? "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                Create Account
              </Link>
            </div>

            <button
              onClick={() => setShowLoginModal(false)}
              className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          SETTINGS DRAWER (LAPTOP, DESKTOP & MOBILE)
      ===================================================== */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Sliding sheet */}
          <div className="fixed inset-y-0 right-0 w-full max-w-md sm:max-w-lg p-5 overflow-hidden border-l border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
            <SettingsPanel
              {...settingsPanelProps}
              onClose={() => setMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* =====================================================
          MAIN STAGE
      ===================================================== */}
      <div className="flex-1 flex flex-col min-h-screen max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
        {/* Streamlined Main Header */}
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4 gap-3 transition-colors">
          {/* Left: Brand */}
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 dark:text-white transition hover:opacity-85"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold text-sm shadow-md shadow-emerald-500/25">
                🎙️
              </span>
              <span>Chatly</span>
              <span className="hidden sm:inline-block text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                Voice AI
              </span>
            </Link>
          </div>

          {/* Center/Right: Pipeline Status + Debate Arena + Theme Toggle + Settings */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Thinking Mode Autonomous Cognitive Agent Toggle */}
            <button
              type="button"
              onClick={toggleThinkingMode}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-xs ${
                isThinkingMode
                  ? "border-purple-500/50 bg-purple-500/15 text-purple-600 dark:text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.25)] ring-1 ring-purple-500/30"
                  : "border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
              title={
                isThinkingMode
                  ? "🧠 Thinking Mode Active: Autonomous 5-step cognitive loop (Planning, Tools, Verification, Critique, Synthesis)"
                  : "⚡ Fast Mode: Ultra-low latency voice streaming (<300ms) for casual banter. Click to switch to Thinking Mode for deep research."
              }
            >
              <span>{isThinkingMode ? "🧠" : "⚡"}</span>
              <span className="hidden sm:inline">{isThinkingMode ? "Thinking Mode" : "Fast Mode"}</span>
            </button>

            {/* AI vs AI Debate Arena Launcher */}
            <button
              type="button"
              onClick={() => setIsDebateModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20 active:scale-95 shadow-xs"
              title="Launch AI vs AI Debate Arena: Saffron Debater vs Rationalist Analyst"
            >
              <span>⚔️</span>
              <span className="hidden sm:inline">Debate Arena</span>
            </button>

            {/* Keyboard Shortcuts Button */}
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white text-xs font-mono transition cursor-pointer active:scale-95"
              title="Keyboard Shortcuts (Space to talk, M to mute, Esc to cancel, ? for help)"
            >
              <span>⌨️</span>
              <span>Hotkeys</span>
            </button>

            {/* Dynamic Status Indicator Chip */}
            <div
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                pipelineState === "listening"
                  ? "border-red-500/50 bg-red-500/15 text-red-500 dark:text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                  : pipelineState === "transcribing"
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                  : pipelineState === "synthesizing"
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-600 dark:text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                  : pipelineState === "speaking"
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  : isDark
                  ? "border-white/10 bg-white/5 text-zinc-300"
                  : "border-slate-200 bg-white text-slate-700 shadow-xs"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  pipelineState === "listening"
                    ? "bg-red-500 animate-ping"
                    : pipelineState === "transcribing"
                    ? "bg-amber-400 animate-pulse"
                    : pipelineState === "synthesizing"
                    ? "bg-sky-400 dark:bg-cyan-400 animate-pulse"
                    : pipelineState === "speaking"
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-emerald-500"
                }`}
              />
              <span className="capitalize">
                {pipelineState === "idle"
                  ? "Ready"
                  : pipelineState === "synthesizing"
                  ? "Thinking..."
                  : pipelineState === "transcribing"
                  ? "Transcribing..."
                  : pipelineState === "speaking"
                  ? "Chatly Speaking"
                  : "Listening..."}
              </span>
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Settings Button (Laptop, Desktop & Mobile) */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open settings dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer transition border-slate-200 bg-white text-slate-800 hover:bg-slate-100 shadow-xs dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 text-xs font-semibold active:scale-95"
            >
              <span className="text-sm">⚙️</span>
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </header>

        {/* ERROR ALERT */}
        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-red-500 dark:text-red-400">Notice</p>
                  <p className="mt-0.5 text-xs leading-5 text-red-700 dark:text-red-200/90">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs text-slate-500 dark:text-zinc-400 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* =====================================================
            STAGE: VOICE ONLY & SPLIT MODES (ORB VISUALIZER)
        ===================================================== */}
        {conversationMode !== "text-only" && (
          <div className="flex flex-col items-center justify-center py-6 sm:py-8">
            {/* Status Instruction */}
            <p
              className={`mb-4 text-xs sm:text-sm font-medium tracking-wide transition-colors ${
                pipelineState === "listening"
                  ? "text-red-500 dark:text-red-400"
                  : pipelineState === "transcribing"
                  ? "text-amber-600 dark:text-amber-400"
                  : pipelineState === "speaking"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : pipelineState === "synthesizing"
                  ? "text-sky-600 dark:text-cyan-400"
                  : isDark
                  ? "text-zinc-400"
                  : "text-slate-600"
              }`}
            >
              {pipelineState === "listening"
                ? "🎙️ Listening... (Barge-in active: speak anytime to interrupt)"
                : pipelineState === "speaking"
                ? "🔊 Chatly is speaking (Click Interrupt to cut in)"
                : pipelineState === "synthesizing"
                ? "✨ Chatly is thinking..."
                : pipelineState === "transcribing"
                ? "⚡ Transcribing..."
                : "Click the microphone button or start speaking"}
            </p>

            {/* AUDIO REACTIVE CANVAS + ORB CONTAINER */}
            <div className="relative mb-6 flex items-center justify-center" style={{ width: 280, height: 280 }}>
              {/* Web Audio API Analyser Reactive Canvas */}
              <VisualizerCanvas
                state={pipelineState}
                analyserNode={activeAnalyser}
                isDark={isDark}
                size={280}
                personaMode={selectedPersona}
              />

              {/* Central Glowing Core Orb */}
              <div
                className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-2xl ${
                  pipelineState === "listening"
                    ? "w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-red-600 to-rose-400 shadow-red-500/50 scale-105"
                    : pipelineState === "speaking"
                    ? (selectedPersona === "andhbhakt" || selectedPersona === "saffron")
                      ? "w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-amber-600 via-orange-500 to-amber-400 shadow-amber-500/60 scale-105 animate-pulse"
                      : selectedPersona === "secular"
                      ? "w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 shadow-cyan-500/60 scale-105 animate-pulse"
                      : "w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-500/50 scale-105 animate-pulse"
                    : pipelineState === "synthesizing"
                    ? (selectedPersona === "andhbhakt" || selectedPersona === "saffron")
                      ? "w-22 h-22 sm:w-26 sm:h-26 bg-gradient-to-tr from-orange-600 to-amber-500 shadow-orange-500/40 animate-pulse"
                      : "w-22 h-22 sm:w-26 sm:h-26 bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-cyan-500/40 animate-pulse"
                    : pipelineState === "transcribing"
                    ? "w-22 h-22 sm:w-26 sm:h-26 bg-gradient-to-tr from-amber-600 to-yellow-500 shadow-amber-500/40"
                    : (selectedPersona === "andhbhakt" || selectedPersona === "saffron")
                    ? "w-22 h-22 sm:w-26 sm:h-26 bg-amber-500/10 border border-amber-500/30 text-amber-500"
                    : isDark
                    ? "w-22 h-22 sm:w-26 sm:h-26 bg-white/5 border border-white/10"
                    : "w-22 h-22 sm:w-26 sm:h-26 bg-white border border-slate-200 shadow-lg"
                }`}
              >
                <span className="text-3xl sm:text-4xl select-none">
                  {pipelineState === "listening"
                    ? "🔴"
                    : pipelineState === "speaking"
                    ? (selectedPersona === "andhbhakt" || selectedPersona === "saffron")
                      ? "🦁"
                      : "🔊"
                    : pipelineState === "synthesizing"
                    ? "✨"
                    : pipelineState === "transcribing"
                    ? "⚡"
                    : (selectedPersona === "andhbhakt" || selectedPersona === "saffron")
                    ? "🚩"
                    : "🎙️"}
                </span>
              </div>
            </div>

            {/* Quick Debate Starter Chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-2xl px-3 mb-5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-wider mr-1">
                Quick Topics:
              </span>
              {QUICK_DEBATE_PROMPTS.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    sendVoiceToBackend(item.prompt);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer font-medium active:scale-95 shadow-xs border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white dark:hover:border-white/20"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Real-Time Fact-Check HUD & Truth Meter */}
            {isFactCheckHudEnabled && activeFactCheck && (
              <div className="w-full max-w-xl px-2 mb-3">
                <FactCheckHUD
                  data={activeFactCheck}
                  onClose={() => setActiveFactCheck(null)}
                />
              </div>
            )}

            {/* CONTROLS (Speak, Stop, Interrupt) */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto px-4 sm:px-0">
              <button
                type="button"
                disabled={!isStarted}
                onClick={() => {
                  toggleListening();
                }}
                className={`w-full sm:w-auto touch-manipulation select-none rounded-2xl sm:rounded-full px-8 py-3.5 font-semibold text-sm sm:text-base transition-all duration-150 cursor-pointer active:scale-95 text-center ${
                  !isStarted
                    ? "cursor-not-allowed opacity-50 border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-600"
                    : listening
                    ? "border border-red-500 bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.45)] hover:bg-red-700"
                    : isDark
                    ? "border border-white/20 bg-white text-black hover:bg-zinc-200 shadow-md"
                    : "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                }`}
              >
                <span className="flex items-center justify-center gap-2.5">
                  <span className="text-base sm:text-lg">
                    {listening ? "⏹️" : "🎙️"}
                  </span>
                  <span>
                    {listening
                      ? "Click to Stop Talking"
                      : "Click to Speak"}
                  </span>
                </span>
              </button>

              {isAiSpeaking && (
                <button
                  type="button"
                  onClick={stopAiSpeaking}
                  className="w-full sm:w-auto cursor-pointer rounded-2xl sm:rounded-full border border-red-500/40 bg-red-500/10 px-6 py-3.5 text-xs sm:text-sm font-semibold text-red-500 dark:text-red-400 transition hover:bg-red-500/20 active:scale-95 text-center"
                >
                  ⏹️ Interrupt AI (Barge-in)
                </button>
              )}
            </div>

            {/* Quick Volume Control Bar */}
            <div className="mt-4 flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] backdrop-blur-md shadow-xs">
              <button
                type="button"
                onClick={handleToggleMute}
                className="text-sm cursor-pointer hover:scale-110 active:scale-95 transition"
                title={voiceMuted ? "Unmute AI Voice" : "Mute AI Voice"}
              >
                {voiceMuted || volume === 0 ? "🔇" : volume < 0.35 ? "🔈" : volume < 0.75 ? "🔉" : "🔊"}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={voiceMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 sm:w-28 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                aria-label="Quick volume control"
              />
              <span className="text-[11px] font-mono font-medium text-slate-600 dark:text-zinc-400 w-8 text-right">
                {Math.round((voiceMuted ? 0 : volume) * 100)}%
              </span>
            </div>

            {/* Subtitles pill in Voice-Only mode */}
            {conversationMode === "voice-only" && (interimText || aiResponse) && (
              <div className="mt-6 w-full max-w-lg px-4 text-center">
                <div className="rounded-2xl p-4 border backdrop-blur-md shadow-lg transition bg-white border-slate-200 dark:bg-white/[0.04] dark:border-white/10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                    {interimText ? "You Spoke" : "Chatly AI"}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-zinc-200">
                    {interimText || aiResponse}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================
            CONVERSATION HISTORY & CHAT PANEL
        ===================================================== */}
        {conversationMode !== "voice-only" && (
          <div className="flex-1 flex flex-col mt-4 max-w-3xl w-full mx-auto">
            {/* Transcript Header with Clear History & Export Options */}
            <div className="flex flex-wrap items-center justify-between px-2 mb-3 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                  Conversation Transcript ({messages.length})
                </span>
                {isAiSpeaking && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                    Speaking...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {messages.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => exportConversationTranscript(messages)}
                      title="Download conversation transcript as formatted text file"
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/10 dark:text-zinc-300"
                    >
                      📄 Export
                    </button>
                    {messages.some((m) => !!m.audio) && (
                      <button
                        type="button"
                        onClick={() => {
                          const lastAudioMsg = [...messages].reverse().find((m) => !!m.audio);
                          if (lastAudioMsg && lastAudioMsg.audio) {
                            exportAudioFile(lastAudioMsg.audio, "wav", "chatly-ai-response.wav");
                          }
                        }}
                        title="Download latest AI audio response as WAV file"
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      >
                        🎵 Audio
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="text-xs text-slate-500 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition cursor-pointer ml-1"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Real-time Fact-Check & Truth Meter HUD in Transcript */}
            {isFactCheckHudEnabled && activeFactCheck && (
              <div className="px-1 mb-3">
                <FactCheckHUD
                  data={activeFactCheck}
                  onClose={() => setActiveFactCheck(null)}
                />
              </div>
            )}

            {/* Scrollable Message Feed */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto rounded-3xl border p-4 sm:p-6 space-y-4 max-h-[420px] transition-colors border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none"
            >
              {messages.length === 0 && !isAiLoading && (
                <div className="py-12 text-center">
                  <p className="text-3xl mb-2">💬</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                    No messages yet.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
                    Press the microphone button or type below to begin.
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in duration-200`}
                  >
                    {/* Speaker & Timestamp header */}
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                        {isUser ? currentUser?.name || "You" : "Chatly AI"}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">{timeString}</span>
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition ${
                        isUser
                          ? isDark
                            ? "bg-emerald-600/30 border border-emerald-500/40 text-emerald-100 rounded-tr-none shadow-sm"
                            : "bg-emerald-600 text-white rounded-tr-none shadow-sm"
                          : isDark
                          ? "bg-white/[0.05] border border-white/10 text-zinc-200 rounded-tl-none shadow-sm"
                          : "bg-slate-100/90 border border-slate-200 text-slate-800 rounded-tl-none shadow-xs"
                      }`}
                    >
                      {/* Clickable RAG Grounding Indicator Drawer Trigger */}
                      {msg.ragSource && (
                        <button
                          type="button"
                          onClick={() => {
                            setGroundingDrawerData({
                              ragSource: msg.ragSource!,
                              groundingDetails: msg.groundingDetails,
                              messageText: msg.text,
                            });
                            setIsGroundingDrawerOpen(true);
                          }}
                          title="Click to view verified knowledge graph sources, matched topic & counter-arguments"
                          className={`mb-2.5 mr-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition-all shadow-xs cursor-pointer hover:scale-105 active:scale-95 group/badge ${
                            msg.ragSource.includes("political_debate_rag")
                              ? isDark
                                ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 ring-1 ring-amber-500/20"
                                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              : msg.ragSource.includes("fact_checks_rag")
                              ? isDark
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 ring-1 ring-emerald-500/20"
                                : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                              : isDark
                              ? "border-purple-500/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25"
                              : "border-purple-300 bg-purple-50 text-purple-900 hover:bg-purple-100"
                          }`}
                        >
                          <span className="text-sm select-none">
                            {msg.ragSource.includes("political_debate_rag")
                              ? "🚩"
                              : msg.ragSource.includes("fact_checks_rag")
                              ? "⚖️"
                              : "🧠"}
                          </span>
                          <span className="font-semibold">
                            {msg.ragSource.includes("political_debate_rag")
                              ? "Debate GraphRAG Grounded"
                              : msg.ragSource.includes("fact_checks_rag")
                              ? "Fact-Check Grounded"
                              : "Knowledge Grounded"}
                          </span>
                          <span className="text-[10px] opacity-70 group-hover/badge:opacity-100 underline decoration-dotted ml-0.5">
                            🔍 View Sources
                          </span>
                        </button>
                      )}

                      {/* Gemini / ChatGPT Style Tool Usage Indicator */}
                      {msg.toolUsed && (() => {
                        const meta = getToolIndicatorMeta(msg.toolUsed);
                        if (!meta) return null;
                        return (
                          <div
                            className={`mb-2.5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition-all shadow-xs ${
                              isDark
                                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                                : "border-sky-300 bg-sky-50 text-sky-900"
                            }`}
                          >
                            <span className="text-sm select-none">{meta.icon}</span>
                            <span className="font-semibold">{meta.badgeText}</span>
                            {meta.detailText && (
                              <>
                                <span className="opacity-40">•</span>
                                <span className="font-normal opacity-90 truncate max-w-[200px] sm:max-w-[280px]">
                                  {meta.detailText}
                                </span>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {/* Live Truth Meter & Fallacy Tag on Message */}
                      {msg.factCheck && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFactCheck(msg.factCheck!);
                            setIsFactCheckHudEnabled(true);
                          }}
                          title="Click to view full Truth Meter audit and fallacy breakdown in HUD"
                          className={`mb-2.5 mr-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                            (msg.factCheck.credibilityScore ?? 70) >= 80
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : (msg.factCheck.credibilityScore ?? 70) >= 50
                              ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          <span>{(msg.factCheck.credibilityScore ?? 70) >= 80 ? "✓" : (msg.factCheck.credibilityScore ?? 70) >= 50 ? "⚖️" : "⚠️"}</span>
                          <span>Truth: {Math.round(msg.factCheck.credibilityScore ?? 70)}%</span>
                          {msg.factCheck.fallaciesDetected && msg.factCheck.fallaciesDetected.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300 text-[10px]">
                              {msg.factCheck.fallaciesDetected.length} fallacy
                            </span>
                          )}
                        </button>
                      )}

                      {/* Thinking Mode Autonomous Cognitive Reasoning Accordion */}
                      {msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                        <div className="mb-2.5">
                          <ThinkingAccordion steps={msg.thinkingSteps} />
                        </div>
                      )}

                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Quick Actions (Copy & Replay) */}
                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-white/10 flex items-center gap-2 transition">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(msg.text, msg.id)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer flex items-center gap-1 font-medium"
                        >
                          {copiedId === msg.id ? "✓ Copied!" : "📋 Copy"}
                        </button>

                        {!isUser && (
                          <button
                            type="button"
                            onClick={() => {
                              if (msg.audio) {
                                playDeepgramAudio(msg.audio, "audio/wav", msg.text);
                              } else {
                                speakAiResponse(msg.text);
                              }
                            }}
                            className="text-[10px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition cursor-pointer flex items-center gap-1 ml-2 font-medium"
                          >
                            ▶ Replay Voice
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Thinking Live Stepper (Multi-Step Autonomous Loop) */}
              {isAiLoading && currentThinkingSteps.length > 0 && (
                <div className="w-full">
                  <ThinkingLiveStepper steps={currentThinkingSteps} />
                </div>
              )}

              {/* Gemini / ChatGPT Style Live Tool & Thinking Indicator */}
              {isAiLoading && currentThinkingSteps.length === 0 && (
                <div className="flex flex-col items-start animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-sky-600 dark:text-cyan-400">Chatly AI</span>
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-cyan-400 animate-ping" />
                      Consulting tools & synthesizing...
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl rounded-tl-none border shadow-xs bg-sky-50 border-sky-200 text-sky-900 dark:bg-white/[0.04] dark:border-white/10 dark:text-cyan-300">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 dark:bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500 dark:bg-cyan-500"></span>
                    </span>
                    <span className="text-xs font-medium">Running live tool</span>
                    <div className="flex items-center gap-1 ml-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-cyan-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-cyan-400 animate-bounce" />
                    </div>
                  </div>
                </div>
              )}

              {/* Interim Realtime Transcript */}
              {interimText && (
                <div className="flex flex-col items-end opacity-75">
                  <span className="text-[10px] text-red-500 dark:text-red-400 mb-1">Transcribing live...</span>
                  <div className="rounded-2xl rounded-tr-none border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-700 dark:text-red-200 italic">
                    {interimText}
                  </div>
                </div>
              )}
            </div>

            {/* MANUAL TEXT INPUT BAR WITH MODE SELECTION & DYNAMIC ITERATION LEVEL */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualInput.trim()) return;
                const textToSend = manualInput.trim();
                setManualInput("");
                sendVoiceToBackend(textToSend);
              }}
              className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-2xl border p-2 backdrop-blur-sm transition border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:focus-within:border-white/30 dark:shadow-none"
            >
              {/* Mode Selection Button (Beside Text Input Field) */}
              <div className="flex items-center gap-1.5 shrink-0 px-1">
                <button
                  type="button"
                  onClick={toggleThinkingMode}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer select-none border active:scale-95 ${
                    isThinkingMode
                      ? "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)]"
                      : "border-slate-300 dark:border-white/10 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-zinc-300 dark:hover:bg-white/10"
                  }`}
                  title={isThinkingMode ? "Thinking Mode active (Click to switch to Fast Mode)" : "Fast Mode active (Click to switch to Thinking Mode)"}
                >
                  <span>{isThinkingMode ? "🧠" : "⚡"}</span>
                  <span className="font-medium">{isThinkingMode ? "Thinking" : "Fast"}</span>
                </button>

                {/* Dynamic Iteration Level Selector — ONLY displays when Thinking Mode is selected */}
                {isThinkingMode && (
                  <div className="inline-flex items-center rounded-xl p-0.5 border border-purple-500/30 bg-purple-500/10 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => handleSetThinkingLevel("quick")}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        thinkingLevel === "quick"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-purple-700 dark:text-purple-300 hover:bg-purple-500/20"
                      }`}
                      title="Quick Thinking: 1-2 research iterations (~1.5s)"
                    >
                      Quick
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetThinkingLevel("standard")}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        thinkingLevel === "standard"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-purple-700 dark:text-purple-300 hover:bg-purple-500/20"
                      }`}
                      title="Standard Thinking: 3-4 deep research iterations (~3-5s)"
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetThinkingLevel("deep")}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        thinkingLevel === "deep"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-purple-700 dark:text-purple-300 hover:bg-purple-500/20"
                      }`}
                      title="Deep Thinking: 6-8 comprehensive iterations with gap audit & multi-critique"
                    >
                      Deep
                    </button>
                  </div>
                )}
              </div>

              {/* Text Input Field */}
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder={
                  isThinkingMode
                    ? `Ask anything (Thinking: ${thinkingLevel.toUpperCase()} iterations)...`
                    : "Ask or chat with Chatly..."
                }
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!manualInput.trim() || isAiLoading}
                className="cursor-pointer shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Send →
              </button>
            </form>
          </div>
        )}

        {/* FOOTER */}
        <footer className="mt-auto pt-6 text-center text-xs text-slate-500 dark:text-zinc-500">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span>Model: {activeModel}</span>
            <span>•</span>
            <span>Voice: {selectedVoice.replace("aura-", "").replace("-en", "")}</span>
            <span>•</span>
            <span>Mode: {conversationMode}</span>
            <span>•</span>
            <span>Loop: {handsFree ? "Continuous" : "Push-to-Talk"}</span>
          </div>
        </footer>
      </div>

      {/* Clickable Grounding Source Sliding Drawer */}
      <GroundingSourceDrawer
        isOpen={isGroundingDrawerOpen}
        onClose={() => setIsGroundingDrawerOpen(false)}
        data={groundingDrawerData}
        isDark={isDark}
      />

      {/* AI vs AI Debate Arena Modal */}
      <DebateArenaModal
        isOpen={isDebateModalOpen}
        onClose={() => setIsDebateModalOpen(false)}
        isDark={isDark}
        onOpenGroundingDrawer={(d) => {
          setGroundingDrawerData(d);
          setIsGroundingDrawerOpen(true);
        }}
      />

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">⌨️</span>
                <h3 className="font-bold text-base">Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-zinc-300">Push-to-Talk (Hold to speak)</span>
                <kbd className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-xs font-mono font-semibold">Space</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-zinc-300">Mute / Unmute AI Voice</span>
                <kbd className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-xs font-mono font-semibold">M</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-zinc-300">Interrupt AI (Barge-in)</span>
                <kbd className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-xs font-mono font-semibold">Esc</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-600 dark:text-zinc-300">Toggle Shortcuts Cheat-sheet</span>
                <kbd className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-xs font-mono font-semibold">?</kbd>
              </div>
            </div>
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="w-full py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
