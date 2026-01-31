/**
 * Shared Audio Engine for SOLIDS
 * Two-deck DJ system with crossfader
 */

export const EQ_FREQUENCIES = [60, 170, 350, 1000, 3500, 6000, 10000, 14000];
export const DEFAULT_GAIN = 0;
export const MIN_GAIN = -24;
export const MAX_GAIN = 24;
export const Q_VALUE = 1.0;
export const WAVEFORM_SAMPLES = 800;
export const LOOP_MIN_GAP = 0.05;

export const FLAT_GAINS = [0, 0, 0, 0, 0, 0, 0, 0];

export const BUILT_IN_PRESETS: Record<string, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 3, -1, 0, 1, 2, 2, 1],
  'Vocal': [-2, -1, 2, 4, 3, 1, 0, -1],
  'Bright': [-2, -1, 0, 1, 2, 4, 5, 4],
  'Club': [5, 3, 0, -1, 2, 3, 2, 1],
};

export const USER_PRESETS_KEY = 'solidEQ_userPresets';

export interface UserPreset {
  name: string;
  gains: number[];
}

export interface HotCue {
  time: number;
  label: string;
}

export interface DJSceneParams {
  playbackRate: number;
  djFilterValue: number;
  echoMix: number;
  echoTime: number;
  echoFeedback: number;
}

export const BUILT_IN_DJ_SCENES: Record<string, DJSceneParams> = {
  'Clean': { playbackRate: 1.0, djFilterValue: 0, echoMix: 0, echoTime: 0.3, echoFeedback: 0.3 },
  'Club Echo': { playbackRate: 1.0, djFilterValue: 0, echoMix: 0.35, echoTime: 0.25, echoFeedback: 0.45 },
  'Lowpass Drop': { playbackRate: 0.95, djFilterValue: -60, echoMix: 0.2, echoTime: 0.4, echoFeedback: 0.3 },
  'HiPass Build': { playbackRate: 1.05, djFilterValue: 50, echoMix: 0.15, echoTime: 0.15, echoFeedback: 0.2 },
  'Slowdown': { playbackRate: 0.8, djFilterValue: -30, echoMix: 0.4, echoTime: 0.5, echoFeedback: 0.5 },
};

// Per-deck state
export interface DeckState {
  audioSrc: string | null;
  fileName: string | null;
  sourceBuffer: AudioBuffer | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  
  // Per-deck FX
  djFilterValue: number;
  echoMix: number;
  echoTime: number;
  echoFeedback: number;
  djBypass: boolean;
  
  // Per-deck hot cues and loop
  hotCues: (HotCue | null)[];
  loopIn: number | null;
  loopOut: number | null;
  loopEnabled: boolean;
}

const DEFAULT_DECK_STATE: DeckState = {
  audioSrc: null,
  fileName: null,
  sourceBuffer: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  djFilterValue: 0,
  echoMix: 0,
  echoTime: 0.3,
  echoFeedback: 0.4,
  djBypass: false,
  hotCues: [null, null, null, null],
  loopIn: null,
  loopOut: null,
  loopEnabled: false,
};

export interface AudioEngineState {
  // Deck states
  deckA: DeckState;
  deckB: DeckState;
  activeDeck: 'A' | 'B';
  
  // Master
  volume: number;
  crossfader: number; // 0 = full A, 1 = full B, 0.5 = center
  
  // EQ (applied to Deck A only)
  gains: number[];
  isBypassed: boolean;
  activeSlot: 'A' | 'B';
  slotAGains: number[];
  slotBGains: number[];
  
  // DJ Scenes (global)
  djSceneA: DJSceneParams;
  djSceneB: DJSceneParams;
  activeDjScene: 'A' | 'B';
  isMorphing: boolean;
  morphProgress: number;
  
  // Safe Mode
  safeModeEnabled: boolean;
  
  // Recording
  isRecording: boolean;
  recordingDuration: number;
  recordingBlob: Blob | null;
  
  // Debug
  audioCtxState: string;
  webAudioConnected: boolean;
}

export type AudioEngineListener = (state: AudioEngineState) => void;

const DEFAULT_DJ_SCENE: DJSceneParams = {
  playbackRate: 1.0,
  djFilterValue: 0,
  echoMix: 0,
  echoTime: 0.3,
  echoFeedback: 0.4,
};

export class AudioEngine {
  // Audio elements
  private audioElementA: HTMLAudioElement | null = null;
  private audioElementB: HTMLAudioElement | null = null;
  
  // Audio context
  private audioContext: AudioContext | null = null;
  
  // Deck A nodes
  private sourceNodeA: MediaElementAudioSourceNode | null = null;
  private filtersA: BiquadFilterNode[] = [];
  private fxDryGainA: GainNode | null = null;
  private fxWetGainA: GainNode | null = null;
  private djFilterA: BiquadFilterNode | null = null;
  private echoDelayA: DelayNode | null = null;
  private echoFeedbackGainA: GainNode | null = null;
  private echoMixGainA: GainNode | null = null;
  private echoDryGainA: GainNode | null = null;
  private deckGainA: GainNode | null = null;
  
  // Deck B nodes
  private sourceNodeB: MediaElementAudioSourceNode | null = null;
  private fxDryGainB: GainNode | null = null;
  private fxWetGainB: GainNode | null = null;
  private djFilterB: BiquadFilterNode | null = null;
  private echoDelayB: DelayNode | null = null;
  private echoFeedbackGainB: GainNode | null = null;
  private echoMixGainB: GainNode | null = null;
  private echoDryGainB: GainNode | null = null;
  private deckGainB: GainNode | null = null;
  
  // Master nodes
  private crossfadeGainA: GainNode | null = null;
  private crossfadeGainB: GainNode | null = null;
  private masterSum: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private graphBuiltA = false;
  private graphBuiltB = false;
  
  private listeners: Set<AudioEngineListener> = new Set();
  private animationFrameId: number | null = null;
  private morphAnimationId: number | null = null;
  
  private state: AudioEngineState = {
    deckA: { ...DEFAULT_DECK_STATE },
    deckB: { ...DEFAULT_DECK_STATE },
    activeDeck: 'A',
    volume: 1,
    crossfader: 0.5,
    gains: [...FLAT_GAINS],
    isBypassed: false,
    activeSlot: 'A',
    slotAGains: [...FLAT_GAINS],
    slotBGains: [...FLAT_GAINS],
    djSceneA: { ...DEFAULT_DJ_SCENE },
    djSceneB: { ...DEFAULT_DJ_SCENE },
    activeDjScene: 'A',
    isMorphing: false,
    morphProgress: 0,
    safeModeEnabled: true,
    isRecording: false,
    recordingDuration: 0,
    recordingBlob: null,
    audioCtxState: 'not created',
    webAudioConnected: false,
  };

  constructor() {
    this.startStateLoop();
  }

  private startStateLoop() {
    const update = () => {
      let changed = false;
      
      // Update Deck A
      if (this.audioElementA) {
        const newTime = this.audioElementA.currentTime;
        const newDuration = isFinite(this.audioElementA.duration) ? this.audioElementA.duration : 0;
        const newPlaying = !this.audioElementA.paused;
        
        if (this.state.deckA.currentTime !== newTime) {
          this.state.deckA.currentTime = newTime;
          changed = true;
        }
        if (this.state.deckA.duration !== newDuration) {
          this.state.deckA.duration = newDuration;
          changed = true;
        }
        if (this.state.deckA.isPlaying !== newPlaying) {
          this.state.deckA.isPlaying = newPlaying;
          changed = true;
        }
        
        // Loop handling Deck A
        if (this.state.deckA.loopEnabled && this.state.deckA.loopIn !== null && this.state.deckA.loopOut !== null) {
          if (newTime >= this.state.deckA.loopOut) {
            this.audioElementA.currentTime = this.state.deckA.loopIn;
          }
        }
      }
      
      // Update Deck B
      if (this.audioElementB) {
        const newTime = this.audioElementB.currentTime;
        const newDuration = isFinite(this.audioElementB.duration) ? this.audioElementB.duration : 0;
        const newPlaying = !this.audioElementB.paused;
        
        if (this.state.deckB.currentTime !== newTime) {
          this.state.deckB.currentTime = newTime;
          changed = true;
        }
        if (this.state.deckB.duration !== newDuration) {
          this.state.deckB.duration = newDuration;
          changed = true;
        }
        if (this.state.deckB.isPlaying !== newPlaying) {
          this.state.deckB.isPlaying = newPlaying;
          changed = true;
        }
        
        // Loop handling Deck B
        if (this.state.deckB.loopEnabled && this.state.deckB.loopIn !== null && this.state.deckB.loopOut !== null) {
          if (newTime >= this.state.deckB.loopOut) {
            this.audioElementB.currentTime = this.state.deckB.loopIn;
          }
        }
      }
      
      // Update recording duration
      if (this.state.isRecording && this.recordingStartTime > 0) {
        const newRecDur = (Date.now() - this.recordingStartTime) / 1000;
        if (Math.floor(newRecDur) !== Math.floor(this.state.recordingDuration)) {
          this.state.recordingDuration = newRecDur;
          changed = true;
        }
      }
      
      if (changed) {
        this.notifyListeners();
      }
      
      if (this.audioContext) {
        const newState = this.audioContext.state;
        if (this.state.audioCtxState !== newState) {
          this.state.audioCtxState = newState;
          this.notifyListeners();
        }
      }
      
      this.animationFrameId = requestAnimationFrame(update);
    };
    
    this.animationFrameId = requestAnimationFrame(update);
  }

  subscribe(listener: AudioEngineListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.state }));
  }

  getState(): AudioEngineState {
    return { ...this.state };
  }

  setAudioElementA(element: HTMLAudioElement) {
    this.audioElementA = element;
    element.addEventListener('loadedmetadata', () => {
      this.state.deckA.duration = isFinite(element.duration) ? element.duration : 0;
      this.notifyListeners();
    });
    element.addEventListener('ended', () => {
      this.state.deckA.isPlaying = false;
      this.notifyListeners();
    });
  }

  setAudioElementB(element: HTMLAudioElement) {
    this.audioElementB = element;
    element.addEventListener('loadedmetadata', () => {
      this.state.deckB.duration = isFinite(element.duration) ? element.duration : 0;
      this.notifyListeners();
    });
    element.addEventListener('ended', () => {
      this.state.deckB.isPlaying = false;
      this.notifyListeners();
    });
  }

  async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      console.log('[AudioEngine] AudioContext created');
    }
    
    if (this.audioContext.state !== 'running') {
      try {
        await this.audioContext.resume();
        console.log('[AudioEngine] AudioContext resumed:', this.audioContext.state);
      } catch (err) {
        console.error('[AudioEngine] Failed to resume AudioContext:', err);
      }
    }
    
    this.state.audioCtxState = this.audioContext.state;
    this.notifyListeners();
    return this.audioContext;
  }

  private buildMasterChain() {
    if (!this.audioContext) return;
    
    const ctx = this.audioContext;
    
    // Crossfade gains
    this.crossfadeGainA = ctx.createGain();
    this.crossfadeGainB = ctx.createGain();
    this.updateCrossfade();
    
    // Master sum
    this.masterSum = ctx.createGain();
    this.masterSum.gain.value = 1;
    
    // Compressor for Safe Mode
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -6;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;
    this.compressor.knee.value = 3;
    
    // Master gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.state.volume;
    
    // Recording destination
    this.mediaStreamDest = ctx.createMediaStreamDestination();
    
    // Connect master chain
    this.crossfadeGainA.connect(this.masterSum);
    this.crossfadeGainB.connect(this.masterSum);
    
    if (this.state.safeModeEnabled) {
      this.masterSum.connect(this.compressor);
      this.compressor.connect(this.masterGain);
    } else {
      this.masterSum.connect(this.masterGain);
    }
    
    this.masterGain.connect(ctx.destination);
    this.masterGain.connect(this.mediaStreamDest);
  }

  buildDeckAGraph() {
    if (!this.audioElementA || !this.audioContext) return;
    if (this.graphBuiltA) return;
    
    console.log('[AudioEngine] Building Deck A graph...');
    const ctx = this.audioContext;
    
    // Ensure master chain exists
    if (!this.masterSum) {
      this.buildMasterChain();
    }
    
    // Source
    this.sourceNodeA = ctx.createMediaElementSource(this.audioElementA);
    
    // EQ filters (Deck A only)
    this.filtersA = EQ_FREQUENCIES.map((freq, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = Q_VALUE;
      filter.gain.value = this.state.gains[index];
      return filter;
    });
    
    for (let i = 0; i < this.filtersA.length - 1; i++) {
      this.filtersA[i].connect(this.filtersA[i + 1]);
    }
    
    // FX bypass dry/wet
    this.fxDryGainA = ctx.createGain();
    this.fxWetGainA = ctx.createGain();
    this.fxDryGainA.gain.value = this.state.deckA.djBypass ? 1 : 0;
    this.fxWetGainA.gain.value = this.state.deckA.djBypass ? 0 : 1;
    
    // DJ Filter
    this.djFilterA = ctx.createBiquadFilter();
    this.djFilterA.type = 'lowpass';
    this.djFilterA.frequency.value = 20000;
    this.djFilterA.Q.value = 0.7;
    
    // Echo
    this.echoDelayA = ctx.createDelay(2.0);
    this.echoDelayA.delayTime.value = this.state.deckA.echoTime;
    this.echoFeedbackGainA = ctx.createGain();
    this.echoFeedbackGainA.gain.value = this.state.deckA.echoFeedback;
    this.echoMixGainA = ctx.createGain();
    this.echoMixGainA.gain.value = this.state.deckA.echoMix;
    this.echoDryGainA = ctx.createGain();
    this.echoDryGainA.gain.value = 1;
    
    // Deck gain
    this.deckGainA = ctx.createGain();
    this.deckGainA.gain.value = 1;
    
    // Connect Deck A
    this.connectDeckA();
    
    this.graphBuiltA = true;
    this.state.webAudioConnected = true;
    this.notifyListeners();
    console.log('[AudioEngine] Deck A graph built');
  }

  private connectDeckA() {
    if (!this.sourceNodeA || !this.crossfadeGainA) return;
    
    const lastFilter = this.filtersA[this.filtersA.length - 1];
    
    // Disconnect
    try { this.sourceNodeA.disconnect(); } catch {}
    try { lastFilter?.disconnect(); } catch {}
    try { this.fxDryGainA?.disconnect(); } catch {}
    try { this.fxWetGainA?.disconnect(); } catch {}
    try { this.djFilterA?.disconnect(); } catch {}
    try { this.echoDryGainA?.disconnect(); } catch {}
    try { this.echoDelayA?.disconnect(); } catch {}
    try { this.echoMixGainA?.disconnect(); } catch {}
    try { this.echoFeedbackGainA?.disconnect(); } catch {}
    try { this.deckGainA?.disconnect(); } catch {}
    
    // Source -> EQ (or bypass) -> preFX
    if (this.state.isBypassed) {
      this.sourceNodeA.connect(this.fxDryGainA!);
      this.sourceNodeA.connect(this.djFilterA!);
    } else {
      this.sourceNodeA.connect(this.filtersA[0]);
      lastFilter.connect(this.fxDryGainA!);
      lastFilter.connect(this.djFilterA!);
    }
    
    // FX chain
    this.djFilterA!.connect(this.echoDryGainA!);
    this.djFilterA!.connect(this.echoDelayA!);
    this.echoDelayA!.connect(this.echoMixGainA!);
    this.echoDelayA!.connect(this.echoFeedbackGainA!);
    this.echoFeedbackGainA!.connect(this.echoDelayA!);
    this.echoDryGainA!.connect(this.fxWetGainA!);
    this.echoMixGainA!.connect(this.fxWetGainA!);
    
    // Dry + Wet -> Deck gain
    this.fxDryGainA!.connect(this.deckGainA!);
    this.fxWetGainA!.connect(this.deckGainA!);
    
    // Deck gain -> crossfade
    this.deckGainA!.connect(this.crossfadeGainA!);
  }

  buildDeckBGraph() {
    if (!this.audioElementB || !this.audioContext) return;
    if (this.graphBuiltB) return;
    
    console.log('[AudioEngine] Building Deck B graph...');
    const ctx = this.audioContext;
    
    // Ensure master chain exists
    if (!this.masterSum) {
      this.buildMasterChain();
    }
    
    // Source
    this.sourceNodeB = ctx.createMediaElementSource(this.audioElementB);
    
    // FX bypass dry/wet
    this.fxDryGainB = ctx.createGain();
    this.fxWetGainB = ctx.createGain();
    this.fxDryGainB.gain.value = this.state.deckB.djBypass ? 1 : 0;
    this.fxWetGainB.gain.value = this.state.deckB.djBypass ? 0 : 1;
    
    // DJ Filter
    this.djFilterB = ctx.createBiquadFilter();
    this.djFilterB.type = 'lowpass';
    this.djFilterB.frequency.value = 20000;
    this.djFilterB.Q.value = 0.7;
    
    // Echo
    this.echoDelayB = ctx.createDelay(2.0);
    this.echoDelayB.delayTime.value = this.state.deckB.echoTime;
    this.echoFeedbackGainB = ctx.createGain();
    this.echoFeedbackGainB.gain.value = this.state.deckB.echoFeedback;
    this.echoMixGainB = ctx.createGain();
    this.echoMixGainB.gain.value = this.state.deckB.echoMix;
    this.echoDryGainB = ctx.createGain();
    this.echoDryGainB.gain.value = 1;
    
    // Deck gain
    this.deckGainB = ctx.createGain();
    this.deckGainB.gain.value = 1;
    
    // Connect Deck B
    this.connectDeckB();
    
    this.graphBuiltB = true;
    this.notifyListeners();
    console.log('[AudioEngine] Deck B graph built');
  }

  private connectDeckB() {
    if (!this.sourceNodeB || !this.crossfadeGainB) return;
    
    // Disconnect
    try { this.sourceNodeB.disconnect(); } catch {}
    try { this.fxDryGainB?.disconnect(); } catch {}
    try { this.fxWetGainB?.disconnect(); } catch {}
    try { this.djFilterB?.disconnect(); } catch {}
    try { this.echoDryGainB?.disconnect(); } catch {}
    try { this.echoDelayB?.disconnect(); } catch {}
    try { this.echoMixGainB?.disconnect(); } catch {}
    try { this.echoFeedbackGainB?.disconnect(); } catch {}
    try { this.deckGainB?.disconnect(); } catch {}
    
    // Source -> FX (no EQ on Deck B)
    this.sourceNodeB.connect(this.fxDryGainB!);
    this.sourceNodeB.connect(this.djFilterB!);
    
    // FX chain
    this.djFilterB!.connect(this.echoDryGainB!);
    this.djFilterB!.connect(this.echoDelayB!);
    this.echoDelayB!.connect(this.echoMixGainB!);
    this.echoDelayB!.connect(this.echoFeedbackGainB!);
    this.echoFeedbackGainB!.connect(this.echoDelayB!);
    this.echoDryGainB!.connect(this.fxWetGainB!);
    this.echoMixGainB!.connect(this.fxWetGainB!);
    
    // Dry + Wet -> Deck gain
    this.fxDryGainB!.connect(this.deckGainB!);
    this.fxWetGainB!.connect(this.deckGainB!);
    
    // Deck gain -> crossfade
    this.deckGainB!.connect(this.crossfadeGainB!);
  }

  private reconnectMasterChain() {
    if (!this.masterSum || !this.masterGain || !this.audioContext) return;
    
    try { this.masterSum.disconnect(); } catch {}
    try { this.compressor?.disconnect(); } catch {}
    try { this.masterGain.disconnect(); } catch {}
    
    if (this.state.safeModeEnabled && this.compressor) {
      this.masterSum.connect(this.compressor);
      this.compressor.connect(this.masterGain);
    } else {
      this.masterSum.connect(this.masterGain);
    }
    
    this.masterGain.connect(this.audioContext.destination);
    if (this.mediaStreamDest) {
      this.masterGain.connect(this.mediaStreamDest);
    }
  }

  // Crossfader
  private updateCrossfade() {
    if (!this.crossfadeGainA || !this.crossfadeGainB) return;
    
    const x = this.state.crossfader;
    // Equal power crossfade
    const gainA = Math.cos(x * Math.PI / 2);
    const gainB = Math.sin(x * Math.PI / 2);
    
    this.crossfadeGainA.gain.value = gainA;
    this.crossfadeGainB.gain.value = gainB;
  }

  setCrossfader(value: number): void {
    this.state.crossfader = Math.max(0, Math.min(1, value));
    this.updateCrossfade();
    this.notifyListeners();
  }

  nudgeCrossfader(delta: number): void {
    this.setCrossfader(this.state.crossfader + delta);
  }

  // Active deck
  setActiveDeck(deck: 'A' | 'B'): void {
    this.state.activeDeck = deck;
    this.notifyListeners();
  }

  toggleActiveDeck(): void {
    this.setActiveDeck(this.state.activeDeck === 'A' ? 'B' : 'A');
  }

  // Track loading
  async loadFileA(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    this.state.deckA.audioSrc = url;
    this.state.deckA.fileName = file.name;
    this.state.deckA.currentTime = 0;
    this.state.deckA.isPlaying = false;
    
    if (this.audioElementA) {
      this.audioElementA.src = url;
    }
    
    await this.ensureAudioContext();
    if (!this.graphBuiltA) {
      this.buildDeckAGraph();
    }
    
    // Decode for waveform
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tempCtx = new AudioContext();
      const decoded = await tempCtx.decodeAudioData(arrayBuffer);
      this.state.deckA.sourceBuffer = decoded;
      await tempCtx.close();
    } catch (err) {
      console.error('[AudioEngine] Failed to decode Deck A:', err);
      this.state.deckA.sourceBuffer = null;
    }
    
    this.notifyListeners();
  }

  loadUrlA(url: string): void {
    this.state.deckA.audioSrc = url;
    this.state.deckA.fileName = url.split('/').pop() || 'URL Audio';
    this.state.deckA.sourceBuffer = null;
    this.state.deckA.currentTime = 0;
    this.state.deckA.isPlaying = false;
    
    if (this.audioElementA) {
      this.audioElementA.src = url;
    }
    
    this.notifyListeners();
  }

  async loadFileB(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    this.state.deckB.audioSrc = url;
    this.state.deckB.fileName = file.name;
    this.state.deckB.currentTime = 0;
    this.state.deckB.isPlaying = false;
    
    if (this.audioElementB) {
      this.audioElementB.src = url;
    }
    
    await this.ensureAudioContext();
    if (!this.graphBuiltB) {
      this.buildDeckBGraph();
    }
    
    // Decode for waveform
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tempCtx = new AudioContext();
      const decoded = await tempCtx.decodeAudioData(arrayBuffer);
      this.state.deckB.sourceBuffer = decoded;
      await tempCtx.close();
    } catch (err) {
      console.error('[AudioEngine] Failed to decode Deck B:', err);
      this.state.deckB.sourceBuffer = null;
    }
    
    this.notifyListeners();
  }

  loadUrlB(url: string): void {
    this.state.deckB.audioSrc = url;
    this.state.deckB.fileName = url.split('/').pop() || 'URL Audio';
    this.state.deckB.sourceBuffer = null;
    this.state.deckB.currentTime = 0;
    this.state.deckB.isPlaying = false;
    
    if (this.audioElementB) {
      this.audioElementB.src = url;
    }
    
    this.notifyListeners();
  }

  // Playback - Deck A
  async playA(): Promise<void> {
    if (!this.audioElementA || !this.state.deckA.audioSrc) return;
    await this.ensureAudioContext();
    if (!this.graphBuiltA) this.buildDeckAGraph();
    try { await this.audioElementA.play(); } catch (err) { console.error('[AudioEngine] Play A failed:', err); }
  }

  pauseA(): void {
    this.audioElementA?.pause();
  }

  async togglePlayA(): Promise<void> {
    if (this.state.deckA.isPlaying) this.pauseA();
    else await this.playA();
  }

  seekA(time: number): void {
    if (this.audioElementA) {
      const clamped = Math.max(0, Math.min(time, this.state.deckA.duration || 0));
      this.audioElementA.currentTime = clamped;
      this.state.deckA.currentTime = clamped;
      this.notifyListeners();
    }
  }

  skipBackwardA(seconds = 5): void {
    this.seekA(this.state.deckA.currentTime - seconds);
  }

  skipForwardA(seconds = 5): void {
    this.seekA(this.state.deckA.currentTime + seconds);
  }

  // Playback - Deck B
  async playB(): Promise<void> {
    if (!this.audioElementB || !this.state.deckB.audioSrc) return;
    await this.ensureAudioContext();
    if (!this.graphBuiltB) this.buildDeckBGraph();
    try { await this.audioElementB.play(); } catch (err) { console.error('[AudioEngine] Play B failed:', err); }
  }

  pauseB(): void {
    this.audioElementB?.pause();
  }

  async togglePlayB(): Promise<void> {
    if (this.state.deckB.isPlaying) this.pauseB();
    else await this.playB();
  }

  seekB(time: number): void {
    if (this.audioElementB) {
      const clamped = Math.max(0, Math.min(time, this.state.deckB.duration || 0));
      this.audioElementB.currentTime = clamped;
      this.state.deckB.currentTime = clamped;
      this.notifyListeners();
    }
  }

  skipBackwardB(seconds = 5): void {
    this.seekB(this.state.deckB.currentTime - seconds);
  }

  skipForwardB(seconds = 5): void {
    this.seekB(this.state.deckB.currentTime + seconds);
  }

  // Convenience: active deck methods
  async togglePlayActive(): Promise<void> {
    if (this.state.activeDeck === 'A') await this.togglePlayA();
    else await this.togglePlayB();
  }

  seekActive(time: number): void {
    if (this.state.activeDeck === 'A') this.seekA(time);
    else this.seekB(time);
  }

  skipBackwardActive(seconds = 5): void {
    if (this.state.activeDeck === 'A') this.skipBackwardA(seconds);
    else this.skipBackwardB(seconds);
  }

  skipForwardActive(seconds = 5): void {
    if (this.state.activeDeck === 'A') this.skipForwardA(seconds);
    else this.skipForwardB(seconds);
  }

  // Volume
  setVolume(vol: number): void {
    this.state.volume = vol;
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
    this.notifyListeners();
  }

  // EQ controls (Deck A only)
  setBandGain(index: number, value: number): void {
    if (index >= 0 && index < this.state.gains.length) {
      this.state.gains[index] = value;
      if (this.filtersA[index]) {
        this.filtersA[index].gain.value = value;
      }
      
      if (this.state.activeSlot === 'A') {
        this.state.slotAGains[index] = value;
      } else {
        this.state.slotBGains[index] = value;
      }
      
      this.notifyListeners();
    }
  }

  setAllGains(gains: number[]): void {
    this.state.gains = [...gains];
    this.filtersA.forEach((filter, i) => {
      if (gains[i] !== undefined) {
        filter.gain.value = gains[i];
      }
    });
    
    if (this.state.activeSlot === 'A') {
      this.state.slotAGains = [...gains];
    } else {
      this.state.slotBGains = [...gains];
    }
    
    this.notifyListeners();
  }

  setEqBypass(bypass: boolean): void {
    this.state.isBypassed = bypass;
    this.connectDeckA();
    this.notifyListeners();
  }

  switchSlot(slot: 'A' | 'B'): void {
    if (slot === this.state.activeSlot) return;
    
    if (this.state.activeSlot === 'A') {
      this.state.slotAGains = [...this.state.gains];
    } else {
      this.state.slotBGains = [...this.state.gains];
    }
    
    const newGains = slot === 'A' ? [...this.state.slotAGains] : [...this.state.slotBGains];
    this.state.gains = newGains;
    this.state.activeSlot = slot;
    
    this.filtersA.forEach((filter, i) => {
      filter.gain.value = newGains[i];
    });
    
    this.notifyListeners();
  }

  // DJ controls - Deck A
  setPlaybackRateA(rate: number): void {
    this.state.deckA.playbackRate = rate;
    if (this.audioElementA) {
      this.audioElementA.playbackRate = rate;
    }
    this.notifyListeners();
  }

  setDjFilterValueA(value: number): void {
    this.state.deckA.djFilterValue = value;
    if (this.djFilterA) {
      this.applyFilterValue(this.djFilterA, value);
    }
    this.notifyListeners();
  }

  setEchoMixA(mix: number): void {
    this.state.deckA.echoMix = mix;
    if (this.echoMixGainA) this.echoMixGainA.gain.value = mix;
    this.notifyListeners();
  }

  setEchoTimeA(time: number): void {
    this.state.deckA.echoTime = time;
    if (this.echoDelayA) this.echoDelayA.delayTime.value = time;
    this.notifyListeners();
  }

  setEchoFeedbackA(feedback: number): void {
    this.state.deckA.echoFeedback = feedback;
    if (this.echoFeedbackGainA) this.echoFeedbackGainA.gain.value = feedback;
    this.notifyListeners();
  }

  setDjBypassA(bypass: boolean): void {
    this.state.deckA.djBypass = bypass;
    if (this.fxDryGainA && this.fxWetGainA) {
      this.fxDryGainA.gain.value = bypass ? 1 : 0;
      this.fxWetGainA.gain.value = bypass ? 0 : 1;
    }
    this.notifyListeners();
  }

  // DJ controls - Deck B
  setPlaybackRateB(rate: number): void {
    this.state.deckB.playbackRate = rate;
    if (this.audioElementB) {
      this.audioElementB.playbackRate = rate;
    }
    this.notifyListeners();
  }

  setDjFilterValueB(value: number): void {
    this.state.deckB.djFilterValue = value;
    if (this.djFilterB) {
      this.applyFilterValue(this.djFilterB, value);
    }
    this.notifyListeners();
  }

  setEchoMixB(mix: number): void {
    this.state.deckB.echoMix = mix;
    if (this.echoMixGainB) this.echoMixGainB.gain.value = mix;
    this.notifyListeners();
  }

  setEchoTimeB(time: number): void {
    this.state.deckB.echoTime = time;
    if (this.echoDelayB) this.echoDelayB.delayTime.value = time;
    this.notifyListeners();
  }

  setEchoFeedbackB(feedback: number): void {
    this.state.deckB.echoFeedback = feedback;
    if (this.echoFeedbackGainB) this.echoFeedbackGainB.gain.value = feedback;
    this.notifyListeners();
  }

  setDjBypassB(bypass: boolean): void {
    this.state.deckB.djBypass = bypass;
    if (this.fxDryGainB && this.fxWetGainB) {
      this.fxDryGainB.gain.value = bypass ? 1 : 0;
      this.fxWetGainB.gain.value = bypass ? 0 : 1;
    }
    this.notifyListeners();
  }

  private applyFilterValue(filter: BiquadFilterNode, value: number) {
    if (value === 0) {
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
    } else if (value < 0) {
      filter.type = 'lowpass';
      const normalized = (value + 100) / 100;
      const freq = 200 * Math.pow(100, normalized);
      filter.frequency.value = Math.min(freq, 20000);
    } else {
      filter.type = 'highpass';
      const normalized = value / 100;
      const freq = 20 * Math.pow(400, normalized);
      filter.frequency.value = Math.min(freq, 8000);
    }
  }

  // Hot cues - per deck
  setHotCueA(index: number): void {
    if (index >= 0 && index < 4) {
      this.state.deckA.hotCues[index] = {
        time: this.state.deckA.currentTime,
        label: `Cue ${index + 1}`,
      };
      this.notifyListeners();
    }
  }

  triggerHotCueA(index: number): void {
    const cue = this.state.deckA.hotCues[index];
    if (cue) this.seekA(cue.time);
  }

  clearHotCueA(index: number): void {
    if (index >= 0 && index < 4) {
      this.state.deckA.hotCues[index] = null;
      this.notifyListeners();
    }
  }

  setHotCueB(index: number): void {
    if (index >= 0 && index < 4) {
      this.state.deckB.hotCues[index] = {
        time: this.state.deckB.currentTime,
        label: `Cue ${index + 1}`,
      };
      this.notifyListeners();
    }
  }

  triggerHotCueB(index: number): void {
    const cue = this.state.deckB.hotCues[index];
    if (cue) this.seekB(cue.time);
  }

  clearHotCueB(index: number): void {
    if (index >= 0 && index < 4) {
      this.state.deckB.hotCues[index] = null;
      this.notifyListeners();
    }
  }

  // Active deck hot cues
  setHotCueActive(index: number): void {
    if (this.state.activeDeck === 'A') this.setHotCueA(index);
    else this.setHotCueB(index);
  }

  triggerHotCueActive(index: number): void {
    if (this.state.activeDeck === 'A') this.triggerHotCueA(index);
    else this.triggerHotCueB(index);
  }

  getHotCueActive(index: number): HotCue | null {
    if (this.state.activeDeck === 'A') return this.state.deckA.hotCues[index];
    return this.state.deckB.hotCues[index];
  }

  // Loop - per deck
  private normalizeLoopMarkersA(): void {
    const duration = this.state.deckA.duration || 0;
    if (this.state.deckA.loopIn !== null) {
      this.state.deckA.loopIn = Math.max(0, Math.min(this.state.deckA.loopIn, duration));
    }
    if (this.state.deckA.loopOut !== null) {
      this.state.deckA.loopOut = Math.max(0, Math.min(this.state.deckA.loopOut, duration));
    }
    if (this.state.deckA.loopIn !== null && this.state.deckA.loopOut !== null) {
      if (this.state.deckA.loopOut < this.state.deckA.loopIn + LOOP_MIN_GAP) {
        this.state.deckA.loopOut = Math.min(this.state.deckA.loopIn + LOOP_MIN_GAP, duration);
      }
    }
  }

  setLoopInA(): void {
    this.state.deckA.loopIn = this.state.deckA.currentTime;
    if (this.state.deckA.loopOut !== null && this.state.deckA.loopIn >= this.state.deckA.loopOut - LOOP_MIN_GAP) {
      this.state.deckA.loopOut = Math.min(this.state.deckA.loopIn + LOOP_MIN_GAP, this.state.deckA.duration);
    }
    this.normalizeLoopMarkersA();
    this.notifyListeners();
  }

  setLoopOutA(): void {
    let newOut = this.state.deckA.currentTime;
    if (this.state.deckA.loopIn !== null && newOut < this.state.deckA.loopIn + LOOP_MIN_GAP) {
      newOut = Math.min(this.state.deckA.loopIn + LOOP_MIN_GAP, this.state.deckA.duration);
    }
    this.state.deckA.loopOut = newOut;
    this.normalizeLoopMarkersA();
    this.notifyListeners();
  }

  toggleLoopA(): void {
    if (this.state.deckA.loopIn !== null && this.state.deckA.loopOut !== null) {
      this.state.deckA.loopEnabled = !this.state.deckA.loopEnabled;
    }
    this.notifyListeners();
  }

  clearLoopA(): void {
    this.state.deckA.loopIn = null;
    this.state.deckA.loopOut = null;
    this.state.deckA.loopEnabled = false;
    this.notifyListeners();
  }

  private normalizeLoopMarkersB(): void {
    const duration = this.state.deckB.duration || 0;
    if (this.state.deckB.loopIn !== null) {
      this.state.deckB.loopIn = Math.max(0, Math.min(this.state.deckB.loopIn, duration));
    }
    if (this.state.deckB.loopOut !== null) {
      this.state.deckB.loopOut = Math.max(0, Math.min(this.state.deckB.loopOut, duration));
    }
    if (this.state.deckB.loopIn !== null && this.state.deckB.loopOut !== null) {
      if (this.state.deckB.loopOut < this.state.deckB.loopIn + LOOP_MIN_GAP) {
        this.state.deckB.loopOut = Math.min(this.state.deckB.loopIn + LOOP_MIN_GAP, duration);
      }
    }
  }

  setLoopInB(): void {
    this.state.deckB.loopIn = this.state.deckB.currentTime;
    if (this.state.deckB.loopOut !== null && this.state.deckB.loopIn >= this.state.deckB.loopOut - LOOP_MIN_GAP) {
      this.state.deckB.loopOut = Math.min(this.state.deckB.loopIn + LOOP_MIN_GAP, this.state.deckB.duration);
    }
    this.normalizeLoopMarkersB();
    this.notifyListeners();
  }

  setLoopOutB(): void {
    let newOut = this.state.deckB.currentTime;
    if (this.state.deckB.loopIn !== null && newOut < this.state.deckB.loopIn + LOOP_MIN_GAP) {
      newOut = Math.min(this.state.deckB.loopIn + LOOP_MIN_GAP, this.state.deckB.duration);
    }
    this.state.deckB.loopOut = newOut;
    this.normalizeLoopMarkersB();
    this.notifyListeners();
  }

  toggleLoopB(): void {
    if (this.state.deckB.loopIn !== null && this.state.deckB.loopOut !== null) {
      this.state.deckB.loopEnabled = !this.state.deckB.loopEnabled;
    }
    this.notifyListeners();
  }

  clearLoopB(): void {
    this.state.deckB.loopIn = null;
    this.state.deckB.loopOut = null;
    this.state.deckB.loopEnabled = false;
    this.notifyListeners();
  }

  // Active deck loop
  setLoopInActive(): void {
    if (this.state.activeDeck === 'A') this.setLoopInA();
    else this.setLoopInB();
  }

  setLoopOutActive(): void {
    if (this.state.activeDeck === 'A') this.setLoopOutA();
    else this.setLoopOutB();
  }

  toggleLoopActive(): void {
    if (this.state.activeDeck === 'A') this.toggleLoopA();
    else this.toggleLoopB();
  }

  clearLoopActive(): void {
    if (this.state.activeDeck === 'A') this.clearLoopA();
    else this.clearLoopB();
  }

  moveLoopWindowActive(offset: number): void {
    const deck = this.state.activeDeck === 'A' ? this.state.deckA : this.state.deckB;
    if (deck.loopIn === null || deck.loopOut === null) return;
    
    const duration = deck.duration || 0;
    const loopLength = deck.loopOut - deck.loopIn;
    
    let newIn = deck.loopIn + offset;
    let newOut = deck.loopOut + offset;
    
    if (newIn < 0) { newIn = 0; newOut = loopLength; }
    if (newOut > duration) { newOut = duration; newIn = Math.max(0, duration - loopLength); }
    
    if (this.state.activeDeck === 'A') {
      this.state.deckA.loopIn = newIn;
      this.state.deckA.loopOut = newOut;
    } else {
      this.state.deckB.loopIn = newIn;
      this.state.deckB.loopOut = newOut;
    }
    this.notifyListeners();
  }

  // Safe Mode
  setSafeMode(enabled: boolean): void {
    this.state.safeModeEnabled = enabled;
    this.reconnectMasterChain();
    this.notifyListeners();
  }

  toggleSafeMode(): void {
    this.setSafeMode(!this.state.safeModeEnabled);
  }

  // DJ Scenes (applied to active deck)
  getCurrentDjParams(): DJSceneParams {
    const deck = this.state.activeDeck === 'A' ? this.state.deckA : this.state.deckB;
    return {
      playbackRate: deck.playbackRate,
      djFilterValue: deck.djFilterValue,
      echoMix: deck.echoMix,
      echoTime: deck.echoTime,
      echoFeedback: deck.echoFeedback,
    };
  }

  applyDjParamsToActive(params: DJSceneParams): void {
    if (this.state.activeDeck === 'A') {
      this.setPlaybackRateA(params.playbackRate);
      this.setDjFilterValueA(params.djFilterValue);
      this.setEchoMixA(params.echoMix);
      this.setEchoTimeA(params.echoTime);
      this.setEchoFeedbackA(params.echoFeedback);
    } else {
      this.setPlaybackRateB(params.playbackRate);
      this.setDjFilterValueB(params.djFilterValue);
      this.setEchoMixB(params.echoMix);
      this.setEchoTimeB(params.echoTime);
      this.setEchoFeedbackB(params.echoFeedback);
    }
  }

  storeDjSceneA(): void {
    this.state.djSceneA = this.getCurrentDjParams();
    this.notifyListeners();
  }

  storeDjSceneB(): void {
    this.state.djSceneB = this.getCurrentDjParams();
    this.notifyListeners();
  }

  loadDjSceneA(): void {
    this.applyDjParamsToActive(this.state.djSceneA);
    this.state.activeDjScene = 'A';
    this.notifyListeners();
  }

  loadDjSceneB(): void {
    this.applyDjParamsToActive(this.state.djSceneB);
    this.state.activeDjScene = 'B';
    this.notifyListeners();
  }

  applyBuiltInDjScene(name: string): void {
    const scene = BUILT_IN_DJ_SCENES[name];
    if (scene) this.applyDjParamsToActive(scene);
  }

  morphToScene(target: 'A' | 'B', durationMs = 600): void {
    if (this.morphAnimationId) {
      cancelAnimationFrame(this.morphAnimationId);
    }

    const startParams = this.getCurrentDjParams();
    const endParams = target === 'A' ? this.state.djSceneA : this.state.djSceneB;
    const startTime = performance.now();

    this.state.isMorphing = true;
    this.state.morphProgress = 0;
    this.notifyListeners();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const interpolated: DJSceneParams = {
        playbackRate: startParams.playbackRate + (endParams.playbackRate - startParams.playbackRate) * eased,
        djFilterValue: startParams.djFilterValue + (endParams.djFilterValue - startParams.djFilterValue) * eased,
        echoMix: startParams.echoMix + (endParams.echoMix - startParams.echoMix) * eased,
        echoTime: startParams.echoTime + (endParams.echoTime - startParams.echoTime) * eased,
        echoFeedback: startParams.echoFeedback + (endParams.echoFeedback - startParams.echoFeedback) * eased,
      };

      this.applyDjParamsToActive(interpolated);
      this.state.morphProgress = progress;

      if (progress < 1) {
        this.morphAnimationId = requestAnimationFrame(animate);
      } else {
        this.state.isMorphing = false;
        this.state.activeDjScene = target;
        this.morphAnimationId = null;
        this.notifyListeners();
      }
    };

    this.morphAnimationId = requestAnimationFrame(animate);
  }

  cancelMorph(): void {
    if (this.morphAnimationId) {
      cancelAnimationFrame(this.morphAnimationId);
      this.morphAnimationId = null;
      this.state.isMorphing = false;
      this.notifyListeners();
    }
  }

  panicFx(): void {
    this.cancelMorph();
    this.setDjFilterValueA(0);
    this.setEchoMixA(0);
    this.setDjFilterValueB(0);
    this.setEchoMixB(0);
  }

  // Recording
  startRecording(): void {
    if (!this.mediaStreamDest || this.state.isRecording) return;

    try {
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.mediaStreamDest.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.state.recordingBlob = blob;
        this.state.isRecording = false;
        this.notifyListeners();
      };

      this.mediaRecorder.start(100);
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;
      this.state.recordingDuration = 0;
      this.state.recordingBlob = null;
      this.notifyListeners();
    } catch (err) {
      console.error('[AudioEngine] Recording not supported:', err);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.state.isRecording) {
      this.mediaRecorder.stop();
      this.recordingStartTime = 0;
    }
  }

  toggleRecording(): void {
    if (this.state.isRecording) this.stopRecording();
    else this.startRecording();
  }

  downloadRecording(): void {
    if (this.state.recordingBlob) {
      const url = URL.createObjectURL(this.state.recordingBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `solids_recording_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  clearRecording(): void {
    this.state.recordingBlob = null;
    this.state.recordingDuration = 0;
    this.notifyListeners();
  }

  destroy(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.morphAnimationId) cancelAnimationFrame(this.morphAnimationId);
    this.audioContext?.close();
  }
}

export const audioEngine = new AudioEngine();
