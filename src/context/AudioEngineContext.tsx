import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { audioEngine, AudioEngineState, UserPreset, USER_PRESETS_KEY, HotCue } from '../audio/AudioEngine';

interface AudioEngineContextType {
  state: AudioEngineState;
  
  // Active deck
  setActiveDeck: (deck: 'A' | 'B') => void;
  toggleActiveDeck: () => void;
  
  // Track loading
  loadFileA: (file: File) => Promise<void>;
  loadUrlA: (url: string) => void;
  loadFileB: (file: File) => Promise<void>;
  loadUrlB: (url: string) => void;
  
  // Playback - Deck A
  playA: () => Promise<void>;
  pauseA: () => void;
  togglePlayA: () => Promise<void>;
  seekA: (time: number) => void;
  skipBackwardA: (seconds?: number) => void;
  skipForwardA: (seconds?: number) => void;
  
  // Playback - Deck B
  playB: () => Promise<void>;
  pauseB: () => void;
  togglePlayB: () => Promise<void>;
  seekB: (time: number) => void;
  skipBackwardB: (seconds?: number) => void;
  skipForwardB: (seconds?: number) => void;
  
  // Playback - Active deck
  togglePlayActive: () => Promise<void>;
  seekActive: (time: number) => void;
  skipBackwardActive: (seconds?: number) => void;
  skipForwardActive: (seconds?: number) => void;
  
  // Volume & Crossfader
  setVolume: (vol: number) => void;
  setCrossfader: (value: number) => void;
  nudgeCrossfader: (delta: number) => void;
  
  // EQ (Deck A)
  setBandGain: (index: number, value: number) => void;
  setAllGains: (gains: number[]) => void;
  setEqBypass: (bypass: boolean) => void;
  switchSlot: (slot: 'A' | 'B') => void;
  
  // DJ FX - Deck A
  setPlaybackRateA: (rate: number) => void;
  setDjFilterValueA: (value: number) => void;
  setEchoMixA: (mix: number) => void;
  setEchoTimeA: (time: number) => void;
  setEchoFeedbackA: (feedback: number) => void;
  setDjBypassA: (bypass: boolean) => void;
  
  // DJ FX - Deck B
  setPlaybackRateB: (rate: number) => void;
  setDjFilterValueB: (value: number) => void;
  setEchoMixB: (mix: number) => void;
  setEchoTimeB: (time: number) => void;
  setEchoFeedbackB: (feedback: number) => void;
  setDjBypassB: (bypass: boolean) => void;
  
  // Hot cues
  setHotCueA: (index: number) => void;
  triggerHotCueA: (index: number) => void;
  clearHotCueA: (index: number) => void;
  setHotCueB: (index: number) => void;
  triggerHotCueB: (index: number) => void;
  clearHotCueB: (index: number) => void;
  setHotCueActive: (index: number) => void;
  triggerHotCueActive: (index: number) => void;
  getHotCueActive: (index: number) => HotCue | null;
  
  // Loop
  setLoopInA: () => void;
  setLoopOutA: () => void;
  toggleLoopA: () => void;
  clearLoopA: () => void;
  setLoopInB: () => void;
  setLoopOutB: () => void;
  toggleLoopB: () => void;
  clearLoopB: () => void;
  setLoopInActive: () => void;
  setLoopOutActive: () => void;
  toggleLoopActive: () => void;
  clearLoopActive: () => void;
  moveLoopWindowActive: (offset: number) => void;
  
  // DJ Scenes
  storeDjSceneA: () => void;
  storeDjSceneB: () => void;
  loadDjSceneA: () => void;
  loadDjSceneB: () => void;
  applyBuiltInDjScene: (name: string) => void;
  morphToScene: (target: 'A' | 'B', durationMs?: number) => void;
  cancelMorph: () => void;
  panicFx: () => void;
  
  // Safe Mode
  setSafeMode: (enabled: boolean) => void;
  toggleSafeMode: () => void;
  
  // Recording
  startRecording: () => void;
  stopRecording: () => void;
  toggleRecording: () => void;
  downloadRecording: () => void;
  clearRecording: () => void;
  
  // User presets
  userPresets: UserPreset[];
  saveUserPreset: (name: string) => void;
  deleteUserPreset: (name: string) => void;
  
  // Audio element setup
  setAudioElementA: (el: HTMLAudioElement) => void;
  setAudioElementB: (el: HTMLAudioElement) => void;
  ensureAudioContext: () => Promise<AudioContext>;
  buildDeckAGraph: () => void;
  buildDeckBGraph: () => void;
}

const AudioEngineContext = createContext<AudioEngineContextType | null>(null);

export function AudioEngineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioEngineState>(audioEngine.getState());
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    try {
      const stored = localStorage.getItem(USER_PRESETS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(setState);
    return unsubscribe;
  }, []);

  const saveUserPreset = (name: string) => {
    const newPreset: UserPreset = { name, gains: [...state.gains] };
    const existingIndex = userPresets.findIndex(p => p.name === name);
    
    let newPresets: UserPreset[];
    if (existingIndex >= 0) {
      newPresets = [...userPresets];
      newPresets[existingIndex] = newPreset;
    } else {
      newPresets = [...userPresets, newPreset];
    }
    
    setUserPresets(newPresets);
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(newPresets));
  };

  const deleteUserPreset = (name: string) => {
    const newPresets = userPresets.filter(p => p.name !== name);
    setUserPresets(newPresets);
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(newPresets));
  };

  const value: AudioEngineContextType = {
    state,
    
    // Active deck
    setActiveDeck: (deck) => audioEngine.setActiveDeck(deck),
    toggleActiveDeck: () => audioEngine.toggleActiveDeck(),
    
    // Track loading
    loadFileA: (file) => audioEngine.loadFileA(file),
    loadUrlA: (url) => audioEngine.loadUrlA(url),
    loadFileB: (file) => audioEngine.loadFileB(file),
    loadUrlB: (url) => audioEngine.loadUrlB(url),
    
    // Playback - Deck A
    playA: () => audioEngine.playA(),
    pauseA: () => audioEngine.pauseA(),
    togglePlayA: () => audioEngine.togglePlayA(),
    seekA: (time) => audioEngine.seekA(time),
    skipBackwardA: (seconds) => audioEngine.skipBackwardA(seconds),
    skipForwardA: (seconds) => audioEngine.skipForwardA(seconds),
    
    // Playback - Deck B
    playB: () => audioEngine.playB(),
    pauseB: () => audioEngine.pauseB(),
    togglePlayB: () => audioEngine.togglePlayB(),
    seekB: (time) => audioEngine.seekB(time),
    skipBackwardB: (seconds) => audioEngine.skipBackwardB(seconds),
    skipForwardB: (seconds) => audioEngine.skipForwardB(seconds),
    
    // Playback - Active
    togglePlayActive: () => audioEngine.togglePlayActive(),
    seekActive: (time) => audioEngine.seekActive(time),
    skipBackwardActive: (seconds) => audioEngine.skipBackwardActive(seconds),
    skipForwardActive: (seconds) => audioEngine.skipForwardActive(seconds),
    
    // Volume & Crossfader
    setVolume: (vol) => audioEngine.setVolume(vol),
    setCrossfader: (value) => audioEngine.setCrossfader(value),
    nudgeCrossfader: (delta) => audioEngine.nudgeCrossfader(delta),
    
    // EQ
    setBandGain: (index, value) => audioEngine.setBandGain(index, value),
    setAllGains: (gains) => audioEngine.setAllGains(gains),
    setEqBypass: (bypass) => audioEngine.setEqBypass(bypass),
    switchSlot: (slot) => audioEngine.switchSlot(slot),
    
    // DJ FX - Deck A
    setPlaybackRateA: (rate) => audioEngine.setPlaybackRateA(rate),
    setDjFilterValueA: (value) => audioEngine.setDjFilterValueA(value),
    setEchoMixA: (mix) => audioEngine.setEchoMixA(mix),
    setEchoTimeA: (time) => audioEngine.setEchoTimeA(time),
    setEchoFeedbackA: (feedback) => audioEngine.setEchoFeedbackA(feedback),
    setDjBypassA: (bypass) => audioEngine.setDjBypassA(bypass),
    
    // DJ FX - Deck B
    setPlaybackRateB: (rate) => audioEngine.setPlaybackRateB(rate),
    setDjFilterValueB: (value) => audioEngine.setDjFilterValueB(value),
    setEchoMixB: (mix) => audioEngine.setEchoMixB(mix),
    setEchoTimeB: (time) => audioEngine.setEchoTimeB(time),
    setEchoFeedbackB: (feedback) => audioEngine.setEchoFeedbackB(feedback),
    setDjBypassB: (bypass) => audioEngine.setDjBypassB(bypass),
    
    // Hot cues
    setHotCueA: (index) => audioEngine.setHotCueA(index),
    triggerHotCueA: (index) => audioEngine.triggerHotCueA(index),
    clearHotCueA: (index) => audioEngine.clearHotCueA(index),
    setHotCueB: (index) => audioEngine.setHotCueB(index),
    triggerHotCueB: (index) => audioEngine.triggerHotCueB(index),
    clearHotCueB: (index) => audioEngine.clearHotCueB(index),
    setHotCueActive: (index) => audioEngine.setHotCueActive(index),
    triggerHotCueActive: (index) => audioEngine.triggerHotCueActive(index),
    getHotCueActive: (index) => audioEngine.getHotCueActive(index),
    
    // Loop
    setLoopInA: () => audioEngine.setLoopInA(),
    setLoopOutA: () => audioEngine.setLoopOutA(),
    toggleLoopA: () => audioEngine.toggleLoopA(),
    clearLoopA: () => audioEngine.clearLoopA(),
    setLoopInB: () => audioEngine.setLoopInB(),
    setLoopOutB: () => audioEngine.setLoopOutB(),
    toggleLoopB: () => audioEngine.toggleLoopB(),
    clearLoopB: () => audioEngine.clearLoopB(),
    setLoopInActive: () => audioEngine.setLoopInActive(),
    setLoopOutActive: () => audioEngine.setLoopOutActive(),
    toggleLoopActive: () => audioEngine.toggleLoopActive(),
    clearLoopActive: () => audioEngine.clearLoopActive(),
    moveLoopWindowActive: (offset) => audioEngine.moveLoopWindowActive(offset),
    
    // DJ Scenes
    storeDjSceneA: () => audioEngine.storeDjSceneA(),
    storeDjSceneB: () => audioEngine.storeDjSceneB(),
    loadDjSceneA: () => audioEngine.loadDjSceneA(),
    loadDjSceneB: () => audioEngine.loadDjSceneB(),
    applyBuiltInDjScene: (name) => audioEngine.applyBuiltInDjScene(name),
    morphToScene: (target, durationMs) => audioEngine.morphToScene(target, durationMs),
    cancelMorph: () => audioEngine.cancelMorph(),
    panicFx: () => audioEngine.panicFx(),
    
    // Safe Mode
    setSafeMode: (enabled) => audioEngine.setSafeMode(enabled),
    toggleSafeMode: () => audioEngine.toggleSafeMode(),
    
    // Recording
    startRecording: () => audioEngine.startRecording(),
    stopRecording: () => audioEngine.stopRecording(),
    toggleRecording: () => audioEngine.toggleRecording(),
    downloadRecording: () => audioEngine.downloadRecording(),
    clearRecording: () => audioEngine.clearRecording(),
    
    // User presets
    userPresets,
    saveUserPreset,
    deleteUserPreset,
    
    // Audio setup
    setAudioElementA: (el) => audioEngine.setAudioElementA(el),
    setAudioElementB: (el) => audioEngine.setAudioElementB(el),
    ensureAudioContext: () => audioEngine.ensureAudioContext(),
    buildDeckAGraph: () => audioEngine.buildDeckAGraph(),
    buildDeckBGraph: () => audioEngine.buildDeckBGraph(),
  };

  return (
    <AudioEngineContext.Provider value={value}>
      {children}
    </AudioEngineContext.Provider>
  );
}

export function useAudioEngine() {
  const context = useContext(AudioEngineContext);
  if (!context) {
    throw new Error('useAudioEngine must be used within AudioEngineProvider');
  }
  return context;
}
