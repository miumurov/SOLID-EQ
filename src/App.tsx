import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AudioEngineProvider, useAudioEngine } from './context/AudioEngineContext';
import { ToastProvider, useToast } from './components/Toast';
import { WelcomeSplash } from './components/WelcomeSplash';
import { MiniPlayer } from './components/MiniPlayer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { EQPage } from './pages/EQPage';
import { DJPage } from './pages/DJPage';
import './App.css';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('solidsSplashSeen');
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  const { 
    setAudioElementA,
    setAudioElementB,
    state, 
    togglePlayActive,
    seekActive,
    skipBackwardActive,
    skipForwardActive,
    toggleActiveDeck,
    setHotCueActive,
    triggerHotCueActive,
    getHotCueActive,
    setEqBypass,
    setDjBypassA,
    setDjBypassB,
    setDjFilterValueA,
    setDjFilterValueB,
    toggleSafeMode,
    toggleRecording,
    loadDjSceneA,
    loadDjSceneB,
    storeDjSceneA,
    storeDjSceneB,
    morphToScene,
    cancelMorph,
    panicFx,
    setLoopInActive,
    setLoopOutActive,
    toggleLoopActive,
    clearLoopActive,
    moveLoopWindowActive,
    setCrossfader,
    nudgeCrossfader,
    setPlaybackRateA,
    setPlaybackRateB,
  } = useAudioEngine();
  
  const { showToast } = useToast();
  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (audioRefA.current) {
      setAudioElementA(audioRefA.current);
    }
    if (audioRefB.current) {
      setAudioElementB(audioRefB.current);
    }
  }, [setAudioElementA, setAudioElementB]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return;
    }
    
    if (showShortcuts && e.code !== 'Escape') {
      return;
    }

    if (e.metaKey && !e.ctrlKey && !e.altKey) {
      return;
    }

    const code = e.code;
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    
    const activeDeck = state.activeDeck;
    const deckState = activeDeck === 'A' ? state.deckA : state.deckB;

    // Navigation with Ctrl+Alt
    if (ctrl && alt) {
      if (code === 'Digit1') {
        e.preventDefault();
        navigate('/eq');
        showToast('EQ Page');
        return;
      }
      if (code === 'Digit2') {
        e.preventDefault();
        navigate('/dj');
        showToast('DJ Page');
        return;
      }
    }

    switch (code) {
      // Toggle active deck
      case 'Tab':
        e.preventDefault();
        toggleActiveDeck();
        showToast(`Active: Deck ${state.activeDeck === 'A' ? 'B' : 'A'}`);
        break;

      // Transport
      case 'Space':
        e.preventDefault();
        togglePlayActive();
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (shift) {
          seekActive(deckState.currentTime - 0.2);
        } else {
          skipBackwardActive(5);
        }
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (shift) {
          seekActive(deckState.currentTime + 0.2);
        } else {
          skipForwardActive(5);
        }
        break;
        
      case 'KeyK':
        e.preventDefault();
        togglePlayActive();
        break;
        
      case 'KeyJ':
        e.preventDefault();
        skipBackwardActive(5);
        break;
        
      case 'KeyL':
        if (!ctrl) {
          e.preventDefault();
          skipForwardActive(5);
        }
        break;

      // Hot cues
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        if (ctrl && alt) break;
        e.preventDefault();
        const cueIndex = parseInt(code.replace('Digit', '')) - 1;
        if (shift) {
          setHotCueActive(cueIndex);
          showToast(`Deck ${activeDeck} Cue ${cueIndex + 1} set at ${formatTime(deckState.currentTime)}`, 'success');
        } else {
          const cue = getHotCueActive(cueIndex);
          if (cue) {
            triggerHotCueActive(cueIndex);
            showToast(`Deck ${activeDeck} Cue ${cueIndex + 1} → ${formatTime(cue.time)}`);
          } else {
            showToast(`Deck ${activeDeck} Cue ${cueIndex + 1} not set`, 'warning');
          }
        }
        break;

      // Tempo
      case 'Equal':
      case 'NumpadAdd':
        e.preventDefault();
        const currentRate = deckState.playbackRate;
        const newRateUp = Math.min(1.5, currentRate + 0.01);
        if (activeDeck === 'A') setPlaybackRateA(newRateUp);
        else setPlaybackRateB(newRateUp);
        showToast(`Deck ${activeDeck} Tempo ${Math.round(newRateUp * 100)}%`);
        break;
        
      case 'Minus':
      case 'NumpadSubtract':
        e.preventDefault();
        const curRate = deckState.playbackRate;
        const newRateDown = Math.max(0.5, curRate - 0.01);
        if (activeDeck === 'A') setPlaybackRateA(newRateDown);
        else setPlaybackRateB(newRateDown);
        showToast(`Deck ${activeDeck} Tempo ${Math.round(newRateDown * 100)}%`);
        break;
        
      case 'Digit0':
        if (!ctrl && !alt) {
          e.preventDefault();
          if (activeDeck === 'A') setPlaybackRateA(1.0);
          else setPlaybackRateB(1.0);
          showToast(`Deck ${activeDeck} Tempo reset to 100%`);
        }
        break;

      // FX
      case 'KeyF':
        e.preventDefault();
        if (activeDeck === 'A') {
          setDjBypassA(!state.deckA.djBypass);
          showToast(`Deck A FX ${state.deckA.djBypass ? 'Active' : 'Bypass'}`);
        } else {
          setDjBypassB(!state.deckB.djBypass);
          showToast(`Deck B FX ${state.deckB.djBypass ? 'Active' : 'Bypass'}`);
        }
        break;
        
      case 'KeyX':
        e.preventDefault();
        panicFx();
        showToast('FX Panic - All Reset', 'warning');
        break;
        
      case 'KeyQ':
        e.preventDefault();
        const qStep = shift ? -2 : -10;
        const currentFilterQ = deckState.djFilterValue;
        const newFilterQ = Math.max(-100, currentFilterQ + qStep);
        if (activeDeck === 'A') setDjFilterValueA(newFilterQ);
        else setDjFilterValueB(newFilterQ);
        break;
        
      case 'KeyE':
        e.preventDefault();
        const eStep = shift ? 2 : 10;
        const currentFilterE = deckState.djFilterValue;
        const newFilterE = Math.min(100, currentFilterE + eStep);
        if (activeDeck === 'A') setDjFilterValueA(newFilterE);
        else setDjFilterValueB(newFilterE);
        break;

      // Crossfader
      case 'KeyZ':
        e.preventDefault();
        nudgeCrossfader(-0.05);
        showToast(`Crossfader → A`);
        break;
        
      case 'Slash':
        if (!shift) {
          e.preventDefault();
          nudgeCrossfader(0.05);
          showToast(`Crossfader → B`);
        } else {
          e.preventDefault();
          setShowShortcuts(true);
        }
        break;

      // Scenes
      case 'KeyA':
        e.preventDefault();
        if (shift) {
          storeDjSceneA();
          showToast('Scene A stored', 'success');
        } else {
          loadDjSceneA();
          showToast('Scene A loaded');
        }
        break;
        
      case 'KeyD':
        e.preventDefault();
        if (shift) {
          storeDjSceneB();
          showToast('Scene B stored', 'success');
        } else {
          loadDjSceneB();
          showToast('Scene B loaded');
        }
        break;
        
      case 'KeyM':
        e.preventDefault();
        if (state.isMorphing) {
          cancelMorph();
          showToast('Morph cancelled');
        } else {
          const targetScene = state.activeDjScene === 'A' ? 'B' : 'A';
          morphToScene(targetScene);
          showToast(`Morphing to Scene ${targetScene}...`);
        }
        break;

      // Loop
      case 'KeyI':
        e.preventDefault();
        setLoopInActive();
        showToast(`Deck ${activeDeck} Loop IN: ${formatTime(deckState.currentTime)}`, 'info');
        break;
        
      case 'KeyO':
        e.preventDefault();
        setLoopOutActive();
        showToast(`Deck ${activeDeck} Loop OUT: ${formatTime(deckState.currentTime)}`, 'info');
        break;
        
      case 'KeyP':
        e.preventDefault();
        if (deckState.loopIn !== null && deckState.loopOut !== null) {
          toggleLoopActive();
          showToast(`Deck ${activeDeck} Loop ${deckState.loopEnabled ? 'OFF' : 'ON'}`);
        } else {
          showToast('Set IN and OUT first', 'warning');
        }
        break;
        
      case 'BracketLeft':
        e.preventDefault();
        if (deckState.loopEnabled) {
          moveLoopWindowActive(-0.5);
        }
        break;
        
      case 'BracketRight':
        e.preventDefault();
        if (deckState.loopEnabled) {
          moveLoopWindowActive(0.5);
        }
        break;
        
      case 'Backspace':
        e.preventDefault();
        clearLoopActive();
        showToast(`Deck ${activeDeck} Loop cleared`);
        break;

      // Recording
      case 'KeyR':
        e.preventDefault();
        toggleRecording();
        showToast(state.isRecording ? 'Recording stopped' : 'Recording started', state.isRecording ? 'info' : 'success');
        break;

      // Safe Mode
      case 'KeyS':
        e.preventDefault();
        toggleSafeMode();
        showToast(state.safeModeEnabled ? 'Safe Mode OFF' : 'Safe Mode ON');
        break;

      // EQ Bypass
      case 'KeyB':
        e.preventDefault();
        setEqBypass(!state.isBypassed);
        showToast(state.isBypassed ? 'EQ Active' : 'EQ Bypass ON');
        break;

      case 'Escape':
        if (showShortcuts) {
          setShowShortcuts(false);
        }
        break;
    }
  }, [
    showShortcuts, 
    state,
    togglePlayActive, 
    seekActive,
    skipBackwardActive, 
    skipForwardActive,
    toggleActiveDeck,
    setHotCueActive, 
    triggerHotCueActive,
    getHotCueActive,
    setEqBypass,
    setDjBypassA,
    setDjBypassB,
    setDjFilterValueA,
    setDjFilterValueB,
    toggleSafeMode, 
    toggleRecording,
    loadDjSceneA,
    loadDjSceneB,
    storeDjSceneA,
    storeDjSceneB,
    morphToScene,
    cancelMorph,
    panicFx,
    setLoopInActive,
    setLoopOutActive,
    toggleLoopActive,
    clearLoopActive,
    moveLoopWindowActive,
    setCrossfader,
    nudgeCrossfader,
    setPlaybackRateA,
    setPlaybackRateB,
    navigate,
    showToast,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (showSplash) {
    return <WelcomeSplash onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div className="app">
      {/* Shared audio elements */}
      <audio
        ref={audioRefA}
        src={state.deckA.audioSrc || undefined}
        crossOrigin="anonymous"
        preload="metadata"
      />
      <audio
        ref={audioRefB}
        src={state.deckB.audioSrc || undefined}
        crossOrigin="anonymous"
        preload="metadata"
      />

      {/* Mini Player */}
      <MiniPlayer onShowShortcuts={() => setShowShortcuts(true)} />

      {/* Main Layout */}
      <div className="app-layout">
        <nav className="app-nav">
          <NavLink 
            to="/eq" 
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            EQ
          </NavLink>
          <NavLink 
            to="/dj" 
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            DJ
          </NavLink>
        </nav>

        <main className="app-main">
          <Routes>
            <Route path="/eq" element={<EQPage />} />
            <Route path="/dj" element={<DJPage />} />
            <Route path="*" element={<Navigate to="/eq" replace />} />
          </Routes>
        </main>
      </div>

      <ShortcutsModal 
        isOpen={showShortcuts} 
        onClose={() => setShowShortcuts(false)} 
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AudioEngineProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AudioEngineProvider>
    </BrowserRouter>
  );
}

export default App;
