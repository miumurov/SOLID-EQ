import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioEngine } from '../context/AudioEngineContext';
import { WAVEFORM_SAMPLES, BUILT_IN_DJ_SCENES } from '../audio/AudioEngine';

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

export function DJPage() {
  const {
    state,
    loadFile,
    togglePlay,
    seek,
    setPlaybackRate,
    setDjFilterValue,
    setEchoMix,
    setEchoTime,
    setEchoFeedback,
    setDjBypass,
    setHotCue,
    triggerHotCue,
    clearHotCue,
    setLoopIn,
    setLoopOut,
    toggleLoop,
    clearLoop,
    storeDjSceneA,
    storeDjSceneB,
    loadDjSceneA,
    loadDjSceneB,
    morphToScene,
    cancelMorph,
    applyBuiltInDjScene,
    toggleRecording,
    downloadRecording,
    clearRecording,
  } = useAudioEngine();

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedDjPreset, setSelectedDjPreset] = useState('');
  
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformPeaksRef = useRef<number[]>([]);
  const playheadRafRef = useRef<number>(0);
  const isPlayheadAnimatingRef = useRef(false);

  // Compute waveform peaks
  useEffect(() => {
    if (state.sourceBuffer) {
      const peaks = computeWaveformPeaks(state.sourceBuffer, WAVEFORM_SAMPLES);
      waveformPeaksRef.current = peaks;
      drawWaveform();
    } else {
      waveformPeaksRef.current = [];
      drawWaveform();
    }
  }, [state.sourceBuffer]);

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
      ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Load a track to begin', width / 2, height / 2);
      return;
    }
    
    const centerY = height / 2;
    const barWidth = width / peaks.length;
    
    // Draw loop region if set
    if (state.loopIn !== null && state.loopOut !== null && state.duration > 0) {
      const loopStartX = (state.loopIn / state.duration) * width;
      const loopEndX = (state.loopOut / state.duration) * width;
      ctx.fillStyle = state.loopEnabled ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);
    }
    
    // Draw hot cue markers
    state.hotCues.forEach((cue, index) => {
      if (cue && state.duration > 0) {
        const cueX = (cue.time / state.duration) * width;
        const colors = ['#f43f5e', '#eab308', '#22c55e', '#3b82f6'];
        ctx.fillStyle = colors[index];
        ctx.fillRect(cueX - 1, 0, 3, height);
      }
    });
    
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = peaks[i] * (height * 0.45);
      ctx.moveTo(x, centerY - amplitude);
      ctx.lineTo(x, centerY + amplitude);
    }
    
    ctx.stroke();
    
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }, [state.hotCues, state.loopIn, state.loopOut, state.loopEnabled, state.duration]);

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
      if (canvas && state.duration > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          const width = rect.width;
          const height = rect.height;
          
          drawWaveform();
          
          const progress = state.currentTime / state.duration;
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
    
    if (state.isPlaying && state.duration > 0) {
      isPlayheadAnimatingRef.current = true;
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      isPlayheadAnimatingRef.current = false;
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
      }
      
      if (state.duration > 0) {
        drawWaveform();
        const canvas = waveformCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const rect = canvas.getBoundingClientRect();
            const progress = state.currentTime / state.duration;
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
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
      }
    };
  }, [state.isPlaying, state.duration, state.currentTime, drawWaveform]);

  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !state.duration) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = clickX / rect.width;
    seek(progress * state.duration);
  }, [state.duration, seek]);

  const handleFileSelect = useCallback(async (file: File) => {
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
    
    const isValidType = validTypes.includes(file.type);
    const isValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isValidType && !isValidExtension) {
      alert('Please select a valid audio file (mp3, wav, ogg, or m4a)');
      return;
    }

    await loadFile(file);
  }, [loadFile]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const getFilterLabel = (value: number): string => {
    if (value === 0) return 'OFF';
    if (value < 0) return `LP ${value}`;
    return `HP +${value}`;
  };

  const handleApplyDjPreset = useCallback(() => {
    if (selectedDjPreset && BUILT_IN_DJ_SCENES[selectedDjPreset]) {
      applyBuiltInDjScene(selectedDjPreset);
    }
  }, [selectedDjPreset, applyBuiltInDjScene]);

  return (
    <div className="page dj-page">
      {/* Deck Card */}
      <section className="card deck-card">
        <div className="card-header">
          <h2 className="card-title">Deck</h2>
          {state.fileName && (
            <span className="deck-track-name">{state.fileName}</span>
          )}
        </div>
        <div className="card-content">
          {!state.audioSrc ? (
            <label
              className={`drop-zone ${isDraggingOver ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleFileDrop}
              htmlFor="file-input-dj"
            >
              <svg className="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M12 1.5v13.5m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="drop-zone-text">Drop track here</p>
              <input
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,audio/*"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                id="file-input-dj"
              />
            </label>
          ) : (
            <div className="deck-display">
              <div className="waveform-container waveform-large">
                <canvas 
                  ref={waveformCanvasRef}
                  className="waveform-canvas"
                  onClick={handleWaveformClick}
                />
              </div>
              
              <div className="deck-info-row">
                <span className="deck-time">{formatTime(state.currentTime)}</span>
                <span className="deck-bpm">{(state.playbackRate * 100).toFixed(0)}%</span>
                <span className="deck-duration">{formatTime(state.duration)}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Transport Card */}
      <section className="card transport-card">
        <div className="card-header">
          <h2 className="card-title">Transport</h2>
          {state.isRecording && (
            <span className="recording-badge">
              ● REC {formatTime(state.recordingDuration)}
            </span>
          )}
        </div>
        <div className="card-content">
          <div className="transport-main">
            <button 
              className="transport-play-btn" 
              onClick={togglePlay}
              disabled={!state.audioSrc}
            >
              {state.isPlaying ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
          </div>
          
          <div className="transport-record">
            <button
              className={`record-btn ${state.isRecording ? 'active' : ''}`}
              onClick={toggleRecording}
            >
              <span className="rec-dot"></span>
              {state.isRecording ? 'Stop Recording' : 'Record'}
            </button>
            {state.recordingBlob && !state.isRecording && (
              <div className="recording-actions">
                <button className="btn btn-sm btn-accent" onClick={downloadRecording}>
                  Download Recording
                </button>
                <button className="btn btn-sm btn-secondary" onClick={clearRecording}>
                  Discard
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DJ Scenes Card */}
      <section className="card scenes-card">
        <div className="card-header">
          <h2 className="card-title">DJ Scenes</h2>
          {state.isMorphing && (
            <span className="morph-indicator">Morphing...</span>
          )}
        </div>
        <div className="card-content">
          <div className="scenes-row">
            <div className="scene-slot">
              <div className="scene-controls">
                <button
                  className={`scene-btn ${state.activeDjScene === 'A' ? 'active' : ''}`}
                  onClick={loadDjSceneA}
                >
                  A
                </button>
                <button className="scene-store-btn" onClick={storeDjSceneA} title="Store to A">
                  ↓
                </button>
              </div>
              <button 
                className="morph-btn"
                onClick={() => morphToScene('A')}
                disabled={state.isMorphing}
              >
                Morph → A
              </button>
            </div>

            <div className="scene-slot">
              <div className="scene-controls">
                <button
                  className={`scene-btn ${state.activeDjScene === 'B' ? 'active' : ''}`}
                  onClick={loadDjSceneB}
                >
                  B
                </button>
                <button className="scene-store-btn" onClick={storeDjSceneB} title="Store to B">
                  ↓
                </button>
              </div>
              <button 
                className="morph-btn"
                onClick={() => morphToScene('B')}
                disabled={state.isMorphing}
              >
                Morph → B
              </button>
            </div>

            {state.isMorphing && (
              <button className="cancel-morph-btn" onClick={cancelMorph}>
                Cancel
              </button>
            )}
          </div>

          <div className="scene-presets">
            <select
              className="preset-select"
              value={selectedDjPreset}
              onChange={(e) => setSelectedDjPreset(e.target.value)}
            >
              <option value="">Load Scene Preset...</option>
              {Object.keys(BUILT_IN_DJ_SCENES).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button 
              className="btn btn-sm btn-secondary"
              onClick={handleApplyDjPreset}
              disabled={!selectedDjPreset}
            >
              Apply
            </button>
          </div>
        </div>
      </section>

      {/* Tempo Card */}
      <section className="card tempo-card">
        <div className="card-header">
          <h2 className="card-title">Tempo</h2>
          <button 
            className="btn btn-sm btn-secondary"
            onClick={() => setPlaybackRate(1.0)}
          >
            Reset
          </button>
        </div>
        <div className="card-content">
          <div className="tempo-control">
            <div className="tempo-slider-container">
              <input
                type="range"
                className="tempo-slider"
                min={0.5}
                max={1.5}
                step={0.01}
                value={state.playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              />
            </div>
            <div className="tempo-display">
              <span className="tempo-value">{(state.playbackRate * 100).toFixed(0)}%</span>
              <span className="tempo-label">Speed</span>
            </div>
          </div>
          <div className="tempo-presets">
            <button className="btn btn-sm" onClick={() => setPlaybackRate(0.8)}>80%</button>
            <button className="btn btn-sm" onClick={() => setPlaybackRate(0.9)}>90%</button>
            <button className="btn btn-sm" onClick={() => setPlaybackRate(1.0)}>100%</button>
            <button className="btn btn-sm" onClick={() => setPlaybackRate(1.1)}>110%</button>
            <button className="btn btn-sm" onClick={() => setPlaybackRate(1.2)}>120%</button>
          </div>
        </div>
      </section>

      {/* Effects Card */}
      <section className={`card effects-card ${state.djBypass ? 'bypassed' : ''}`}>
        <div className="card-header">
          <h2 className="card-title">Effects</h2>
          <div className="fx-bypass-controls">
            <span className={`fx-bypass-debug ${state.djBypass ? 'on' : 'off'}`}>
              FX BYPASS: {state.djBypass ? 'ON' : 'OFF'}
            </span>
            <button
              className={`btn btn-bypass ${state.djBypass ? 'active' : ''}`}
              onClick={() => setDjBypass(!state.djBypass)}
            >
              {state.djBypass ? 'Bypassed' : 'Bypass'}
            </button>
          </div>
        </div>
        <div className="card-content">
          {/* DJ Filter */}
          <div className="effect-section">
            <div className="effect-header">
              <span className="effect-name">Filter</span>
              <span className="effect-value">{getFilterLabel(state.djFilterValue)}</span>
            </div>
            <input
              type="range"
              className="effect-slider"
              min={-100}
              max={100}
              step={1}
              value={state.djFilterValue}
              onChange={(e) => setDjFilterValue(parseInt(e.target.value))}
              disabled={state.djBypass}
            />
            <div className="effect-labels">
              <span>LP</span>
              <span>OFF</span>
              <span>HP</span>
            </div>
          </div>

          {/* Echo */}
          <div className="effect-section">
            <div className="effect-header">
              <span className="effect-name">Echo</span>
              <span className="effect-value">{Math.round(state.echoMix * 100)}%</span>
            </div>
            <div className="effect-controls">
              <div className="effect-control">
                <label>Mix</label>
                <input
                  type="range"
                  className="effect-slider-small"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.echoMix}
                  onChange={(e) => setEchoMix(parseFloat(e.target.value))}
                  disabled={state.djBypass}
                />
              </div>
              <div className="effect-control">
                <label>Time</label>
                <input
                  type="range"
                  className="effect-slider-small"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={state.echoTime}
                  onChange={(e) => setEchoTime(parseFloat(e.target.value))}
                  disabled={state.djBypass}
                />
              </div>
              <div className="effect-control">
                <label>Feedback</label>
                <input
                  type="range"
                  className="effect-slider-small"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={state.echoFeedback}
                  onChange={(e) => setEchoFeedback(parseFloat(e.target.value))}
                  disabled={state.djBypass}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hot Cues Card */}
      <section className="card hotcues-card">
        <div className="card-header">
          <h2 className="card-title">Hot Cues</h2>
          <span className="card-hint">Shift+1-4 to set, 1-4 to trigger</span>
        </div>
        <div className="card-content">
          <div className="hotcue-grid">
            {[0, 1, 2, 3].map((index) => {
              const cue = state.hotCues[index];
              const colors = ['#f43f5e', '#eab308', '#22c55e', '#3b82f6'];
              return (
                <div key={index} className="hotcue-slot">
                  <button
                    className={`hotcue-btn ${cue ? 'active' : ''}`}
                    style={{ '--cue-color': colors[index] } as React.CSSProperties}
                    onClick={() => cue ? triggerHotCue(index) : setHotCue(index)}
                    disabled={!state.audioSrc}
                  >
                    {index + 1}
                  </button>
                  {cue && (
                    <div className="hotcue-info">
                      <span className="hotcue-time">{formatTime(cue.time)}</span>
                      <button 
                        className="hotcue-clear"
                        onClick={() => clearHotCue(index)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Loop Card */}
      <section className="card loop-card">
        <div className="card-header">
          <h2 className="card-title">Loop</h2>
          <button
            className="btn btn-sm btn-secondary"
            onClick={clearLoop}
            disabled={state.loopIn === null && state.loopOut === null}
          >
            Clear
          </button>
        </div>
        <div className="card-content">
          <div className="loop-controls">
            <button
              className={`loop-btn ${state.loopIn !== null ? 'active' : ''}`}
              onClick={setLoopIn}
              disabled={!state.audioSrc}
            >
              IN {state.loopIn !== null && <span>({formatTime(state.loopIn)})</span>}
            </button>
            <button
              className={`loop-btn ${state.loopOut !== null ? 'active' : ''}`}
              onClick={setLoopOut}
              disabled={!state.audioSrc}
            >
              OUT {state.loopOut !== null && <span>({formatTime(state.loopOut)})</span>}
            </button>
            <button
              className={`loop-toggle-btn ${state.loopEnabled ? 'active' : ''}`}
              onClick={toggleLoop}
              disabled={state.loopIn === null || state.loopOut === null}
            >
              {state.loopEnabled ? 'LOOP ON' : 'LOOP OFF'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
