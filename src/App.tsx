import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AudioEngineProvider, useAudioEngine } from './context/AudioEngineContext';
import { WelcomeSplash } from './components/WelcomeSplash';
import { MiniPlayer } from './components/MiniPlayer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { EQPage } from './pages/EQPage';
import { DJPage } from './pages/DJPage';
import './App.css';

function AppContent() {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('solidsSplashSeen');
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  const { 
    setAudioElement, 
    state, 
    togglePlay,
    skipBackward,
    skipForward,
    setHotCue,
    triggerHotCue,
    setEqBypass,
    toggleSafeMode,
    toggleRecording,
  } = useAudioEngine();
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [setAudioElement]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input or modal is open
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' || 
      target.isContentEditable ||
      showShortcuts
    ) {
      return;
    }

    const key = e.key.toLowerCase();

    switch (key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'arrowleft':
        e.preventDefault();
        skipBackward(5);
        break;
      case 'arrowright':
        e.preventDefault();
        skipForward(5);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
        e.preventDefault();
        const index = parseInt(key) - 1;
        if (e.shiftKey) {
          setHotCue(index);
        } else {
          triggerHotCue(index);
        }
        break;
      case 'b':
        e.preventDefault();
        setEqBypass(!state.isBypassed);
        break;
      case 's':
        e.preventDefault();
        toggleSafeMode();
        break;
      case 'r':
        e.preventDefault();
        toggleRecording();
        break;
      case 'e':
        e.preventDefault();
        navigate('/eq');
        break;
      case 'd':
        e.preventDefault();
        navigate('/dj');
        break;
      case '?':
        e.preventDefault();
        setShowShortcuts(true);
        break;
      case 'escape':
        if (showShortcuts) {
          setShowShortcuts(false);
        }
        break;
    }
  }, [
    showShortcuts, 
    togglePlay, 
    skipBackward, 
    skipForward, 
    setHotCue, 
    triggerHotCue, 
    setEqBypass, 
    state.isBypassed,
    toggleSafeMode, 
    toggleRecording, 
    navigate
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
        <AppContent />
      </AudioEngineProvider>
    </BrowserRouter>
  );
}

export default App;
