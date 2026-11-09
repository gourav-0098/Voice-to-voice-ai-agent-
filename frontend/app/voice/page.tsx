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

  // Exactly 2 Explicit Operating Modes: FAST, SEARCH
  const [operatingMode, setOperatingMode] = useState<"FAST" | "SEARCH">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chatly_operating_mode");
      if (saved === "FAST" || saved === "SEARCH") return saved as any;
      if (saved === "THINKING") return "SEARCH";
      const legacy = localStorage.getItem("chatly_thinking_mode");
      if (legacy === "true") return "SEARCH";
    }
    return "FAST";
  });
  const operatingModeRef = useRef<"FAST" | "SEARCH">(operatingMode);

  // Global Effort Control shared by both modes: LOW, MEDIUM, HIGH, MAX
  const [effortLevel, setEffortLevel] = useState<"LOW" | "MEDIUM" | "HIGH" | "MAX">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chatly_effort_level");
      if (saved === "LOW" || saved === "MEDIUM" || saved === "HIGH" || saved === "MAX") return saved as any;
    }
    return "MEDIUM";
  });
  const effortLevelRef = useRef<"LOW" | "MEDIUM" | "HIGH" | "MAX">(effortLevel);

  const [currentThinkingSteps, setCurrentThinkingSteps] = useState<ThinkingStep[]>([]);
  const [showEffortPopover, setShowEffortPopover] = useState<boolean>(false);

  const isThinkingMode = operatingMode === "SEARCH";
  const isThinkingModeRef = useRef<boolean>(isThinkingMode);

  useEffect(() => {
    operatingModeRef.current = operatingMode;
    isThinkingModeRef.current = operatingMode === "SEARCH";
  }, [operatingMode]);

  useEffect(() => {
    effortLevelRef.current = effortLevel;
  }, [effortLevel]);

  const handleSetOperatingMode = useCallback((m: "FAST" | "SEARCH") => {
    setOperatingMode(m);
    try {
      localStorage.setItem("chatly_operating_mode", m);
      localStorage.setItem("chatly_thinking_mode", String(m === "SEARCH"));
    } catch (_) {}
  }, []);

  const handleSetEffortLevel = useCallback((e: "LOW" | "MEDIUM" | "HIGH" | "MAX") => {
    setEffortLevel(e);
    try {
      localStorage.setItem("chatly_effort_level", e);
    } catch (_) {}
  }, []);

  const cycleOperatingMode = useCallback(() => {
    setOperatingMode((prev) => {
      const next: "FAST" | "SEARCH" = prev === "FAST" ? "SEARCH" : "FAST";
      try {
        localStorage.setItem("chatly_operating_mode", next);
        localStorage.setItem("chatly_thinking_mode", String(next === "SEARCH"));
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
          mode: operatingModeRef.current,
          effort: effortLevelRef.current,
          thinkingMode: operatingModeRef.current === "SEARCH",
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
          mode: operatingModeRef.current,
          effort: effortLevelRef.current,
          thinkingMode: operatingModeRef.current === "SEARCH",
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
            } else if (eventType === "error") {
              setError(data.message || data.error || "An error occurred.");
              setIsAiLoading(false);
            }
          } catch (_) {}
        }
      }
      setIsAiLoading(false);
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
          } else if (msg.type === "turn_complete" || msg.type === "done") {
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
            const completeText = msg.reply || msg.fullText;
            if (completeText) {
              setAiResponse(completeText);
            }
            setMessages((prev) => {
              const activeId = activeAiMsgIdRef.current;
              if (!activeId) return prev;
              return prev.map((m) =>
                m.id === activeId
                  ? {
                      ...m,
                      text: completeText || m.text,
                      factCheck: msg.factCheck || m.factCheck,
                      thinkingSteps: msg.thinkingSteps || m.thinkingSteps,
                    }
                  : m
              );
            });
          } else if (msg.type === "error") {
            setIsAiLoading(false);
            setError(msg.message || msg.error || "An error occurred.");
          }
        } catch (_) {}
      };

      ws.onerror = (err) => {
        setIsAiLoading(false);
        console.warn("WebSocket stream fallback to SSE active:", err);
      };

      ws.onclose = () => {
        setIsAiLoading(false);
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

  // =========================================================
  // UI-ONLY DERIVED VALUES (no backend or pipeline impact)
  // =========================================================
  const isSplitView = conversationMode === "voice-chat";
  const activeVoiceMeta = VOICE_OPTIONS.find((v) => v.id === selectedVoice) || VOICE_OPTIONS[0];
  const activePersonaMeta = PERSONA_OPTIONS.find((p) => p.id === selectedPersona) || PERSONA_OPTIONS[0];
  const isSaffronPersona = selectedPersona === "andhbhakt" || selectedPersona === "saffron";

  const PIPELINE_UI: Record<
    VisualizerState,
    { label: string; color: string; chip: string; headline: string; hint: string }
  > = {
    idle: {
      label: "Ready",
      color: "bg-emerald-500",
      chip: "border-slate-200 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
      headline: "Ready when you are",
      hint: "Tap the mic or hold Space to start talking.",
    },
    listening: {
      label: "Listening",
      color: "bg-rose-500",
      chip: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
      headline: "I'm listening…",
      hint: "Speak naturally — I'll answer when you pause. Barge-in is always on.",
    },
    transcribing: {
      label: "Transcribing",
      color: "bg-amber-400",
      chip: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
      headline: "Catching that…",
      hint: "Converting your voice into text.",
    },
    synthesizing: {
      label: "Thinking",
      color: "bg-sky-400",
      chip: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
      headline: "Thinking it through…",
      hint: "Searching, reasoning and preparing your answer.",
    },
    speaking: {
      label: "Speaking",
      color: "bg-emerald-400",
      chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      headline: "Chatly is speaking",
      hint: "Jump in anytime — just start talking to interrupt.",
    },
  };
  const pipelineUi = PIPELINE_UI[pipelineState];

  const orbTheme =
    pipelineState === "listening"
      ? {
          gradient: "from-rose-500 via-red-500 to-orange-500",
          glow: "shadow-[0_0_90px_-12px_rgba(244,63,94,0.75)]",
        }
      : pipelineState === "speaking"
      ? isSaffronPersona
        ? { gradient: "from-amber-500 via-orange-500 to-rose-500", glow: "shadow-[0_0_90px_-12px_rgba(245,158,11,0.75)]" }
        : { gradient: "from-emerald-500 via-teal-400 to-cyan-400", glow: "shadow-[0_0_90px_-12px_rgba(16,185,129,0.75)]" }
      : pipelineState === "synthesizing"
      ? { gradient: "from-sky-500 via-cyan-400 to-blue-500", glow: "shadow-[0_0_80px_-14px_rgba(14,165,233,0.7)]" }
      : pipelineState === "transcribing"
      ? { gradient: "from-amber-500 via-yellow-400 to-orange-400", glow: "shadow-[0_0_80px_-14px_rgba(245,158,11,0.7)]" }
      : isSaffronPersona
      ? { gradient: "from-amber-500/80 via-orange-500/70 to-rose-500/60", glow: "shadow-[0_0_60px_-18px_rgba(245,158,11,0.55)]" }
      : { gradient: "from-emerald-500/90 via-teal-400/80 to-cyan-400/70", glow: "shadow-[0_0_60px_-18px_rgba(16,185,129,0.55)]" };

  const orbEmoji =
    pipelineState === "listening"
      ? "🔴"
      : pipelineState === "speaking"
      ? isSaffronPersona
        ? "🦁"
        : "🔊"
      : pipelineState === "synthesizing"
      ? "✨"
      : pipelineState === "transcribing"
      ? "⚡"
      : isSaffronPersona
      ? "🚩"
      : "🎙️";

  const quotaHourly = quota?.isAdmin ? "∞" : quota ? String(quota.remainingHourly) : "—";
  const quotaDaily = quota?.isAdmin ? "∞" : quota ? String(quota.remainingDaily) : "—";

  return (
    <div
      className={`voice-studio relative min-h-screen flex flex-col overflow-x-hidden transition-colors duration-300 ${
        isDark
          ? "bg-[#07080a] text-white selection:bg-emerald-500 selection:text-white"
          : "bg-slate-50 text-slate-900 selection:bg-emerald-600 selection:text-white"
      }`}
    >
      {/* Ambient aurora background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className={`ambient-blob absolute -top-40 left-[8%] h-[520px] w-[520px] rounded-full blur-[140px] ${isDark ? "bg-emerald-500/12" : "bg-emerald-400/15"}`} />
        <div className={`ambient-blob absolute top-[16%] right-[-12%] h-[480px] w-[480px] rounded-full blur-[150px] ${isDark ? "bg-cyan-500/10" : "bg-cyan-400/12"}`} style={{ animationDelay: "-6s" }} />
        <div className={`ambient-blob absolute bottom-[-12%] left-[32%] h-[440px] w-[440px] rounded-full blur-[150px] ${isDark ? "bg-amber-500/8" : "bg-amber-300/12"}`} style={{ animationDelay: "-12s" }} />
      </div>

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
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-md sm:max-w-lg p-5 overflow-hidden border-l border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
            <SettingsPanel
              {...settingsPanelProps}
              onClose={() => setMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* =====================================================
          APP SHELL
      ===================================================== */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl transition-colors dark:border-white/[0.08] dark:bg-[#07080a]/75">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            {/* Brand */}
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-white shadow-lg shadow-emerald-500/25 transition-transform group-hover:scale-105">
                <span className="text-lg">🎙️</span>
                <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/25" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">Chatly</span>
                <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Voice Studio</span>
              </span>
            </Link>

            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold sm:px-3 ${pipelineUi.chip}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${pipelineUi.color} ${pipelineState !== "idle" ? "animate-ping" : ""}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${pipelineUi.color}`} />
                </span>
                <span className="hidden capitalize sm:inline">{pipelineUi.label}</span>
              </div>

              <button
                type="button"
                onClick={() => setIsDebateModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 shadow-xs transition hover:bg-amber-500/20 active:scale-95 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
                title="Launch AI vs AI Debate Arena"
              >
                <span>⚔️</span>
                <span className="hidden md:inline">Debate Arena</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShortcutsModal(true)}
                className="hidden lg:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/60 px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:text-slate-900 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
                title="Keyboard shortcuts"
              >
                <span>⌨️</span>
                <span>Hotkeys</span>
              </button>

              <ThemeToggle />

              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                aria-label="Open settings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 shadow-xs transition hover:bg-slate-100 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 sm:px-3"
              >
                <span className="text-sm">⚙️</span>
                <span className="hidden sm:inline">Settings</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 pb-6 pt-3 sm:px-6 sm:pt-4">
          {/* ERROR ALERT */}
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 animate-in fade-in duration-200">
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
                  className="text-xs text-slate-500 transition hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* =====================================================
              COMMAND DOCK — MODE, EFFORT, LANGUAGE, QUOTA
          ===================================================== */}
          <div
            className={`mt-3 rounded-2xl border p-2 shadow-sm backdrop-blur-xl transition-colors ${
              isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-slate-200 bg-white/80"
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Operating Mode */}
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-[11px] dark:border-white/10 dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => handleSetOperatingMode("FAST")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition ${
                    operatingMode === "FAST"
                      ? "bg-white text-amber-600 shadow-xs dark:bg-zinc-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                  title="FAST — ultra-low latency conversation"
                >
                  <span>⚡</span>
                  <span>Fast</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetOperatingMode("SEARCH")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition ${
                    operatingMode === "SEARCH"
                      ? "bg-white text-blue-600 shadow-xs dark:bg-zinc-800 dark:text-blue-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                  title="SEARCH — adaptive multi-query research"
                >
                  <span>🔍</span>
                  <span>Search</span>
                </button>
              </div>

              {/* Effort */}
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setShowEffortPopover((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
                  title="Effort budget for the active mode"
                >
                  <span className="font-normal text-slate-500 dark:text-zinc-400">Effort</span>
                  <span className="font-semibold capitalize text-emerald-600 dark:text-emerald-400">{effortLevel.toLowerCase()}</span>
                  <span className="text-[9px] text-slate-500">▾</span>
                </button>
                {showEffortPopover && (
                  <div className="absolute bottom-full left-0 z-50 mb-1.5 w-40 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl animate-in fade-in zoom-in-95 duration-100 dark:border-white/15 dark:bg-zinc-900">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Global Effort
                    </div>
                    {(["LOW", "MEDIUM", "HIGH", "MAX"] as const).map((eff) => (
                      <button
                        key={eff}
                        type="button"
                        onClick={() => {
                          handleSetEffortLevel(eff);
                          setShowEffortPopover(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                          effortLevel === eff
                            ? "bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400"
                            : "text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/5"
                        }`}
                      >
                        <span className={`flex h-3 w-3 items-center justify-center rounded-full border ${effortLevel === eff ? "border-emerald-500 bg-emerald-500" : "border-slate-400"}`}>
                          {effortLevel === eff && <span className="h-1 w-1 rounded-full bg-white" />}
                        </span>
                        <span className="capitalize">{eff.toLowerCase()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="hidden h-5 w-px bg-slate-200 dark:bg-white/10 sm:block" />

              {/* Language quick filter */}
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-[11px] dark:border-white/10 dark:bg-white/5">
                {(["all", "hi", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLanguageFilterChange(lang)}
                    className={`rounded-lg px-2 py-1.5 font-semibold transition ${
                      selectedLanguage === lang
                        ? "bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                    }`}
                    title={lang === "all" ? "All languages" : lang === "hi" ? "Hindi / Hinglish" : "English"}
                  >
                    {lang === "all" ? "🌐 All" : lang === "hi" ? "🇮🇳 हिं" : "🇬🇧 EN"}
                  </button>
                ))}
              </div>

              {/* Hands-free */}
              <button
                type="button"
                onClick={() => setHandsFree(!handsFree)}
                aria-pressed={handsFree}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-95 ${
                  handsFree
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-100 text-slate-500 hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
                }`}
                title="Automatically reopen the mic after Chatly finishes speaking"
              >
                <span>🤟</span>
                <span className="hidden md:inline">Hands-free</span>
              </button>

              {/* Voice shortcut */}
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white xl:inline-flex"
                title="Change voice model and persona"
              >
                <span>🎙️</span>
                <span className="max-w-[150px] truncate">{activeVoiceMeta.label.replace(/^[^A-Za-z0-9]+/, "")}</span>
              </button>

              <div className="flex-1" />

              {lastTtfa != null && (
                <span className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white/60 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 sm:inline-flex">
                  <span>⚡</span>
                  <span className="font-mono">{lastTtfa}ms</span>
                  <span className="font-normal text-slate-500 dark:text-zinc-400">TTFA</span>
                </span>
              )}

              <button
                type="button"
                onClick={() => (currentUser ? setMobileDrawerOpen(true) : setShowLoginModal(true))}
                className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white/60 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 md:inline-flex"
                title={currentUser ? "Open account & quota" : "Sign in to unlock a larger quota"}
              >
                <span className="uppercase tracking-wider text-slate-500 dark:text-zinc-400">Quota</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">{quotaHourly}/hr</span>
                <span className="text-slate-300 dark:text-zinc-600">·</span>
                <span className="font-mono text-sky-600 dark:text-sky-400">{quotaDaily}/day</span>
              </button>
            </div>
          </div>

          {/* Live Fact-Check HUD — rendered once for every mode */}
          {isFactCheckHudEnabled && activeFactCheck && (
            <div className="mt-3">
              <FactCheckHUD data={activeFactCheck} onClose={() => setActiveFactCheck(null)} />
            </div>
          )}

          {/* =====================================================
              STUDIO GRID
          ===================================================== */}
          <div
            className={`mt-3 flex-1 ${
              isSplitView
                ? "grid items-start gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
                : "flex flex-col items-center gap-4"
            }`}
          >
            {/* =====================================================
                VOICE STAGE
            ===================================================== */}
            {conversationMode !== "text-only" && (
              <section
                className={`relative w-full overflow-hidden rounded-3xl border shadow-sm transition-colors ${
                  isDark ? "border-white/[0.08] bg-white/[0.025]" : "border-slate-200 bg-white/85"
                } ${isSplitView ? "mx-auto max-w-2xl lg:mx-0 lg:max-w-none" : "mx-auto max-w-2xl"}`}
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className={`absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl ${isDark ? "bg-emerald-500/10" : "bg-emerald-400/15"}`} />
                  <div className={`absolute -bottom-24 right-0 h-56 w-56 rounded-full blur-3xl ${isDark ? "bg-cyan-500/10" : "bg-cyan-400/10"}`} />
                </div>

                <div className="relative z-10 flex flex-col p-4 sm:p-6">
                  {/* Stage header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${pipelineUi.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${pipelineUi.color}`} />
                        {pipelineUi.label}
                      </span>
                      <span className="hidden truncate text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-400 sm:inline">
                        {activePersonaMeta.icon} {activePersonaMeta.label}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHandsFree(!handsFree)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                        handsFree
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                          : "border-slate-200 bg-white/60 text-slate-500 hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                      title="Automatically reopen the mic after speaking"
                    >
                      <span>🤟</span>
                      <span className="hidden sm:inline">{handsFree ? "Hands-free on" : "Hands-free off"}</span>
                    </button>
                  </div>

                  {/* Orb */}
                  <div className="relative mx-auto my-4 flex h-[280px] w-[280px] items-center justify-center sm:my-5 sm:h-[300px] sm:w-[300px]">
                    <span className="orb-ring" />
<span className={`absolute inset-6 rounded-full border ${isDark ? "border-white/[0.05]" : "border-slate-200/70"}`} />
                    <span
                      className={`absolute inset-2 rounded-full border ${
                        pipelineState === "listening"
                          ? "animate-pulse border-rose-500/20"
                          : pipelineState === "speaking"
                          ? "animate-pulse border-emerald-500/20"
                          : "border-transparent"
                      }`}
                      style={{ animationDuration: "2.4s" }}
                    />
                    <VisualizerCanvas
                      state={pipelineState}
                      analyserNode={activeAnalyser}
                      isDark={isDark}
                      size={280}
                      personaMode={selectedPersona}
                    />

                    <div
                      className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-tr text-white transition-all duration-300 sm:h-28 sm:w-28 ${orbTheme.gradient} ${orbTheme.glow} ${
                        pipelineState === "listening" || pipelineState === "speaking" ? "scale-105" : ""
                      } ${pipelineState === "synthesizing" ? "animate-pulse" : ""}`}
                    >
                      <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/30" />
                      <span className="select-none text-3xl sm:text-4xl">{orbEmoji}</span>
                    </div>
                  </div>

                  {/* Status copy */}
                  <div className="text-center">
                    <p className={`shimmer-text text-sm font-semibold sm:text-base ${isDark ? "text-zinc-100" : "text-slate-900"}`}>{pipelineUi.headline}</p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{pipelineUi.hint}</p>
                  </div>

                  {/* Primary controls */}
                  <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={!isStarted}
                      onClick={toggleListening}
                      className={`w-full touch-manipulation select-none rounded-2xl px-6 py-3.5 text-sm font-semibold shadow-lg transition-all duration-150 active:scale-[0.97] sm:w-auto sm:rounded-full ${
                        !isStarted
                          ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500 opacity-60 dark:border-white/5 dark:bg-white/5 dark:text-zinc-600"
                          : listening
                          ? "border border-rose-500 bg-rose-600 text-white shadow-rose-600/30 hover:bg-rose-700"
                          : isAiSpeaking
                          ? "border border-amber-500/50 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
                          : isDark
                          ? "bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-black shadow-emerald-500/20 hover:brightness-110"
                          : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/25 hover:brightness-110"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className="text-base">{listening ? "⏹️" : "🎙️"}</span>
                        <span>{listening ? "Stop & send" : isAiSpeaking ? "Barge in & speak" : "Start speaking"}</span>
                      </span>
                    </button>

                    {isAiSpeaking && (
                      <button
                        type="button"
                        onClick={stopAiSpeaking}
                        className="w-full rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-3.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/20 active:scale-95 dark:text-red-400 sm:w-auto sm:rounded-full"
                      >
                        ⏹ Stop AI
                      </button>
                    )}
                  </div>

                  <p className="mt-2 text-center text-[10px] text-slate-500 dark:text-zinc-400">
                    Hold <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">Space</kbd> to talk
                    <span className="mx-1.5 text-slate-300 dark:text-zinc-700">·</span>
                    <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">M</kbd> mute
                    <span className="mx-1.5 text-slate-300 dark:text-zinc-700">·</span>
                    <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">Esc</kbd> stop
                  </p>

                  {/* Volume */}
                  <div className={`mt-4 flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${isDark ? "border-white/[0.07] bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className="text-base transition hover:scale-110 active:scale-95"
                      title={voiceMuted ? "Unmute AI voice" : "Mute AI voice"}
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
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-500 dark:bg-zinc-700"
                      aria-label="AI voice volume"
                    />
                    <span className="w-8 text-right font-mono text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                      {Math.round((voiceMuted ? 0 : volume) * 100)}%
                    </span>
                  </div>

                  {/* Quick prompts */}
                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400">Try a prompt</p>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400">Tap to ask instantly</span>
                    </div>
                    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                      {QUICK_DEBATE_PROMPTS.map((item, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => sendVoiceToBackend(item.prompt)}
                          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-emerald-400/50 hover:bg-emerald-50 hover:text-emerald-800 active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-emerald-400/30 dark:hover:bg-emerald-400/10 dark:hover:text-white"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subtitles in voice-only mode */}
                  {conversationMode === "voice-only" && (interimText || aiResponse) && (
                    <div className="mt-5 w-full">
                      <div className={`rounded-2xl border p-3.5 backdrop-blur-md ${isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white"}`}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className={`text-[10px] font-bold uppercase tracking-wider ${interimText ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {interimText ? "You" : "Chatly AI"}
                          </p>
                          {isAiSpeaking && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                              speaking
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-zinc-200">{interimText || aiResponse}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* =====================================================
                CONVERSATION PANEL
            ===================================================== */}
            {conversationMode !== "voice-only" && (
              <section className={`flex w-full min-w-0 flex-col ${isSplitView ? "mx-auto max-w-3xl lg:mx-0 lg:max-w-none" : "mx-auto max-w-3xl"}`}>
                <div
                  className={`flex flex-col overflow-hidden rounded-3xl border shadow-sm transition-colors ${
                    isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-white/85"
                  }`}
                >
                  {/* Panel header */}
                  <div className={`flex items-center justify-between gap-2 border-b px-3.5 py-2.5 ${isDark ? "border-white/[0.07]" : "border-slate-100"}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm dark:border-white/10 dark:bg-white/5">
                        💬
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Conversation</p>
                        <p className="truncate text-[10px] text-slate-500 dark:text-zinc-400">
                          {messages.length === 0 ? "No messages yet" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
                          {isAiSpeaking ? " · speaking" : pipelineState === "synthesizing" ? " · thinking" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {messages.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => exportConversationTranscript(messages)}
                            title="Download transcript"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
                          >
                            📄<span className="hidden sm:inline">Export</span>
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
                              title="Download latest AI audio"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] font-medium text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
                            >
                              🎵<span className="hidden sm:inline">Audio</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={clearHistory}
                            title="Clear history"
                            className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-[10px] font-medium text-slate-500 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400"
                          >
                            🗑<span className="hidden sm:inline">Clear</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Message feed */}
                  <div
                    ref={chatScrollRef}
                    className={`flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4 ${
                      isSplitView ? "max-h-[460px] lg:max-h-[calc(100vh-330px)]" : "max-h-[440px]"
                    }`}
                  >
                    {messages.length === 0 && !isAiLoading && (
                      <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 text-2xl shadow-inner">
                          🎙️
                        </div>
                        <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Start a conversation</p>
                        <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                          Speak naturally in Hindi, Hinglish or English. Chatly answers with grounded, real-time voice.
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                          {QUICK_DEBATE_PROMPTS.slice(0, 3).map((item, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => sendVoiceToBackend(item.prompt)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-emerald-400/50 hover:text-emerald-700 active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:text-white"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {messages.map((msg) => {
                      const isUser = msg.sender === "user";
                      const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <div key={msg.id} className={`flex items-end gap-2.5 animate-in fade-in duration-200 ${isUser ? "flex-row-reverse" : ""}`}>
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-sm shadow-sm ${
                              isUser
                                ? "border-emerald-500/30 bg-emerald-500/10"
                                : isDark
                                ? "border-white/10 bg-white/[0.05]"
                                : "border-slate-200 bg-slate-100"
                            }`}
                          >
                            {isUser ? (
                              currentUser?.avatar ? (
                                <img src={currentUser.avatar} alt={currentUser.name} className="h-full w-full object-cover" />
                              ) : (
                                "🧑"
                              )
                            ) : (
                              "🤖"
                            )}
                          </div>

                          <div className={`flex min-w-0 max-w-[86%] flex-col ${isUser ? "items-end" : "items-start"}`}>
                            <div className="mb-1 flex items-center gap-1.5 px-1">
                              <span className={`text-[10px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                                {isUser ? currentUser?.name || "You" : "Chatly AI"}
                              </span>
                              {!isUser && msg.model && (
                                <span className="rounded-full border border-slate-200 px-1.5 py-px text-[9px] font-medium text-slate-500 dark:border-white/10 dark:text-zinc-400">
                                  {msg.model}
                                </span>
                              )}
                              <span className="text-[9px] text-slate-500 dark:text-zinc-400">{timeString}</span>
                            </div>

                            <div
                              className={`w-full rounded-2xl border px-3.5 py-3 text-sm leading-relaxed shadow-sm transition ${
                                isUser
                                  ? isDark
                                    ? "rounded-tr-md border-emerald-500/35 bg-emerald-500/20 text-emerald-50"
                                    : "rounded-tr-md border-emerald-600 bg-emerald-600 text-white"
                                  : isDark
                                  ? "rounded-tl-md border-white/10 bg-white/[0.05] text-zinc-200"
                                  : "rounded-tl-md border-slate-200 bg-slate-50 text-slate-800"
                              }`}
                            >
                              {/* RAG grounding badge */}
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
                                  title="View verified sources and counter-arguments"
                                  className={`group/badge mb-2 mr-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition-all hover:scale-105 active:scale-95 ${
                                    msg.ragSource.includes("political_debate_rag")
                                      ? isDark
                                        ? "border-amber-500/40 bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/20 hover:bg-amber-500/25"
                                        : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                      : msg.ragSource.includes("fact_checks_rag")
                                      ? isDark
                                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/20 hover:bg-emerald-500/25"
                                        : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                                      : isDark
                                      ? "border-purple-500/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25"
                                      : "border-purple-300 bg-purple-50 text-purple-900 hover:bg-purple-100"
                                  }`}
                                >
                                  <span className="text-xs select-none">
                                    {msg.ragSource.includes("political_debate_rag") ? "🚩" : msg.ragSource.includes("fact_checks_rag") ? "⚖️" : "🧠"}
                                  </span>
                                  <span className="font-semibold">
                                    {msg.ragSource.includes("political_debate_rag")
                                      ? "Debate GraphRAG Grounded"
                                      : msg.ragSource.includes("fact_checks_rag")
                                      ? "Fact-Check Grounded"
                                      : "Knowledge Grounded"}
                                  </span>
                                  <span className="text-[10px] underline decoration-dotted opacity-70 group-hover/badge:opacity-100">🔍 Sources</span>
                                </button>
                              )}

                              {/* Tool usage indicator */}
                              {msg.toolUsed && (() => {
                                const meta = getToolIndicatorMeta(msg.toolUsed);
                                if (!meta) return null;
                                return (
                                  <div
                                    className={`mb-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md shadow-xs ${
                                      isDark ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" : "border-sky-300 bg-sky-50 text-sky-900"
                                    }`}
                                  >
                                    <span className="text-xs select-none">{meta.icon}</span>
                                    <span className="font-semibold">{meta.badgeText}</span>
                                    {meta.detailText && (
                                      <>
                                        <span className="opacity-40">•</span>
                                        <span className="max-w-[180px] truncate font-normal opacity-90 sm:max-w-[260px]">{meta.detailText}</span>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Fact-check score */}
                              {msg.factCheck && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveFactCheck(msg.factCheck!);
                                    setIsFactCheckHudEnabled(true);
                                  }}
                                  title="Open the full Truth Meter audit"
                                  className={`mb-2 mr-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition-all hover:scale-105 active:scale-95 ${
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
                                    <span className="rounded-full bg-rose-500/20 px-1.5 py-px text-[9px] text-rose-600 dark:text-rose-300">
                                      {msg.factCheck.fallaciesDetected.length} fallacy
                                    </span>
                                  )}
                                </button>
                              )}

                              {msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                                <div className="mb-2.5">
                                  <ThinkingAccordion steps={msg.thinkingSteps} />
                                </div>
                              )}

                              <p className="whitespace-pre-wrap break-words">{msg.text}</p>

                              {/* Message actions */}
                              <div className={`mt-2 flex items-center gap-3 border-t pt-2 ${isUser ? "border-white/20 dark:border-emerald-300/20" : "border-slate-200/80 dark:border-white/10"}`}>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(msg.text, msg.id)}
                                  className={`flex items-center gap-1 text-[10px] font-medium transition ${
                                    isUser ? "text-white/70 hover:text-white dark:text-emerald-100/70 dark:hover:text-white" : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                                  }`}
                                >
                                  {copiedId === msg.id ? "✓ Copied" : "📋 Copy"}
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
                                    className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                                  >
                                    ▶ Replay
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Live thinking stepper */}
                    {isAiLoading && currentThinkingSteps.length > 0 && (
                      <div className="w-full">
                        <ThinkingLiveStepper steps={currentThinkingSteps} />
                      </div>
                    )}

                    {/* Loading placeholder */}
                    {isAiLoading && currentThinkingSteps.length === 0 && (
                      <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm ${isDark ? "border-white/10 bg-white/[0.05]" : "border-slate-200 bg-slate-100"}`}>
                          🤖
                        </div>
                        <div className="flex flex-col items-start">
                          <div className="mb-1 flex items-center gap-1.5 px-1">
                            <span className={`text-[10px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>Chatly AI</span>
                            <span className="flex items-center gap-1 text-[9px] text-slate-500 dark:text-zinc-400">
                              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-sky-500 dark:bg-cyan-400" />
                              consulting tools
                            </span>
                          </div>
                          <div className={`flex items-center gap-2.5 rounded-2xl rounded-tl-md border px-4 py-3 ${isDark ? "border-white/10 bg-white/[0.04]" : "border-sky-200 bg-sky-50"}`}>
                            <div className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.3s] dark:bg-cyan-400" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.15s] dark:bg-cyan-400" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 dark:bg-cyan-400" />
                            </div>
                            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Synthesizing answer…</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Interim live transcript */}
                    {interimText && (
                      <div className="flex flex-col items-end opacity-90">
                        <span className="mb-1 flex items-center gap-1 px-1 text-[9px] font-semibold text-rose-500 dark:text-rose-400">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-rose-500" />
                          Listening live
                        </span>
                        <div className="max-w-[86%] rounded-2xl rounded-tr-md border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs italic text-rose-700 dark:text-rose-200">
                          {interimText}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Composer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!manualInput.trim()) return;
                      const textToSend = manualInput.trim();
                      setManualInput("");
                      sendVoiceToBackend(textToSend);
                    }}
                    className={`flex items-center gap-2 border-t p-2 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-100 bg-white"}`}
                  >
                    <button
                      type="button"
                      onClick={toggleListening}
                      aria-label={listening ? "Stop voice input" : "Start voice input"}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-base transition active:scale-95 ${
                        listening
                          ? "border-rose-500/50 bg-rose-500/15 text-rose-500 dark:text-rose-300"
                          : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
                      }`}
                      title={listening ? "Stop listening" : "Start voice input"}
                    >
                      {listening ? "⏹️" : "🎙️"}
                    </button>

                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder={
                        operatingMode === "SEARCH"
                          ? `Search live facts & deep research (${effortLevel.toLowerCase()} effort)…`
                          : `Ask Chatly anything (${effortLevel.toLowerCase()} effort)…`
                      }
                      className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm outline-none text-slate-900 placeholder:text-slate-500 dark:text-white dark:placeholder:text-zinc-500"
                    />

                    <button
                      type="submit"
                      disabled={!manualInput.trim() || isAiLoading}
                      className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
                        isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      Send
                    </button>
                  </form>
                </div>
              </section>
            )}
          </div>

          {/* Footer */}
          <footer className="mt-auto pt-6 text-center text-[10px] text-slate-500 dark:text-zinc-400">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-500" /> {activeModel}</span>
              <span className="text-slate-300 dark:text-zinc-700">·</span>
              <span>{activeVoiceMeta.label.replace(/^[^A-Za-z0-9]+/, "")}</span>
              <span className="text-slate-300 dark:text-zinc-700">·</span>
              <span className="capitalize">{activePersonaMeta.label}</span>
              <span className="text-slate-300 dark:text-zinc-700">·</span>
              <span>{handsFree ? "Hands-free loop" : "Push-to-talk"}</span>
            </div>
          </footer>
        </main>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">⌨️</span>
                <h3 className="font-bold text-base">Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-slate-500 hover:text-slate-600 dark:hover:text-white text-lg font-bold p-1 cursor-pointer"
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
