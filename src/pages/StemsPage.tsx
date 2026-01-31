import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioEngine } from '../context/AudioEngineContext';
import { TrackLoader } from '../components/TrackLoader';
import { useToast } from '../components/Toast';

// Types for stem separation
interface StemData {
  vocals: { left: Float32Array; right: Float32Array } | null;
  drums: { left: Float32Array; right: Float32Array } | null;
  bass: { left: Float32Array; right: Float32Array } | null;
  other: { left: Float32Array; right: Float32Array } | null;
}

interface StemMixState {
  vocals: { gain: number; muted: boolean; solo: boolean };
  drums: { gain: number; muted: boolean; solo: boolean };
  bass: { gain: number; muted: boolean; solo: boolean };
  other: { gain: number; muted: boolean; solo: boolean };
}

type SeparationStage = 'idle' | 'loading-model' | 'decoding' | 'separating' | 'assembling' | 'done' | 'error';

const DEFAULT_MIX_STATE: StemMixState = {
  vocals: { gain: 1, muted: false, solo: false },
  drums: { gain: 1, muted: false, solo: false },
  bass: { gain: 1, muted: false, solo: false },
  other: { gain: 1, muted: false, solo: false },
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Encode stereo audio data to WAV
function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 2;
  const numSamples = left.length;
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

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sampleL = Math.max(-1, Math.min(1, left[i]));
    const sampleR = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF, true);
    offset += 2;
    view.setInt16(offset, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

// Create AudioBuffer from stereo data
function createAudioBuffer(
  ctx: AudioContext,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): AudioBuffer {
  const buffer = ctx.createBuffer(2, left.length, sampleRate);
  // Create new Float32Arrays to satisfy TypeScript's strict typing
  buffer.copyToChannel(new Float32Array(left), 0);
  buffer.copyToChannel(new Float32Array(right), 1);
  return buffer;
}

export function StemsPage() {
  const { state, loadFileA } = useAudioEngine();
  const { showToast } = useToast();
  
  const deckA = state.deckA;
  
  // Separation state
  const [stage, setStage] = useState<SeparationStage>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);
  
  // Stem data
  const [stemData, setStemData] = useState<StemData | null>(null);
  const [mixState, setMixState] = useState<StemMixState>(DEFAULT_MIX_STATE);
  const [sampleRate, setSampleRate] = useState(44100);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<{
    vocals: AudioBufferSourceNode | null;
    drums: AudioBufferSourceNode | null;
    bass: AudioBufferSourceNode | null;
    other: AudioBufferSourceNode | null;
  }>({ vocals: null, drums: null, bass: null, other: null });
  const gainNodesRef = useRef<{
    vocals: GainNode | null;
    drums: GainNode | null;
    bass: GainNode | null;
    other: GainNode | null;
  }>({ vocals: null, drums: null, bass: null, other: null });
  const masterGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const pauseTimeRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  
  // Separation refs
  const processorRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Initialize audio context
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Update gain nodes based on mix state
  useEffect(() => {
    const gains = gainNodesRef.current;
    const anySoloed = mixState.vocals.solo || mixState.drums.solo || mixState.bass.solo || mixState.other.solo;
    
    const getEffectiveGain = (stemKey: keyof StemMixState) => {
      const stem = mixState[stemKey];
      if (anySoloed) {
        return stem.solo ? stem.gain : 0;
      }
      return stem.muted ? 0 : stem.gain;
    };
    
    if (gains.vocals) gains.vocals.gain.value = getEffectiveGain('vocals');
    if (gains.drums) gains.drums.gain.value = getEffectiveGain('drums');
    if (gains.bass) gains.bass.gain.value = getEffectiveGain('bass');
    if (gains.other) gains.other.gain.value = getEffectiveGain('other');
  }, [mixState]);

  // Time update loop
  useEffect(() => {
    const updateTime = () => {
      if (isPlaying && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        setCurrentTime(Math.min(elapsed, duration));
        
        if (elapsed >= duration) {
          stopPlayback();
        } else {
          animFrameRef.current = requestAnimationFrame(updateTime);
        }
      }
    };
    
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
    
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, duration]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    const sources = sourceNodesRef.current;
    try { sources.vocals?.stop(); } catch {}
    try { sources.drums?.stop(); } catch {}
    try { sources.bass?.stop(); } catch {}
    try { sources.other?.stop(); } catch {}
    
    sourceNodesRef.current = { vocals: null, drums: null, bass: null, other: null };
    setIsPlaying(false);
  }, []);

  // Start playback from a given time
  const startPlaybackFrom = useCallback((fromTime: number) => {
    if (!stemData || !audioContextRef.current) return;
    
    stopPlayback();
    
    const ctx = audioContextRef.current;
    const stemKeys: (keyof StemData)[] = ['vocals', 'drums', 'bass', 'other'];
    
    // Create gain nodes if needed
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.connect(ctx.destination);
    }
    
    stemKeys.forEach((key) => {
      const data = stemData[key];
      if (!data) return;
      
      // Create gain node if needed
      if (!gainNodesRef.current[key]) {
        gainNodesRef.current[key] = ctx.createGain();
        gainNodesRef.current[key]!.connect(masterGainRef.current!);
      }
      
      // Create and start source
      const buffer = createAudioBuffer(ctx, data.left, data.right, sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodesRef.current[key]!);
      
      const offsetSeconds = Math.max(0, Math.min(fromTime, buffer.duration));
      source.start(0, offsetSeconds);
      sourceNodesRef.current[key] = source;
    });
    
    startTimeRef.current = ctx.currentTime - fromTime;
    setIsPlaying(true);
    setCurrentTime(fromTime);
  }, [stemData, sampleRate, stopPlayback]);

  // Toggle play/pause
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pauseTimeRef.current = currentTime;
      stopPlayback();
    } else {
      startPlaybackFrom(pauseTimeRef.current);
    }
  }, [isPlaying, currentTime, startPlaybackFrom, stopPlayback]);

  // Seek
  const seekTo = useCallback((time: number) => {
    pauseTimeRef.current = time;
    setCurrentTime(time);
    if (isPlaying) {
      startPlaybackFrom(time);
    }
  }, [isPlaying, startPlaybackFrom]);

  // Stem separation
  const startSeparation = useCallback(async () => {
    if (!deckA.sourceBuffer) {
      showToast('Load a track first', 'warning');
      return;
    }

    abortControllerRef.current = new AbortController();
    
    try {
      // Stage 1: Loading model
      setStage('loading-model');
      setProgress(0);
      setProgressMessage('Loading Demucs model (84MB)...');
      
      // Dynamic imports
      const [{ DemucsProcessor, CONSTANTS }, ort] = await Promise.all([
        import('demucs-web'),
        import('onnxruntime-web')
      ]);
      
      const processor = new DemucsProcessor({
        ort,
        onProgress: (info: { progress: number; currentSegment: number; totalSegments: number }) => {
          setProgress(info.progress * 100);
          setProgressMessage(`Separating: segment ${info.currentSegment}/${info.totalSegments}`);
        },
        onLog: (type: string, msg: string) => {
          console.log(`[Demucs ${type}]`, msg);
        },
        onDownloadProgress: (loaded: number, total: number) => {
          const pct = (loaded / total) * 100;
          setModelDownloadProgress(pct);
          setProgressMessage(`Downloading model: ${Math.round(pct)}%`);
        }
      });
      
      processorRef.current = processor;
      
      await processor.loadModel(CONSTANTS.DEFAULT_MODEL_URL);
      
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Aborted');
      }
      
      // Stage 2: Decoding audio
      setStage('decoding');
      setProgress(0);
      setProgressMessage('Decoding audio...');
      
      const sourceBuffer = deckA.sourceBuffer;
      const sourceSampleRate = sourceBuffer.sampleRate;
      
      // Get stereo channels (or duplicate mono)
      let leftChannel: Float32Array;
      let rightChannel: Float32Array;
      
      if (sourceBuffer.numberOfChannels >= 2) {
        leftChannel = sourceBuffer.getChannelData(0);
        rightChannel = sourceBuffer.getChannelData(1);
      } else {
        leftChannel = sourceBuffer.getChannelData(0);
        rightChannel = new Float32Array(leftChannel);
      }
      
      // Resample to 44100 if needed
      let processLeft = leftChannel;
      let processRight = rightChannel;
      
      if (sourceSampleRate !== CONSTANTS.SAMPLE_RATE) {
        setProgressMessage('Resampling to 44100Hz...');
        const ratio = CONSTANTS.SAMPLE_RATE / sourceSampleRate;
        const newLength = Math.floor(leftChannel.length * ratio);
        
        processLeft = new Float32Array(newLength);
        processRight = new Float32Array(newLength);
        
        // Simple linear interpolation resampling
        for (let i = 0; i < newLength; i++) {
          const srcIdx = i / ratio;
          const srcIdxFloor = Math.floor(srcIdx);
          const srcIdxCeil = Math.min(srcIdxFloor + 1, leftChannel.length - 1);
          const frac = srcIdx - srcIdxFloor;
          
          processLeft[i] = leftChannel[srcIdxFloor] * (1 - frac) + leftChannel[srcIdxCeil] * frac;
          processRight[i] = rightChannel[srcIdxFloor] * (1 - frac) + rightChannel[srcIdxCeil] * frac;
        }
      }
      
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Aborted');
      }
      
      // Stage 3: Separation
      setStage('separating');
      setProgress(0);
      setProgressMessage('Running stem separation...');
      
      const result = await processor.separate(processLeft, processRight);
      
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Aborted');
      }
      
      // Stage 4: Assembling
      setStage('assembling');
      setProgress(100);
      setProgressMessage('Preparing stems for playback...');
      
      setStemData({
        vocals: result.vocals,
        drums: result.drums,
        bass: result.bass,
        other: result.other,
      });
      
      setSampleRate(CONSTANTS.SAMPLE_RATE);
      setDuration(processLeft.length / CONSTANTS.SAMPLE_RATE);
      
      // Initialize audio context
      ensureAudioContext();
      
      setStage('done');
      setProgressMessage('Separation complete!');
      showToast('Stems ready!', 'success');
      
    } catch (err: any) {
      if (err.message === 'Aborted') {
        setStage('idle');
        setProgressMessage('');
        showToast('Separation cancelled', 'info');
      } else {
        console.error('Separation failed:', err);
        setStage('error');
        setProgressMessage(`Error: ${err.message}`);
        showToast('Separation failed', 'error');
      }
    }
  }, [deckA.sourceBuffer, ensureAudioContext, showToast]);

  // Cancel separation
  const cancelSeparation = useCallback(() => {
    abortControllerRef.current?.abort();
    setStage('idle');
    setProgressMessage('');
  }, []);

  // Mix state helpers
  const setStemGain = useCallback((stem: keyof StemMixState, gain: number) => {
    setMixState(prev => ({
      ...prev,
      [stem]: { ...prev[stem], gain: Math.max(0, Math.min(1.5, gain)) }
    }));
  }, []);

  const toggleStemMute = useCallback((stem: keyof StemMixState) => {
    setMixState(prev => ({
      ...prev,
      [stem]: { ...prev[stem], muted: !prev[stem].muted, solo: false }
    }));
  }, []);

  const toggleStemSolo = useCallback((stem: keyof StemMixState) => {
    setMixState(prev => ({
      ...prev,
      [stem]: { ...prev[stem], solo: !prev[stem].solo, muted: false }
    }));
  }, []);

  // Presets
  const setAcapella = useCallback(() => {
    setMixState({
      vocals: { gain: 1, muted: false, solo: true },
      drums: { gain: 1, muted: true, solo: false },
      bass: { gain: 1, muted: true, solo: false },
      other: { gain: 1, muted: true, solo: false },
    });
    showToast('Acapella mode');
  }, [showToast]);

  const setInstrumental = useCallback(() => {
    setMixState({
      vocals: { gain: 1, muted: true, solo: false },
      drums: { gain: 1, muted: false, solo: false },
      bass: { gain: 1, muted: false, solo: false },
      other: { gain: 1, muted: false, solo: false },
    });
    showToast('Instrumental mode');
  }, [showToast]);

  const resetMix = useCallback(() => {
    setMixState(DEFAULT_MIX_STATE);
    showToast('Mix reset');
  }, [showToast]);

  // Download stem
  const downloadStem = useCallback((stemName: keyof StemData) => {
    if (!stemData || !stemData[stemName]) return;
    
    const data = stemData[stemName]!;
    const wavBuffer = encodeWav(data.left, data.right, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckA.fileName?.replace(/\.[^/.]+$/, '') || 'track'}_${stemName}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`Downloaded ${stemName}`, 'success');
  }, [stemData, sampleRate, deckA.fileName, showToast]);

  // Download current mix
  const downloadMix = useCallback(() => {
    if (!stemData) return;
    
    const anySoloed = mixState.vocals.solo || mixState.drums.solo || mixState.bass.solo || mixState.other.solo;
    const length = stemData.vocals?.left.length || 0;
    
    const mixLeft = new Float32Array(length);
    const mixRight = new Float32Array(length);
    
    const stemKeys: (keyof StemData)[] = ['vocals', 'drums', 'bass', 'other'];
    
    stemKeys.forEach((key) => {
      const data = stemData[key];
      if (!data) return;
      
      const stem = mixState[key];
      let effectiveGain = anySoloed ? (stem.solo ? stem.gain : 0) : (stem.muted ? 0 : stem.gain);
      
      for (let i = 0; i < length; i++) {
        mixLeft[i] += data.left[i] * effectiveGain;
        mixRight[i] += data.right[i] * effectiveGain;
      }
    });
    
    const wavBuffer = encodeWav(mixLeft, mixRight, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckA.fileName?.replace(/\.[^/.]+$/, '') || 'track'}_stems_mix.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Downloaded mix', 'success');
  }, [stemData, mixState, sampleRate, deckA.fileName, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      
      switch (e.code) {
        case 'KeyV':
          e.preventDefault();
          if (e.shiftKey) {
            toggleStemSolo('vocals');
            showToast('Vocals solo');
          } else {
            toggleStemMute('vocals');
            showToast('Vocals mute toggle');
          }
          break;
        case 'KeyD':
          e.preventDefault();
          if (e.shiftKey) {
            toggleStemSolo('drums');
          } else {
            toggleStemMute('drums');
          }
          break;
        case 'KeyB':
          e.preventDefault();
          if (e.shiftKey) {
            toggleStemSolo('bass');
          } else {
            toggleStemMute('bass');
          }
          break;
        case 'KeyO':
          e.preventDefault();
          if (e.shiftKey) {
            toggleStemSolo('other');
          } else {
            toggleStemMute('other');
          }
          break;
        case 'KeyA':
          if (!e.shiftKey) {
            e.preventDefault();
            setAcapella();
          }
          break;
        case 'KeyI':
          e.preventDefault();
          setInstrumental();
          break;
        case 'Space':
          if (stemData) {
            e.preventDefault();
            togglePlayback();
          }
          break;
        case 'Escape':
          if (stage === 'loading-model' || stage === 'decoding' || stage === 'separating') {
            e.preventDefault();
            cancelSeparation();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleStemMute, toggleStemSolo, setAcapella, setInstrumental, togglePlayback, cancelSeparation, stemData, stage, showToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const isSeparating = stage === 'loading-model' || stage === 'decoding' || stage === 'separating' || stage === 'assembling';
  const canSeparate = deckA.sourceBuffer && !isSeparating;

  return (
    <div className="page stems-page">
      <div className="stems-header">
        <h2 className="stems-title">AI STEM SEPARATION</h2>
        <p className="stems-subtitle">Powered by Demucs • Real-time AI separation in your browser</p>
      </div>

      {/* Source Track */}
      <section className="card stems-source-card">
        <div className="card-header">
          <h3 className="card-title">Source Track</h3>
        </div>
        <TrackLoader
          trackName={deckA.fileName}
          onLoadFile={loadFileA}
          label="Load Audio File"
        />
        
        {deckA.sourceBuffer && (
          <div className="stems-source-info">
            <span>Duration: {formatTime(deckA.duration)}</span>
            <span>•</span>
            <span>{deckA.sourceBuffer.sampleRate}Hz</span>
            <span>•</span>
            <span>{deckA.sourceBuffer.numberOfChannels}ch</span>
          </div>
        )}
      </section>

      {/* Separation Controls */}
      <section className="card stems-separation-card">
        <div className="card-header">
          <h3 className="card-title">Separation</h3>
        </div>
        
        {stage === 'idle' && (
          <div className="separation-idle">
            <button
              className="btn btn-primary btn-lg stems-split-btn"
              onClick={startSeparation}
              disabled={!canSeparate}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M2 12h20" strokeLinecap="round"/>
              </svg>
              Split to Stems
            </button>
            <p className="stems-warning">
              ⚠️ Stem separation is CPU/GPU intensive. First run downloads the model (~84MB).
              Processing may take 30s–5min depending on track length and device.
            </p>
          </div>
        )}
        
        {isSeparating && (
          <div className="separation-progress">
            <div className="progress-bar-container">
              <div className="progress-bar-bg">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${stage === 'loading-model' ? modelDownloadProgress : progress}%` }}
                />
              </div>
              <div className="progress-text">
                {progressMessage}
              </div>
            </div>
            <button className="btn btn-secondary" onClick={cancelSeparation}>
              Cancel
            </button>
          </div>
        )}
        
        {stage === 'error' && (
          <div className="separation-error">
            <p>{progressMessage}</p>
            <button className="btn btn-primary" onClick={startSeparation}>
              Retry
            </button>
          </div>
        )}
      </section>

      {/* Stems Mixer */}
      {(stage === 'done' && stemData) && (
        <>
          <section className="card stems-mixer-card">
            <div className="card-header">
              <h3 className="card-title">Stems Mixer</h3>
              <div className="stems-playback-controls">
                <button className="stems-play-btn" onClick={togglePlayback}>
                  {isPlaying ? (
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
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <input
                  type="range"
                  className="stems-seek-slider"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                />
              </div>
            </div>
            
            <div className="stems-channels">
              {(['vocals', 'drums', 'bass', 'other'] as const).map((stemKey) => {
                const stem = mixState[stemKey];
                const colors = {
                  vocals: '#f472b6',
                  drums: '#fb923c',
                  bass: '#4ade80',
                  other: '#60a5fa',
                };
                const icons = {
                  vocals: '🎤',
                  drums: '🥁',
                  bass: '🎸',
                  other: '🎹',
                };
                
                return (
                  <div 
                    key={stemKey}
                    className={`stem-channel ${stem.muted ? 'muted' : ''} ${stem.solo ? 'solo' : ''}`}
                    style={{ '--stem-color': colors[stemKey] } as React.CSSProperties}
                  >
                    <div className="stem-channel-header">
                      <span className="stem-icon">{icons[stemKey]}</span>
                      <span className="stem-name">{stemKey.charAt(0).toUpperCase() + stemKey.slice(1)}</span>
                    </div>
                    
                    <div className="stem-channel-slider">
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={stem.gain}
                        onChange={(e) => setStemGain(stemKey, parseFloat(e.target.value))}
                        disabled={stem.muted}
                      />
                      <span className="stem-gain-value">{Math.round(stem.gain * 100)}%</span>
                    </div>
                    
                    <div className="stem-channel-buttons">
                      <button
                        className={`stem-btn stem-mute-btn ${stem.muted ? 'active' : ''}`}
                        onClick={() => toggleStemMute(stemKey)}
                      >
                        M
                      </button>
                      <button
                        className={`stem-btn stem-solo-btn ${stem.solo ? 'active' : ''}`}
                        onClick={() => toggleStemSolo(stemKey)}
                      >
                        S
                      </button>
                      <button
                        className="stem-btn stem-download-btn"
                        onClick={() => downloadStem(stemKey)}
                        title={`Download ${stemKey}`}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Presets & Export */}
          <section className="card stems-actions-card">
            <div className="stems-presets">
              <button className="btn btn-preset" onClick={setAcapella}>
                🎤 Acapella
              </button>
              <button className="btn btn-preset" onClick={setInstrumental}>
                🎸 Instrumental
              </button>
              <button className="btn btn-preset" onClick={resetMix}>
                ↺ Reset
              </button>
            </div>
            
            <div className="stems-export">
              <button className="btn btn-accent" onClick={downloadMix}>
                📥 Download Current Mix
              </button>
            </div>
          </section>
        </>
      )}

      {/* Info */}
      <div className="stems-info">
        <p>
          <strong>Keyboard:</strong> V=mute vocals, Shift+V=solo vocals, A=acapella, I=instrumental, Space=play/pause, Esc=cancel
        </p>
      </div>
    </div>
  );
}
