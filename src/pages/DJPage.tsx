import { useCallback } from 'react';
import { useAudioEngine, DJScene } from '../audio/AudioEngine';
import TrackLoader from '../components/TrackLoader';
import Waveform from '../components/Waveform';
import { useToast } from '../components/Toast';

const DJ_PRESETS: { name: string; scene: DJScene }[] = [
  { name: 'Clean', scene: { playbackRate: 1.0, filterMacro: 0, echoMix: 0, echoTime: 0.25, echoFeedback: 0.3 } },
  { name: 'Club Echo', scene: { playbackRate: 1.0, filterMacro: 0, echoMix: 0.4, echoTime: 0.25, echoFeedback: 0.4 } },
  { name: 'Lowpass Drop', scene: { playbackRate: 1.0, filterMacro: -60, echoMix: 0.2, echoTime: 0.15, echoFeedback: 0.3 } },
  { name: 'HiPass Build', scene: { playbackRate: 1.0, filterMacro: 50, echoMix: 0.1, echoTime: 0.1, echoFeedback: 0.2 } },
  { name: 'Slowdown', scene: { playbackRate: 0.85, filterMacro: -30, echoMix: 0.3, echoTime: 0.35, echoFeedback: 0.5 } },
];

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface DeckPanelProps {
  deck: 'A' | 'B';
  isActive: boolean;
  onActivate: () => void;
}

function DeckPanel({ deck, isActive, onActivate }: DeckPanelProps) {
  const engine = useAudioEngine();
  const { showToast } = useToast();

  const deckState = deck === 'A' ? engine.deckA : engine.deckB;
  const waveform = deck === 'A' ? engine.waveformA : engine.waveformB;
  const loadFile = deck === 'A' ? engine.loadFileA : engine.loadFileB;
  const loadUrl = deck === 'A' ? engine.loadUrlA : engine.loadUrlB;
  const togglePlay = deck === 'A' ? engine.togglePlayA : engine.togglePlayB;
  const seek = deck === 'A' ? engine.seekA : engine.seekB;
  const setPlaybackRate = deck === 'A' ? engine.setPlaybackRateA : engine.setPlaybackRateB;
  const setHotCue = deck === 'A' ? engine.setHotCueA : engine.setHotCueB;
  const triggerHotCue = deck === 'A' ? engine.triggerHotCueA : engine.triggerHotCueB;
  const setLoopIn = deck === 'A' ? engine.setLoopInA : engine.setLoopInB;
  const setLoopOut = deck === 'A' ? engine.setLoopOutA : engine.setLoopOutB;
  const toggleLoop = deck === 'A' ? engine.toggleLoopA : engine.toggleLoopB;
  const clearLoop = deck === 'A' ? engine.clearLoopA : engine.clearLoopB;

  return (
    <div className={`deck-panel ${isActive ? 'active' : ''}`} onClick={onActivate}>
      <div className="deck-header">
        <span className="deck-label">DECK {deck}</span>
        {isActive && <span className="active-badge">ACTIVE</span>}
      </div>

      <TrackLoader
        onFileLoad={loadFile}
        onUrlLoad={loadUrl}
        trackLabel={deckState.trackLabel}
        showUrlInput
      />

      <div className="deck-waveform">
        <Waveform
          peaks={waveform}
          currentTime={deckState.currentTime}
          duration={deckState.duration}
          onSeek={seek}
        />
      </div>

      <div className="deck-transport">
        <button className="btn-play" onClick={togglePlay}>
          {deckState.isPlaying ? '❚❚' : '▶'}
        </button>
        <span className="deck-time">
          {formatTime(deckState.currentTime)} / {formatTime(deckState.duration)}
        </span>
      </div>

      <div className="deck-tempo">
        <label>Tempo: {(deckState.playbackRate * 100).toFixed(0)}%</label>
        <input
          type="range"
          className="tempo-slider"
          min={0.5}
          max={1.5}
          step={0.01}
          value={deckState.playbackRate}
          onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
        />
        <button className="btn-glass btn-sm" onClick={() => setPlaybackRate(1)}>
          Reset
        </button>
      </div>

      <div className="hot-cues">
        <label>Hot Cues</label>
        <div className="cue-buttons">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              className={`btn-cue ${deckState.hotCues[i] !== null ? 'set' : ''}`}
              onClick={() => {
                if (deckState.hotCues[i] !== null) {
                  triggerHotCue(i);
                } else {
                  setHotCue(i, deckState.currentTime);
                  showToast(`Cue ${i + 1} set at ${formatTime(deckState.currentTime)}`);
                }
              }}
              onDoubleClick={() => {
                setHotCue(i, deckState.currentTime);
                showToast(`Cue ${i + 1} set at ${formatTime(deckState.currentTime)}`);
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="loop-controls">
        <label>Loop</label>
        <div className="loop-buttons">
          <button
            className={`btn-glass btn-sm ${deckState.loopIn !== null ? 'set' : ''}`}
            onClick={() => setLoopIn(deckState.currentTime)}
          >
            IN {deckState.loopIn !== null ? formatTime(deckState.loopIn) : ''}
          </button>
          <button
            className={`btn-glass btn-sm ${deckState.loopOut !== null ? 'set' : ''}`}
            onClick={() => setLoopOut(deckState.currentTime)}
          >
            OUT {deckState.loopOut !== null ? formatTime(deckState.loopOut) : ''}
          </button>
          <button
            className={`btn-glass btn-sm ${deckState.loopEnabled ? 'active' : ''}`}
            onClick={toggleLoop}
            disabled={deckState.loopIn === null || deckState.loopOut === null}
          >
            {deckState.loopEnabled ? 'LOOP ON' : 'LOOP'}
          </button>
          <button className="btn-glass btn-sm" onClick={clearLoop}>
            CLR
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DJPage() {
  const {
    activeDeck,
    setActiveDeck,
    crossfader,
    setCrossfader,
    filterMacro,
    setFilterMacro,
    echoMix,
    setEchoMix,
    echoTime,
    setEchoTime,
    echoFeedback,
    setEchoFeedback,
    fxBypass,
    setFxBypass,
    djSceneA,
    djSceneB,
    activeDjScene,
    setActiveDjScene,
    storeDjScene,
    morphDjScenes,
    isMorphing,
    applyDjPreset,
  } = useAudioEngine();

  const { showToast } = useToast();

  const handleApplyDjPreset = useCallback(
    (preset: DJScene) => {
      applyDjPreset(preset);
    },
    [applyDjPreset]
  );

  return (
    <div className="page dj-page">
      <h2 className="section-label">DECKS</h2>
      <div className="decks-container">
        <DeckPanel deck="A" isActive={activeDeck === 'A'} onActivate={() => setActiveDeck('A')} />
        <DeckPanel deck="B" isActive={activeDeck === 'B'} onActivate={() => setActiveDeck('B')} />
      </div>

      <h2 className="section-label">CROSSFADER</h2>
      <div className="glass-card crossfader-card">
        <div className="crossfader-labels">
          <span>A</span>
          <span>B</span>
        </div>
        <input
          type="range"
          className="crossfader-slider"
          min={0}
          max={1}
          step={0.01}
          value={crossfader}
          onChange={(e) => setCrossfader(parseFloat(e.target.value))}
        />
      </div>

      <h2 className="section-label">DJ FX</h2>
      <div className="glass-card fx-card">
        <div className="fx-toolbar">
          <button
            className={`btn-glass btn-sm ${fxBypass ? 'active' : ''}`}
            onClick={() => {
              setFxBypass(!fxBypass);
              showToast(fxBypass ? 'FX enabled' : 'FX bypassed');
            }}
          >
            {fxBypass ? 'FX BYPASS ON' : 'FX BYPASS OFF'}
          </button>

          <div className="scene-buttons">
            <button
              className={`btn-ab ${activeDjScene === 'A' ? 'active' : ''}`}
              onClick={() => {
                setActiveDjScene('A');
                applyDjPreset(djSceneA);
              }}
            >
              Scene A
            </button>
            <button
              className={`btn-ab ${activeDjScene === 'B' ? 'active' : ''}`}
              onClick={() => {
                setActiveDjScene('B');
                applyDjPreset(djSceneB);
              }}
            >
              Scene B
            </button>
            <button className="btn-glass btn-sm" onClick={() => storeDjScene(activeDjScene)}>
              Store
            </button>
            <button
              className={`btn-glass btn-sm ${isMorphing ? 'active' : ''}`}
              onClick={morphDjScenes}
            >
              {isMorphing ? 'Stop Morph' : 'Morph'}
            </button>
          </div>
        </div>

        <div className="fx-controls">
          <div className="fx-control">
            <label>Filter: {filterMacro}</label>
            <input
              type="range"
              className="fx-slider"
              min={-100}
              max={100}
              step={1}
              value={filterMacro}
              onChange={(e) => setFilterMacro(parseInt(e.target.value))}
            />
            <div className="fx-hint">LP ← 0 → HP</div>
          </div>

          <div className="fx-control">
            <label>Echo Mix: {(echoMix * 100).toFixed(0)}%</label>
            <input
              type="range"
              className="fx-slider"
              min={0}
              max={1}
              step={0.01}
              value={echoMix}
              onChange={(e) => setEchoMix(parseFloat(e.target.value))}
            />
          </div>

          <div className="fx-control">
            <label>Echo Time: {echoTime.toFixed(2)}s</label>
            <input
              type="range"
              className="fx-slider"
              min={0.05}
              max={1}
              step={0.01}
              value={echoTime}
              onChange={(e) => setEchoTime(parseFloat(e.target.value))}
            />
          </div>

          <div className="fx-control">
            <label>Echo Feedback: {(echoFeedback * 100).toFixed(0)}%</label>
            <input
              type="range"
              className="fx-slider"
              min={0}
              max={0.9}
              step={0.01}
              value={echoFeedback}
              onChange={(e) => setEchoFeedback(parseFloat(e.target.value))}
            />
          </div>
        </div>

        <div className="fx-presets">
          <label>DJ Presets:</label>
          <div className="preset-buttons">
            {DJ_PRESETS.map((p) => (
              <button
                key={p.name}
                className="btn-glass btn-sm"
                onClick={() => {
                  handleApplyDjPreset(p.scene);
                  showToast(`Applied: ${p.name}`);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hotkey-hint">
        Hotkeys: 1–4 cues · Shift+1–4 set · Space play · Tab switch deck · F FX bypass · Backspace clear loop
      </div>
    </div>
  );
}
