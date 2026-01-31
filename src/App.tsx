import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AudioEngineProvider, useAudioEngine } from './audio/AudioEngine';
import { ToastProvider, useToast } from './components/Toast';
import MiniPlayer from './components/MiniPlayer';
import EQPage from './pages/EQPage';
import DJPage from './pages/DJPage';
import StemsPage from './pages/StemsPage';

// ─────────────────────────────────────────────────────────────────────────────
// Welcome Splash
// ─────────────────────────────────────────────────────────────────────────────
function WelcomeSplash({ onContinue }: { onContinue: () => void }) {
  const [showSolids, setShowSolids] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSolids(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="splash-overlay">
      <div className="splash-content">
        <div className="splash-text">WELCOME TO</div>
        <div className={`splash-brand ${showSolids ? 'visible' : ''}`}>SOLIDS</div>
        <button className="splash-continue" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard handler
// ─────────────────────────────────────────────────────────────────────────────
function KeyboardHandler() {
  const engine = useAudioEngine();
  const { showToast } = useToast();
  const location = useLocation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore meta/ctrl combos except our explicit ones
      if (e.metaKey || (e.ctrlKey && !e.altKey)) return;

      const code = e.code;
      const isDJ = location.pathname === '/dj';
      const isStems = location.pathname === '/stems';
      const activeDeck = engine.activeDeck;

      // Get deck-specific functions
      const togglePlay = activeDeck === 'A' ? engine.togglePlayA : engine.togglePlayB;
      const seek = activeDeck === 'A' ? engine.seekA : engine.seekB;
      const currentTime = activeDeck === 'A' ? engine.deckA.currentTime : engine.deckB.currentTime;
      const duration = activeDeck === 'A' ? engine.deckA.duration : engine.deckB.duration;
      const setHotCue = activeDeck === 'A' ? engine.setHotCueA : engine.setHotCueB;
      const triggerHotCue = activeDeck === 'A' ? engine.triggerHotCueA : engine.triggerHotCueB;
      const clearLoop = activeDeck === 'A' ? engine.clearLoopA : engine.clearLoopB;

      switch (code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            seek(Math.max(0, currentTime - 0.2));
          } else {
            seek(Math.max(0, currentTime - 5));
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            seek(Math.min(duration, currentTime + 0.2));
          } else {
            seek(Math.min(duration, currentTime + 5));
          }
          break;

        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4': {
          e.preventDefault();
          const cueIndex = parseInt(code.slice(-1)) - 1;
          if (e.shiftKey) {
            setHotCue(cueIndex, currentTime);
            showToast(`Cue ${cueIndex + 1} set (Deck ${activeDeck})`);
          } else {
            const triggered = triggerHotCue(cueIndex);
            if (!triggered) {
              showToast(`Cue ${cueIndex + 1} not set`);
            }
          }
          break;
        }

        case 'KeyB':
          e.preventDefault();
          engine.setEqBypass(!engine.eqBypass);
          showToast(engine.eqBypass ? 'EQ enabled' : 'EQ bypassed');
          break;

        case 'KeyF':
          if (isDJ) {
            e.preventDefault();
            engine.setFxBypass(!engine.fxBypass);
            showToast(engine.fxBypass ? 'FX enabled' : 'FX bypassed');
          }
          break;

        case 'KeyS':
          e.preventDefault();
          engine.setSafeMode(!engine.safeMode);
          showToast(engine.safeMode ? 'Safe Mode OFF' : 'Safe Mode ON');
          break;

        case 'KeyR':
          e.preventDefault();
          if (engine.isRecording) {
            engine.stopRecording();
            showToast('Recording stopped');
          } else {
            engine.startRecording();
            showToast('Recording started');
          }
          break;

        case 'Tab':
          if (isDJ) {
            e.preventDefault();
            const newDeck = activeDeck === 'A' ? 'B' : 'A';
            engine.setActiveDeck(newDeck);
            showToast(`Active deck: ${newDeck}`);
          }
          break;

        case 'Backspace':
          e.preventDefault();
          if (e.shiftKey) {
            engine.clearLoopA();
            engine.clearLoopB();
            showToast('All loops cleared');
          } else {
            clearLoop();
            showToast(`Loop cleared (Deck ${activeDeck})`);
          }
          break;

        case 'KeyI':
          if (isDJ) {
            e.preventDefault();
            const setLoopIn = activeDeck === 'A' ? engine.setLoopInA : engine.setLoopInB;
            setLoopIn(currentTime);
            showToast(`Loop IN set (Deck ${activeDeck})`);
          }
          break;

        case 'KeyO':
          if (isDJ) {
            e.preventDefault();
            const setLoopOut = activeDeck === 'A' ? engine.setLoopOutA : engine.setLoopOutB;
            setLoopOut(currentTime);
            showToast(`Loop OUT set (Deck ${activeDeck})`);
          }
          break;

        case 'KeyP':
          if (isDJ) {
            e.preventDefault();
            const toggleLoop = activeDeck === 'A' ? engine.toggleLoopA : engine.toggleLoopB;
            toggleLoop();
          }
          break;

        case 'KeyM':
          if (isDJ) {
            e.preventDefault();
            engine.morphDjScenes();
            showToast(engine.isMorphing ? 'Morph stopped' : 'Morphing...');
          }
          break;

        case 'KeyA':
          if (isDJ && e.shiftKey) {
            e.preventDefault();
            engine.storeDjScene('A');
            showToast('Stored to Scene A');
          } else if (isDJ) {
            e.preventDefault();
            engine.setActiveDjScene('A');
            engine.applyDjPreset(engine.djSceneA);
            showToast('Recalled Scene A');
          }
          break;

        case 'KeyD':
          if (isDJ && e.shiftKey) {
            e.preventDefault();
            engine.storeDjScene('B');
            showToast('Stored to Scene B');
          } else if (isDJ) {
            e.preventDefault();
            engine.setActiveDjScene('B');
            engine.applyDjPreset(engine.djSceneB);
            showToast('Recalled Scene B');
          }
          break;

        case 'KeyX':
          if (isDJ) {
            e.preventDefault();
            engine.setFilterMacro(0);
            engine.setEchoMix(0);
            showToast('FX killed');
          }
          break;

        case 'KeyQ':
          if (isDJ) {
            e.preventDefault();
            const step = e.shiftKey ? -2 : -10;
            engine.setFilterMacro(engine.filterMacro + step);
          }
          break;

        case 'KeyE':
          if (isDJ) {
            e.preventDefault();
            const step = e.shiftKey ? 2 : 10;
            engine.setFilterMacro(engine.filterMacro + step);
          }
          break;

        case 'Equal':
          if (isDJ) {
            e.preventDefault();
            const newRate = Math.min(1.5, engine.deckA.playbackRate + 0.01);
            engine.setPlaybackRateA(newRate);
          }
          break;

        case 'Minus':
          if (isDJ) {
            e.preventDefault();
            const newRate = Math.max(0.5, engine.deckA.playbackRate - 0.01);
            engine.setPlaybackRateA(newRate);
          }
          break;

        case 'Digit0':
          if (isDJ) {
            e.preventDefault();
            engine.setPlaybackRateA(1);
            showToast('Tempo reset');
          }
          break;

        case 'KeyV':
          if (isStems) {
            e.preventDefault();
            // Toggle vocals - would need stems integration
            showToast('Vocals toggle (demo)');
          }
          break;

        case 'Escape':
          showToast('Escape pressed');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine, showToast, location.pathname]);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Help Modal
// ─────────────────────────────────────────────────────────────────────────────
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        <div className="shortcuts-list">
          <div className="shortcut-group">
            <h4>Transport</h4>
            <p><kbd>Space</kbd> Play/Pause</p>
            <p><kbd>←</kbd> / <kbd>→</kbd> Seek ±5s</p>
            <p><kbd>Shift+←</kbd> / <kbd>Shift+→</kbd> Nudge ±0.2s</p>
          </div>
          <div className="shortcut-group">
            <h4>Hot Cues</h4>
            <p><kbd>1-4</kbd> Trigger cue</p>
            <p><kbd>Shift+1-4</kbd> Set cue</p>
          </div>
          <div className="shortcut-group">
            <h4>Loops (DJ)</h4>
            <p><kbd>I</kbd> Set loop IN</p>
            <p><kbd>O</kbd> Set loop OUT</p>
            <p><kbd>P</kbd> Toggle loop</p>
            <p><kbd>Backspace</kbd> Clear loop</p>
          </div>
          <div className="shortcut-group">
            <h4>Effects</h4>
            <p><kbd>B</kbd> EQ bypass</p>
            <p><kbd>F</kbd> FX bypass (DJ)</p>
            <p><kbd>S</kbd> Safe Mode</p>
            <p><kbd>R</kbd> Record</p>
            <p><kbd>Q/E</kbd> Filter macro</p>
            <p><kbd>X</kbd> Kill FX</p>
          </div>
          <div className="shortcut-group">
            <h4>DJ Scenes</h4>
            <p><kbd>A/D</kbd> Recall scene</p>
            <p><kbd>Shift+A/D</kbd> Store scene</p>
            <p><kbd>M</kbd> Morph</p>
            <p><kbd>Tab</kbd> Switch deck</p>
          </div>
        </div>
        <button className="btn-glass" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App Layout
// ─────────────────────────────────────────────────────────────────────────────
function AppLayout() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="app-layout">
      <MiniPlayer />

      <nav className="main-nav">
        <NavLink to="/eq" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          EQ
        </NavLink>
        <NavLink to="/dj" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          DJ
        </NavLink>
        <NavLink to="/stems" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          STEMS
        </NavLink>
        <button className="help-button" onClick={() => setShowHelp(true)} title="Keyboard shortcuts">
          ?
        </button>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/eq" element={<EQPage />} />
          <Route path="/dj" element={<DJPage />} />
          <Route path="/stems" element={<StemsPage />} />
          <Route path="*" element={<Navigate to="/eq" replace />} />
        </Routes>
      </main>

      <KeyboardHandler />

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('solids_splash_seen');
  });

  const handleContinue = useCallback(() => {
    sessionStorage.setItem('solids_splash_seen', '1');
    setShowSplash(false);
  }, []);

  return (
    <ToastProvider>
      <AudioEngineProvider>
        {showSplash ? (
          <WelcomeSplash onContinue={handleContinue} />
        ) : (
          <AppLayout />
        )}
      </AudioEngineProvider>
    </ToastProvider>
  );
}
