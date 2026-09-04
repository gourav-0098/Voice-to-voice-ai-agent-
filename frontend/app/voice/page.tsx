"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../config";

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
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

export default function VoicePage() {
  const router = useRouter();

  const [showStartPopup, setShowStartPopup] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // User & Quota states
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<UserProfile["quota"] | null>(null);

  // Recognition text states
  const [interimText, setInterimText] = useState("");
  const [finalisedText, setFinalisedText] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>("");

  // Listening & audio settings
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talkMode, setTalkMode] = useState<"toggle" | "hold">("toggle");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [activeModel, setActiveModel] = useState<string>("Chatly Ultra");

  // References
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const manuallyStoppedRef = useRef(false);
  const hadErrorRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

  const voiceMutedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const isStartedRef = useRef(false);
  const currentUserRef = useRef<UserProfile | null>(null);

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

  // Load authenticated user and fetch live quota
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

  // =========================================================
  // TEXT-TO-SPEECH (AI SPEAKS OUT LOUD)
  // =========================================================
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

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const playDeepgramAudio = useCallback(
    (base64Audio: string, format: string = "audio/wav", fallbackText?: string) => {
      stopAiSpeaking();
      if (voiceMutedRef.current) return;

      try {
        const audioSrc = `data:${format};base64,${base64Audio}`;
        const audio = new Audio(audioSrc);
        audioPlayerRef.current = audio;

        audio.onplay = () => {
          setIsAiSpeaking(true);
        };

        audio.onended = () => {
          setIsAiSpeaking(false);
          audioPlayerRef.current = null;
          if (handsFreeRef.current && isStartedRef.current) {
            setTimeout(() => {
              startListening();
            }, 600);
          }
        };

        audio.onerror = (e) => {
          console.warn("Deepgram audio playback error, falling back to speech synthesis:", e);
          setIsAiSpeaking(false);
          audioPlayerRef.current = null;
          if (fallbackText) {
            speakAiResponse(fallbackText);
          }
        };

        audio.play().catch((err) => {
          console.warn("Audio autoplay notice:", err);
          if (fallbackText) {
            speakAiResponse(fallbackText);
          }
        });
      } catch (err) {
        console.error("Failed to initialize Deepgram audio:", err);
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

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const isHindiScript = /[\u0900-\u097F]/.test(cleanText);
      const voices = window.speechSynthesis.getVoices();
      let selectedVoice = null;

      if (isHindiScript) {
        // Find dedicated Hindi (hi-IN) voice
        selectedVoice =
          voices.find((v) => v.lang.startsWith("hi") || v.name.includes("Hindi") || v.name.includes("हिन्दी")) ||
          voices.find((v) => v.lang === "hi-IN" || v.lang.startsWith("en-IN") || v.name.includes("India"));
        utterance.lang = "hi-IN";
      } else {
        // Natural English / Hinglish voice
        selectedVoice =
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

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => {
        setIsAiSpeaking(true);
      };

      utterance.onend = () => {
        setIsAiSpeaking(false);
        if (handsFreeRef.current && isStartedRef.current) {
          setTimeout(() => {
            startListening();
          }, 600);
        }
      };

      utterance.onerror = () => {
        setIsAiSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [stopAiSpeaking]
  );

  // Setup / Probe microphone permission without locking the audio hardware
  const setupAudioProbe = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        if (err.message && err.message.toLowerCase().includes("system")) {
          setError(
            "Windows Privacy Settings is blocking microphone access! Open Windows Settings → Privacy & Security → Microphone → Turn ON 'Microphone access' & 'Let desktop apps access your microphone'."
          );
        } else {
          setError(
            "Microphone permission was denied. Click the tune / lock icon next to localhost:3000 in your browser address bar and set Microphone to Allow."
          );
        }
      } else {
        setError(
          "Could not access microphone. Please ensure a microphone is connected."
        );
      }
      return false;
    }
  };

  // =========================================================
  // SEND VOICE TEXT TO BACKEND (POST /api/voice with Auth Token)
  // =========================================================
  const sendVoiceToBackend = async (text: string) => {
    if (!text || !text.trim()) return;

    // Check if user is logged in
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) {
      setError("Please sign in or create an account to talk with Chatly AI.");
      setShowLoginModal(true);
      return;
    }

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
        }),
      });

      // Handle Rate Limit (429 Too Many Requests)
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

      // Play Deepgram Alexis audio if available, else fallback to browser synthesis
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

  // =========================================================
  // INITIALIZE SPEECH RECOGNITION
  // =========================================================
  const createRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
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
      };

      recognition.onresult = (event: any) => {
        let currentInterim = "";
        let newFinalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;

          if (result.isFinal) {
            newFinalText += transcript + " ";
          } else {
            currentInterim += transcript;
          }
        }

        if (newFinalText.trim()) {
          const finishedText = newFinalText.trim();
          setFinalisedText((prev) => [finishedText, ...prev]);
          setInterimText("");

          sendVoiceToBackendRef.current(finishedText);
        } else if (currentInterim) {
          setInterimText(currentInterim);
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
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAiSpeaking();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stopAiSpeaking]);

  // =========================================================
  // START LISTENING (User begins speaking)
  // =========================================================
  const startListening = async () => {
    // Check if user is authenticated
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    if (!isStarted) {
      setShowStartPopup(true);
      return;
    }

    if (listeningRef.current) return;

    stopAiSpeaking();

    hadErrorRef.current = false;
    manuallyStoppedRef.current = false;
    setError(null);

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      const instance = createRecognition();
      if (instance) {
        recognitionRef.current = instance;
        try {
          instance.start();
        } catch (_) {}
      }

      listeningRef.current = true;
      setListening(true);
    } catch (err: any) {
      setListening(false);
      listeningRef.current = false;
      setError(err.message || "Could not start audio input.");
    }
  };

  // =========================================================
  // STOP LISTENING (User finishes speaking)
  // =========================================================
  const stopListening = () => {
    manuallyStoppedRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    }

    listeningRef.current = false;
    setListening(false);
  };

  const toggleListening = () => {
    if (listeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    const handleRelease = () => {
      if (talkMode === "hold" && listeningRef.current) {
        stopListening();
      }
    };

    window.addEventListener("mouseup", handleRelease);
    window.addEventListener("touchend", handleRelease);

    return () => {
      window.removeEventListener("mouseup", handleRelease);
      window.removeEventListener("touchend", handleRelease);
    };
  }, [talkMode]);

  const handleStartVoice = async () => {
    setError(null);
    const micReady = await setupAudioProbe();
    if (micReady) {
      setShowStartPopup(false);
      setIsStarted(true);
    }
  };

  const clearHistory = async () => {
    setFinalisedText([]);
    setInterimText("");
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

  const isAdmin = currentUser?.role === "admin" || currentUser?.email === "r19216871@gamil.com";

  return (
    <main className="min-h-screen bg-[#07080a] text-white flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* =====================================================
          LOGIN REQUIRED MODAL (Talking to AI is not free/anonymous)
      ===================================================== */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/90 p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

            <div className="mb-6 text-center relative">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-3xl shadow-inner shadow-emerald-500/20">
                🔒
              </div>

              <h2 className="text-2xl font-bold tracking-tight">
                Sign in to Talk to AI
              </h2>

              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Talking to Chatly Voice AI requires an account. Free accounts get:
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs text-zinc-500">Hourly Limit</p>
                  <p className="text-sm font-semibold text-white mt-0.5">5 calls / hr</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs text-zinc-500">Daily Limit</p>
                  <p className="text-sm font-semibold text-white mt-0.5">10 calls / day</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href="/login"
                className="block w-full text-center rounded-xl bg-white py-3.5 font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-lg shadow-white/10"
              >
                Sign In →
              </Link>
              <Link
                href="/signup"
                className="block w-full text-center rounded-xl border border-white/10 bg-white/[0.04] py-3.5 font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Create Account
              </Link>
            </div>

            <button
              onClick={() => setShowLoginModal(false)}
              className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* START VOICE CHAT MODAL (Microphone Permission) */}
      {showStartPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md overflow-y-auto py-8">
          <div className="w-full max-w-sm sm:max-w-md rounded-3xl border border-white/10 bg-zinc-950/95 p-6 sm:p-8 shadow-2xl relative overflow-hidden my-auto">
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

            <div className="mb-6 text-center relative">
              <div className="mx-auto mb-4 sm:mb-5 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-2xl sm:text-3xl shadow-inner shadow-emerald-500/20">
                🎙️
              </div>

              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                Chatly Voice AI
              </h1>

              <p className="mt-2.5 text-xs sm:text-sm leading-5 sm:leading-6 text-zinc-400">
                Natural voice-to-voice conversation powered by advanced real-time AI. Speak freely and Chatly will respond aloud with natural human-like speech.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleStartVoice}
              className="w-full cursor-pointer rounded-2xl bg-white py-3.5 font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-lg shadow-white/10"
            >
              Enable Microphone & Begin
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Two-way voice synthesis ready
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MAIN VOICE STAGE
      ===================================================== */}
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 sm:px-6 py-4 sm:py-6">
        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between border-b border-white/10 pb-4 sm:pb-5 gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs sm:text-sm text-zinc-400 hover:text-white transition"
            >
              ← <span className="font-semibold text-white">Chatly</span>
            </Link>
            <span className="text-zinc-600 hidden sm:inline">/</span>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs sm:text-sm font-medium text-zinc-300">Voice AI</span>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                {activeModel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-teal-300">
                🎙️ Neural HD Voice
              </span>
            </div>

            {/* Authenticated User & Quota Badges */}
            {currentUser ? (
              <div className="hidden lg:flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-medium text-emerald-300">{currentUser.name}</span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="ml-1 text-[11px] text-zinc-400 hover:text-red-400 transition cursor-pointer"
                    title="Sign out"
                  >
                    (Sign out)
                  </button>
                </div>

                <Link
                  href="/dashboard"
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 hover:text-white transition"
                >
                  Dashboard
                </Link>

                {isAdmin && (
                  <Link
                    href="/admin"
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                  >
                    👑 Admin Console
                  </Link>
                )}

                {/* Quota Badge */}
                {isAdmin ? (
                  <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    👑 Admin: Unlimited Calls
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    ⚡ Quota: {quota ? `${quota.remainingHourly}/5 hr · ${quota.remainingDaily}/10 day` : "5/5 hr · 10/10 day"}
                  </span>
                )}

                {/* Memory Status Pill */}
                <span className="hidden xl:flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-300">
                  🧠 {isAdmin ? "Enterprise Knowledge Memory" : "Adaptive Context Memory"}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="hidden md:inline-block text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 transition"
              >
                🔒 Sign in to Talk
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Audio Mute / Unmute AI Speech */}
            <button
              type="button"
              onClick={() => {
                if (isAiSpeaking) stopAiSpeaking();
                setVoiceMuted(!voiceMuted);
              }}
              title={voiceMuted ? "Unmute AI Voice" : "Mute AI Voice"}
              className={`rounded-full p-2 border transition ${
                voiceMuted
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {voiceMuted ? "🔇" : "🔊"}
            </button>

            {/* Hands-Free Auto Conversation Mode */}
            <button
              type="button"
              onClick={() => setHandsFree(!handsFree)}
              title="Hands-free auto conversation loop"
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition flex items-center gap-1.5 ${
                handsFree
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
              }`}
            >
              <span>{handsFree ? "✨ Hands-Free: ON" : "Hands-Free"}</span>
            </button>

            {/* Status Pill */}
            <div
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                listening
                  ? "border-red-500/50 bg-red-500/15 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                  : isAiSpeaking
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  : isAiLoading
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                  : "border-white/10 bg-white/5 text-zinc-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  listening
                    ? "bg-red-500 animate-ping"
                    : isAiSpeaking
                    ? "bg-emerald-400 animate-pulse"
                    : isAiLoading
                    ? "bg-cyan-400 animate-pulse"
                    : "bg-emerald-500"
                }`}
              />
              {listening
                ? "Listening..."
                : isAiSpeaking
                ? "Chatly Speaking..."
                : isAiLoading
                ? "Thinking..."
                : "Ready"}
            </div>
          </div>
        </header>

        {/* ERROR / RATE LIMIT ALERT */}
        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-red-400">Notice</p>
                  <p className="mt-0.5 text-xs leading-5 text-red-200/80">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* =================================================
            VOICE ORB CENTERSTAGE
        ================================================= */}
        <div className="flex flex-1 flex-col items-center justify-center py-6">
          {/* Status Instruction */}
          <p
            className={`mb-6 text-sm font-medium tracking-wide transition-colors duration-200 ${
              listening
                ? "text-red-400"
                : isAiSpeaking
                ? "text-emerald-300"
                : isAiLoading
                ? "text-cyan-300"
                : "text-zinc-400"
            }`}
          >
            {listening
              ? talkMode === "hold"
                ? "🎙️ Release button when finished speaking"
                : "🎙️ Listening... click button below when done"
              : isAiSpeaking
              ? "🔊 Chatly is speaking (click Interrupt to cut in)"
              : isAiLoading
              ? "✨ Thinking..."
              : !currentUser
              ? "🔒 Please sign in to start talking"
              : "Click the microphone button to talk"}
          </p>

          {/* DYNAMIC MULTI-STATE VOICE ORB */}
          <div className="relative mb-6 sm:mb-8 flex items-center justify-center">
            {/* Ambient Background Glow */}
            <div
              className={`absolute rounded-full transition-all duration-500 pointer-events-none ${
                listening
                  ? "w-44 sm:w-56 h-44 sm:h-56 bg-red-500/25 blur-3xl"
                  : isAiSpeaking
                  ? "w-48 sm:w-60 h-48 sm:h-60 bg-emerald-500/25 blur-3xl animate-pulse"
                  : isAiLoading
                  ? "w-40 sm:w-52 h-40 sm:h-52 bg-cyan-500/20 blur-3xl animate-pulse"
                  : "w-36 sm:w-44 h-36 sm:h-44 bg-white/5 blur-2xl"
              }`}
            />

            {/* Outer Ring */}
            <div
              className={`flex items-center justify-center rounded-full border transition-all duration-300 ${
                listening
                  ? "w-36 h-36 sm:w-48 sm:h-48 border-red-500/60 bg-red-500/10 shadow-[0_0_80px_rgba(239,68,68,0.3)] scale-105 sm:scale-110"
                  : isAiSpeaking
                  ? "w-36 h-36 sm:w-48 sm:h-48 border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_80px_rgba(16,185,129,0.35)] scale-105"
                  : isAiLoading
                  ? "w-32 h-32 sm:w-44 sm:h-44 border-cyan-500/40 bg-cyan-500/10 animate-spin"
                  : "w-32 h-32 sm:w-44 sm:h-44 border-white/10 bg-white/[0.02]"
              }`}
            >
              {/* Inner Glowing Core */}
              <div
                className={`flex items-center justify-center rounded-full transition-all duration-300 shadow-xl ${
                  listening
                    ? "w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-tr from-red-600 to-rose-400 shadow-red-500/50 scale-105"
                    : isAiSpeaking
                    ? "w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-500/50 scale-105 animate-pulse"
                    : isAiLoading
                    ? "w-18 h-18 sm:w-24 sm:h-24 bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-cyan-500/40"
                    : "w-18 h-18 sm:w-24 sm:h-24 bg-white/5 border border-white/10"
                }`}
              >
                <span className="text-3xl sm:text-4xl select-none">
                  {listening
                    ? "🔴"
                    : isAiSpeaking
                    ? "🔊"
                    : isAiLoading
                    ? "✨"
                    : "🎙️"}
                </span>
              </div>
            </div>
          </div>

          {/* Sound Wave Animation */}
          {(listening || isAiSpeaking) && (
            <div className="mb-6 flex items-center gap-1.5 h-6">
              {[0.4, 0.9, 1.3, 0.7, 1.2, 0.5, 1.1, 0.6].map((factor, idx) => (
                <span
                  key={idx}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    listening
                      ? "bg-red-500 animate-pulse"
                      : "bg-emerald-400 animate-bounce"
                  }`}
                  style={{
                    height: `${12 * factor + 8}px`,
                    animationDelay: `${idx * 80}ms`,
                  }}
                />
              ))}
            </div>
          )}

          {/* CONTROLS */}
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
              style={{ touchAction: "manipulation" }}
              className={`w-full sm:w-auto touch-manipulation select-none rounded-2xl sm:rounded-full px-8 py-4 font-semibold text-sm sm:text-base transition-all duration-150 cursor-pointer active:scale-95 text-center ${
                !isStarted
                  ? "cursor-not-allowed opacity-50 border border-white/5 bg-white/5 text-zinc-600"
                  : listening
                  ? "border border-red-500 bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.45)] hover:bg-red-700"
                  : !currentUser
                  ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  : "border border-white/20 bg-white text-black hover:bg-zinc-200 shadow-md"
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
                style={{ touchAction: "manipulation" }}
                className="w-full sm:w-auto cursor-pointer rounded-2xl sm:rounded-full border border-red-500/40 bg-red-500/10 px-6 py-3.5 text-xs sm:text-sm font-semibold text-red-300 transition hover:bg-red-500/20 active:scale-95 text-center"
              >
                ⏹️ Interrupt AI
              </button>
            )}
          </div>

          {/* USER SPOKEN DISPLAY */}
          <div className="mt-8 w-full max-w-2xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  You Spoke
                </span>
                {interimText && (
                  <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    Transcribing...
                  </span>
                )}
              </div>

              <p
                className={`min-h-[2.2rem] text-base leading-relaxed ${
                  interimText
                    ? "text-white font-medium"
                    : "text-zinc-500 italic"
                }`}
              >
                {interimText ||
                  (listening
                    ? "Listening to your voice..."
                    : finalisedText.length > 0
                    ? finalisedText[0]
                    : "Your speech will appear here in real time...")}
              </p>
            </div>
          </div>

          {/* AI RESPONSE BOX */}
          <div className="mt-4 w-full max-w-2xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-[10px] font-bold text-black shadow-sm">
                    AI
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Chatly AI
                </span>
                </div>

                <div className="flex items-center gap-2">
                  {isAiLoading && (
                    <span className="flex items-center gap-1.5 text-xs text-cyan-400">
                      <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                      Thinking...
                    </span>
                  )}
                  {isAiSpeaking && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Speaking aloud...
                    </span>
                  )}
                  {aiResponse && !isAiLoading && (
                    <button
                      type="button"
                      onClick={() => speakAiResponse(aiResponse)}
                      title="Replay AI Voice"
                      className="cursor-pointer text-xs px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 hover:text-white transition"
                    >
                      ▶ Replay
                    </button>
                  )}
                </div>
              </div>

              <p
                className={`text-sm leading-relaxed ${
                  isAiSpeaking
                    ? "text-emerald-200 font-medium"
                    : aiResponse
                    ? "text-zinc-200"
                    : "text-zinc-500 italic"
                }`}
              >
                {isAiLoading
                  ? "Generating response..."
                  : aiResponse || "Speak into the microphone to converse with Chatly AI."}
              </p>
            </div>
          </div>

          {/* FALLBACK TEXT INPUT BAR */}
          <div className="mt-4 w-full max-w-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!currentUser) {
                  setShowLoginModal(true);
                  return;
                }
                if (!manualInput.trim()) return;
                const textToSend = manualInput.trim();
                setFinalisedText((prev) => [textToSend, ...prev]);
                setManualInput("");
                sendVoiceToBackend(textToSend);
              }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 focus-within:border-white/25 transition backdrop-blur-sm"
            >
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder={
                  currentUser
                    ? "Or type a message to send..."
                    : "Please sign in to send messages..."
                }
                disabled={!currentUser}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!manualInput.trim() || isAiLoading}
                className="cursor-pointer rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Send →
              </button>
            </form>
          </div>

          {/* CONVERSATION HISTORY */}
          {finalisedText.length > 1 && (
            <div className="mt-4 w-full max-w-2xl animate-in fade-in duration-200">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Past Spoken Phrases ({finalisedText.length})
                  </p>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                  >
                    Clear
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {finalisedText.slice(1).map((text, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-zinc-300 flex items-center justify-between gap-2"
                    >
                      <p className="truncate flex-1">{text}</p>
                      <button
                        type="button"
                        onClick={() => sendVoiceToBackend(text)}
                        className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-zinc-300 hover:bg-white hover:text-black transition"
                      >
                        Ask Again →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FOOTER SETTINGS & STATUS */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
            {currentUser && !isAdmin && (
              <>
                <span className="text-zinc-400">
                  Calls Remaining: {quota ? `${quota.remainingHourly}/5 hr · ${quota.remainingDaily}/10 day` : "5/5 hr"}
                </span>
                <span className="text-zinc-700">|</span>
              </>
            )}
            {isAdmin && (
              <>
                <span className="text-amber-400 font-medium">
                  👑 Admin Account (Unlimited Calls)
                </span>
                <span className="text-zinc-700">|</span>
              </>
            )}
            <span>AI Voice: {voiceMuted ? "Muted" : "Active"}</span>
            <span className="text-zinc-700">|</span>
            <span>Loop: {handsFree ? "Continuous" : "Push-to-Talk"}</span>
          </div>
        </div>
      </div>
    </main>
  );
}