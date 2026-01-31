import { useRef, useEffect, useCallback } from 'react';

interface WaveformProps {
  peaks: Float32Array | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export default function Waveform({ peaks, currentTime, duration, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.textAlign = 'center';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText('No waveform', width / 2, height / 2);
      return;
    }

    // Draw waveform
    const barWidth = width / peaks.length;
    const centerY = height / 2;
    const maxAmp = height * 0.45;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i] * maxAmp;
      const x = i * barWidth;
      ctx.fillRect(x, centerY - amp, Math.max(1, barWidth - 0.5), amp * 2);
    }

    // Draw playhead
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Played portion overlay
      ctx.fillStyle = 'rgba(100, 180, 255, 0.15)';
      ctx.fillRect(0, 0, playheadX, height);
    }
  }, [peaks, currentTime, duration]);

  useEffect(() => {
    const animate = () => {
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawWaveform]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!duration) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      onSeek(percent * duration);
    },
    [duration, onSeek]
  );

  return (
    <div className="waveform-container">
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        onClick={handleClick}
      />
      <p className="waveform-hint">Click waveform to seek</p>
    </div>
  );
}
