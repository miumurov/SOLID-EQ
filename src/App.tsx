import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AudioEngineProvider, useAudioEngine } from './context/AudioEngineContext';
import { WelcomeSplash } from './components/WelcomeSplash';
import { EQPage } from './pages/EQPage';
import { DJPage } from './pages/DJPage';
import './App.css';

function AppContent() {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('solidsSplashSeen');
  });
  
  const { setAudioElement, state } = useAudioEngine();
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [setAudioElement]);

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

      {/* Header with navigation */}
      <header className="app-header">
        <h1 className="app-title">SOLIDS</h1>
        
        <nav className="nav-tabs">
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

        {/* Debug info */}
        <div className="debug-info">
          <span className={`debug-badge ${state.audioCtxState === 'running' ? 'running' : ''}`}>
            {state.audioCtxState}
          </span>
          {state.webAudioConnected && (
            <span className="debug-badge connected">connected</span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        <Routes>
          <Route path="/eq" element={<EQPage />} />
          <Route path="/dj" element={<DJPage />} />
          <Route path="*" element={<Navigate to="/eq" replace />} />
        </Routes>
      </main>
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
