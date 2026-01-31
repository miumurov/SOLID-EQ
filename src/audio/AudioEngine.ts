/**
 * Shared Audio Engine for SOLIDS
 * Manages the Web Audio graph shared across EQ and DJ pages
 */

export const EQ_FREQUENCIES = [60, 170, 350, 1000, 3500, 6000, 10000, 14000];
export const DEFAULT_GAIN = 0;
export const MIN_GAIN = -24;
export const MAX_GAIN = 24;
export const Q_VALUE = 1.0;
export const WAVEFORM_SAMPLES = 800;

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

// DJ Scene parameters
export interface DJSceneParams {
  playbackRate: number;
  djFilterValue: number;
  echoMix: number;
  echoTime: number;
  echoFeedback: number;
}

// Built-in DJ scenes
export const BUILT_IN_DJ_SCENES: Record<string, DJSceneParams> = {
  'Clean': { playbackRate: 1.0, djFilterValue: 0, echoMix: 0, echoTime: 0.3, echoFeedback: 0.3 },
  'Club Echo': { playbackRate: 1.0, djFilterValue: 0, echoMix: 0.35, echoTime: 0.25, echoFeedback: 0.45 },
  'Lowpass Drop': { playbackRate: 0.95, djFilterValue: -60, echoMix: 0.2, echoTime: 0.4, echoFeedback: 0.3 },
  'HiPass Build': { playbackRate: 1.05, djFilterValue: 50, echoMix: 0.15, echoTime: 0.15, echoFeedback: 0.2 },
  'Slowdown': { playbackRate: 0.8, djFilterValue: -30, echoMix: 0.4, echoTime: 0.5, echoFeedback: 0.5 },
};

export interface AudioEngineState {
  // Track info
  audioSrc: string | null;
  fileName: string | null;
  sourceBuffer: AudioBuffer | null;
  
  // Playback
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  
  // EQ
  gains: number[];
  isBypassed: boolean;
  activeSlot: 'A' | 'B';
  slotAGains: number[];
  slotBGains: number[];
  
  // DJ
  playbackRate: number;
  djFilterValue: number;
  echoMix: number;
  echoTime: number;
  echoFeedback: number;
  djBypass: boolean;
  hotCues: (HotCue | null)[];
  loopIn: number | null;
  loopOut: number | null;
  loopEnabled: boolean;
  
  // DJ Scenes
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
  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private masterGain: GainNode | null = null;
  private djFilter: BiquadFilterNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFeedbackGain: GainNode | null = null;
  private echoMixGain: GainNode | null = null;
  private echoDryGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private preCompressorGain: GainNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private graphBuilt = false;
  
  private listeners: Set<AudioEngineListener> = new Set();
  private animationFrameId: number | null = null;
  private morphAnimationId: number | null = null;
  
  private state: AudioEngineState = {
    audioSrc: null,
    fileName: null,
    sourceBuffer: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    gains: [...FLAT_GAINS],
    isBypassed: false,
    activeSlot: 'A',
    slotAGains: [...FLAT_GAINS],
    slotBGains: [...FLAT_GAINS],
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
      if (this.audioElement) {
        const newTime = this.audioElement.currentTime;
        const newDuration = isFinite(this.audioElement.duration) ? this.audioElement.duration : 0;
        const newPlaying = !this.audioElement.paused;
        
        let changed = false;
        if (this.state.currentTime !== newTime) {
          this.state.currentTime = newTime;
          changed = true;
        }
        if (this.state.duration !== newDuration) {
          this.state.duration = newDuration;
          changed = true;
        }
        if (this.state.isPlaying !== newPlaying) {
          this.state.isPlaying = newPlaying;
          changed = true;
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
        
        // Loop handling
        if (this.state.loopEnabled && this.state.loopIn !== null && this.state.loopOut !== null) {
          if (newTime >= this.state.loopOut) {
            this.audioElement.currentTime = this.state.loopIn;
          }
        }
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

  setAudioElement(element: HTMLAudioElement) {
    this.audioElement = element;
    
    element.addEventListener('loadedmetadata', () => {
      this.state.duration = isFinite(element.duration) ? element.duration : 0;
      this.notifyListeners();
    });
    
    element.addEventListener('ended', () => {
      this.state.isPlaying = false;
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

  buildAudioGraph() {
    if (!this.audioElement || !this.audioContext) {
      console.log('[AudioEngine] buildAudioGraph: missing audio element or context');
      return;
    }
    
    if (this.graphBuilt) {
      console.log('[AudioEngine] buildAudioGraph: already built');
      return;
    }
    
    console.log('[AudioEngine] Building audio graph...');
    const ctx = this.audioContext;
    
    // Source node (only once per audio element)
    this.sourceNode = ctx.createMediaElementSource(this.audioElement);
    
    // EQ filter nodes
    this.filters = EQ_FREQUENCIES.map((freq, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = Q_VALUE;
      filter.gain.value = this.state.gains[index];
      return filter;
    });
    
    // Chain EQ filters
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
    
    // DJ Filter (lowpass/highpass)
    this.djFilter = ctx.createBiquadFilter();
    this.djFilter.type = 'lowpass';
    this.djFilter.frequency.value = 20000;
    this.djFilter.Q.value = 0.7;
    
    // Echo effect chain
    this.echoDelay = ctx.createDelay(2.0);
    this.echoDelay.delayTime.value = this.state.echoTime;
    
    this.echoFeedbackGain = ctx.createGain();
    this.echoFeedbackGain.gain.value = this.state.echoFeedback;
    
    this.echoMixGain = ctx.createGain();
    this.echoMixGain.gain.value = this.state.echoMix;
    
    this.echoDryGain = ctx.createGain();
    this.echoDryGain.gain.value = 1;
    
    // Pre-compressor gain (for routing)
    this.preCompressorGain = ctx.createGain();
    this.preCompressorGain.gain.value = 1;
    
    // Compressor/Limiter for Safe Mode
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -6;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;
    this.compressor.knee.value = 3;
    
    // Master gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.state.volume;
    
    // MediaStream destination for recording
    this.mediaStreamDest = ctx.createMediaStreamDestination();
    
    // Connect the graph
    this.connectGraph();
    
    this.graphBuilt = true;
    this.state.webAudioConnected = true;
    this.notifyListeners();
    
    console.log('[AudioEngine] Audio graph built successfully');
  }

  private connectGraph() {
    if (!this.sourceNode || !this.audioContext || !this.masterGain || !this.djFilter || !this.preCompressorGain) return;
    
    const ctx = this.audioContext;
    const lastFilter = this.filters[this.filters.length - 1];
    
    // Disconnect everything first
    try { this.sourceNode.disconnect(); } catch {}
    try { lastFilter?.disconnect(); } catch {}
    try { this.djFilter.disconnect(); } catch {}
    try { this.echoDryGain?.disconnect(); } catch {}
    try { this.echoDelay?.disconnect(); } catch {}
    try { this.echoMixGain?.disconnect(); } catch {}
    try { this.echoFeedbackGain?.disconnect(); } catch {}
    try { this.preCompressorGain?.disconnect(); } catch {}
    try { this.compressor?.disconnect(); } catch {}
    try { this.masterGain.disconnect(); } catch {}
    
    // Source -> EQ (or bypass)
    if (this.state.isBypassed) {
      this.sourceNode.connect(this.djFilter);
    } else {
      this.sourceNode.connect(this.filters[0]);
      lastFilter.connect(this.djFilter);
    }
    
    // DJ Filter -> Echo (or bypass) -> preCompressorGain
    if (this.state.djBypass) {
      this.djFilter.connect(this.preCompressorGain);
    } else {
      this.djFilter.connect(this.echoDryGain!);
      this.djFilter.connect(this.echoDelay!);
      
      this.echoDelay!.connect(this.echoMixGain!);
      this.echoDelay!.connect(this.echoFeedbackGain!);
      this.echoFeedbackGain!.connect(this.echoDelay!);
      
      this.echoDryGain!.connect(this.preCompressorGain);
      this.echoMixGain!.connect(this.preCompressorGain);
    }
    
    // preCompressorGain -> Compressor (if Safe Mode) -> masterGain -> destination
    if (this.state.safeModeEnabled && this.compressor) {
      this.preCompressorGain.connect(this.compressor);
      this.compressor.connect(this.masterGain);
    } else {
      this.preCompressorGain.connect(this.masterGain);
    }
    
    // masterGain -> destination + recording tap
    this.masterGain.connect(ctx.destination);
    if (this.mediaStreamDest) {
      this.masterGain.connect(this.mediaStreamDest);
    }
  }

  // Track loading
  async loadFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    this.state.audioSrc = url;
    this.state.fileName = file.name;
    this.state.currentTime = 0;
    this.state.isPlaying = false;
    
    if (this.audioElement) {
      this.audioElement.src = url;
    }
    
    await this.ensureAudioContext();
    
    setTimeout(() => {
      if (!this.graphBuilt) {
        this.buildAudioGraph();
      }
    }, 0);
    
    // Decode for export/waveform
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tempCtx = new AudioContext();
      const decoded = await tempCtx.decodeAudioData(arrayBuffer);
      this.state.sourceBuffer = decoded;
      await tempCtx.close();
    } catch (err) {
      console.error('[AudioEngine] Failed to decode:', err);
      this.state.sourceBuffer = null;
    }
    
    this.notifyListeners();
  }

  loadUrl(url: string): void {
    this.state.audioSrc = url;
    this.state.fileName = url.split('/').pop() || 'URL Audio';
    this.state.sourceBuffer = null;
    this.state.currentTime = 0;
    this.state.isPlaying = false;
    
    if (this.audioElement) {
      this.audioElement.src = url;
    }
    
    this.notifyListeners();
  }

  // Playback controls
  async play(): Promise<void> {
    if (!this.audioElement || !this.state.audioSrc) return;
    
    await this.ensureAudioContext();
    if (!this.graphBuilt) {
      this.buildAudioGraph();
    }
    
    try {
      await this.audioElement.play();
    } catch (err) {
      console.error('[AudioEngine] Play failed:', err);
    }
  }

  pause(): void {
    this.audioElement?.pause();
  }

  async togglePlay(): Promise<void> {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  seek(time: number): void {
    if (this.audioElement) {
      const clamped = Math.max(0, Math.min(time, this.state.duration || 0));
      this.audioElement.currentTime = clamped;
      this.state.currentTime = clamped;
      this.notifyListeners();
    }
  }

  skipBackward(seconds = 5): void {
    this.seek(this.state.currentTime - seconds);
  }

  skipForward(seconds = 5): void {
    this.seek(this.state.currentTime + seconds);
  }

  // Volume
  setVolume(vol: number): void {
    this.state.volume = vol;
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
    if (this.audioElement) {
      this.audioElement.volume = vol;
    }
    this.notifyListeners();
  }

  // EQ controls
  setBandGain(index: number, value: number): void {
    if (index >= 0 && index < this.state.gains.length) {
      this.state.gains[index] = value;
      if (this.filters[index]) {
        this.filters[index].gain.value = value;
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
    this.filters.forEach((filter, i) => {
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
    this.connectGraph();
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
    
    this.filters.forEach((filter, i) => {
      filter.gain.value = newGains[i];
    });
    
    this.notifyListeners();
  }

  // DJ controls
  setPlaybackRate(rate: number): void {
    this.state.playbackRate = rate;
    if (this.audioElement) {
      this.audioElement.playbackRate = rate;
    }
    this.notifyListeners();
  }

  setDjFilterValue(value: number): void {
    this.state.djFilterValue = value;
    
    if (this.djFilter) {
      if (value === 0) {
        this.djFilter.type = 'lowpass';
        this.djFilter.frequency.value = 20000;
      } else if (value < 0) {
        this.djFilter.type = 'lowpass';
        const normalized = (value + 100) / 100;
        const freq = 200 * Math.pow(100, normalized);
        this.djFilter.frequency.value = Math.min(freq, 20000);
      } else {
        this.djFilter.type = 'highpass';
        const normalized = value / 100;
        const freq = 20 * Math.pow(400, normalized);
        this.djFilter.frequency.value = Math.min(freq, 8000);
      }
    }
    
    this.notifyListeners();
  }

  setEchoMix(mix: number): void {
    this.state.echoMix = mix;
    if (this.echoMixGain) {
      this.echoMixGain.gain.value = mix;
    }
    this.notifyListeners();
  }

  setEchoTime(time: number): void {
    this.state.echoTime = time;
    if (this.echoDelay) {
      this.echoDelay.delayTime.value = time;
    }
    this.notifyListeners();
  }

  setEchoFeedback(feedback: number): void {
    this.state.echoFeedback = feedback;
    if (this.echoFeedbackGain) {
      this.echoFeedbackGain.gain.value = feedback;
    }
    this.notifyListeners();
  }

  setDjBypass(bypass: boolean): void {
    this.state.djBypass = bypass;
    this.connectGraph();
    this.notifyListeners();
  }

  // Hot cues
  setHotCue(index: number): void {
    if (index >= 0 && index < 4) {
      this.state.hotCues[index] = {
        time: this.state.currentTime,
        label: `Cue ${index + 1}`,
      };
      this.notifyListeners();
    }
  }

  triggerHotCue(index: number): void {
    const cue = this.state.hotCues[index];
    if (cue) {
      this.seek(cue.time);
    }
  }

  clearHotCue(index: number): void {
    if (index >= 0 && index < 4) {
      this.state.hotCues[index] = null;
      this.notifyListeners();
    }
  }

  // Loop
  setLoopIn(): void {
    this.state.loopIn = this.state.currentTime;
    this.notifyListeners();
  }

  setLoopOut(): void {
    this.state.loopOut = this.state.currentTime;
    this.notifyListeners();
  }

  toggleLoop(): void {
    this.state.loopEnabled = !this.state.loopEnabled;
    this.notifyListeners();
  }

  clearLoop(): void {
    this.state.loopIn = null;
    this.state.loopOut = null;
    this.state.loopEnabled = false;
    this.notifyListeners();
  }

  // Safe Mode
  setSafeMode(enabled: boolean): void {
    this.state.safeModeEnabled = enabled;
    this.connectGraph();
    this.notifyListeners();
  }

  toggleSafeMode(): void {
    this.setSafeMode(!this.state.safeModeEnabled);
  }

  // DJ Scenes
  getCurrentDjParams(): DJSceneParams {
    return {
      playbackRate: this.state.playbackRate,
      djFilterValue: this.state.djFilterValue,
      echoMix: this.state.echoMix,
      echoTime: this.state.echoTime,
      echoFeedback: this.state.echoFeedback,
    };
  }

  applyDjParams(params: DJSceneParams): void {
    this.setPlaybackRate(params.playbackRate);
    this.setDjFilterValue(params.djFilterValue);
    this.setEchoMix(params.echoMix);
    this.setEchoTime(params.echoTime);
    this.setEchoFeedback(params.echoFeedback);
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
    this.applyDjParams(this.state.djSceneA);
    this.state.activeDjScene = 'A';
    this.notifyListeners();
  }

  loadDjSceneB(): void {
    this.applyDjParams(this.state.djSceneB);
    this.state.activeDjScene = 'B';
    this.notifyListeners();
  }

  applyBuiltInDjScene(name: string): void {
    const scene = BUILT_IN_DJ_SCENES[name];
    if (scene) {
      this.applyDjParams(scene);
    }
  }

  // Morph between scenes
  morphToScene(target: 'A' | 'B', durationMs = 600): void {
    if (this.morphAnimationId) {
      cancelAnimationFrame(this.morphAnimationId);
      this.morphAnimationId = null;
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
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      // Interpolate all params
      const interpolated: DJSceneParams = {
        playbackRate: startParams.playbackRate + (endParams.playbackRate - startParams.playbackRate) * eased,
        djFilterValue: startParams.djFilterValue + (endParams.djFilterValue - startParams.djFilterValue) * eased,
        echoMix: startParams.echoMix + (endParams.echoMix - startParams.echoMix) * eased,
        echoTime: startParams.echoTime + (endParams.echoTime - startParams.echoTime) * eased,
        echoFeedback: startParams.echoFeedback + (endParams.echoFeedback - startParams.echoFeedback) * eased,
      };

      this.applyDjParams(interpolated);
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

  // Recording
  startRecording(): void {
    if (!this.mediaStreamDest || this.state.isRecording) return;

    try {
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.mediaStreamDest.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
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
      alert('Recording is not supported in this browser.');
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.state.isRecording) {
      this.mediaRecorder.stop();
      this.recordingStartTime = 0;
    }
  }

  toggleRecording(): void {
    if (this.state.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
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

  // Cleanup
  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.morphAnimationId) {
      cancelAnimationFrame(this.morphAnimationId);
    }
    this.audioContext?.close();
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
