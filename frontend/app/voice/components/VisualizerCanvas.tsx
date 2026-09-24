"use client";

import { useEffect, useRef, useCallback } from "react";

export type VisualizerState = "idle" | "listening" | "transcribing" | "synthesizing" | "speaking";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
}

interface VisualizerCanvasProps {
  state: VisualizerState;
  analyserNode: AnalyserNode | null;
  isDark?: boolean;
  size?: number;
}

const COLORS = {
  idle: { primary: "rgba(255,255,255,0.3)", secondary: "rgba(255,255,255,0.12)", glow: "rgba(255,255,255,0.08)" },
  listening: { primary: "rgba(239,68,68,0.85)", secondary: "rgba(244,63,94,0.6)", glow: "rgba(239,68,68,0.4)" },
  transcribing: { primary: "rgba(245,158,11,0.85)", secondary: "rgba(251,191,36,0.6)", glow: "rgba(245,158,11,0.35)" },
  synthesizing: { primary: "rgba(6,182,212,0.9)", secondary: "rgba(59,130,246,0.6)", glow: "rgba(6,182,212,0.4)" },
  speaking: { primary: "rgba(16,185,129,0.85)", secondary: "rgba(6,182,212,0.6)", glow: "rgba(16,185,129,0.4)" },
};

export default function VisualizerCanvas({
  state,
  analyserNode,
  isDark = true,
  size = 280,
}: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const prevAmplitudesRef = useRef<number[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getColor = useCallback(() => {
    if (state === "idle") return isDark ? COLORS.idle : { primary: "rgba(100,116,139,0.3)", secondary: "rgba(148,163,184,0.2)", glow: "rgba(148,163,184,0.08)" };
    return COLORS[state] || COLORS.idle;
  }, [state, isDark]);

  const initAudioContext = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (!analyserRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8;
      }
      const ctx = audioContextRef.current;
      if (!micSourceRef.current && ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch (_) {}
  }, []);

  const connectMicStream = useCallback((stream: MediaStream) => {
    initAudioContext();
    try {
      const ctx = audioContextRef.current;
      const analyser = analyserRef.current;
      if (ctx && analyser && !micSourceRef.current) {
        micSourceRef.current = ctx.createMediaStreamSource(stream);
        micSourceRef.current.connect(analyser);
      }
    } catch (_) {}
  }, [initAudioContext]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = size * 0.35;
    const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength);

    const numBars = 48;
    if (prevAmplitudesRef.current.length !== numBars) {
      prevAmplitudesRef.current = new Array(numBars).fill(0);
    }

    let phase = 0;

    const createParticles = (count: number) => {
      const particles: Particle[] = [];
      const color = getColor();
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const radius = baseRadius + Math.random() * 30;
        particles.push({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.5 + 0.2,
          color: state === "listening" ? `rgba(239,68,68,${Math.random() * 0.5 + 0.3})` :
                 state === "speaking" ? `rgba(16,185,129,${Math.random() * 0.5 + 0.3})` :
                 state === "synthesizing" ? `rgba(6,182,212,${Math.random() * 0.5 + 0.3})` :
                 state === "transcribing" ? `rgba(245,158,11,${Math.random() * 0.5 + 0.3})` :
                 `rgba(255,255,255,${Math.random() * 0.3 + 0.1})`,
        });
      }
      return particles;
    };

    particlesRef.current = createParticles(24);

    const render = () => {
      ctx.clearRect(0, 0, size, size);
      phase += 0.03;

      let avgVolume = 0;
      let timeAvg = 0;
      if (analyserRef.current && (state === "listening" || state === "speaking")) {
        (analyserRef.current.getByteFrequencyData as (array: Uint8Array) => void)(dataArray);
        (analyserRef.current.getByteTimeDomainData as (array: Uint8Array) => void)(timeArray);
        let sum = 0;
        for (let i = 0; i < 32; i++) sum += dataArray[i];
        avgVolume = sum / 32 / 255;
        let tSum = 0;
        for (let i = 0; i < bufferLength; i++) tSum += Math.abs(timeArray[i] - 128);
        timeAvg = tSum / bufferLength / 128;
      }

      const colors = getColor();

      // 1. Draw outer ambient glow
      const glowRadius = baseRadius * (1.35 + avgVolume * 0.5);
      const glowGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.7, centerX, centerY, glowRadius);
      glowGrad.addColorStop(0, colors.glow);
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw circular harmonic wave mesh
      ctx.save();
      ctx.translate(centerX, centerY);

      const rings = state === "idle" ? 2 : 3;
      for (let r = 0; r < rings; r++) {
        const ringRadius = baseRadius + r * 6;
        ctx.beginPath();
        for (let i = 0; i <= numBars; i++) {
          const idx = i % numBars;
          const angle = (idx / numBars) * Math.PI * 2;

          let targetAmp = 0;
          if (analyserRef.current && (state === "listening" || state === "speaking")) {
            const dataIdx = Math.floor((idx / numBars) * (bufferLength / 2));
            targetAmp = (dataArray[dataIdx] || 0) / 255;
          } else if (state === "synthesizing") {
            targetAmp = (Math.sin(angle * 4 + phase * 2 + r) + 1) * 0.3;
          } else {
            targetAmp = (Math.sin(angle * 3 + phase + r) + 1) * 0.08;
          }

          prevAmplitudesRef.current[idx] = prevAmplitudesRef.current[idx] * 0.75 + targetAmp * 0.25;
          const amp = prevAmplitudesRef.current[idx];

          const radius = ringRadius + amp * (state === "idle" ? 10 : 35);
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = r === 0 ? colors.primary : colors.secondary;
        ctx.lineWidth = r === 0 ? 2 : 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // 3. Frequency ray bursts
      if ((state === "listening" || state === "speaking") && avgVolume > 0.04) {
        ctx.save();
        ctx.translate(centerX, centerY);
        for (let i = 0; i < numBars; i += 2) {
          const angle = (i / numBars) * Math.PI * 2;
          const amp = prevAmplitudesRef.current[i];
          const innerR = baseRadius + 4;
          const outerR = baseRadius + 8 + amp * 40;
          const x1 = Math.cos(angle) * innerR;
          const y1 = Math.sin(angle) * innerR;
          const x2 = Math.cos(angle) * outerR;
          const y2 = Math.sin(angle) * outerR;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = colors.primary;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Glowing particle accents
      ctx.save();
      particlesRef.current.forEach((p) => {
        const ampScale = state === "idle" ? 0.3 : state === "listening" || state === "speaking" ? avgVolume * 1.5 : state === "synthesizing" ? 0.6 : 0.5;
        p.x += p.vx * ampScale;
        p.y += p.vy * ampScale;

        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = baseRadius * (1.5 + avgVolume * 0.5);
        if (dist > maxDist) {
          p.vx *= -1;
          p.vy *= -1;
          const angle = Math.atan2(dy, dx);
          p.x = centerX + Math.cos(angle) * (baseRadius + 10);
          p.y = centerY + Math.sin(angle) * (baseRadius + 10);
        }

        const pulse = (Math.sin(phase * 3 + p.size * 10) + 1) * 0.5;
        const finalOpacity = p.opacity * (0.5 + pulse * 0.5) * ampScale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * ampScale), 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${finalOpacity})`);
        ctx.fill();
      });
      ctx.restore();

      // 5. Breathing pulse for idle state
      if (state === "idle") {
        const breathScale = 1 + Math.sin(phase * 1.5) * 0.08;
        const breathGlowGrad = ctx.createRadialGradient(
          centerX, centerY, baseRadius * 0.5,
          centerX, centerY, baseRadius * breathScale * 1.5
        );
        breathGlowGrad.addColorStop(0, isDark ? "rgba(255,255,255,0.05)" : "rgba(100,116,139,0.05)");
        breathGlowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = breathGlowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * breathScale * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Central core glow
      const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 0.3);
      coreGrad.addColorStop(0, state === "idle" ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(100,116,139,0.06)") :
        state === "listening" ? "rgba(239,68,68,0.15)" :
        state === "synthesizing" ? "rgba(6,182,212,0.15)" : "rgba(16,185,129,0.15)");
      coreGrad.addColorStop(1, "transparent");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state, analyserNode, isDark, size, getColor]);

  // Expose connectMicStream for parent component
  useEffect(() => {
    return () => {
      if (micSourceRef.current) {
        try { micSourceRef.current.disconnect(); } catch (_) {}
        micSourceRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${size}px`, height: `${size}px` }}
      className="pointer-events-none absolute inset-0 z-0 m-auto select-none"
    />
  );
}
