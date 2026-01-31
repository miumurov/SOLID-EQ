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
    setAudioElement, 
    state, 
    togglePlay,
    seek,
    skipBackward,
    skipForward,
    setPlaybackRate,
    setHotCue,
    triggerHotCue,
    setEqBypass,
    setDjBypass,
    setDjFilterValue,
    toggleSafeMode,
    toggleRecording,
    loadDjSceneA,
    loadDjSceneB,
    storeDjSceneA,
    storeDjSceneB,
    morphToScene,
    cancelMorph,
    panicFx,
    setLoopIn,
    setLoopOut,
    toggleLoop,
    clearLoop,
    moveLoopWindow,
  } = useAudioEngine();
  
  const { showToast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [setAudioElement]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return;
    }
    
    // Ignore when modal is open (except Escape)
    if (showShortcuts && e.code !== 'Escape') {
      return;
    }

    // Ignore Cmd/Meta combos (browser shortcuts)
    if (e.metaKey && !e.ctrlKey && !e.altKey) {
      return;
    }

    const code = e.code;
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;

    // Handle navigation with Ctrl+Alt
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
      // Transport
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (shift) {
          // Fine nudge -0.2s
          seek(state.currentTime - 0.2);
          showToast('Nudge -0.2s');
        } else {
          skipBackward(5);
        }
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (shift) {
          // Fine nudge +0.2s
          seek(state.currentTime + 0.2);
          showToast('Nudge +0.2s');
        } else {
          skipForward(5);
        }
        break;
        
      // J/K/L transport
      case 'KeyK':
        e.preventDefault();
        togglePlay();
        break;
        
      case 'KeyJ':
        e.preventDefault();
        skipBackward(5);
        break;
        
      case 'KeyL':
        if (!ctrl) {
          e.preventDefault();
          skipForward(5);
        }
        break;

      // Hot cues 1-4 using event.code
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        // Skip if Ctrl+Alt (navigation)
        if (ctrl && alt) break;
        
        e.preventDefault();
        const cueIndex = parseInt(code.replace('Digit', '')) - 1;
        if (shift) {
          setHotCue(cueIndex);
          showToast(`Cue ${cueIndex + 1} set at ${formatTime(state.currentTime)}`, 'success');
        } else {
          const cue = state.hotCues[cueIndex];
          if (cue) {
            triggerHotCue(cueIndex);
            showToast(`Cue ${cueIndex + 1} → ${formatTime(cue.time)}`);
          } else {
            showToast(`Cue ${cueIndex + 1} not set`, 'warning');
          }
        }
        break;

      // Tempo / Rate
      case 'Equal':
      case 'NumpadAdd':
        e.preventDefault();
        const newRateUp = Math.min(1.5, state.playbackRate + 0.01);
        setPlaybackRate(newRateUp);
        showToast(`Tempo ${Math.round(newRateUp * 100)}%`);
        break;
        
      case 'Minus':
      case 'NumpadSubtract':
        e.preventDefault();
        const newRateDown = Math.max(0.5, state.playbackRate - 0.01);
        setPlaybackRate(newRateDown);
        showToast(`Tempo ${Math.round(newRateDown * 100)}%`);
        break;
        
      case 'Digit0':
        if (!ctrl && !alt) {
          e.preventDefault();
          setPlaybackRate(1.0);
          showToast('Tempo reset to 100%');
        }
        break;

      // FX / Macros
      case 'KeyF':
        e.preventDefault();
        setDjBypass(!state.djBypass);
        showToast(state.djBypass ? 'FX Active' : 'FX Bypass ON', 'info');
        break;
        
      case 'KeyX':
        e.preventDefault();
        panicFx();
        showToast('FX Panic - All FX Reset', 'warning');
        break;
        
      case 'KeyQ':
        e.preventDefault();
        const qStep = shift ? -2 : -10;
        const newFilterQ = Math.max(-100, state.djFilterValue + qStep);
        setDjFilterValue(newFilterQ);
        break;
        
      case 'KeyE':
        e.preventDefault();
        const eStep = shift ? 2 : 10;
        const newFilterE = Math.min(100, state.djFilterValue + eStep);
        setDjFilterValue(newFilterE);
        break;

      // Scenes & Morph
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
          // Morph to the other scene
          const targetScene = state.activeDjScene === 'A' ? 'B' : 'A';
          morphToScene(targetScene);
          showToast(`Morphing to Scene ${targetScene}...`);
        }
        break;

      // Looping
      case 'KeyI':
        e.preventDefault();
        setLoopIn();
        showToast(`Loop IN: ${formatTime(state.currentTime)}`, 'info');
        break;
        
      case 'KeyO':
        e.preventDefault();
        setLoopOut();
        showToast(`Loop OUT: ${formatTime(state.currentTime)}`, 'info');
        break;
        
      case 'KeyP':
        e.preventDefault();
        if (state.loopIn !== null && state.loopOut !== null) {
          toggleLoop();
          showToast(state.loopEnabled ? 'Loop OFF' : 'Loop ON');
        } else {
          showToast('Set IN and OUT first', 'warning');
        }
        break;
        
      case 'BracketLeft':
        e.preventDefault();
        if (state.loopEnabled) {
          moveLoopWindow(-0.5);
          showToast('Loop ← 0.5s');
        }
        break;
        
      case 'BracketRight':
        e.preventDefault();
        if (state.loopEnabled) {
          moveLoopWindow(0.5);
          showToast('Loop → 0.5s');
        }
        break;
        
      case 'Backspace':
        e.preventDefault();
        clearLoop();
        showToast('Loop cleared');
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

      // Help
      case 'Slash':
        if (shift) {
          e.preventDefault();
          setShowShortcuts(true);
        }
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
    togglePlay, 
    seek,
    skipBackward, 
    skipForward,
    setPlaybackRate,
    setHotCue, 
    triggerHotCue, 
    setEqBypass,
    setDjBypass,
    setDjFilterValue,
    toggleSafeMode, 
    toggleRecording,
    loadDjSceneA,
    loadDjSceneB,
    storeDjSceneA,
    storeDjSceneB,
    morphToScene,
    cancelMorph,
    panicFx,
    setLoopIn,
    setLoopOut,
    toggleLoop,
    clearLoop,
    moveLoopWindow,
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
      {/* Shared audio element */}
      <audio
        ref={audioRef}
        src={state.audioSrc || undefined}
        crossOrigin="anonymous"
        preload="metadata"
      />

      {/* Mini Player (sticky top) */}
      <MiniPlayer onShowShortcuts={() => setShowShortcuts(true)} />

      {/* Main Layout */}
      <div className="app-layout">
        {/* Navigation */}
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

        {/* Main content */}
        <main className="app-main">
          <Routes>
            <Route path="/eq" element={<EQPage />} />
            <Route path="/dj" element={<DJPage />} />
            <Route path="*" element={<Navigate to="/eq" replace />} />
          </Routes>
        </main>
      </div>

      {/* Shortcuts Modal */}
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
