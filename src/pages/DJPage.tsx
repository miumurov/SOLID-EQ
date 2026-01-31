import { useRef, useCallback, useEffect } from 'react';
import { useAudioEngine } from '../context/AudioEngineContext';
import { WAVEFORM_SAMPLES, DeckState } from '../audio/AudioEngine';
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

interface DeckPanelProps {
  deckId: 'A' | 'B';
  deck: DeckState;
  isActive: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onLoadFile: (file: File) => void;
  onLoadUrl: (url: string) => void;
  onSetPlaybackRate: (rate: number) => void;
  onSetDjFilterValue: (value: number) => void;
  onSetEchoMix: (mix: number) => void;
  onSetDjBypass: (bypass: boolean) => void;
  onSetHotCue: (index: number) => void;
  onTriggerHotCue: (index: number) => void;
  onClearHotCue: (index: number) => void;
  onSetLoopIn: () => void;
  onSetLoopOut: () => void;
  onToggleLoop: () => void;
  onClearLoop: () => void;
  onSetActive: () => void;
}

function DeckPanel({
  deckId,
  deck,
  isActive,
  onTogglePlay,
  onSeek,
  onLoadFile,
  onLoadUrl,
  onSetPlaybackRate,
  onSetDjFilterValue,
  onSetEchoMix,
  onSetDjBypass,
  onSetHotCue,
  onTriggerHotCue,
  onClearHotCue,
  onSetLoopIn,
  onSetLoopOut,
  onToggleLoop,
  onClearLoop,
  onSetActive,
}: DeckPanelProps) {
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformPeaksRef = useRef<number[]>([]);
  const playheadRafRef = useRef<number>(0);
  const isPlayheadAnimatingRef = useRef(false);

  // Compute waveform peaks
  useEffect(() => {
    if (deck.sourceBuffer) {
      const peaks = computeWaveformPeaks(deck.sourceBuffer, WAVEFORM_SAMPLES);
      waveformPeaksRef.current = peaks;
      drawWaveform();
    } else {
      waveformPeaksRef.current = [];
      drawWaveform();
    }
  }, [deck.sourceBuffer]);

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
      ctx.fillText('Load a track', width / 2, height / 2);
      return;
    }
    
    const centerY = height / 2;
    const barWidth = width / peaks.length;
    
    // Draw loop region
    if (deck.loopIn !== null && deck.loopOut !== null && deck.duration > 0) {
      const loopStartX = (deck.loopIn / deck.duration) * width;
      const loopEndX = (deck.loopOut / deck.duration) * width;
      ctx.fillStyle = deck.loopEnabled ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);
    }
    
    // Draw hot cue markers
    deck.hotCues.forEach((cue, index) => {
      if (cue && deck.duration > 0) {
        const cueX = (cue.time / deck.duration) * width;
        const colors = ['#f43f5e', '#eab308', '#22c55e', '#3b82f6'];
        ctx.fillStyle = colors[index];
        ctx.fillRect(cueX - 1, 0, 2, height);
      }
    });
    
    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = deckId === 'A' ? 'rgba(96, 165, 250, 0.4)' : 'rgba(248, 113, 113, 0.4)';
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
  }, [deck.hotCues, deck.loopIn, deck.loopOut, deck.loopEnabled, deck.duration, deckId]);

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
      if (canvas && deck.duration > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          const width = rect.width;
          const height = rect.height;
          
          drawWaveform();
          
          const progress = deck.currentTime / deck.duration;
          const playheadX = progress * width;
          
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.moveTo(playheadX, 0);
          ctx.lineTo(playheadX, height);
          ctx.stroke();
        }
      }
      
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    };
    
    if (deck.isPlaying && deck.duration > 0) {
      isPlayheadAnimatingRef.current = true;
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      isPlayheadAnimatingRef.current = false;
      if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current);
      
      if (deck.duration > 0) {
        drawWaveform();
        const canvas = waveformCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const rect = canvas.getBoundingClientRect();
            const progress = deck.currentTime / deck.duration;
            const playheadX = progress * rect.width;
            
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
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
  }, [deck.isPlaying, deck.duration, deck.currentTime, drawWaveform]);

  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !deck.duration) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = clickX / rect.width;
    onSeek(progress * deck.duration);
  }, [deck.duration, onSeek]);

  const getFilterLabel = (value: number): string => {
    if (value === 0) return 'OFF';
    if (value < 0) return `LP ${value}`;
    return `HP +${value}`;
  };

  const deckColor = deckId === 'A' ? '#60a5fa' : '#f87171';

  return (
    <section 
      className={`card deck-panel ${isActive ? 'active' : ''}`}
      onClick={onSetActive}
      style={{ '--deck-color': deckColor } as React.CSSProperties}
    >
      <div className="deck-header">
        <div className="deck-label">
          <span className="deck-id">{deckId}</span>
          {isActive && <span className="deck-active-badge">ACTIVE</span>}
        </div>
        <span className="deck-track-name">{deck.fileName || 'No track'}</span>
      </div>

      {!deck.audioSrc ? (
        <TrackLoader
          trackName={deck.fileName}
          onLoadFile={onLoadFile}
          onLoadUrl={onLoadUrl}
          label={`Load Track to Deck ${deckId}`}
        />
      ) : (
        <>
          <div className="deck-waveform">
            <canvas
              ref={waveformCanvasRef}
              className="waveform-canvas"
              onClick={handleWaveformClick}
            />
          </div>

          <div className="deck-transport">
            <button className="deck-play-btn" onClick={onTogglePlay}>
              {deck.isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <div className="deck-time-display">
              <span className="deck-time">{formatTime(deck.currentTime)}</span>
              <span className="deck-time-sep">/</span>
              <span className="deck-time">{formatTime(deck.duration)}</span>
            </div>
            <div className="deck-tempo">
              <input
                type="range"
                className="tempo-slider-mini"
                min={0.5}
                max={1.5}
                step={0.01}
                value={deck.playbackRate}
                onChange={(e) => onSetPlaybackRate(parseFloat(e.target.value))}
              />
              <span className="tempo-value-mini">{Math.round(deck.playbackRate * 100)}%</span>
            </div>
          </div>

          <div className="deck-controls">
            <div className="deck-fx">
              <div className="fx-control">
                <label>Filter</label>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={deck.djFilterValue}
                  onChange={(e) => onSetDjFilterValue(parseInt(e.target.value))}
                  disabled={deck.djBypass}
                />
                <span className="fx-value">{getFilterLabel(deck.djFilterValue)}</span>
              </div>
              <div className="fx-control">
                <label>Echo</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={deck.echoMix}
                  onChange={(e) => onSetEchoMix(parseFloat(e.target.value))}
                  disabled={deck.djBypass}
                />
                <span className="fx-value">{Math.round(deck.echoMix * 100)}%</span>
              </div>
              <button
                className={`fx-bypass-btn ${deck.djBypass ? 'active' : ''}`}
                onClick={() => onSetDjBypass(!deck.djBypass)}
              >
                {deck.djBypass ? 'FX OFF' : 'FX'}
              </button>
            </div>

            <div className="deck-hotcues">
              {[0, 1, 2, 3].map((index) => {
                const cue = deck.hotCues[index];
                const colors = ['#f43f5e', '#eab308', '#22c55e', '#3b82f6'];
                return (
                  <button
                    key={index}
                    className={`hotcue-mini ${cue ? 'active' : ''}`}
                    style={{ '--cue-color': colors[index] } as React.CSSProperties}
                    onClick={() => cue ? onTriggerHotCue(index) : onSetHotCue(index)}
                    onContextMenu={(e) => { e.preventDefault(); onClearHotCue(index); }}
                    title={cue ? `Cue ${index+1}: ${formatTime(cue.time)}` : `Set Cue ${index+1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="deck-loop">
              <button 
                className={`loop-mini-btn ${deck.loopIn !== null ? 'set' : ''}`}
                onClick={onSetLoopIn}
              >
                IN
              </button>
              <button 
                className={`loop-mini-btn ${deck.loopOut !== null ? 'set' : ''}`}
                onClick={onSetLoopOut}
              >
                OUT
              </button>
              <button 
                className={`loop-mini-btn ${deck.loopEnabled ? 'active' : ''}`}
                onClick={onToggleLoop}
                disabled={deck.loopIn === null || deck.loopOut === null}
              >
                LOOP
              </button>
              <button className="loop-mini-btn" onClick={onClearLoop}>×</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function DJPage() {
  const {
    state,
    setActiveDeck,
    loadFileA,
    loadUrlA,
    togglePlayA,
    seekA,
    setPlaybackRateA,
    setDjFilterValueA,
    setEchoMixA,
    setDjBypassA,
    setHotCueA,
    triggerHotCueA,
    clearHotCueA,
    setLoopInA,
    setLoopOutA,
    toggleLoopA,
    clearLoopA,
    loadFileB,
    loadUrlB,
    togglePlayB,
    seekB,
    setPlaybackRateB,
    setDjFilterValueB,
    setEchoMixB,
    setDjBypassB,
    setHotCueB,
    triggerHotCueB,
    clearHotCueB,
    setLoopInB,
    setLoopOutB,
    toggleLoopB,
    clearLoopB,
    setCrossfader,
    setVolume,
    toggleRecording,
    downloadRecording,
    clearRecording,
  } = useAudioEngine();

  return (
    <div className="page dj-page">
      {/* HUD */}
      <div className="dj-hud">
        <span className="hud-hint">
          <kbd>Tab</kbd> switch deck · 
          <kbd>1</kbd>–<kbd>4</kbd> cues · 
          <kbd>Z</kbd>/<kbd>/</kbd> crossfade · 
          <kbd>?</kbd> help
        </span>
      </div>

      {/* Decks Container */}
      <div className="decks-container">
        <DeckPanel
          deckId="A"
          deck={state.deckA}
          isActive={state.activeDeck === 'A'}
          onTogglePlay={togglePlayA}
          onSeek={seekA}
          onLoadFile={loadFileA}
          onLoadUrl={loadUrlA}
          onSetPlaybackRate={setPlaybackRateA}
          onSetDjFilterValue={setDjFilterValueA}
          onSetEchoMix={setEchoMixA}
          onSetDjBypass={setDjBypassA}
          onSetHotCue={setHotCueA}
          onTriggerHotCue={triggerHotCueA}
          onClearHotCue={clearHotCueA}
          onSetLoopIn={setLoopInA}
          onSetLoopOut={setLoopOutA}
          onToggleLoop={toggleLoopA}
          onClearLoop={clearLoopA}
          onSetActive={() => setActiveDeck('A')}
        />

        <DeckPanel
          deckId="B"
          deck={state.deckB}
          isActive={state.activeDeck === 'B'}
          onTogglePlay={togglePlayB}
          onSeek={seekB}
          onLoadFile={loadFileB}
          onLoadUrl={loadUrlB}
          onSetPlaybackRate={setPlaybackRateB}
          onSetDjFilterValue={setDjFilterValueB}
          onSetEchoMix={setEchoMixB}
          onSetDjBypass={setDjBypassB}
          onSetHotCue={setHotCueB}
          onTriggerHotCue={triggerHotCueB}
          onClearHotCue={clearHotCueB}
          onSetLoopIn={setLoopInB}
          onSetLoopOut={setLoopOutB}
          onToggleLoop={toggleLoopB}
          onClearLoop={clearLoopB}
          onSetActive={() => setActiveDeck('B')}
        />
      </div>

      {/* Crossfader Section */}
      <section className="card crossfader-card">
        <div className="crossfader-header">
          <span className="crossfader-label-a">A</span>
          <h3 className="crossfader-title">CROSSFADER</h3>
          <span className="crossfader-label-b">B</span>
        </div>
        <div className="crossfader-container">
          <input
            type="range"
            className="crossfader-slider"
            min={0}
            max={1}
            step={0.01}
            value={state.crossfader}
            onChange={(e) => setCrossfader(parseFloat(e.target.value))}
          />
        </div>
        <div className="crossfader-values">
          <span>{Math.round((1 - state.crossfader) * 100)}%</span>
          <span>{Math.round(state.crossfader * 100)}%</span>
        </div>
      </section>

      {/* Master Section */}
      <section className="card master-card">
        <div className="card-header">
          <h3 className="card-title">Master</h3>
          {state.isRecording && (
            <span className="recording-badge">● REC {formatTime(state.recordingDuration)}</span>
          )}
        </div>
        <div className="master-controls">
          <div className="master-volume">
            <label>Volume</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
            <span>{Math.round(state.volume * 100)}%</span>
          </div>
          <div className="master-record">
            <button
              className={`record-btn ${state.isRecording ? 'active' : ''}`}
              onClick={toggleRecording}
            >
              <span className="rec-dot"></span>
              {state.isRecording ? 'Stop' : 'Record'}
            </button>
            {state.recordingBlob && !state.isRecording && (
              <div className="recording-actions">
                <button className="btn btn-sm btn-accent" onClick={downloadRecording}>
                  Download
                </button>
                <button className="btn btn-sm btn-secondary" onClick={clearRecording}>
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
