import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export const EQ_FREQUENCIES = [60, 170, 350, 1000, 3500, 6000, 10000, 14000];
const Q_VALUE = 1.0;

export interface DeckState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  trackLabel: string | null;
  sourceBuffer: AudioBuffer | null;
  hotCues: (number | null)[];
  loopIn: number | null;
  loopOut: number | null;
  loopEnabled: boolean;
  playbackRate: number;
}

export interface DJScene {
  playbackRate: number;
  filterMacro: number;
  echoMix: number;
  echoTime: number;
  echoFeedback: number;
}

interface AudioEngineContextType {
  // Deck A
  deckA: DeckState;
  loadFileA: (file: File) => Promise<void>;
  loadUrlA: (url: string) => void;
  playA: () => void;
  pauseA: () => void;
  togglePlayA: () => void;
  seekA: (time: number) => void;
  setPlaybackRateA: (rate: number) => void;
  setHotCueA: (index: number, time: number) => void;
  triggerHotCueA: (index: number) => boolean;
  setLoopInA: (time: number) => void;
  setLoopOutA: (time: number) => void;
  toggleLoopA: () => void;
  clearLoopA: () => void;

  // Deck B
  deckB: DeckState;
  loadFileB: (file: File) => Promise<void>;
  loadUrlB: (url: string) => void;
  playB: () => void;
  pauseB: () => void;
  togglePlayB: () => void;
  seekB: (time: number) => void;
  setPlaybackRateB: (rate: number) => void;
  setHotCueB: (index: number, time: number) => void;
  triggerHotCueB: (index: number) => boolean;
  setLoopInB: (time: number) => void;
  setLoopOutB: (time: number) => void;
  toggleLoopB: () => void;
  clearLoopB: () => void;

  // Active deck
  activeDeck: 'A' | 'B';
  setActiveDeck: (deck: 'A' | 'B') => void;

  // EQ (Deck A only)
  eqGains: number[];
  setEqGain: (index: number, gain: number) => void;
  resetEq: () => void;
  eqBypass: boolean;
  setEqBypass: (bypass: boolean) => void;
  eqPresetA: number[];
  eqPresetB: number[];
  activeEqPreset: 'A' | 'B';
  setActiveEqPreset: (preset: 'A' | 'B') => void;
  storeEqPreset: (preset: 'A' | 'B') => void;
  applyBuiltinPreset: (gains: number[]) => void;
  userPresets: { name: string; gains: number[] }[];
  saveUserPreset: (name: string) => void;
  deleteUserPreset: (name: string) => void;

  // DJ FX
  filterMacro: number;
  setFilterMacro: (value: number) => void;
  echoMix: number;
  setEchoMix: (value: number) => void;
  echoTime: number;
  setEchoTime: (value: number) => void;
  echoFeedback: number;
  setEchoFeedback: (value: number) => void;
  fxBypass: boolean;
  setFxBypass: (bypass: boolean) => void;

  // DJ Scenes
  djSceneA: DJScene;
  djSceneB: DJScene;
  activeDjScene: 'A' | 'B';
  setActiveDjScene: (scene: 'A' | 'B') => void;
  storeDjScene: (scene: 'A' | 'B') => void;
  morphDjScenes: () => void;
  isMorphing: boolean;
  applyDjPreset: (scene: DJScene) => void;

  // Crossfader
  crossfader: number;
  setCrossfader: (value: number) => void;

  // Master
  volume: number;
  setVolume: (value: number) => void;
  safeMode: boolean;
  setSafeMode: (enabled: boolean) => void;

  // Recording
  isRecording: boolean;
  recordingTime: number;
  startRecording: () => void;
  stopRecording: () => void;
  recordingBlob: Blob | null;
  clearRecording: () => void;

  // Export
  exportStatus: string;
  exportWav: (normalize: boolean, bitDepth: 16 | 32) => Promise<void>;

  // Waveform data
  waveformA: Float32Array | null;
  waveformB: Float32Array | null;

  // Audio elements refs (for external use)
  audioRefA: React.RefObject<HTMLAudioElement>;
  audioRefB: React.RefObject<HTMLAudioElement>;

  // Audio context state
  audioContextState: string;
  isWebAudioConnected: boolean;
}

const AudioEngineContext = createContext<AudioEngineContextType | null>(null);

export function useAudioEngine() {
  const ctx = useContext(AudioEngineContext);
  if (!ctx) throw new Error('useAudioEngine must be used within AudioEngineProvider');
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: compute waveform peaks
// ─────────────────────────────────────────────────────────────────────────────
function computeWaveform(buffer: AudioBuffer, samples = 1200): Float32Array {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / samples);
  const peaks = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    let max = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }
  return peaks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: WAV encoding
// ─────────────────────────────────────────────────────────────────────────────
function encodeWav16(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function encodeWav32(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 4;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 32, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setFloat32(offset, channels[ch][i], true);
      offset += 4;
    }
  }

  return arrayBuffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default values
// ─────────────────────────────────────────────────────────────────────────────
const defaultDeckState = (): DeckState => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  trackLabel: null,
  sourceBuffer: null,
  hotCues: [null, null, null, null],
  loopIn: null,
  loopOut: null,
  loopEnabled: false,
  playbackRate: 1.0,
});

const defaultDjScene = (): DJScene => ({
  playbackRate: 1.0,
  filterMacro: 0,
  echoMix: 0,
  echoTime: 0.25,
  echoFeedback: 0.3,
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function AudioEngineProvider({ children }: { children: ReactNode }) {
  // Audio elements
  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);

  // Audio context and nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeARef = useRef<MediaElementAudioSourceNode | null>(null);
  const sourceNodeBRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const djFilterRef = useRef<BiquadFilterNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const feedbackGainRef = useRef<GainNode | null>(null);
  const echoWetGainRef = useRef<GainNode | null>(null);
  const echoDryGainRef = useRef<GainNode | null>(null);
  const fxDryGainRef = useRef<GainNode | null>(null);
  const fxWetGainRef = useRef<GainNode | null>(null);
  const deckGainARef = useRef<GainNode | null>(null);
  const deckGainBRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // State: decks
  const [deckA, setDeckA] = useState<DeckState>(defaultDeckState);
  const [deckB, setDeckB] = useState<DeckState>(defaultDeckState);
  const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');

  // State: EQ
  const [eqGains, setEqGains] = useState<number[]>(EQ_FREQUENCIES.map(() => 0));
  const [eqBypass, setEqBypassState] = useState(false);
  const [eqPresetA, setEqPresetA] = useState<number[]>(EQ_FREQUENCIES.map(() => 0));
  const [eqPresetB, setEqPresetB] = useState<number[]>(EQ_FREQUENCIES.map(() => 0));
  const [activeEqPreset, setActiveEqPreset] = useState<'A' | 'B'>('A');
  const [userPresets, setUserPresets] = useState<{ name: string; gains: number[] }[]>(() => {
    try {
      const stored = localStorage.getItem('solids_user_presets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // State: DJ FX
  const [filterMacro, setFilterMacroState] = useState(0);
  const [echoMix, setEchoMixState] = useState(0);
  const [echoTime, setEchoTimeState] = useState(0.25);
  const [echoFeedback, setEchoFeedbackState] = useState(0.3);
  const [fxBypass, setFxBypassState] = useState(false);

  // State: DJ Scenes
  const [djSceneA, setDjSceneA] = useState<DJScene>(defaultDjScene);
  const [djSceneB, setDjSceneB] = useState<DJScene>(defaultDjScene);
  const [activeDjScene, setActiveDjScene] = useState<'A' | 'B'>('A');
  const [isMorphing, setIsMorphing] = useState(false);
  const morphRafRef = useRef<number | null>(null);

  // State: Crossfader
  const [crossfader, setCrossfaderState] = useState(0.5);

  // State: Master
  const [volume, setVolumeState] = useState(0.8);
  const [safeMode, setSafeModeState] = useState(true);

  // State: Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  // State: Export
  const [exportStatus, setExportStatus] = useState('');

  // State: Waveforms
  const [waveformA, setWaveformA] = useState<Float32Array | null>(null);
  const [waveformB, setWaveformB] = useState<Float32Array | null>(null);

  // State: AudioContext
  const [audioContextState, setAudioContextState] = useState('closed');
  const [isWebAudioConnected, setIsWebAudioConnected] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Initialize AudioContext and graph
  // ───────────────────────────────────────────────────────────────────────────
  const initAudioContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    setAudioContextState(audioCtx.state);

    // Create master gain
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGainRef.current = masterGain;
    masterGain.connect(audioCtx.destination);

    // Create compressor (safe mode)
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    compressor.knee.value = 6;
    compressorRef.current = compressor;

    // Media stream destination for recording
    const mediaStreamDest = audioCtx.createMediaStreamDestination();
    mediaStreamDestRef.current = mediaStreamDest;

    // Deck gains
    const deckGainA = audioCtx.createGain();
    const deckGainB = audioCtx.createGain();
    deckGainARef.current = deckGainA;
    deckGainBRef.current = deckGainB;

    // Connect deck gains -> compressor (or master based on safe mode)
    const updateSafeMode = (enabled: boolean) => {
      deckGainA.disconnect();
      deckGainB.disconnect();
      compressor.disconnect();
      if (enabled) {
        deckGainA.connect(compressor);
        deckGainB.connect(compressor);
        compressor.connect(masterGain);
        compressor.connect(mediaStreamDest);
      } else {
        deckGainA.connect(masterGain);
        deckGainB.connect(masterGain);
        deckGainA.connect(mediaStreamDest);
        deckGainB.connect(mediaStreamDest);
      }
    };
    updateSafeMode(safeMode);

    // EQ filters (for Deck A only)
    const filters = EQ_FREQUENCIES.map((freq, i) => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = Q_VALUE;
      filter.gain.value = eqGains[i];
      return filter;
    });
    filtersRef.current = filters;

    // DJ filter (lowpass/highpass based on macro)
    const djFilter = audioCtx.createBiquadFilter();
    djFilter.type = 'lowpass';
    djFilter.frequency.value = 20000;
    djFilter.Q.value = 0.707;
    djFilterRef.current = djFilter;

    // Echo nodes
    const delayNode = audioCtx.createDelay(2);
    delayNode.delayTime.value = echoTime;
    delayNodeRef.current = delayNode;

    const feedbackGain = audioCtx.createGain();
    feedbackGain.gain.value = echoFeedback;
    feedbackGainRef.current = feedbackGain;

    const echoWetGain = audioCtx.createGain();
    echoWetGain.gain.value = echoMix;
    echoWetGainRef.current = echoWetGain;

    const echoDryGain = audioCtx.createGain();
    echoDryGain.gain.value = 1;
    echoDryGainRef.current = echoDryGain;

    // FX dry/wet for bypass
    const fxDryGain = audioCtx.createGain();
    fxDryGain.gain.value = fxBypass ? 1 : 0;
    fxDryGainRef.current = fxDryGain;

    const fxWetGain = audioCtx.createGain();
    fxWetGain.gain.value = fxBypass ? 0 : 1;
    fxWetGainRef.current = fxWetGain;

    // Echo feedback loop
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(echoWetGain);

    return audioCtx;
  }, [volume, safeMode, eqGains, echoTime, echoFeedback, echoMix, fxBypass]);

  // ───────────────────────────────────────────────────────────────────────────
  // Connect source nodes
  // ───────────────────────────────────────────────────────────────────────────
  const connectSourceA = useCallback(() => {
    const audioCtx = audioCtxRef.current;
    const audioEl = audioRefA.current;
    if (!audioCtx || !audioEl || sourceNodeARef.current) return;

    const source = audioCtx.createMediaElementSource(audioEl);
    sourceNodeARef.current = source;

    const filters = filtersRef.current;
    const djFilter = djFilterRef.current;
    const deckGainA = deckGainARef.current;
    const delayNode = delayNodeRef.current;
    const echoDryGain = echoDryGainRef.current;
    const echoWetGain = echoWetGainRef.current;
    const fxDryGain = fxDryGainRef.current;
    const fxWetGain = fxWetGainRef.current;

    if (!djFilter || !deckGainA || !delayNode || !echoDryGain || !echoWetGain || !fxDryGain || !fxWetGain) return;

    // Chain: source -> EQ filters -> DJ filter -> echo -> deck gain
    let currentNode: AudioNode = source;
    if (!eqBypass) {
      filters.forEach((filter) => {
        currentNode.connect(filter);
        currentNode = filter;
      });
    }

    // FX routing with dry/wet
    currentNode.connect(fxDryGain);
    currentNode.connect(djFilter);
    djFilter.connect(echoDryGain);
    djFilter.connect(delayNode);
    echoDryGain.connect(fxWetGain);
    echoWetGain.connect(fxWetGain);
    fxDryGain.connect(deckGainA);
    fxWetGain.connect(deckGainA);

    setIsWebAudioConnected(true);
  }, [eqBypass]);

  const connectSourceB = useCallback(() => {
    const audioCtx = audioCtxRef.current;
    const audioEl = audioRefB.current;
    if (!audioCtx || !audioEl || sourceNodeBRef.current) return;

    const source = audioCtx.createMediaElementSource(audioEl);
    sourceNodeBRef.current = source;

    const deckGainB = deckGainBRef.current;
    if (!deckGainB) return;

    // Deck B: source -> deck gain (simpler chain, no EQ)
    source.connect(deckGainB);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Resume AudioContext
  // ───────────────────────────────────────────────────────────────────────────
  const ensureAudioContext = useCallback(async () => {
    const audioCtx = initAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    setAudioContextState(audioCtx.state);
    return audioCtx;
  }, [initAudioContext]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update crossfader gains
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const deckGainA = deckGainARef.current;
    const deckGainB = deckGainBRef.current;
    if (!deckGainA || !deckGainB) return;

    // Equal power crossfade
    const x = crossfader;
    deckGainA.gain.value = Math.cos(x * Math.PI * 0.5);
    deckGainB.gain.value = Math.sin(x * Math.PI * 0.5);
  }, [crossfader]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update volume
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const masterGain = masterGainRef.current;
    if (masterGain) {
      masterGain.gain.value = volume;
    }
  }, [volume]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update EQ gains
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    filtersRef.current.forEach((filter, i) => {
      filter.gain.value = eqGains[i];
    });
  }, [eqGains]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update DJ filter macro
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const djFilter = djFilterRef.current;
    if (!djFilter) return;

    if (filterMacro === 0) {
      djFilter.type = 'lowpass';
      djFilter.frequency.value = 20000;
    } else if (filterMacro < 0) {
      // Low-pass sweep
      djFilter.type = 'lowpass';
      const normalized = (filterMacro + 100) / 100; // 0 to 1
      djFilter.frequency.value = 200 + normalized * 19800;
    } else {
      // High-pass sweep
      djFilter.type = 'highpass';
      const normalized = filterMacro / 100; // 0 to 1
      djFilter.frequency.value = 20 + normalized * 2000;
    }
  }, [filterMacro]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update echo
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (delayNodeRef.current) {
      delayNodeRef.current.delayTime.value = echoTime;
    }
  }, [echoTime]);

  useEffect(() => {
    if (feedbackGainRef.current) {
      feedbackGainRef.current.gain.value = echoFeedback;
    }
  }, [echoFeedback]);

  useEffect(() => {
    if (echoWetGainRef.current) {
      echoWetGainRef.current.gain.value = echoMix;
    }
  }, [echoMix]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update FX bypass
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fxDryGain = fxDryGainRef.current;
    const fxWetGain = fxWetGainRef.current;
    if (fxDryGain && fxWetGain) {
      fxDryGain.gain.value = fxBypass ? 1 : 0;
      fxWetGain.gain.value = fxBypass ? 0 : 1;
    }
  }, [fxBypass]);

  // ───────────────────────────────────────────────────────────────────────────
  // Safe mode
  // ───────────────────────────────────────────────────────────────────────────
  const setSafeMode = useCallback((enabled: boolean) => {
    setSafeModeState(enabled);
    const compressor = compressorRef.current;
    const masterGain = masterGainRef.current;
    const deckGainA = deckGainARef.current;
    const deckGainB = deckGainBRef.current;
    const mediaStreamDest = mediaStreamDestRef.current;
    if (!compressor || !masterGain || !deckGainA || !deckGainB || !mediaStreamDest) return;

    deckGainA.disconnect();
    deckGainB.disconnect();
    compressor.disconnect();

    if (enabled) {
      deckGainA.connect(compressor);
      deckGainB.connect(compressor);
      compressor.connect(masterGain);
      compressor.connect(mediaStreamDest);
    } else {
      deckGainA.connect(masterGain);
      deckGainB.connect(masterGain);
      deckGainA.connect(mediaStreamDest);
      deckGainB.connect(mediaStreamDest);
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // File loading
  // ───────────────────────────────────────────────────────────────────────────
  const loadFileA = useCallback(async (file: File) => {
    await ensureAudioContext();
    connectSourceA();

    const url = URL.createObjectURL(file);
    if (audioRefA.current) {
      audioRefA.current.src = url;
      audioRefA.current.load();
    }

    setDeckA((prev) => ({
      ...prev,
      trackLabel: file.name,
      hotCues: [null, null, null, null],
      loopIn: null,
      loopOut: null,
      loopEnabled: false,
    }));

    // Decode for waveform and export
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = audioCtxRef.current;
    if (audioCtx) {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      setDeckA((prev) => ({ ...prev, sourceBuffer: audioBuffer }));
      const peaks = computeWaveform(audioBuffer);
      setWaveformA(peaks);
    }
  }, [ensureAudioContext, connectSourceA]);

  const loadUrlA = useCallback((url: string) => {
    ensureAudioContext();
    connectSourceA();

    if (audioRefA.current) {
      audioRefA.current.src = url;
      audioRefA.current.load();
    }

    const label = url.split('/').pop() || 'URL Audio';
    setDeckA((prev) => ({
      ...prev,
      trackLabel: label,
      sourceBuffer: null,
      hotCues: [null, null, null, null],
      loopIn: null,
      loopOut: null,
      loopEnabled: false,
    }));
    setWaveformA(null);
  }, [ensureAudioContext, connectSourceA]);

  const loadFileB = useCallback(async (file: File) => {
    await ensureAudioContext();
    connectSourceB();

    const url = URL.createObjectURL(file);
    if (audioRefB.current) {
      audioRefB.current.src = url;
      audioRefB.current.load();
    }

    setDeckB((prev) => ({
      ...prev,
      trackLabel: file.name,
      hotCues: [null, null, null, null],
      loopIn: null,
      loopOut: null,
      loopEnabled: false,
    }));

    // Decode for waveform
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = audioCtxRef.current;
    if (audioCtx) {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      setDeckB((prev) => ({ ...prev, sourceBuffer: audioBuffer }));
      const peaks = computeWaveform(audioBuffer);
      setWaveformB(peaks);
    }
  }, [ensureAudioContext, connectSourceB]);

  const loadUrlB = useCallback((url: string) => {
    ensureAudioContext();
    connectSourceB();

    if (audioRefB.current) {
      audioRefB.current.src = url;
      audioRefB.current.load();
    }

    const label = url.split('/').pop() || 'URL Audio';
    setDeckB((prev) => ({
      ...prev,
      trackLabel: label,
      sourceBuffer: null,
      hotCues: [null, null, null, null],
      loopIn: null,
      loopOut: null,
      loopEnabled: false,
    }));
    setWaveformB(null);
  }, [ensureAudioContext, connectSourceB]);

  // ───────────────────────────────────────────────────────────────────────────
  // Playback controls
  // ───────────────────────────────────────────────────────────────────────────
  const playA = useCallback(async () => {
    await ensureAudioContext();
    connectSourceA();
    audioRefA.current?.play();
  }, [ensureAudioContext, connectSourceA]);

  const pauseA = useCallback(() => {
    audioRefA.current?.pause();
  }, []);

  const togglePlayA = useCallback(async () => {
    if (deckA.isPlaying) {
      pauseA();
    } else {
      await playA();
    }
  }, [deckA.isPlaying, playA, pauseA]);

  const seekA = useCallback((time: number) => {
    if (audioRefA.current) {
      audioRefA.current.currentTime = Math.max(0, Math.min(time, deckA.duration));
    }
  }, [deckA.duration]);

  const setPlaybackRateA = useCallback((rate: number) => {
    const clampedRate = Math.max(0.5, Math.min(2, rate));
    if (audioRefA.current) {
      audioRefA.current.playbackRate = clampedRate;
    }
    setDeckA((prev) => ({ ...prev, playbackRate: clampedRate }));
  }, []);

  const playB = useCallback(async () => {
    await ensureAudioContext();
    connectSourceB();
    audioRefB.current?.play();
  }, [ensureAudioContext, connectSourceB]);

  const pauseB = useCallback(() => {
    audioRefB.current?.pause();
  }, []);

  const togglePlayB = useCallback(async () => {
    if (deckB.isPlaying) {
      pauseB();
    } else {
      await playB();
    }
  }, [deckB.isPlaying, playB, pauseB]);

  const seekB = useCallback((time: number) => {
    if (audioRefB.current) {
      audioRefB.current.currentTime = Math.max(0, Math.min(time, deckB.duration));
    }
  }, [deckB.duration]);

  const setPlaybackRateB = useCallback((rate: number) => {
    const clampedRate = Math.max(0.5, Math.min(2, rate));
    if (audioRefB.current) {
      audioRefB.current.playbackRate = clampedRate;
    }
    setDeckB((prev) => ({ ...prev, playbackRate: clampedRate }));
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Hot cues
  // ───────────────────────────────────────────────────────────────────────────
  const setHotCueA = useCallback((index: number, time: number) => {
    setDeckA((prev) => {
      const newCues = [...prev.hotCues];
      newCues[index] = time;
      return { ...prev, hotCues: newCues };
    });
  }, []);

  const triggerHotCueA = useCallback((index: number) => {
    const cue = deckA.hotCues[index];
    if (cue !== null) {
      seekA(cue);
    }
    return cue !== null;
  }, [deckA.hotCues, seekA]);

  const setHotCueB = useCallback((index: number, time: number) => {
    setDeckB((prev) => {
      const newCues = [...prev.hotCues];
      newCues[index] = time;
      return { ...prev, hotCues: newCues };
    });
  }, []);

  const triggerHotCueB = useCallback((index: number) => {
    const cue = deckB.hotCues[index];
    if (cue !== null) {
      seekB(cue);
    }
    return cue !== null;
  }, [deckB.hotCues, seekB]);

  // ───────────────────────────────────────────────────────────────────────────
  // Loops
  // ───────────────────────────────────────────────────────────────────────────
  const MIN_LOOP_GAP = 0.05;

  const normalizeLoop = (loopIn: number | null, loopOut: number | null, duration: number): { loopIn: number | null; loopOut: number | null } => {
    if (loopIn === null || loopOut === null) return { loopIn, loopOut };
    let inVal = Math.max(0, Math.min(loopIn, duration));
    let outVal = Math.max(0, Math.min(loopOut, duration));
    if (outVal < inVal + MIN_LOOP_GAP) {
      outVal = Math.min(inVal + MIN_LOOP_GAP, duration);
    }
    return { loopIn: inVal, loopOut: outVal };
  };

  const setLoopInA = useCallback((time: number) => {
    setDeckA((prev) => {
      const { loopIn, loopOut } = normalizeLoop(time, prev.loopOut, prev.duration);
      return { ...prev, loopIn, loopOut };
    });
  }, []);

  const setLoopOutA = useCallback((time: number) => {
    setDeckA((prev) => {
      const { loopIn, loopOut } = normalizeLoop(prev.loopIn, time, prev.duration);
      return { ...prev, loopIn, loopOut };
    });
  }, []);

  const toggleLoopA = useCallback(() => {
    setDeckA((prev) => ({ ...prev, loopEnabled: !prev.loopEnabled }));
  }, []);

  const clearLoopA = useCallback(() => {
    setDeckA((prev) => ({ ...prev, loopIn: null, loopOut: null, loopEnabled: false }));
  }, []);

  const setLoopInB = useCallback((time: number) => {
    setDeckB((prev) => {
      const { loopIn, loopOut } = normalizeLoop(time, prev.loopOut, prev.duration);
      return { ...prev, loopIn, loopOut };
    });
  }, []);

  const setLoopOutB = useCallback((time: number) => {
    setDeckB((prev) => {
      const { loopIn, loopOut } = normalizeLoop(prev.loopIn, time, prev.duration);
      return { ...prev, loopIn, loopOut };
    });
  }, []);

  const toggleLoopB = useCallback(() => {
    setDeckB((prev) => ({ ...prev, loopEnabled: !prev.loopEnabled }));
  }, []);

  const clearLoopB = useCallback(() => {
    setDeckB((prev) => ({ ...prev, loopIn: null, loopOut: null, loopEnabled: false }));
  }, []);

  // Loop playback enforcement
  useEffect(() => {
    const audioA = audioRefA.current;
    if (!audioA || !deckA.loopEnabled || deckA.loopIn === null || deckA.loopOut === null) return;

    const handleTimeUpdate = () => {
      if (audioA.currentTime >= deckA.loopOut!) {
        audioA.currentTime = deckA.loopIn!;
      }
    };

    audioA.addEventListener('timeupdate', handleTimeUpdate);
    return () => audioA.removeEventListener('timeupdate', handleTimeUpdate);
  }, [deckA.loopEnabled, deckA.loopIn, deckA.loopOut]);

  useEffect(() => {
    const audioB = audioRefB.current;
    if (!audioB || !deckB.loopEnabled || deckB.loopIn === null || deckB.loopOut === null) return;

    const handleTimeUpdate = () => {
      if (audioB.currentTime >= deckB.loopOut!) {
        audioB.currentTime = deckB.loopIn!;
      }
    };

    audioB.addEventListener('timeupdate', handleTimeUpdate);
    return () => audioB.removeEventListener('timeupdate', handleTimeUpdate);
  }, [deckB.loopEnabled, deckB.loopIn, deckB.loopOut]);

  // ───────────────────────────────────────────────────────────────────────────
  // EQ functions
  // ───────────────────────────────────────────────────────────────────────────
  const setEqGain = useCallback((index: number, gain: number) => {
    setEqGains((prev) => {
      const newGains = [...prev];
      newGains[index] = gain;
      return newGains;
    });
  }, []);

  const resetEq = useCallback(() => {
    setEqGains(EQ_FREQUENCIES.map(() => 0));
  }, []);

  const setEqBypass = useCallback((bypass: boolean) => {
    setEqBypassState(bypass);
    // Reconnect source with/without EQ (simplified - just update gains to 0)
    if (bypass) {
      filtersRef.current.forEach((f) => (f.gain.value = 0));
    } else {
      filtersRef.current.forEach((f, i) => (f.gain.value = eqGains[i]));
    }
  }, [eqGains]);

  const storeEqPreset = useCallback((preset: 'A' | 'B') => {
    if (preset === 'A') {
      setEqPresetA([...eqGains]);
    } else {
      setEqPresetB([...eqGains]);
    }
  }, [eqGains]);

  const applyBuiltinPreset = useCallback((gains: number[]) => {
    setEqGains([...gains]);
  }, []);

  const saveUserPreset = useCallback((name: string) => {
    const newPreset = { name, gains: [...eqGains] };
    setUserPresets((prev) => {
      const updated = [...prev.filter((p) => p.name !== name), newPreset];
      localStorage.setItem('solids_user_presets', JSON.stringify(updated));
      return updated;
    });
  }, [eqGains]);

  const deleteUserPreset = useCallback((name: string) => {
    setUserPresets((prev) => {
      const updated = prev.filter((p) => p.name !== name);
      localStorage.setItem('solids_user_presets', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // DJ FX functions
  // ───────────────────────────────────────────────────────────────────────────
  const setFilterMacro = useCallback((value: number) => {
    setFilterMacroState(Math.max(-100, Math.min(100, value)));
  }, []);

  const setEchoMix = useCallback((value: number) => {
    setEchoMixState(Math.max(0, Math.min(1, value)));
  }, []);

  const setEchoTime = useCallback((value: number) => {
    setEchoTimeState(Math.max(0.05, Math.min(2, value)));
  }, []);

  const setEchoFeedback = useCallback((value: number) => {
    setEchoFeedbackState(Math.max(0, Math.min(0.9, value)));
  }, []);

  const setFxBypass = useCallback((bypass: boolean) => {
    setFxBypassState(bypass);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // DJ Scenes
  // ───────────────────────────────────────────────────────────────────────────
  const storeDjScene = useCallback((scene: 'A' | 'B') => {
    const currentScene: DJScene = {
      playbackRate: deckA.playbackRate,
      filterMacro,
      echoMix,
      echoTime,
      echoFeedback,
    };
    if (scene === 'A') {
      setDjSceneA(currentScene);
    } else {
      setDjSceneB(currentScene);
    }
  }, [deckA.playbackRate, filterMacro, echoMix, echoTime, echoFeedback]);

  const applyDjPreset = useCallback((scene: DJScene) => {
    setPlaybackRateA(scene.playbackRate);
    setFilterMacroState(scene.filterMacro);
    setEchoMixState(scene.echoMix);
    setEchoTimeState(scene.echoTime);
    setEchoFeedbackState(scene.echoFeedback);
  }, [setPlaybackRateA]);

  const morphDjScenes = useCallback(() => {
    if (isMorphing) {
      if (morphRafRef.current) {
        cancelAnimationFrame(morphRafRef.current);
        morphRafRef.current = null;
      }
      setIsMorphing(false);
      return;
    }

    const startScene = activeDjScene === 'A' ? djSceneA : djSceneB;
    const endScene = activeDjScene === 'A' ? djSceneB : djSceneA;
    const duration = 800;
    const startTime = performance.now();

    setIsMorphing(true);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);

      const lerp = (a: number, b: number) => a + (b - a) * t;

      setPlaybackRateA(lerp(startScene.playbackRate, endScene.playbackRate));
      setFilterMacroState(lerp(startScene.filterMacro, endScene.filterMacro));
      setEchoMixState(lerp(startScene.echoMix, endScene.echoMix));
      setEchoTimeState(lerp(startScene.echoTime, endScene.echoTime));
      setEchoFeedbackState(lerp(startScene.echoFeedback, endScene.echoFeedback));

      if (t < 1) {
        morphRafRef.current = requestAnimationFrame(animate);
      } else {
        setIsMorphing(false);
        setActiveDjScene(activeDjScene === 'A' ? 'B' : 'A');
      }
    };

    morphRafRef.current = requestAnimationFrame(animate);
  }, [isMorphing, activeDjScene, djSceneA, djSceneB, setPlaybackRateA]);

  // ───────────────────────────────────────────────────────────────────────────
  // Recording
  // ───────────────────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    const mediaStreamDest = mediaStreamDestRef.current;
    if (!mediaStreamDest || !MediaRecorder) return;

    recordedChunksRef.current = [];
    setRecordingBlob(null);

    const mediaRecorder = new MediaRecorder(mediaStreamDest.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      setRecordingBlob(blob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);

    const startTime = Date.now();
    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingTime((Date.now() - startTime) / 1000);
    }, 100);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const clearRecording = useCallback(() => {
    setRecordingBlob(null);
    recordedChunksRef.current = [];
    setRecordingTime(0);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Export WAV
  // ───────────────────────────────────────────────────────────────────────────
  const exportWav = useCallback(async (normalize: boolean, bitDepth: 16 | 32) => {
    const sourceBuffer = deckA.sourceBuffer;
    if (!sourceBuffer) {
      setExportStatus('No audio loaded');
      return;
    }

    setExportStatus('Rendering...');

    try {
      const offline = new OfflineAudioContext(
        sourceBuffer.numberOfChannels,
        sourceBuffer.length,
        sourceBuffer.sampleRate
      );

      const bufferSource = offline.createBufferSource();
      bufferSource.buffer = sourceBuffer;

      // Recreate EQ filters
      let currentNode: AudioNode = bufferSource;
      if (!eqBypass) {
        EQ_FREQUENCIES.forEach((freq, i) => {
          const filter = offline.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = freq;
          filter.Q.value = Q_VALUE;
          filter.gain.value = eqGains[i];
          currentNode.connect(filter);
          currentNode = filter;
        });
      }

      currentNode.connect(offline.destination);
      bufferSource.start(0);

      const renderedBuffer = await offline.startRendering();

      // Normalize if requested
      let finalBuffer = renderedBuffer;
      if (normalize) {
        let peak = 0;
        for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
          const data = renderedBuffer.getChannelData(ch);
          for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > peak) peak = abs;
          }
        }
        if (peak > 0 && peak !== 1) {
          const gain = 0.98 / peak;
          for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
            const data = renderedBuffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
              data[i] *= gain;
            }
          }
        }
      }

      setExportStatus('Encoding...');

      const wavData = bitDepth === 16 ? encodeWav16(finalBuffer) : encodeWav32(finalBuffer);
      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${bitDepth}bit.wav`;
      a.click();
      URL.revokeObjectURL(url);

      setExportStatus('Downloaded!');
      setTimeout(() => setExportStatus(''), 2000);
    } catch (err) {
      console.error('Export failed:', err);
      setExportStatus('Export failed');
    }
  }, [deckA.sourceBuffer, eqBypass, eqGains]);

  // ───────────────────────────────────────────────────────────────────────────
  // Audio element event handlers (attached via effects)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const audioA = audioRefA.current;
    if (!audioA) return;

    const onPlay = () => setDeckA((prev) => ({ ...prev, isPlaying: true }));
    const onPause = () => setDeckA((prev) => ({ ...prev, isPlaying: false }));
    const onTimeUpdate = () => setDeckA((prev) => ({ ...prev, currentTime: audioA.currentTime }));
    const onDurationChange = () => {
      const dur = isNaN(audioA.duration) ? 0 : audioA.duration;
      setDeckA((prev) => ({ ...prev, duration: dur }));
    };
    const onLoadedMetadata = () => {
      const dur = isNaN(audioA.duration) ? 0 : audioA.duration;
      setDeckA((prev) => ({ ...prev, duration: dur }));
    };

    audioA.addEventListener('play', onPlay);
    audioA.addEventListener('pause', onPause);
    audioA.addEventListener('timeupdate', onTimeUpdate);
    audioA.addEventListener('durationchange', onDurationChange);
    audioA.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      audioA.removeEventListener('play', onPlay);
      audioA.removeEventListener('pause', onPause);
      audioA.removeEventListener('timeupdate', onTimeUpdate);
      audioA.removeEventListener('durationchange', onDurationChange);
      audioA.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, []);

  useEffect(() => {
    const audioB = audioRefB.current;
    if (!audioB) return;

    const onPlay = () => setDeckB((prev) => ({ ...prev, isPlaying: true }));
    const onPause = () => setDeckB((prev) => ({ ...prev, isPlaying: false }));
    const onTimeUpdate = () => setDeckB((prev) => ({ ...prev, currentTime: audioB.currentTime }));
    const onDurationChange = () => {
      const dur = isNaN(audioB.duration) ? 0 : audioB.duration;
      setDeckB((prev) => ({ ...prev, duration: dur }));
    };
    const onLoadedMetadata = () => {
      const dur = isNaN(audioB.duration) ? 0 : audioB.duration;
      setDeckB((prev) => ({ ...prev, duration: dur }));
    };

    audioB.addEventListener('play', onPlay);
    audioB.addEventListener('pause', onPause);
    audioB.addEventListener('timeupdate', onTimeUpdate);
    audioB.addEventListener('durationchange', onDurationChange);
    audioB.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      audioB.removeEventListener('play', onPlay);
      audioB.removeEventListener('pause', onPause);
      audioB.removeEventListener('timeupdate', onTimeUpdate);
      audioB.removeEventListener('durationchange', onDurationChange);
      audioB.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Context value
  // ───────────────────────────────────────────────────────────────────────────
  const value: AudioEngineContextType = {
    deckA,
    loadFileA,
    loadUrlA,
    playA,
    pauseA,
    togglePlayA,
    seekA,
    setPlaybackRateA,
    setHotCueA,
    triggerHotCueA,
    setLoopInA,
    setLoopOutA,
    toggleLoopA,
    clearLoopA,

    deckB,
    loadFileB,
    loadUrlB,
    playB,
    pauseB,
    togglePlayB,
    seekB,
    setPlaybackRateB,
    setHotCueB,
    triggerHotCueB,
    setLoopInB,
    setLoopOutB,
    toggleLoopB,
    clearLoopB,

    activeDeck,
    setActiveDeck,

    eqGains,
    setEqGain,
    resetEq,
    eqBypass,
    setEqBypass,
    eqPresetA,
    eqPresetB,
    activeEqPreset,
    setActiveEqPreset: (preset) => {
      setActiveEqPreset(preset);
      setEqGains(preset === 'A' ? [...eqPresetA] : [...eqPresetB]);
    },
    storeEqPreset,
    applyBuiltinPreset,
    userPresets,
    saveUserPreset,
    deleteUserPreset,

    filterMacro,
    setFilterMacro,
    echoMix,
    setEchoMix,
    echoTime,
    setEchoTime,
    echoFeedback,
    setEchoFeedback,
    fxBypass,
    setFxBypass,

    djSceneA,
    djSceneB,
    activeDjScene,
    setActiveDjScene,
    storeDjScene,
    morphDjScenes,
    isMorphing,
    applyDjPreset,

    crossfader,
    setCrossfader: setCrossfaderState,

    volume,
    setVolume: setVolumeState,
    safeMode,
    setSafeMode,

    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    recordingBlob,
    clearRecording,

    exportStatus,
    exportWav,

    waveformA,
    waveformB,

    audioRefA,
    audioRefB,

    audioContextState,
    isWebAudioConnected,
  };

  return (
    <AudioEngineContext.Provider value={value}>
      {children}
      <audio ref={audioRefA} crossOrigin="anonymous" preload="metadata" style={{ display: 'none' }} />
      <audio ref={audioRefB} crossOrigin="anonymous" preload="metadata" style={{ display: 'none' }} />
    </AudioEngineContext.Provider>
  );
}
