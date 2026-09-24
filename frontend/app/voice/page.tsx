"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { API_BASE } from "../config";
import VisualizerCanvas, { VisualizerState } from "./components/VisualizerCanvas";
import { ThemeToggle } from "../components/ThemeToggle";

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
];

const VOICE_OPTIONS = [
  { id: "flux-alexis-en", label: "Alexis", desc: "Expressive & Conversational (Default)" },
  { id: "aura-asteria-en", label: "Asteria", desc: "Warm & Natural Female" },
  { id: "aura-orion-en", label: "Orion", desc: "Confident English Male" },
  { id: "aura-luna-en", label: "Luna", desc: "Calm & Friendly Female" },
  { id: "aura-zeus-en", label: "Zeus", desc: "Deep Authority Male" },
  { id: "aura-arcas-en", label: "Arcas", desc: "Crisp Neutral" },
];

export default function VoicePage() {
  const router = useRouter();

  // Modals & Initialization
  const [showStartPopup, setShowStartPopup] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

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
  const [selectedVoice, setSelectedVoice] = useState<string>("flux-alexis-en");
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

  const voiceMutedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const isStartedRef = useRef(false);
  const currentUserRef = useRef<UserProfile | null>(null);
  const isAiSpeakingRef = useRef(false);

  // User speech accumulation & 2.5s silence debouncing refs
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

  // Preferences synchronization
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("chatly_mode") as any;
      if (savedMode && ["voice-only", "voice-chat", "text-only"].includes(savedMode)) {
        setConversationMode(savedMode);
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
      } catch (err) {
        console.warn("Could not attach mic audio analyzer:", err);
      }
    },
    [getAudioContext]
  );

  // Text-To-Speech Interruption
  const stopAiSpeaking = useCallback(() => {
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

  // Send speech or text to backend
  const sendVoiceToBackend = async (text: string) => {
    if (!text || !text.trim()) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) {
      setError("Please sign in or create an account to talk with Chatly AI.");
      setShowLoginModal(true);
      return;
    }

    // Append user message to chat stream
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setIsAiLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/voice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: text.trim(),
          message: text.trim(),
          voiceModel: selectedVoice,
          persona: selectedPersona,
        }),
      });

      // Handle Rate Limit (429)
      if (response.status === 429) {
        const errData = await response.json();
        const limitMsg = errData.error || "Rate limit reached. Please wait before making more calls.";
        setError(limitMsg);
        setAiResponse(limitMsg);
        if (errData.quota) setQuota(errData.quota);
        speakAiResponse("You have reached your voice call limit. Please check back later.");
        return;
      }

      // Handle Unauthorized (401)
      if (response.status === 401) {
        setError("Your session has expired. Please sign in again.");
        setShowLoginModal(true);
        return;
      }

      if (!response.ok) {
        let serverError = `Server responded with status ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.details || errData.error || errData.reply) {
            serverError = errData.details || errData.error || errData.reply;
          }
        } catch (_) {}
        setError(serverError);
        setAiResponse(serverError);
        speakAiResponse(serverError);
        throw new Error(serverError);
      }

      const data = await response.json();
      const reply = data.reply || data.response || "I heard you!";
      if (data.quota) setQuota(data.quota);
      if (data.model) setActiveModel(data.model);

      setAiResponse(reply);

      // Append AI response to chat stream with tool metadata
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: reply,
        timestamp: new Date(),
        model: data.model || activeModel,
        audio: data.audio || undefined,
        toolUsed: data.toolUsed || undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Play audio if available, else browser TTS
      if (data.audio) {
        playDeepgramAudio(data.audio, data.audioFormat || "audio/wav", reply);
      } else {
        speakAiResponse(reply);
      }
    } catch (err: any) {
      console.error("❌ Failed to send voice text to backend:", err);
      const errMsg = `Notice: ${err.message || "Could not connect to Chatly backend"}`;
      setAiResponse(errMsg);
    } finally {
      setIsAiLoading(false);
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

  // Speech Recognition Initializer with continuous listening and 2.5s silence debounce
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
          }

          // Debounce: Wait 2.5 seconds of silence before finalizing user's speech
          silenceTimeoutRef.current = setTimeout(() => {
            finalizeAndSendSpeech();
          }, 2500);
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

      {/* DEEPGRAM VOICE SELECTOR */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500 mb-2">
          Neural Voice Model
        </label>
        <div className="space-y-1.5">
          {VOICE_OPTIONS.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => handleVoiceChange(v.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs transition cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300 font-semibold"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs dark:border-white/5 dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <div>
                  <p className="font-medium">{v.label}</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-500">{v.desc}</p>
                </div>
                {isSelected && <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>}
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

          {/* Center/Right: Pipeline Status + Mobile Theme Toggle + Hamburger */}
          <div className="flex items-center gap-3">
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
            {/* Transcript Header with Clear History */}
            <div className="flex items-center justify-between px-2 mb-3">
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

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-xs text-slate-500 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition cursor-pointer"
                >
                  Clear History
                </button>
              )}
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
    </div>
  );
}
