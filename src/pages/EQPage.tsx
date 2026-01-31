import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioEngine } from '../context/AudioEngineContext';
import { 
  EQ_FREQUENCIES, 
  MIN_GAIN, 
  MAX_GAIN, 
  BUILT_IN_PRESETS, 
  FLAT_GAINS,
  WAVEFORM_SAMPLES 
} from '../audio/AudioEngine';

type ExportFormat = '16bit' | '32bit';

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

function findPeakAmplitude(audioBuffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }
  }
  return peak;
}

function normalizeAudioBuffer(audioBuffer: AudioBuffer, targetPeak = 0.98): void {
  const currentPeak = findPeakAmplitude(audioBuffer);
  if (currentPeak <= 0) return;
  
  const gain = targetPeak / currentPeak;
  if (gain >= 1) return;
  
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] *= gain;
    }
  }
}

function encodeWav16bit(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return buffer;
}

function encodeWav32bitFloat(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bytesPerSample = 4;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setFloat32(offset, channels[ch][i], true);
      offset += 4;
    }
  }

  return buffer;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function EQPage() {
  const {
    state,
    loadFile,
    loadUrl,
    togglePlay,
    seek,
    skipBackward,
    skipForward,
    setVolume,
    setBandGain,
    setAllGains,
    setEqBypass,
    switchSlot,
    userPresets,
    saveUserPreset,
    deleteUserPreset,
  } = useAudioEngine();

  const [urlInput, setUrlInput] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('16bit');
  const [normalizeOnExport, setNormalizeOnExport] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformPeaksRef = useRef<number[]>([]);
  const playheadRafRef = useRef<number>(0);
  const isPlayheadAnimatingRef = useRef(false);

  // Sync seekValue when not seeking
  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(state.currentTime);
    }
  }, [state.currentTime, isSeeking]);

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
      ctx.fillText('No waveform data', width / 2, height / 2);
      return;
    }
    
    const centerY = height / 2;
    const barWidth = width / peaks.length;
    
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
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.fillRect(0, 0, playheadX, height);
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

  const handleUrlSubmit = useCallback(() => {
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const urlLower = urlInput.toLowerCase();
    
    if (!validExtensions.some(ext => urlLower.includes(ext))) {
      alert('Please enter a direct audio URL (.mp3, .wav, .ogg, or .m4a)');
      return;
    }

    loadUrl(urlInput);
    setUrlInput('');
  }, [urlInput, loadUrl]);

  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset) return;
    
    let presetGains: number[] | undefined;
    
    if (BUILT_IN_PRESETS[selectedPreset]) {
      presetGains = [...BUILT_IN_PRESETS[selectedPreset]];
    } else {
      const userPreset = userPresets.find(p => p.name === selectedPreset);
      if (userPreset) {
        presetGains = [...userPreset.gains];
      }
    }
    
    if (presetGains) {
      setAllGains(presetGains);
    }
  }, [selectedPreset, userPresets, setAllGains]);

  const handleSavePreset = useCallback(() => {
    const name = prompt('Enter preset name:');
    if (!name || !name.trim()) return;
    
    const trimmedName = name.trim();
    
    if (BUILT_IN_PRESETS[trimmedName]) {
      alert('Cannot use a built-in preset name.');
      return;
    }
    
    saveUserPreset(trimmedName);
    setSelectedPreset(trimmedName);
  }, [saveUserPreset]);

  const handleResetEQ = useCallback(() => {
    setAllGains([...FLAT_GAINS]);
  }, [setAllGains]);

  const handleSeekPointerDown = useCallback(() => {
    setIsSeeking(true);
  }, []);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(parseFloat(e.target.value));
  }, []);

  const handleSeekPointerUp = useCallback(() => {
    if (isFinite(seekValue)) {
      seek(seekValue);
    }
    setIsSeeking(false);
  }, [seekValue, seek]);

  const exportWav = useCallback(async () => {
    if (!state.sourceBuffer) return;

    setIsExporting(true);
    setExportStatus('Rendering...');
    
    try {
      const offlineCtx = new OfflineAudioContext(
        state.sourceBuffer.numberOfChannels,
        state.sourceBuffer.length,
        state.sourceBuffer.sampleRate
      );

      const bufferSource = offlineCtx.createBufferSource();
      bufferSource.buffer = state.sourceBuffer;

      const filters = EQ_FREQUENCIES.map((freq, index) => {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = state.gains[index];
        return filter;
      });

      let currentNode: AudioNode = bufferSource;
      filters.forEach((filter) => {
        currentNode.connect(filter);
        currentNode = filter;
      });
      currentNode.connect(offlineCtx.destination);

      bufferSource.start(0);
      const renderedBuffer = await offlineCtx.startRendering();

      if (normalizeOnExport) {
        setExportStatus('Normalizing...');
        await new Promise(resolve => setTimeout(resolve, 10));
        normalizeAudioBuffer(renderedBuffer, 0.98);
      }

      setExportStatus('Encoding...');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const wavData = exportFormat === '32bit' 
        ? encodeWav32bitFloat(renderedBuffer)
        : encodeWav16bit(renderedBuffer);

      setExportStatus('Downloading...');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = state.fileName?.replace(/\.[^/.]+$/, '') || 'audio';
      const formatSuffix = exportFormat === '32bit' ? '_32bit' : '';
      a.download = `${baseName}_eq${formatSuffix}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportStatus('Done!');
      setTimeout(() => setExportStatus(''), 2000);
    } catch (err) {
      console.error('Failed to export WAV:', err);
      setExportStatus('Error');
      alert('Failed to export audio. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [state.sourceBuffer, state.gains, state.fileName, exportFormat, normalizeOnExport]);

  const formatFrequency = (freq: number) => {
    return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
  };

  return (
    <div className="page eq-page">
      {/* Source Card */}
      <section className="card source-card">
        <div className="card-header">
          <h2 className="card-title">Audio Source</h2>
        </div>
        <div className="card-content">
          <label
            className={`drop-zone ${isDraggingOver ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleFileDrop}
            htmlFor="file-input-eq"
          >
            <svg className="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M12 1.5v13.5m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="drop-zone-text">Drop audio file here or click to browse</p>
            <p className="drop-zone-formats">Supports MP3, WAV, OGG, M4A</p>
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,audio/*"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              id="file-input-eq"
            />
          </label>

          <div className="url-row">
            <input
              type="text"
              className="text-input"
              placeholder="Or paste audio URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            />
            <button className="btn btn-secondary" onClick={handleUrlSubmit}>
              Load
            </button>
          </div>
        </div>
      </section>

      {/* Playback Card */}
      <section className="card playback-card">
        <div className="card-header">
          <h2 className="card-title">Playback</h2>
        </div>
        <div className="card-content">
          {state.audioSrc ? (
            <>
              <div className="track-row">
                <div className="track-artwork">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <div className="track-meta">
                  <div className="track-title">{state.fileName}</div>
                  <div className="track-subtitle">{state.isPlaying ? 'Playing' : 'Paused'}</div>
                </div>
                <div className="track-time">
                  {formatTime(state.currentTime)} / {formatTime(state.duration)}
                </div>
              </div>

              <div className="timeline-container">
                <input
                  type="range"
                  className="timeline-slider"
                  min={0}
                  max={state.duration || 0}
                  step={0.01}
                  value={Math.min(seekValue, state.duration || 0)}
                  disabled={!state.duration || state.duration <= 0}
                  onChange={handleSeekChange}
                  onPointerDown={handleSeekPointerDown}
                  onPointerUp={handleSeekPointerUp}
                />
              </div>

              <div className="controls-row">
                <div className="playback-buttons">
                  <button 
                    className="play-pause-btn" 
                    onClick={togglePlay} 
                    aria-label={state.isPlaying ? 'Pause' : 'Play'}
                  >
                    {state.isPlaying ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>
                  <button 
                    className="skip-btn" 
                    onClick={() => skipBackward()}
                    disabled={!state.duration}
                  >
                    −5s
                  </button>
                  <button 
                    className="skip-btn" 
                    onClick={() => skipForward()}
                    disabled={!state.duration}
                  >
                    +5s
                  </button>
                </div>
                <div className="volume-group">
                  <svg className="volume-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                  </svg>
                  <input
                    type="range"
                    className="volume-slider"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              Load an audio file to start playback
            </div>
          )}
        </div>
      </section>

      {/* Waveform Card */}
      <section className="card waveform-card">
        <div className="card-header">
          <h2 className="card-title">Waveform</h2>
          <span className="waveform-hint">Click to seek</span>
        </div>
        <div className="card-content">
          <div className="waveform-container">
            <canvas 
              ref={waveformCanvasRef}
              className="waveform-canvas"
              onClick={handleWaveformClick}
            />
          </div>
        </div>
      </section>

      {/* EQ Card */}
      <section className={`card eq-card ${state.isBypassed ? 'bypassed' : ''}`}>
        <div className="card-header">
          <h2 className="card-title">8-Band Equalizer</h2>
          <div className="eq-actions">
            <div className="ab-compare">
              <button
                className={`btn btn-ab ${state.activeSlot === 'A' ? 'active' : ''}`}
                onClick={() => switchSlot('A')}
              >
                A
              </button>
              <button
                className={`btn btn-ab ${state.activeSlot === 'B' ? 'active' : ''}`}
                onClick={() => switchSlot('B')}
              >
                B
              </button>
            </div>
            
            <button
              className={`btn btn-bypass ${state.isBypassed ? 'active' : ''}`}
              onClick={() => setEqBypass(!state.isBypassed)}
              title={state.isBypassed ? 'EQ Bypassed' : 'EQ Active'}
            >
              {state.isBypassed ? 'Bypassed' : 'Bypass'}
            </button>
            
            <button className="btn btn-secondary" onClick={handleResetEQ}>
              Reset
            </button>
          </div>
        </div>

        <div className="presets-row">
          <div className="preset-select-group">
            <select
              className="preset-select"
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
            >
              <option value="">Select Preset...</option>
              <optgroup label="Built-in">
                {Object.keys(BUILT_IN_PRESETS).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </optgroup>
              {userPresets.length > 0 && (
                <optgroup label="User Presets">
                  {userPresets.map(preset => (
                    <option key={preset.name} value={preset.name}>{preset.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleApplyPreset}
              disabled={!selectedPreset}
            >
              Apply
            </button>
          </div>
          <div className="preset-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleSavePreset}>
              Save Preset
            </button>
            {selectedPreset && userPresets.some(p => p.name === selectedPreset) && (
              <button 
                className="btn btn-danger btn-sm"
                onClick={() => {
                  deleteUserPreset(selectedPreset);
                  setSelectedPreset('');
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="card-content">
          <div className={`eq-sliders ${state.isBypassed ? 'disabled' : ''}`}>
            {EQ_FREQUENCIES.map((freq, index) => (
              <div key={freq} className="eq-band">
                <span className="gain-value">
                  {state.gains[index] > 0 ? '+' : ''}{state.gains[index].toFixed(1)} dB
                </span>
                <input
                  type="range"
                  min={MIN_GAIN}
                  max={MAX_GAIN}
                  step={0.5}
                  value={state.gains[index]}
                  onChange={(e) => setBandGain(index, parseFloat(e.target.value))}
                  className="eq-slider"
                  aria-label={`${formatFrequency(freq)} Hz gain`}
                  disabled={state.isBypassed}
                />
                <span className="freq-label">{formatFrequency(freq)} Hz</span>
              </div>
            ))}
          </div>
          <div className="eq-scale">
            <span>+{MAX_GAIN} dB</span>
            <span>0 dB</span>
            <span>{MIN_GAIN} dB</span>
          </div>
        </div>
      </section>

      {/* Export Card */}
      <section className="card export-card">
        <div className="card-header">
          <h2 className="card-title">Export with EQ</h2>
        </div>
        <div className="card-content">
          <div className="export-options">
            <div className="export-option">
              <label className="option-label">Format</label>
              <div className="format-toggle">
                <button
                  className={`format-btn ${exportFormat === '16bit' ? 'active' : ''}`}
                  onClick={() => setExportFormat('16bit')}
                  disabled={isExporting}
                >
                  16-bit PCM
                </button>
                <button
                  className={`format-btn ${exportFormat === '32bit' ? 'active' : ''}`}
                  onClick={() => setExportFormat('32bit')}
                  disabled={isExporting}
                >
                  32-bit Float
                </button>
              </div>
            </div>
            
            <div className="export-option">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={normalizeOnExport}
                  onChange={(e) => setNormalizeOnExport(e.target.checked)}
                  disabled={isExporting}
                />
                <span className="toggle-switch"></span>
                <span className="toggle-text">Normalize on export</span>
              </label>
              <span className="option-hint">Peak to -0.18 dB</span>
            </div>
          </div>

          <div className="export-action">
            <div className="export-info">
              {isExporting && exportStatus ? (
                <div className="export-status">
                  <span className="status-indicator"></span>
                  {exportStatus}
                </div>
              ) : (
                <div className="export-hint">
                  {state.sourceBuffer 
                    ? `Ready to export • ${exportFormat === '32bit' ? '32-bit float' : '16-bit PCM'}${normalizeOnExport ? ' • Normalized' : ''}`
                    : 'Load a local audio file to enable export'}
                </div>
              )}
            </div>
            <button
              className="btn btn-accent"
              onClick={exportWav}
              disabled={!state.sourceBuffer || isExporting}
            >
              {isExporting ? (
                <span className="loading">{exportStatus || 'Exporting...'}</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Export WAV
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
