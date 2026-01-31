import { useState, useEffect, useCallback } from 'react';
import { useAudioEngine } from '../audio/AudioEngine';
import TrackLoader from '../components/TrackLoader';
import { useToast } from '../components/Toast';

interface StemState {
  gain: number;
  muted: boolean;
  soloed: boolean;
}

const STEM_NAMES = ['Vocals', 'Drums', 'Bass', 'Other'] as const;

export default function StemsPage() {
  const { deckA, loadFileA, togglePlayA } = useAudioEngine();
  const { showToast } = useToast();

  const [isSeparating, setIsSeparating] = useState(false);
  const [separationProgress, setSeparationProgress] = useState('');
  const [hasSeparated, setHasSeparated] = useState(false);

  const [stems, setStems] = useState<Record<string, StemState>>({
    Vocals: { gain: 1, muted: false, soloed: false },
    Drums: { gain: 1, muted: false, soloed: false },
    Bass: { gain: 1, muted: false, soloed: false },
    Other: { gain: 1, muted: false, soloed: false },
  });

  // Warn before unload during separation
  useEffect(() => {
    if (!isSeparating) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSeparating]);

  const handleSeparate = useCallback(async () => {
    if (!deckA.sourceBuffer) {
      showToast('Load a local file first');
      return;
    }

    setIsSeparating(true);
    setSeparationProgress('Initializing...');

    try {
      // Note: demucs-web integration would go here
      // For now, simulate the process
      setSeparationProgress('Loading model...');
      await new Promise((r) => setTimeout(r, 1000));

      setSeparationProgress('Separating stems... This may take a while.');
      await new Promise((r) => setTimeout(r, 2000));

      // Simulated completion
      setHasSeparated(true);
      setSeparationProgress('');
      showToast('Stem separation complete (demo mode)');
    } catch (err) {
      console.error('Separation failed:', err);
      showToast('Separation failed');
      setSeparationProgress('');
    } finally {
      setIsSeparating(false);
    }
  }, [deckA.sourceBuffer, showToast]);

  const handleCancel = useCallback(() => {
    setIsSeparating(false);
    setSeparationProgress('Cancelled');
    showToast('Separation cancelled');
  }, [showToast]);

  const updateStem = useCallback((name: string, updates: Partial<StemState>) => {
    setStems((prev) => ({
      ...prev,
      [name]: { ...prev[name], ...updates },
    }));
  }, []);

  const handleSolo = useCallback((name: string) => {
    setStems((prev) => {
      const wasSoloed = prev[name].soloed;
      const newStems = { ...prev };

      // Toggle solo for this stem
      newStems[name] = { ...prev[name], soloed: !wasSoloed };

      // If turning solo on, turn off other solos
      if (!wasSoloed) {
        Object.keys(newStems).forEach((key) => {
          if (key !== name) {
            newStems[key] = { ...newStems[key], soloed: false };
          }
        });
      }

      return newStems;
    });
  }, []);

  const handleAcapella = useCallback(() => {
    setStems({
      Vocals: { gain: 1, muted: false, soloed: true },
      Drums: { gain: 1, muted: true, soloed: false },
      Bass: { gain: 1, muted: true, soloed: false },
      Other: { gain: 1, muted: true, soloed: false },
    });
    showToast('Acapella mode');
  }, [showToast]);

  const handleInstrumental = useCallback(() => {
    setStems({
      Vocals: { gain: 0, muted: true, soloed: false },
      Drums: { gain: 1, muted: false, soloed: false },
      Bass: { gain: 1, muted: false, soloed: false },
      Other: { gain: 1, muted: false, soloed: false },
    });
    showToast('Instrumental mode');
  }, [showToast]);

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="page stems-page">
      <h2 className="section-label">SOURCE</h2>
      <div className="glass-card">
        <TrackLoader
          onFileLoad={loadFileA}
          trackLabel={deckA.trackLabel}
          showUrlInput={false}
          disabled={isSeparating}
        />
      </div>

      <h2 className="section-label">STEM SEPARATION</h2>
      <div className="glass-card">
        {isSeparating && (
          <div className="separation-warning">
            ⚠️ Do not close or refresh while splitting stems.
          </div>
        )}

        <div className="separation-controls">
          <button
            className="btn-primary"
            onClick={handleSeparate}
            disabled={!deckA.sourceBuffer || isSeparating}
          >
            {isSeparating ? 'Separating...' : 'Split to Stems'}
          </button>

          {isSeparating && (
            <button className="btn-glass" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>

        {separationProgress && (
          <div className="separation-progress">
            <div className="progress-text">{separationProgress}</div>
          </div>
        )}

        {!deckA.sourceBuffer && (
          <p className="hint">Load a local audio file to enable stem separation</p>
        )}

        <p className="hint">
          Stem separation uses AI to isolate vocals, drums, bass, and other instruments.
          Processing happens in your browser - no upload required.
        </p>
      </div>

      {hasSeparated && (
        <>
          <h2 className="section-label">STEM MIXER</h2>
          <div className="glass-card stems-mixer">
            <div className="preset-buttons">
              <button className="btn-glass" onClick={handleAcapella}>
                🎤 Acapella
              </button>
              <button className="btn-glass" onClick={handleInstrumental}>
                🎸 Instrumental
              </button>
            </div>

            <div className="stems-grid">
              {STEM_NAMES.map((name) => {
                const stem = stems[name];
                const isAudible = !stem.muted && (Object.values(stems).every(s => !s.soloed) || stem.soloed);
                
                return (
                  <div key={name} className={`stem-channel ${!isAudible ? 'muted' : ''}`}>
                    <div className="stem-header">
                      <span className="stem-name">{name}</span>
                      <span className="stem-gain">{(stem.gain * 100).toFixed(0)}%</span>
                    </div>

                    <input
                      type="range"
                      className="stem-slider"
                      min={0}
                      max={2}
                      step={0.01}
                      value={stem.gain}
                      onChange={(e) => updateStem(name, { gain: parseFloat(e.target.value) })}
                    />

                    <div className="stem-buttons">
                      <button
                        className={`btn-mute ${stem.muted ? 'active' : ''}`}
                        onClick={() => updateStem(name, { muted: !stem.muted })}
                      >
                        M
                      </button>
                      <button
                        className={`btn-solo ${stem.soloed ? 'active' : ''}`}
                        onClick={() => handleSolo(name)}
                      >
                        S
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <h2 className="section-label">PLAYBACK</h2>
          <div className="glass-card">
            <div className="playback-row">
              <button className="btn-play" onClick={togglePlayA}>
                {deckA.isPlaying ? '❚❚' : '▶'}
              </button>
              <span className="time-display">
                {formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="hotkey-hint">
        Hotkeys: V mute vocals · Shift+V solo vocals · A acapella · I instrumental · Esc cancel
      </div>
    </div>
  );
}
