"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizer3DProps {
  isListening: boolean;
  isAiSpeaking: boolean;
  isAiLoading: boolean;
  audioStream?: MediaStream | null;
  className?: string;
}

export default function AudioVisualizer3D({
  isListening,
  isAiSpeaking,
  isAiLoading,
  audioStream,
  className = "",
}: AudioVisualizer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Setup Web Audio Analyser if stream provided
  useEffect(() => {
    if (!audioStream) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(audioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
    } catch (err) {
      console.warn("Audio analyser setup warning:", err);
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch (_) {}
      }
    };
  }, [audioStream]);

  // ChatGPT Voice / Gemini Live Fluid Morphing Blob
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const baseRadius = 65;

    // 12 Organic fluid control points with spring physics
    const numPoints = 12;
    const points = Array.from({ length: numPoints }, (_, i) => ({
      angle: (i * 2 * Math.PI) / numPoints,
      currentRadius: baseRadius,
      targetRadius: baseRadius,
      velocity: 0,
    }));

    let time = 0;
    let smoothVolume = 0;
    let spinAngle = 0;

    const render = () => {
      time += 0.03;
      ctx.clearRect(0, 0, size, size);

      // 1. Measure audio energy
      let rawVolume = 0;
      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        let sum = 0;
        const count = 32;
        for (let i = 0; i < count; i++) {
          sum += dataArrayRef.current[i];
        }
        rawVolume = sum / (count * 255);
      } else if (isListening) {
        rawVolume = 0.35 + Math.sin(time * 5) * 0.25;
      } else if (isAiSpeaking) {
        rawVolume = 0.45 + Math.sin(time * 6) * 0.3 * Math.cos(time * 2.5);
      } else if (isAiLoading) {
        rawVolume = 0.2 + Math.sin(time * 8) * 0.15;
      }

      smoothVolume += (rawVolume - smoothVolume) * 0.25;

      // Rotation speed based on activity
      const rotSpeed = isAiLoading ? 0.05 : isAiSpeaking ? 0.025 : isListening ? 0.02 : 0.008;
      spinAngle += rotSpeed;

      // 2. Physics Spring Simulation on Fluid Control Points
      points.forEach((p, i) => {
        // Individual harmonic frequency wave for each point
        const wave1 = Math.sin(time * 3 + i * 1.2) * (8 + smoothVolume * 35);
        const wave2 = Math.cos(time * 2 + i * 2.4) * (6 + smoothVolume * 25);
        const thinkingWave = isAiLoading ? Math.sin(time * 8 + i * 3) * 14 : 0;

        p.targetRadius = baseRadius + wave1 + wave2 + thinkingWave + smoothVolume * 30;

        // Spring physics: acceleration = (target - current) * stiffness - damping * velocity
        const force = (p.targetRadius - p.currentRadius) * 0.2;
        p.velocity = p.velocity * 0.75 + force;
        p.currentRadius += p.velocity;
      });

      // 3. Cinematic Ambient Glow (ChatGPT / Gemini Style)
      let glowColor = "rgba(255, 255, 255, 0.15)";
      let outerBlobColor1 = "#ffffff";
      let outerBlobColor2 = "#e2e8f0";
      let innerCoreColor = "#ffffff";

      if (isListening) {
        // User Speaking: Soft Crimson / Rose Aurora
        glowColor = `rgba(244, 63, 94, ${0.35 + smoothVolume * 0.4})`;
        outerBlobColor1 = "#ffffff";
        outerBlobColor2 = "#fecdd3";
      } else if (isAiSpeaking) {
        // AI Speaking: Gemini Cyan / Emerald Iridescent
        glowColor = `rgba(16, 185, 129, ${0.4 + smoothVolume * 0.4})`;
        outerBlobColor1 = "#ffffff";
        outerBlobColor2 = "#a7f3d0";
      } else if (isAiLoading) {
        // Gemini Thinking: Indigo / Violet Aurora
        glowColor = `rgba(139, 92, 246, ${0.35 + Math.sin(time * 6) * 0.2})`;
        outerBlobColor1 = "#ffffff";
        outerBlobColor2 = "#ddd6fe";
      }

      // Draw soft diffused ambient backlight
      const ambientGrad = ctx.createRadialGradient(
        center,
        center,
        20,
        center,
        center,
        baseRadius + 50 + smoothVolume * 40
      );
      ambientGrad.addColorStop(0, glowColor);
      ambientGrad.addColorStop(0.6, glowColor.replace(/[\d.]+\)$/, "0.08)"));
      ambientGrad.addColorStop(1, "transparent");

      ctx.fillStyle = ambientGrad;
      ctx.beginPath();
      ctx.arc(center, center, baseRadius + 50 + smoothVolume * 40, 0, Math.PI * 2);
      ctx.fill();

      // 4. Calculate Smooth Bezier Spline Coordinates
      const coords = points.map((p) => {
        const totalAngle = p.angle + spinAngle;
        return {
          x: center + Math.cos(totalAngle) * p.currentRadius,
          y: center + Math.sin(totalAngle) * p.currentRadius,
        };
      });

      // Draw Outer Fluid Shadow Layer
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 25 + smoothVolume * 30;

      // 5. Draw Primary Fluid Morphing Silhouette (ChatGPT Iconic Blob)
      ctx.beginPath();
      const firstMid = {
        x: (coords[0].x + coords[coords.length - 1].x) / 2,
        y: (coords[0].y + coords[coords.length - 1].y) / 2,
      };
      ctx.moveTo(firstMid.x, firstMid.y);

      for (let i = 0; i < coords.length; i++) {
        const current = coords[i];
        const next = coords[(i + 1) % coords.length];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;

        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
      }

      ctx.closePath();

      // Fluid gradient fill
      const blobGrad = ctx.createLinearGradient(
        center - baseRadius,
        center - baseRadius,
        center + baseRadius,
        center + baseRadius
      );
      blobGrad.addColorStop(0, outerBlobColor1);
      blobGrad.addColorStop(1, outerBlobColor2);

      ctx.fillStyle = blobGrad;
      ctx.fill();
      ctx.restore();

      // 6. Draw Inner Glass Highlight (Zero-Gravity Water Droplet Refraction)
      ctx.save();
      ctx.beginPath();
      const innerRadius = (baseRadius - 16) * (0.85 + smoothVolume * 0.2);
      const highlightX = center - 8 + Math.sin(time) * 4;
      const highlightY = center - 8 + Math.cos(time) * 4;

      const innerGrad = ctx.createRadialGradient(
        highlightX,
        highlightY,
        2,
        highlightX,
        highlightY,
        innerRadius + 12
      );
      innerGrad.addColorStop(0, innerCoreColor);
      innerGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.4)");
      innerGrad.addColorStop(1, "transparent");

      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(highlightX, highlightY, innerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 7. Subtle Outer Ripple Wave on Speak/Listen (Gemini Live Ring)
      if (isListening || isAiSpeaking) {
        const ringProgress = (time * 0.7) % 1;
        const ringRadius = baseRadius + 15 + ringProgress * 45;
        const ringAlpha = (1 - ringProgress) * (0.4 + smoothVolume * 0.4);

        ctx.save();
        ctx.strokeStyle = outerBlobColor1;
        ctx.globalAlpha = ringAlpha;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(center, center, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening, isAiSpeaking, isAiLoading]);

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: "320px", height: "320px" }}
        className="pointer-events-none transition-transform duration-300 hover:scale-105"
      />
    </div>
  );
}
