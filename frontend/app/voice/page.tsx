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
import { exportConversationTranscript, exportAudioFile } from "./utils/exportUtils";

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
  lang: "hi" | "en";
  provider: "Sarvam Bulbul" | "Deepgram Aura" | "Deepgram Flux" | "Edge Neural";
  gender: "Male" | "Female";
  badge: string;
}

const VOICE_OPTIONS: VoiceOption[] = [
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
      audio.volume = 1.0;

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
  const [showStartPopup, setShowStartPopup] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // AI vs AI Debate Arena & Grounding Source Drawer states
  const [isDebateModalOpen, setIsDebateModalOpen] = useState(false);
  const [isGroundingDrawerOpen, setIsGroundingDrawerOpen] = useState(false);
  const [groundingDrawerData, setGroundingDrawerData] = useState<GroundingDrawerData | null>(null);

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

  // Conversation history stream
  const [messages, setMessages] = useState<ChatMessage[]>([]);

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
    const matching = VOICE_OPTIONS.filter((v) => lang === "all" || v.lang === lang);
    if (!matching.some((v) => v.id === selectedVoice)) {
      const defaultVoiceForLang =
        lang === "hi"
          ? "sarvam-aditya"
          : lang === "en"
          ? "flux-alexis-en"
          : matching[0]?.id || "sarvam-aditya";
      setSelectedVoice(defaultVoiceForLang);
      if (typeof window !== "undefined") {
        localStorage.setItem("chatly_voice", defaultVoiceForLang);
      }
    }
  };

  const filteredVoices = useMemo(() => {
    if (selectedLanguage === "all") return VOICE_OPTIONS;
    return VOICE_OPTIONS.filter((v) => v.lang === selectedLanguage);
  }, [selectedLanguage]);

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoice(voiceId);
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

          // Vocalization threshold: 2.2x ambient noise floor + baseline
          const isVocalizing = rms > (noiseFloorRef.current * 2.2 + 0.015);
          isVocalizingRef.current = isVocalizing;

          // If user started speaking while a silence debounce was ticking, cancel it
          if (isVocalizing && silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
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
        audio.volume = 1.0;
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
    if (!token) {
      setError("Please sign in or create an account to talk with Chatly AI.");
      setShowLoginModal(true);
      return;
    }

    // 1. Halt any previous speech & stop listening
    stopAiSpeaking();
    audioQueueRef.current.reset(0);

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const promptText = text.trim();
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
    const startTurnTime = Date.now();

    const appendOrUpdateAiMessage = (
      newText: string,
      ragSource?: string | null,
      groundingDetails?: any,
      audioBase64?: string
    ) => {
      if (groundingDetails) currentGroundingDetails = groundingDetails;
      if (audioBase64) turnAudioBase64 = audioBase64;
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

    // 1. Try WebSocket Duplex Connection (Lowest Latency < 280ms)
    const ws = voiceWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: "user_speech",
          text: promptText,
          persona: selectedPersona,
          voiceModel: selectedVoice,
          token,
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: promptText,
          message: promptText,
          voiceModel: selectedVoice,
          persona: selectedPersona,
          language: selectedLanguage,
        }),
      });

      if (response.status === 429) {
        const errData = await response.json().catch(() => ({}));
        const limitMsg = errData.error || "Rate limit reached. Please wait before making more calls.";
        setError(limitMsg);
        setAiResponse(limitMsg);
        speakAiResponse("You have reached your voice call limit. Please check back later.");
        setIsAiLoading(false);
        return;
      }

      if (response.status === 401) {
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
            if (eventType === "rag") {
              ragSourceBadge = data.ragSource;
              if (data.groundingDetails) currentGroundingDetails = data.groundingDetails;
              appendOrUpdateAiMessage(currentStreamTextRef.current, ragSourceBadge, currentGroundingDetails);
            } else if (eventType === "token") {
              currentStreamTextRef.current += data.token;
              appendOrUpdateAiMessage(currentStreamTextRef.current, ragSourceBadge, currentGroundingDetails);
            } else if (eventType === "audio") {
              handleAudioChunk(data);
              if (data.audio && !turnAudioBase64) {
                turnAudioBase64 = data.audio;
              }
            } else if (eventType === "done") {
              if (data.groundingDetails) currentGroundingDetails = data.groundingDetails;
              if (data.audio) turnAudioBase64 = data.audio;
              if (data.reply) appendOrUpdateAiMessage(data.reply, data.ragSource, currentGroundingDetails, turnAudioBase64 || undefined);
              if (data.firstAudioTimeMs) setLastTtfa(data.firstAudioTimeMs);
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
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: promptText,
            message: promptText,
            voiceModel: selectedVoice,
            persona: selectedPersona,
          }),
        });

        if (!legacyRes.ok) throw new Error(`Server returned ${legacyRes.status}`);

        const data = await legacyRes.json();
        const reply = data.reply || "I heard you!";
        appendOrUpdateAiMessage(reply, data.ragSource, data.groundingDetails, data.audio);

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

  // Finalize full user query and dispatch to backend
  const finalizeAndSendSpeech = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    const queryToSend = currentQueryRef.current.trim();
    currentQueryRef.current = "";
    setInterimText("");

    if (!queryToSend) return;

    // Stop recognition while waiting for AI response so ambient noises aren't captured
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    setListening(false);
    listeningRef.current = false;

    setFinalisedText((prev) => [queryToSend, ...prev]);
    sendVoiceToBackendRef.current(queryToSend);
  }, []);

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
      recognition.lang =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "en-US";
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

          // Smart VAD Turn-Taking Tuning:
          // 1. If sentence ends with terminal punctuation (. ? !) or isFinal is true: user finished thought -> 650ms
          // 2. If mid-clause pause: allow user time to think without cutting them off -> 1100ms
          const lastResult = event.results[event.results.length - 1];
          const isTerminal = /[.?!]$/.test(combinedText) || (lastResult && lastResult.isFinal);
          const dynamicSilenceMs = isTerminal ? 650 : 1100;

          silenceTimeoutRef.current = setTimeout(() => {
            // Verify energy VAD is not currently detecting active vocalization before finalizing
            if (!isVocalizingRef.current) {
              finalizeAndSendSpeech();
            }
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
          default:
            setListening(false);
            listeningRef.current = false;
            break;
        }
      };

      recognition.onend = () => {
        // If silence timer was pending and text was collected, trigger finalization now
        if (silenceTimeoutRef.current && currentQueryRef.current.trim()) {
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
              return prev.map((m) => (m.id === activeId ? { ...m, ragSource: msg.ragSource } : m));
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
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }
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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      const rec = createRecognition();
      if (!rec) return;

      recognitionRef.current = rec;
      manuallyStoppedRef.current = false;
      hadErrorRef.current = false;
      rec.start();
    } catch (err: any) {
      console.error("Error starting recognition:", err);
    }
  }, [isSupported, stopAiSpeaking, createRecognition]);

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

  const isAdmin = currentUser?.role === "admin" || currentUser?.email === "r19216871@gamil.com";

  // =========================================================
  // REUSABLE DASHBOARD SETTINGS CONTENT
  // Rendered in Desktop Sidebar and Mobile Hamburger Drawer
  // =========================================================
  const renderDashboardSettings = (isMobile: boolean = false) => (
    <div className="flex flex-col h-full space-y-6">
      {/* Brand & Close Button (for mobile) */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-black font-bold shadow-md shadow-emerald-500/20">
            🎙️
          </div>
          <div>
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
              Chatly AI
            </span>
            <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
              Control Panel
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {/* Theme Quick Toggle */}
          <ThemeToggle />

          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close settings drawer"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* USER PROFILE & LIVE QUOTA CARD */}
      <div className="rounded-2xl p-4 border transition bg-white border-slate-200 shadow-xs dark:bg-white/[0.03] dark:border-white/10 dark:shadow-none">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/30">
              {currentUser ? currentUser.name.slice(0, 2).toUpperCase() : "👤"}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                {currentUser ? currentUser.name : "Guest User"}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500 truncate max-w-[140px]">
                {currentUser ? currentUser.email : "Not signed in"}
              </p>
            </div>
          </div>

          {currentUser ? (
            <button
              type="button"
              onClick={handleLogout}
              className="text-[11px] text-slate-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition cursor-pointer font-medium"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowLoginModal(true);
                if (isMobile) setMobileDrawerOpen(false);
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition cursor-pointer shadow-xs"
            >
              Sign In
            </button>
          )}
        </div>

        {/* Quota Counters */}
        <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
          {isAdmin ? (
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-medium">
              <span>Account Plan</span>
              <span>👑 Admin (Unlimited)</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                <span>Hourly Quota</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {quota ? `${quota.remainingHourly} / 5 calls` : "5 / 5 calls"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                <span>Daily Quota</span>
                <span className="font-semibold text-sky-600 dark:text-cyan-400">
                  {quota ? `${quota.remainingDaily} / 10 calls` : "10 / 10 calls"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Personal Semantic Memory Indicator */}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200 dark:border-white/10 text-[11px]">
          <span className="flex items-center gap-1.5 text-sky-600 dark:text-cyan-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-cyan-400 animate-pulse" />
            Semantic Memory
          </span>
          <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-medium">Active (Qdrant)</span>
        </div>
      </div>

      {/* CONVERSATION MODE SELECTOR */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500 mb-2">
          Conversation Mode
        </label>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl border text-xs font-medium bg-slate-100 border-slate-200 dark:bg-white/[0.02] dark:border-white/10">
          <button
            type="button"
            onClick={() => handleModeChange("voice-only")}
            className={`py-2 rounded-xl cursor-pointer text-center transition ${
              conversationMode === "voice-only"
                ? "bg-white text-slate-900 shadow-xs dark:bg-white dark:text-black font-semibold"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            🎙️ Voice
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("voice-chat")}
            className={`py-2 rounded-xl cursor-pointer text-center transition ${
              conversationMode === "voice-chat"
                ? "bg-white text-slate-900 shadow-xs dark:bg-white dark:text-black font-semibold"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            💬 Split
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("text-only")}
            className={`py-2 rounded-xl cursor-pointer text-center transition ${
              conversationMode === "text-only"
                ? "bg-white text-slate-900 shadow-xs dark:bg-white dark:text-black font-semibold"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            ⌨️ Text
          </button>
        </div>
      </div>

      {/* AI PERSONA & CADENCE SELECTOR */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500 mb-2">
          AI Persona & Cadence
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PERSONA_OPTIONS.map((p) => {
            const isSelected = selectedPersona === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePersonaChange(p.id)}
                className={`text-left p-2.5 rounded-xl border text-xs transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-300 font-semibold"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs dark:border-white/5 dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm select-none">{p.icon}</span>
                  <span className="font-medium text-xs">{p.label}</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 leading-tight">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* LANGUAGE & NEURAL VOICE MODEL SELECTOR */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
            Voice Model
          </label>
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            {filteredVoices.length} {filteredVoices.length === 1 ? "voice" : "voices"}
          </span>
        </div>

        {/* Dynamic Language Selection Segmented Control */}
        <div className="grid grid-cols-3 gap-1 p-1 mb-2.5 rounded-xl border text-[11px] font-medium bg-slate-100 border-slate-200 dark:bg-white/[0.03] dark:border-white/10">
          <button
            type="button"
            onClick={() => handleLanguageFilterChange("all")}
            className={`py-1.5 rounded-lg cursor-pointer text-center transition font-medium ${
              selectedLanguage === "all"
                ? "bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white font-semibold"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            🌐 All
          </button>
          <button
            type="button"
            onClick={() => handleLanguageFilterChange("hi")}
            className={`py-1.5 rounded-lg cursor-pointer text-center transition font-medium ${
              selectedLanguage === "hi"
                ? "bg-white text-orange-700 shadow-xs dark:bg-orange-500/20 dark:text-orange-300 font-semibold"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            🇮🇳 Hindi
          </button>
          <button
            type="button"
            onClick={() => handleLanguageFilterChange("en")}
            className={`py-1.5 rounded-lg cursor-pointer text-center transition font-medium ${
              selectedLanguage === "en"
                ? "bg-white text-blue-700 shadow-xs dark:bg-blue-500/20 dark:text-blue-300 font-semibold"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            🇬🇧 English
          </button>
        </div>

        {/* Filtered Voice Models List */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {filteredVoices.map((v: VoiceOption) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => handleVoiceChange(v.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50/90 text-emerald-950 shadow-xs dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300 font-semibold"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs dark:border-white/5 dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="font-medium truncate text-xs">{v.label}</p>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider shrink-0 ${
                        v.provider === "Sarvam Bulbul"
                          ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30"
                          : v.provider === "Edge Neural"
                          ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                          : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      {v.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">{v.desc}</p>
                </div>
                {isSelected && <span className="text-emerald-600 dark:text-emerald-400 text-sm shrink-0">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* INTERACTIVE TOGGLES: HANDS-FREE, MUTE, THEME */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500 mb-2">
          Preferences
        </label>

        {/* Hands-Free Toggle */}
        <div className="flex items-center justify-between p-3 rounded-2xl border transition bg-white border-slate-200 shadow-xs dark:bg-white/[0.02] dark:border-white/10 dark:shadow-none">
          <div>
            <p className="text-xs font-medium text-slate-900 dark:text-white">
              ✨ Hands-Free Mode
            </p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500">Auto re-opens mic after AI speaks</p>
          </div>
          <button
            type="button"
            onClick={() => setHandsFree(!handsFree)}
            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
              handsFree ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-700"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                handsFree ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Voice Audio Mute */}
        <div className="flex items-center justify-between p-3 rounded-2xl border transition bg-white border-slate-200 shadow-xs dark:bg-white/[0.02] dark:border-white/10 dark:shadow-none">
          <div>
            <p className="text-xs font-medium text-slate-900 dark:text-white">
              🔊 AI Voice Audio
            </p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500">Mute or play AI spoken responses</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isAiSpeaking) stopAiSpeaking();
              setVoiceMuted(!voiceMuted);
            }}
            className={`px-3 py-1 text-xs rounded-full border cursor-pointer transition ${
              voiceMuted
                ? "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-400 font-semibold"
                : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:text-white"
            }`}
          >
            {voiceMuted ? "🔇 Muted" : "Active"}
          </button>
        </div>

        {/* Theme Toggle */}
        <div className="flex items-center justify-between p-3 rounded-2xl border transition bg-white border-slate-200 shadow-xs dark:bg-white/[0.02] dark:border-white/10 dark:shadow-none">
          <div>
            <p className="text-xs font-medium text-slate-900 dark:text-white">
              {isDark ? "🌙 Dark Mode" : "☀️ Light Mode"}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500">Switch color theme</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* ACTIVE AI TOOLS BADGES */}
      <div className="p-3.5 rounded-2xl border bg-white border-slate-200 shadow-xs dark:bg-white/[0.02] dark:border-white/10 dark:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500 mb-2">
          Active AI Tools
        </p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span>🌐</span>
              <span>Live Web Search</span>
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Enabled</span>
          </div>
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span>📄</span>
              <span>Web Page Scraper</span>
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Enabled</span>
          </div>
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span>🧠</span>
              <span>Semantic Memory</span>
            </span>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Qdrant Cloud</span>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS & LINKS */}
      <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2 text-xs">
        {/* Debate Arena Launcher Button */}
        <button
          type="button"
          onClick={() => {
            setIsDebateModalOpen(true);
            if (isMobile) setMobileDrawerOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-700 dark:text-amber-300 font-semibold hover:from-amber-500/25 hover:to-orange-500/25 transition cursor-pointer shadow-xs active:scale-98"
        >
          <span>⚔️</span>
          <span>Open AI Debate Arena</span>
        </button>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="w-full text-center py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 transition cursor-pointer font-medium"
          >
            🗑️ Clear Conversation History
          </button>
        )}

        <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 pt-2">
          <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-white transition">
            Dashboard →
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-amber-600 dark:text-amber-400 hover:underline transition font-medium">
              👑 Admin Console
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`min-h-screen flex flex-row transition-colors duration-300 ${
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

      {/* START VOICE CHAT MODAL */}
      {showStartPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-md overflow-y-auto py-8">
          <div
            className={`w-full max-w-sm sm:max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden border my-auto ${
              isDark ? "bg-zinc-950/95 border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

            <div className="mb-6 text-center relative">
              <div className="mx-auto mb-4 sm:mb-5 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-2xl sm:text-3xl shadow-inner shadow-emerald-500/20">
                🎙️
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Chatly Voice AI</h1>
              <p className={`mt-2.5 text-xs sm:text-sm leading-5 sm:leading-6 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                Real-time voice-to-voice intelligence with neural waveform visualization, web tools, and hands-free conversation.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleStartVoice}
              className={`w-full cursor-pointer rounded-2xl py-3.5 font-semibold transition active:scale-[0.98] shadow-lg ${
                isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              Enable Audio & Begin
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Two-way neural voice pipeline ready
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          1. LAPTOP / DESKTOP SIDEBAR DASHBOARD (>= lg)
      ===================================================== */}
      <aside className="hidden lg:flex w-80 flex-col h-screen sticky top-0 border-r border-slate-200 dark:border-white/10 bg-white/95 dark:bg-zinc-950/70 backdrop-blur-xl p-6 overflow-y-auto shrink-0 transition-colors shadow-sm dark:shadow-none">
        {renderDashboardSettings(false)}
      </aside>

      {/* =====================================================
          2. MOBILE HAMBURGER SETTINGS DRAWER (< lg)
      ===================================================== */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Sliding sheet */}
          <div className="fixed inset-y-0 right-0 w-full max-w-sm p-6 overflow-y-auto border-l border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl transition-transform">
            {renderDashboardSettings(true)}
          </div>
        </div>
      )}

      {/* =====================================================
          3. MAIN STAGE
      ===================================================== */}
      <div className="flex-1 flex flex-col min-h-screen max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
        {/* Streamlined Main Header */}
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4 gap-3 transition-colors">
          {/* Left on mobile: Brand */}
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="lg:hidden flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white transition"
            >
              🎙️ Chatly
            </Link>

            <span className="hidden lg:inline text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
              Voice Assistant Stage
            </span>
          </div>

          {/* Center/Right: Pipeline Status + Debate Arena + Mobile Theme Toggle + Hamburger */}
          <div className="flex items-center gap-2 sm:gap-3">
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

            {/* Mobile Header Theme Toggle */}
            <div className="lg:hidden">
              <ThemeToggle />
            </div>

            {/* Mobile Hamburger Menu Toggle Button (< lg) */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open settings dashboard"
              className="lg:hidden flex items-center justify-center p-2 rounded-xl border cursor-pointer transition border-slate-200 bg-white text-slate-800 hover:bg-slate-100 shadow-xs dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
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
                ? "🔊 Chatly is speaking aloud (Speak or click Interrupt to cut in)"
                : pipelineState === "synthesizing"
                ? "✨ Chatly is thinking & generating voice..."
                : pipelineState === "transcribing"
                ? "⚡ Transcribing your voice..."
                : !currentUser
                ? "🔒 Sign in to start talking"
                : "Click the microphone button to talk"}
            </p>

            {/* Real-time Streaming & VAD Telemetry Pill */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Sub-300ms Streaming Voice
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                ⚡ Silero VAD Tuned
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                🎯 FlashRank Reranker + HyDE
              </span>
              {lastTtfa && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  ⚡ First Spoken: {lastTtfa}ms
                </span>
              )}
            </div>

            {/* AUDIO REACTIVE CANVAS + ORB CONTAINER */}
            <div className="relative mb-6 flex items-center justify-center" style={{ width: 280, height: 280 }}>
              {/* Web Audio API Analyser Reactive Canvas */}
              <VisualizerCanvas
                state={pipelineState}
                analyserNode={activeAnalyser}
                isDark={isDark}
                size={280}
              />

              {/* Central Glowing Core Orb */}
              <div
                className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-2xl ${
                  pipelineState === "listening"
                    ? "w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-red-600 to-rose-400 shadow-red-500/50 scale-105"
                    : pipelineState === "speaking"
                    ? "w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-500/50 scale-105 animate-pulse"
                    : pipelineState === "synthesizing"
                    ? "w-22 h-22 sm:w-26 sm:h-26 bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-cyan-500/40 animate-pulse"
                    : pipelineState === "transcribing"
                    ? "w-22 h-22 sm:w-26 sm:h-26 bg-gradient-to-tr from-amber-600 to-yellow-500 shadow-amber-500/40"
                    : isDark
                    ? "w-22 h-22 sm:w-26 sm:h-26 bg-white/5 border border-white/10"
                    : "w-22 h-22 sm:w-26 sm:h-26 bg-white border border-slate-200 shadow-lg"
                }`}
              >
                <span className="text-3xl sm:text-4xl select-none">
                  {pipelineState === "listening"
                    ? "🔴"
                    : pipelineState === "speaking"
                    ? "🔊"
                    : pipelineState === "synthesizing"
                    ? "✨"
                    : pipelineState === "transcribing"
                    ? "⚡"
                    : "🎙️"}
                </span>
              </div>
            </div>

            {/* CONTROLS (Speak, Stop, Interrupt) */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto px-4 sm:px-0">
              <button
                type="button"
                disabled={!isStarted}
                onClick={() => {
                  if (!currentUser) {
                    setShowLoginModal(true);
                    return;
                  }
                  toggleListening();
                }}
                className={`w-full sm:w-auto touch-manipulation select-none rounded-2xl sm:rounded-full px-8 py-3.5 font-semibold text-sm sm:text-base transition-all duration-150 cursor-pointer active:scale-95 text-center ${
                  !isStarted
                    ? "cursor-not-allowed opacity-50 border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-600"
                    : listening
                    ? "border border-red-500 bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.45)] hover:bg-red-700"
                    : !currentUser
                    ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/30"
                    : isDark
                    ? "border border-white/20 bg-white text-black hover:bg-zinc-200 shadow-md"
                    : "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                }`}
              >
                <span className="flex items-center justify-center gap-2.5">
                  <span className="text-base sm:text-lg">
                    {listening ? "⏹️" : !currentUser ? "🔒" : "🎙️"}
                  </span>
                  <span>
                    {listening
                      ? "Click to Stop Talking"
                      : !currentUser
                      ? "Sign In to Talk"
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

              {/* Gemini / ChatGPT Style Live Tool & Thinking Indicator */}
              {isAiLoading && (
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

            {/* FALLBACK MANUAL TEXT INPUT BAR */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!currentUser) {
                  setShowLoginModal(true);
                  return;
                }
                if (!manualInput.trim()) return;
                const textToSend = manualInput.trim();
                setManualInput("");
                sendVoiceToBackend(textToSend);
              }}
              className="mt-3 flex items-center gap-2 rounded-2xl border p-2 backdrop-blur-sm transition border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:focus-within:border-white/30 dark:shadow-none"
            >
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder={
                  currentUser
                    ? "Type a message to Chatly..."
                    : "Please sign in to send messages..."
                }
                disabled={!currentUser}
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-50 text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={!manualInput.trim() || isAiLoading}
                className="cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm dark:bg-white dark:text-black dark:hover:bg-zinc-200"
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
    </div>
  );
}
