import { useRef, useCallback, useEffect } from 'react';
import { useAudioEngine } from '../context/AudioEngineContext';
import { StemName, WAVEFORM_SAMPLES } from '../audio/AudioEngine';
import { TrackLoader } from '../components/TrackLoader';

function computeWaveformPeaks(buffer: AudioBuffer, numSamples: number): number[] {
  const channelData = buffer.getChannelData(0);
  const peaks: number[] = [];
  const samplesPerPeak = Math.floor(channelData.length / numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface StemControlProps {
  name: string;
  stemKey: StemName;
  color: string;
  icon: React.ReactNode;
  gain: number;
  muted: boolean;
  solo: boolean;
  onGainChange: (gain: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
}

function StemControl({
  name,
  color,
  icon,
  gain,
  muted,
  solo,
  onGainChange,
  onMuteToggle,
  onSoloToggle,
}: StemControlProps) {
  const isActive = !muted && gain > 0;
  
  return (
    <div 
      className={`stem-control ${isActive ? 'active' : ''} ${muted ? 'muted' : ''} ${solo ? 'solo' : ''}`}
      style={{ '--stem-color': color } as React.CSSProperties}
    >
      <div className="stem-header">
        <div className="stem-icon">{icon}</div>
        <span className="stem-name">{name}</span>
      </div>
      
      <div className="stem-slider-container">
        <input
          type="range"
          className="stem-slider"
          min={0}
          max={2}
          step={0.01}
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
          disabled={muted}
        />
        <div className="stem-slider-labels">
          <span>0</span>
          <span>1</span>
          <span>2</span>
        </div>
      </div>
      
      <div className="stem-value">{Math.round(gain * 100)}%</div>
      
      <div className="stem-buttons">
        <button
          className={`stem-btn stem-mute ${muted ? 'active' : ''}`}
          onClick={onMuteToggle}
          title={muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>
        <button
          className={`stem-btn stem-solo ${solo ? 'active' : ''}`}
          onClick={onSoloToggle}
          title={solo ? 'Unsolo' : 'Solo'}
        >
          S
        </button>
      </div>
    </div>
  );
}

export function StemsPage() {
  const {
    state,
    loadFileA,
    loadUrlA,
    togglePlayA,
    seekA,
    setStemGain,
    toggleStemMute,
    toggleStemSolo,
    toggleStemsEnabled,
    setAcapellaMode,
    setInstrumentalMode,
    resetStems,
  } = useAudioEngine();
  
  const deckA = state.deckA;
  const stems = state.stems;
  
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformPeaksRef = useRef<number[]>([]);
  const playheadRafRef = useRef<number>(0);
  const isPlayheadAnimatingRef = useRef(false);

  // Compute waveform peaks
  useEffect(() => {
    if (deckA.sourceBuffer) {
      const peaks = computeWaveformPeaks(deckA.sourceBuffer, WAVEFORM_SAMPLES);
      waveformPeaksRef.current = peaks;
      drawWaveform();
    } else {
      waveformPeaksRef.current = [];
      drawWaveform();
    }
  }, [deckA.sourceBuffer]);

  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const peaks = waveformPeaksRef.current;
    
    ctx.clearRect(0, 0, width, height);
    
    if (peaks.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.textAlign = 'center';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Load a track to use stems', width / 2, height / 2);
      return;
    }
    
    const centerY = height / 2;
    const barWidth = width / peaks.length;
    
    // Draw waveform with stem colors
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)'; // Purple for stems
    ctx.lineWidth = 1;
    
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = peaks[i] * (height * 0.4);
      ctx.moveTo(x, centerY - amplitude);
      ctx.lineTo(x, centerY + amplitude);
    }
    ctx.stroke();
    
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => drawWaveform();
    window.addEventListener('resize', handleResize);
    drawWaveform();
    return () => window.removeEventListener('resize', handleResize);
  }, [drawWaveform]);

  // Playhead animation
  useEffect(() => {
    const updatePlayhead = () => {
      if (!isPlayheadAnimatingRef.current) return;
      
      const canvas = waveformCanvasRef.current;
      if (canvas && deckA.duration > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          const width = rect.width;
          const height = rect.height;
          
          drawWaveform();
          
          const progress = deckA.currentTime / deckA.duration;
          const playheadX = progress * width;
          
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
          ctx.lineWidth = 2;
          ctx.moveTo(playheadX, 0);
          ctx.lineTo(playheadX, height);
          ctx.stroke();
        }
      }
      
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    };
    
    if (deckA.isPlaying && deckA.duration > 0) {
      isPlayheadAnimatingRef.current = true;
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      isPlayheadAnimatingRef.current = false;
      if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current);
      
      if (deckA.duration > 0) {
        drawWaveform();
        const canvas = waveformCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const rect = canvas.getBoundingClientRect();
            const progress = deckA.currentTime / deckA.duration;
            const playheadX = progress * rect.width;
            
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
            ctx.lineWidth = 2;
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, rect.height);
            ctx.stroke();
          }
        }
      }
    }
    
    return () => {
      isPlayheadAnimatingRef.current = false;
      if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current);
    };
  }, [deckA.isPlaying, deckA.duration, deckA.currentTime, drawWaveform]);

  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !deckA.duration) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = clickX / rect.width;
    seekA(progress * deckA.duration);
  }, [deckA.duration, seekA]);

  return (
    <div className="page stems-page">
      <div className="stems-header">
        <h2 className="stems-title">STEM SEPARATION</h2>
        <p className="stems-subtitle">Isolate vocals, drums, bass, and other instruments</p>
      </div>

      {/* Track Loader */}
      <section className="card stems-source-card">
        <div className="card-header">
          <h3 className="card-title">Source Track (Deck A)</h3>
        </div>
        <TrackLoader
          trackName={deckA.fileName}
          onLoadFile={loadFileA}
          onLoadUrl={loadUrlA}
          label="Load Track for Stem Separation"
        />
      </section>

      {/* Waveform */}
      {deckA.audioSrc && (
        <section className="card stems-waveform-card">
          <div className="stems-waveform">
            <canvas
              ref={waveformCanvasRef}
              className="waveform-canvas"
              onClick={handleWaveformClick}
            />
          </div>
          <div className="stems-transport">
            <button className="stems-play-btn" onClick={togglePlayA}>
              {deckA.isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <span className="stems-time">
              {formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}
            </span>
          </div>
        </section>
      )}

      {/* Stem Controls */}
      <section className="card stems-controls-card">
        <div className="card-header">
          <h3 className="card-title">Stem Controls</h3>
          <div className="stems-master-toggle">
            <button
              className={`btn btn-sm ${stems.enabled ? 'btn-accent' : 'btn-secondary'}`}
              onClick={toggleStemsEnabled}
            >
              {stems.enabled ? 'STEMS ON' : 'STEMS OFF'}
            </button>
          </div>
        </div>
        
        <div className={`stems-grid ${!stems.enabled ? 'disabled' : ''}`}>
          <StemControl
            name="Vocals"
            stemKey="vocals"
            color="#f472b6"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            gain={stems.vocals.gain}
            muted={stems.vocals.muted}
            solo={stems.vocals.solo}
            onGainChange={(g) => setStemGain('vocals', g)}
            onMuteToggle={() => toggleStemMute('vocals')}
            onSoloToggle={() => toggleStemSolo('vocals')}
          />
          
          <StemControl
            name="Drums"
            stemKey="drums"
            color="#fb923c"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 5v6c0 1.66-4.03 3-9 3S3 12.66 3 11V5M21 11v6c0 1.66-4.03 3-9 3s-9-1.34-9-3v-6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            gain={stems.drums.gain}
            muted={stems.drums.muted}
            solo={stems.drums.solo}
            onGainChange={(g) => setStemGain('drums', g)}
            onMuteToggle={() => toggleStemMute('drums')}
            onSoloToggle={() => toggleStemSolo('drums')}
          />
          
          <StemControl
            name="Bass"
            stemKey="bass"
            color="#4ade80"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            gain={stems.bass.gain}
            muted={stems.bass.muted}
            solo={stems.bass.solo}
            onGainChange={(g) => setStemGain('bass', g)}
            onMuteToggle={() => toggleStemMute('bass')}
            onSoloToggle={() => toggleStemSolo('bass')}
          />
          
          <StemControl
            name="Other"
            stemKey="other"
            color="#60a5fa"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13M9 18c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zM21 16c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            gain={stems.other.gain}
            muted={stems.other.muted}
            solo={stems.other.solo}
            onGainChange={(g) => setStemGain('other', g)}
            onMuteToggle={() => toggleStemMute('other')}
            onSoloToggle={() => toggleStemSolo('other')}
          />
        </div>
      </section>

      {/* Presets */}
      <section className="card stems-presets-card">
        <div className="card-header">
          <h3 className="card-title">Quick Modes</h3>
        </div>
        <div className="stems-presets">
          <button className="btn btn-preset" onClick={setAcapellaMode}>
            <span className="preset-icon">🎤</span>
            Acapella
          </button>
          <button className="btn btn-preset" onClick={setInstrumentalMode}>
            <span className="preset-icon">🎸</span>
            Instrumental
          </button>
          <button className="btn btn-preset" onClick={resetStems}>
            <span className="preset-icon">↺</span>
            Reset All
          </button>
        </div>
      </section>

      {/* Info */}
      <div className="stems-info">
        <p>
          <strong>Note:</strong> This uses spectral approximation filters for real-time stem separation.
          For professional-grade isolation, export and use dedicated stem separation software.
        </p>
      </div>
    </div>
  );
}
