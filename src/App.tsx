import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

const EQ_FREQUENCIES = [60, 170, 350, 1000, 3500, 6000, 10000, 14000];
const DEFAULT_GAIN = 0;
const MIN_GAIN = -24;
const MAX_GAIN = 24;
const Q_VALUE = 1.0;
const WAVEFORM_SAMPLES = 800; // Number of peak samples for waveform

const FLAT_GAINS = [0, 0, 0, 0, 0, 0, 0, 0];

// Built-in presets
const BUILT_IN_PRESETS: Record<string, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 3, -1, 0, 1, 2, 2, 1],
  'Vocal': [-2, -1, 2, 4, 3, 1, 0, -1],
  'Bright': [-2, -1, 0, 1, 2, 4, 5, 4],
  'Club': [5, 3, 0, -1, 2, 3, 2, 1],
};

const USER_PRESETS_KEY = 'solidEQ_userPresets';

interface UserPreset {
  name: string;
  gains: number[];
}

function loadUserPresets(): UserPreset[] {
  try {
    const stored = localStorage.getItem(USER_PRESETS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load user presets:', e);
  }
  return [];
}

function saveUserPresets(presets: UserPreset[]): void {
  try {
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save user presets:', e);
  }
}

/**
 * Computes downsampled peak amplitudes from an AudioBuffer
 */
function computeWaveformPeaks(buffer: AudioBuffer, numSamples: number): number[] {
  const channelData = buffer.getChannelData(0); // Use first channel
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

type ExportFormat = '16bit' | '32bit';

/**
 * Find peak amplitude across all channels
 */
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

/**
 * Normalize audio buffer in-place to target peak (default 0.98)
 */
function normalizeAudioBuffer(audioBuffer: AudioBuffer, targetPeak = 0.98): void {
  const currentPeak = findPeakAmplitude(audioBuffer);
  if (currentPeak <= 0) return; // Silence or invalid
  
  const gain = targetPeak / currentPeak;
  if (gain >= 1) return; // Already below target, no need to reduce
  
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] *= gain;
    }
  }
}

/**
 * Encodes an AudioBuffer to WAV format (PCM 16-bit)
 */
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

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  
  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);           // fmt chunk size
  view.setUint16(20, 1, true);            // audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  
  // data chunk
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

/**
 * Encodes an AudioBuffer to WAV format (32-bit IEEE float)
 */
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

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  
  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);           // fmt chunk size
  view.setUint16(20, 3, true);            // audio format (3 = IEEE float)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  
  // data chunk
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

function App() {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [gains, setGains] = useState<number[]>(EQ_FREQUENCIES.map(() => DEFAULT_GAIN));
  const [isAudioContextInitialized, setIsAudioContextInitialized] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('16bit');
  const [normalizeOnExport, setNormalizeOnExport] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  
  // Pro EQ features
  const [isBypassed, setIsBypassed] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [slotAGains, setSlotAGains] = useState<number[]>([...FLAT_GAINS]);
  const [slotBGains, setSlotBGains] = useState<number[]>([...FLAT_GAINS]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const graphBuiltRef = useRef(false);
  
  // Debug state
  const [audioCtxState, setAudioCtxState] = useState<string>('not created');
  const [webAudioConnected, setWebAudioConnected] = useState(false);
  
  // Waveform refs
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformPeaksRef = useRef<number[]>([]);
  const playheadRafRef = useRef<number>(0);
  const isPlayheadAnimatingRef = useRef(false);

  /**
   * Ensure AudioContext exists and is running.
   * Call this on any user gesture (play, file load, etc.)
   */
  const ensureAudioContext = useCallback(async () => {
    // Create AudioContext if it doesn't exist
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      console.log('[SOLID EQ] AudioContext created');
    }
    
    const ctx = audioContextRef.current;
    
    // Resume if suspended (required after user gesture)
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
        console.log('[SOLID EQ] AudioContext resumed, state:', ctx.state);
      } catch (err) {
        console.error('[SOLID EQ] Failed to resume AudioContext:', err);
      }
    }
    
    setAudioCtxState(ctx.state);
    return ctx;
  }, []);

  /**
   * Build the audio graph ONCE.
   * MediaElementAudioSourceNode can only be created once per <audio> element.
   */
  const buildAudioGraph = useCallback(() => {
    const audioEl = audioRef.current;
    const ctx = audioContextRef.current;
    
    if (!audioEl || !ctx) {
      console.log('[SOLID EQ] buildAudioGraph: missing audio element or context');
      return;
    }
    
    // CRITICAL: Only create MediaElementAudioSourceNode ONCE
    if (sourceNodeRef.current) {
      console.log('[SOLID EQ] buildAudioGraph: source already exists, skipping');
      return;
    }
    
    if (graphBuiltRef.current) {
      console.log('[SOLID EQ] buildAudioGraph: graph already built, skipping');
      return;
    }
    
    console.log('[SOLID EQ] Building audio graph...');
    
    // Create source node (ONLY ONCE per audio element)
    const sourceNode = ctx.createMediaElementSource(audioEl);
    sourceNodeRef.current = sourceNode;
    
    // Create master gain node for volume control
    const masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGainRef.current = masterGain;
    
    // Create EQ filter nodes
    const filters: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = Q_VALUE;
      filter.gain.value = 0; // Start flat, will be updated by useEffect
      return filter;
    });
    filtersRef.current = filters;
    
    // Chain filters: filter[0] -> filter[1] -> ... -> filter[n-1]
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }
    
    // Connect: source -> filters[0], filters[last] -> masterGain -> destination
    // (Default non-bypassed state)
    sourceNode.connect(filters[0]);
    filters[filters.length - 1].connect(masterGain);
    masterGain.connect(ctx.destination);
    
    graphBuiltRef.current = true;
    setIsAudioContextInitialized(true);
    setWebAudioConnected(true);
    
    console.log('[SOLID EQ] Audio graph built successfully');
  }, [volume]);

  /**
   * Update bypass routing by reconnecting nodes.
   * MUST disconnect before reconnecting to avoid multiple paths.
   * Chain: source -> (filters or bypass) -> masterGain -> destination
   */
  const updateBypassRouting = useCallback((bypass: boolean) => {
    const sourceNode = sourceNodeRef.current;
    const filters = filtersRef.current;
    const masterGain = masterGainRef.current;
    const ctx = audioContextRef.current;
    
    if (!sourceNode || !ctx || !masterGain || filters.length === 0) {
      console.log('[SOLID EQ] updateBypassRouting: graph not ready');
      return;
    }
    
    console.log('[SOLID EQ] Updating bypass routing, bypass:', bypass);
    
    // Disconnect source from everything
    try {
      sourceNode.disconnect();
    } catch {
      // May already be disconnected
    }
    
    // Disconnect last filter from masterGain
    try {
      filters[filters.length - 1].disconnect(masterGain);
    } catch {
      // May already be disconnected
    }
    
    if (bypass) {
      // Bypass: source -> masterGain -> destination (skip filters)
      sourceNode.connect(masterGain);
      console.log('[SOLID EQ] Bypass ON: source -> masterGain -> destination');
    } else {
      // Normal: source -> filters -> masterGain -> destination
      sourceNode.connect(filters[0]);
      filters[filters.length - 1].connect(masterGain);
      console.log('[SOLID EQ] Bypass OFF: source -> filters -> masterGain -> destination');
    }
  }, []);

  // Update routing when bypass state changes
  useEffect(() => {
    if (isAudioContextInitialized && graphBuiltRef.current) {
      updateBypassRouting(isBypassed);
    }
  }, [isBypassed, isAudioContextInitialized, updateBypassRouting]);

  // Update AudioContext state display periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioContextRef.current) {
        setAudioCtxState(audioContextRef.current.state);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Update filter gains
  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
  }, [gains]);

  // Compute waveform peaks when sourceBuffer changes
  useEffect(() => {
    if (sourceBuffer) {
      const peaks = computeWaveformPeaks(sourceBuffer, WAVEFORM_SAMPLES);
      waveformPeaksRef.current = peaks;
      // Trigger redraw
      drawWaveform();
    } else {
      waveformPeaksRef.current = [];
      drawWaveform();
    }
  }, [sourceBuffer]);

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get actual display size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size for high DPI
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const peaks = waveformPeaksRef.current;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (peaks.length === 0) {
      // Draw placeholder
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.textAlign = 'center';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('No waveform data', width / 2, height / 2);
      return;
    }
    
    // Draw waveform
    const centerY = height / 2;
    const barWidth = width / peaks.length;
    
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    
    // Draw as mirrored waveform
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = peaks[i] * (height * 0.45);
      
      ctx.moveTo(x, centerY - amplitude);
      ctx.lineTo(x, centerY + amplitude);
    }
    
    ctx.stroke();
    
    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      drawWaveform();
    };
    
    window.addEventListener('resize', handleResize);
    // Initial draw
    drawWaveform();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [drawWaveform]);

  // Playhead animation loop
  useEffect(() => {
    const updatePlayhead = () => {
      if (!isPlayheadAnimatingRef.current) return;
      
      const canvas = waveformCanvasRef.current;
      const audio = audioRef.current;
      
      if (canvas && audio && duration > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const width = rect.width;
          const height = rect.height;
          
          // Redraw waveform (clears previous playhead)
          drawWaveform();
          
          // Draw playhead
          const progress = audio.currentTime / duration;
          const playheadX = progress * width;
          
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.moveTo(playheadX * dpr / dpr, 0);
          ctx.lineTo(playheadX * dpr / dpr, height);
          ctx.stroke();
          
          // Draw played region with slight highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.fillRect(0, 0, playheadX, height);
        }
      }
      
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    };
    
    if (isPlaying && duration > 0) {
      isPlayheadAnimatingRef.current = true;
      playheadRafRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      isPlayheadAnimatingRef.current = false;
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = 0;
      }
      // Draw static playhead position
      if (duration > 0) {
        drawWaveform();
        const canvas = waveformCanvasRef.current;
        const audio = audioRef.current;
        if (canvas && audio) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const progress = audio.currentTime / duration;
            const playheadX = progress * width;
            
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();
          }
        }
      }
    }
    
    return () => {
      isPlayheadAnimatingRef.current = false;
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = 0;
      }
    };
  }, [isPlaying, duration, drawWaveform]);

  // Waveform click to seek
  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformCanvasRef.current;
    const audio = audioRef.current;
    
    if (!canvas || !audio || !duration) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = clickX / rect.width;
    const newTime = progress * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Audio element event handlers (React handlers, not addEventListener)
  const handleAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }, []);

  const handleAudioLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const dur = audio.duration;
    setDuration(isFinite(dur) && dur > 0 ? dur : 0);
  }, []);

  const handleAudioDurationChange = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const dur = audio.duration;
    setDuration(isFinite(dur) && dur > 0 ? dur : 0);
  }, []);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleAudioPlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handleAudioPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
    
    const isValidType = validTypes.includes(file.type);
    const isValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isValidType && !isValidExtension) {
      alert('Please select a valid audio file (mp3, wav, ogg, or m4a)');
      return;
    }

    const url = URL.createObjectURL(file);
    setAudioSrc(url);
    setFileName(file.name);
    setCurrentTime(0);
    setIsPlaying(false);

    // CRITICAL: Ensure AudioContext on user gesture (file select is a gesture)
    await ensureAudioContext();
    
    // Build audio graph if not already built
    // Note: We need to wait a tick for the audio element src to be set
    setTimeout(() => {
      if (!graphBuiltRef.current && audioContextRef.current) {
        buildAudioGraph();
        // Apply current gains
        filtersRef.current.forEach((filter, index) => {
          filter.gain.value = gains[index];
        });
        updateBypassRouting(isBypassed);
      }
    }, 0);

    // Decode for export functionality
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tempAudioContext = new AudioContext();
      const decodedBuffer = await tempAudioContext.decodeAudioData(arrayBuffer);
      setSourceBuffer(decodedBuffer);
      await tempAudioContext.close();
    } catch (err) {
      console.error('Failed to decode audio file:', err);
      setSourceBuffer(null);
    }
  }, [ensureAudioContext, buildAudioGraph, gains, isBypassed, updateBypassRouting]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUrlSubmit = useCallback(() => {
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const urlLower = urlInput.toLowerCase();
    
    if (!validExtensions.some(ext => urlLower.includes(ext))) {
      alert('Please enter a direct audio URL (.mp3, .wav, .ogg, or .m4a)');
      return;
    }

    setAudioSrc(urlInput);
    setFileName(urlInput.split('/').pop() || 'URL Audio');
    setSourceBuffer(null);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [urlInput]);

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current || !audioSrc) return;

    // CRITICAL: Ensure AudioContext exists and is running on user gesture
    await ensureAudioContext();
    
    // Build audio graph if not already built
    if (!graphBuiltRef.current) {
      buildAudioGraph();
      // Apply current gains to the newly created filters
      filtersRef.current.forEach((filter, index) => {
        filter.gain.value = gains[index];
      });
      // Apply current bypass state
      updateBypassRouting(isBypassed);
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error('Failed to play audio:', err);
      }
    }
  }, [audioSrc, isPlaying, gains, isBypassed, ensureAudioContext, buildAudioGraph, updateBypassRouting]);

  // Skip forward/backward handlers
  const handleSkipBackward = useCallback(() => {
    if (!audioRef.current) return;
    const newTime = Math.max(0, audioRef.current.currentTime - 5);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleSkipForward = useCallback(() => {
    if (!audioRef.current || !duration) return;
    const newTime = Math.min(duration, audioRef.current.currentTime + 5);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Volume control via master gain node
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    
    // Update master gain node (WebAudio volume control)
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = vol;
    }
    
    // Also update audio element volume as fallback
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  }, []);

  const handleGainChange = useCallback((index: number, value: number) => {
    setGains(prev => {
      const newGains = [...prev];
      newGains[index] = value;
      return newGains;
    });
  }, []);

  const handleResetEQ = useCallback(() => {
    const newGains = EQ_FREQUENCIES.map(() => DEFAULT_GAIN);
    setGains(newGains);
    // Update current slot
    if (activeSlot === 'A') {
      setSlotAGains(newGains);
    } else {
      setSlotBGains(newGains);
    }
  }, [activeSlot]);

  // Apply a built-in or user preset
  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset) return;
    
    let presetGains: number[] | undefined;
    
    // Check built-in presets first
    if (BUILT_IN_PRESETS[selectedPreset]) {
      presetGains = [...BUILT_IN_PRESETS[selectedPreset]];
    } else {
      // Check user presets
      const userPreset = userPresets.find(p => p.name === selectedPreset);
      if (userPreset) {
        presetGains = [...userPreset.gains];
      }
    }
    
    if (presetGains) {
      setGains(presetGains);
      // Update current slot
      if (activeSlot === 'A') {
        setSlotAGains(presetGains);
      } else {
        setSlotBGains(presetGains);
      }
    }
  }, [selectedPreset, userPresets, activeSlot]);

  // Save current settings as user preset
  const handleSavePreset = useCallback(() => {
    const name = prompt('Enter preset name:');
    if (!name || !name.trim()) return;
    
    const trimmedName = name.trim();
    
    // Check if name already exists
    if (BUILT_IN_PRESETS[trimmedName]) {
      alert('Cannot use a built-in preset name.');
      return;
    }
    
    const existingIndex = userPresets.findIndex(p => p.name === trimmedName);
    let newPresets: UserPreset[];
    
    if (existingIndex >= 0) {
      // Update existing
      newPresets = [...userPresets];
      newPresets[existingIndex] = { name: trimmedName, gains: [...gains] };
    } else {
      // Add new
      newPresets = [...userPresets, { name: trimmedName, gains: [...gains] }];
    }
    
    setUserPresets(newPresets);
    saveUserPresets(newPresets);
    setSelectedPreset(trimmedName);
  }, [gains, userPresets]);

  // Delete a user preset
  const handleDeletePreset = useCallback((presetName: string) => {
    const newPresets = userPresets.filter(p => p.name !== presetName);
    setUserPresets(newPresets);
    saveUserPresets(newPresets);
    if (selectedPreset === presetName) {
      setSelectedPreset('');
    }
  }, [userPresets, selectedPreset]);

  // A/B comparison - switch slots
  const handleSwitchSlot = useCallback((slot: 'A' | 'B') => {
    if (slot === activeSlot) return;
    
    // Save current gains to current slot
    if (activeSlot === 'A') {
      setSlotAGains([...gains]);
    } else {
      setSlotBGains([...gains]);
    }
    
    // Load gains from new slot
    const newGains = slot === 'A' ? [...slotAGains] : [...slotBGains];
    setGains(newGains);
    setActiveSlot(slot);
  }, [activeSlot, gains, slotAGains, slotBGains]);

  // Keep current slot in sync with gains
  useEffect(() => {
    if (activeSlot === 'A') {
      setSlotAGains([...gains]);
    } else {
      setSlotBGains([...gains]);
    }
  }, [gains, activeSlot]);

  const exportWav = useCallback(async () => {
    if (!sourceBuffer) return;

    setIsExporting(true);
    setExportStatus('Rendering...');
    
    try {
      // Step 1: Render with EQ
      const offlineCtx = new OfflineAudioContext(
        sourceBuffer.numberOfChannels,
        sourceBuffer.length,
        sourceBuffer.sampleRate
      );

      const bufferSource = offlineCtx.createBufferSource();
      bufferSource.buffer = sourceBuffer;

      // Apply current EQ gains
      const filters = EQ_FREQUENCIES.map((freq, index) => {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = Q_VALUE;
        filter.gain.value = gains[index];
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

      // Step 2: Normalize if enabled
      if (normalizeOnExport) {
        setExportStatus('Normalizing...');
        // Small delay to allow UI update
        await new Promise(resolve => setTimeout(resolve, 10));
        normalizeAudioBuffer(renderedBuffer, 0.98);
      }

      // Step 3: Encode to selected format
      setExportStatus('Encoding...');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const wavData = exportFormat === '32bit' 
        ? encodeWav32bitFloat(renderedBuffer)
        : encodeWav16bit(renderedBuffer);

      // Step 4: Download
      setExportStatus('Downloading...');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = fileName?.replace(/\.[^/.]+$/, '') || 'audio';
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
  }, [sourceBuffer, gains, fileName, exportFormat, normalizeOnExport]);

  const formatFrequency = (freq: number) => {
    return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
  };

  return (
    <div className="app">
      {/* Hidden audio element with React event handlers */}
      <audio
        ref={audioRef}
        src={audioSrc || undefined}
        crossOrigin="anonymous"
        preload="metadata"
        onLoadedMetadata={handleAudioLoadedMetadata}
        onDurationChange={handleAudioDurationChange}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
      />

      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">SOLID EQ</h1>
        {/* Debug UI - remove later */}
        <div className="debug-info">
          <span className={`debug-badge ${audioCtxState === 'running' ? 'running' : ''}`}>
            AudioContext: {audioCtxState}
          </span>
          {webAudioConnected && (
            <span className="debug-badge connected">WebAudio connected</span>
          )}
        </div>
      </header>

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
            htmlFor="file-input"
          >
            <svg className="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M12 1.5v13.5m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="drop-zone-text">Drop audio file here or click to browse</p>
            <p className="drop-zone-formats">Supports MP3, WAV, OGG, M4A</p>
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,audio/*"
              onChange={handleFileInputChange}
              id="file-input"
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
          {audioSrc ? (
            <>
              <div className="now-playing">
                <div className="track-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <div className="track-info">
                  <div className="track-name">{fileName}</div>
                  <div className="track-status">{isPlaying ? 'Playing' : 'Paused'}</div>
                </div>
              </div>

              <div className="player-controls">
                <button className="play-btn" onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <div className="volume-control">
                  <div className="volume-control-row">
                    <svg className="volume-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                    <input
                      type="range"
                      className="volume-slider"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={handleVolumeChange}
                    />
                  </div>
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
          {/* Time display with skip buttons */}
          <div className="waveform-time-controls">
            <button 
              className="skip-btn" 
              onClick={handleSkipBackward}
              disabled={!duration}
              aria-label="Skip backward 5 seconds"
            >
              −5s
            </button>
            <span className="waveform-time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button 
              className="skip-btn" 
              onClick={handleSkipForward}
              disabled={!duration}
              aria-label="Skip forward 5 seconds"
            >
              +5s
            </button>
          </div>
        </div>
      </section>

      {/* EQ Card */}
      <section className={`card eq-card ${isBypassed ? 'bypassed' : ''}`}>
        <div className="card-header">
          <h2 className="card-title">8-Band Equalizer</h2>
          <div className="eq-actions">
            {/* A/B Compare */}
            <div className="ab-compare">
              <button
                className={`btn btn-ab ${activeSlot === 'A' ? 'active' : ''}`}
                onClick={() => handleSwitchSlot('A')}
              >
                A
              </button>
              <button
                className={`btn btn-ab ${activeSlot === 'B' ? 'active' : ''}`}
                onClick={() => handleSwitchSlot('B')}
              >
                B
              </button>
            </div>
            
            {/* Bypass Toggle */}
            <button
              className={`btn btn-bypass ${isBypassed ? 'active' : ''}`}
              onClick={() => setIsBypassed(!isBypassed)}
              title={isBypassed ? 'EQ Bypassed' : 'EQ Active'}
            >
              {isBypassed ? 'Bypassed' : 'Bypass'}
            </button>
            
            <button className="btn btn-secondary" onClick={handleResetEQ}>
              Reset
            </button>
          </div>
        </div>

        {/* Presets Row */}
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
                onClick={() => handleDeletePreset(selectedPreset)}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="card-content">
          <div className={`eq-sliders ${isBypassed ? 'disabled' : ''}`}>
            {EQ_FREQUENCIES.map((freq, index) => (
              <div key={freq} className="eq-band">
                <span className="gain-value">
                  {gains[index] > 0 ? '+' : ''}{gains[index].toFixed(1)} dB
                </span>
                <input
                  type="range"
                  min={MIN_GAIN}
                  max={MAX_GAIN}
                  step={0.5}
                  value={gains[index]}
                  onChange={(e) => handleGainChange(index, parseFloat(e.target.value))}
                  className="eq-slider"
                  aria-label={`${formatFrequency(freq)} Hz gain`}
                  disabled={isBypassed}
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
          {/* Export Options */}
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

          {/* Export Action */}
          <div className="export-action">
            <div className="export-info">
              {isExporting && exportStatus ? (
                <div className="export-status">
                  <span className="status-indicator"></span>
                  {exportStatus}
                </div>
              ) : (
                <div className="export-hint">
                  {sourceBuffer 
                    ? `Ready to export • ${exportFormat === '32bit' ? '32-bit float' : '16-bit PCM'}${normalizeOnExport ? ' • Normalized' : ''}`
                    : 'Load a local audio file to enable export'}
                </div>
              )}
            </div>
            <button
              className="btn btn-accent"
              onClick={exportWav}
              disabled={!sourceBuffer || isExporting}
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

export default App;
