import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { audioEngine, AudioEngineState, UserPreset, USER_PRESETS_KEY } from '../audio/AudioEngine';

interface AudioEngineContextType {
  state: AudioEngineState;
  
  // Track loading
  loadFile: (file: File) => Promise<void>;
  loadUrl: (url: string) => void;
  
  // Playback
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => Promise<void>;
  seek: (time: number) => void;
  skipBackward: (seconds?: number) => void;
  skipForward: (seconds?: number) => void;
  setVolume: (vol: number) => void;
  
  // EQ
  setBandGain: (index: number, value: number) => void;
  setAllGains: (gains: number[]) => void;
  setEqBypass: (bypass: boolean) => void;
  switchSlot: (slot: 'A' | 'B') => void;
  
  // DJ
  setPlaybackRate: (rate: number) => void;
  setDjFilterValue: (value: number) => void;
  setEchoMix: (mix: number) => void;
  setEchoTime: (time: number) => void;
  setEchoFeedback: (feedback: number) => void;
  setDjBypass: (bypass: boolean) => void;
  setHotCue: (index: number) => void;
  triggerHotCue: (index: number) => void;
  clearHotCue: (index: number) => void;
  setLoopIn: () => void;
  setLoopOut: () => void;
  toggleLoop: () => void;
  clearLoop: () => void;
  
  // User presets
  userPresets: UserPreset[];
  saveUserPreset: (name: string) => void;
  deleteUserPreset: (name: string) => void;
  
  // Audio element ref setter
  setAudioElement: (el: HTMLAudioElement) => void;
  ensureAudioContext: () => Promise<AudioContext>;
  buildAudioGraph: () => void;
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
    
    // Track loading
    loadFile: (file) => audioEngine.loadFile(file),
    loadUrl: (url) => audioEngine.loadUrl(url),
    
    // Playback
    play: () => audioEngine.play(),
    pause: () => audioEngine.pause(),
    togglePlay: () => audioEngine.togglePlay(),
    seek: (time) => audioEngine.seek(time),
    skipBackward: (seconds) => audioEngine.skipBackward(seconds),
    skipForward: (seconds) => audioEngine.skipForward(seconds),
    setVolume: (vol) => audioEngine.setVolume(vol),
    
    // EQ
    setBandGain: (index, value) => audioEngine.setBandGain(index, value),
    setAllGains: (gains) => audioEngine.setAllGains(gains),
    setEqBypass: (bypass) => audioEngine.setEqBypass(bypass),
    switchSlot: (slot) => audioEngine.switchSlot(slot),
    
    // DJ
    setPlaybackRate: (rate) => audioEngine.setPlaybackRate(rate),
    setDjFilterValue: (value) => audioEngine.setDjFilterValue(value),
    setEchoMix: (mix) => audioEngine.setEchoMix(mix),
    setEchoTime: (time) => audioEngine.setEchoTime(time),
    setEchoFeedback: (feedback) => audioEngine.setEchoFeedback(feedback),
    setDjBypass: (bypass) => audioEngine.setDjBypass(bypass),
    setHotCue: (index) => audioEngine.setHotCue(index),
    triggerHotCue: (index) => audioEngine.triggerHotCue(index),
    clearHotCue: (index) => audioEngine.clearHotCue(index),
    setLoopIn: () => audioEngine.setLoopIn(),
    setLoopOut: () => audioEngine.setLoopOut(),
    toggleLoop: () => audioEngine.toggleLoop(),
    clearLoop: () => audioEngine.clearLoop(),
    
    // User presets
    userPresets,
    saveUserPreset,
    deleteUserPreset,
    
    // Audio setup
    setAudioElement: (el) => audioEngine.setAudioElement(el),
    ensureAudioContext: () => audioEngine.ensureAudioContext(),
    buildAudioGraph: () => audioEngine.buildAudioGraph(),
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
