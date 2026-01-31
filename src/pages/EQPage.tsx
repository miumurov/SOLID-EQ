import { useState, useCallback } from 'react';
import { useAudioEngine, EQ_FREQUENCIES } from '../audio/AudioEngine';
import TrackLoader from '../components/TrackLoader';
import Waveform from '../components/Waveform';
import { useToast } from '../components/Toast';

const BUILTIN_PRESETS: { name: string; gains: number[] }[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', gains: [6, 3, -1, 0, 1, 2, 2, 1] },
  { name: 'Vocal', gains: [-2, -1, 2, 4, 3, 1, 0, -1] },
  { name: 'Bright', gains: [-2, -1, 0, 1, 2, 4, 5, 4] },
  { name: 'Club', gains: [5, 3, 0, -1, 2, 3, 2, 1] },
];

function formatFrequency(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function EQPage() {
  const {
    deckA,
    loadFileA,
    loadUrlA,
    togglePlayA,
    seekA,
    eqGains,
    setEqGain,
    resetEq,
    eqBypass,
    setEqBypass,
    activeEqPreset,
    setActiveEqPreset,
    storeEqPreset,
    applyBuiltinPreset,
    userPresets,
    saveUserPreset,
    deleteUserPreset,
    exportStatus,
    exportWav,
    waveformA,
  } = useAudioEngine();

  const { showToast } = useToast();

  const [selectedPreset, setSelectedPreset] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [normalize, setNormalize] = useState(true);
  const [bitDepth, setBitDepth] = useState<16 | 32>(16);

  const handleApplyPreset = useCallback(() => {
    const preset = BUILTIN_PRESETS.find((p) => p.name === selectedPreset);
    if (preset) {
      applyBuiltinPreset(preset.gains);
      showToast(`Applied preset: ${preset.name}`);
    } else {
      const userPreset = userPresets.find((p) => p.name === selectedPreset);
      if (userPreset) {
        applyBuiltinPreset(userPreset.gains);
        showToast(`Applied preset: ${userPreset.name}`);
      }
    }
  }, [selectedPreset, applyBuiltinPreset, userPresets, showToast]);

  const handleSavePreset = useCallback(() => {
    if (!newPresetName.trim()) {
      showToast('Enter a preset name');
      return;
    }
    saveUserPreset(newPresetName.trim());
    showToast(`Saved preset: ${newPresetName}`);
    setNewPresetName('');
  }, [newPresetName, saveUserPreset, showToast]);

  const handleExport = useCallback(async () => {
    if (!deckA.sourceBuffer) {
      showToast('Load a local file first');
      return;
    }
    await exportWav(normalize, bitDepth);
  }, [deckA.sourceBuffer, exportWav, normalize, bitDepth, showToast]);

  return (
    <div className="page eq-page">
      <h2 className="section-label">SOURCE</h2>
      <div className="glass-card">
        <TrackLoader
          onFileLoad={loadFileA}
          onUrlLoad={loadUrlA}
          trackLabel={deckA.trackLabel}
          showUrlInput
        />
      </div>

      <h2 className="section-label">PLAYBACK</h2>
      <div className="glass-card playback-card">
        <div className="playback-row">
          <div className="track-info">
            <div className="track-icon-placeholder">♪</div>
            <div className="track-details">
              <div className="track-title">{deckA.trackLabel || 'No track loaded'}</div>
              <div className="track-status">{deckA.isPlaying ? 'Playing' : 'Paused'}</div>
            </div>
          </div>
          <div className="time-display">
            {formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}
          </div>
        </div>

        <div className="controls-row">
          <button className="btn-play" onClick={togglePlayA}>
            {deckA.isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="btn-glass btn-sm" onClick={() => seekA(deckA.currentTime - 5)}>
            -5s
          </button>
          <button className="btn-glass btn-sm" onClick={() => seekA(deckA.currentTime + 5)}>
            +5s
          </button>
        </div>
      </div>

      <h2 className="section-label">WAVEFORM</h2>
      <div className="glass-card">
        <Waveform
          peaks={waveformA}
          currentTime={deckA.currentTime}
          duration={deckA.duration}
          onSeek={seekA}
        />
      </div>

      <h2 className="section-label">EQUALIZER</h2>
      <div className="glass-card eq-card">
        <div className="eq-toolbar">
          <button
            className={`btn-glass btn-sm ${eqBypass ? 'active' : ''}`}
            onClick={() => {
              setEqBypass(!eqBypass);
              showToast(eqBypass ? 'EQ enabled' : 'EQ bypassed');
            }}
          >
            {eqBypass ? 'BYPASS ON' : 'BYPASS OFF'}
          </button>
          <button className="btn-glass btn-sm" onClick={resetEq}>
            Reset EQ
          </button>

          <div className="ab-buttons">
            <button
              className={`btn-ab ${activeEqPreset === 'A' ? 'active' : ''}`}
              onClick={() => setActiveEqPreset('A')}
            >
              A
            </button>
            <button
              className={`btn-ab ${activeEqPreset === 'B' ? 'active' : ''}`}
              onClick={() => setActiveEqPreset('B')}
            >
              B
            </button>
            <button
              className="btn-glass btn-sm"
              onClick={() => {
                storeEqPreset(activeEqPreset);
                showToast(`Stored to ${activeEqPreset}`);
              }}
            >
              Store
            </button>
          </div>
        </div>

        <div className="eq-sliders">
          {EQ_FREQUENCIES.map((freq, index) => (
            <div key={freq} className="eq-band">
              <span className="gain-value">
                {eqGains[index] > 0 ? '+' : ''}
                {eqGains[index]} dB
              </span>
              <input
                type="range"
                min={-24}
                max={24}
                step={0.5}
                value={eqGains[index]}
                onChange={(e) => setEqGain(index, parseFloat(e.target.value))}
                className="eq-slider"
                disabled={eqBypass}
              />
              <span className="freq-label">{formatFrequency(freq)}</span>
            </div>
          ))}
        </div>

        <div className="presets-section">
          <select
            className="input-glass"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
          >
            <option value="">Select preset...</option>
            <optgroup label="Built-in">
              {BUILTIN_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {userPresets.length > 0 && (
              <optgroup label="User Presets">
                {userPresets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button className="btn-glass btn-sm" onClick={handleApplyPreset}>
            Apply
          </button>

          <input
            type="text"
            className="input-glass"
            placeholder="New preset name..."
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
          />
          <button className="btn-glass btn-sm" onClick={handleSavePreset}>
            Save
          </button>

          {userPresets.length > 0 && (
            <select
              className="input-glass"
              onChange={(e) => {
                if (e.target.value) {
                  deleteUserPreset(e.target.value);
                  showToast(`Deleted preset: ${e.target.value}`);
                  e.target.value = '';
                }
              }}
            >
              <option value="">Delete preset...</option>
              {userPresets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <h2 className="section-label">EXPORT</h2>
      <div className="glass-card export-card">
        <div className="export-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={normalize}
              onChange={(e) => setNormalize(e.target.checked)}
            />
            Normalize
          </label>

          <label className="radio-label">
            <input
              type="radio"
              name="bitDepth"
              checked={bitDepth === 16}
              onChange={() => setBitDepth(16)}
            />
            16-bit WAV
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="bitDepth"
              checked={bitDepth === 32}
              onChange={() => setBitDepth(32)}
            />
            32-bit Float WAV
          </label>
        </div>

        <button
          className="btn-primary"
          onClick={handleExport}
          disabled={!deckA.sourceBuffer || !!exportStatus}
        >
          {exportStatus || 'Export WAV with EQ'}
        </button>

        {!deckA.sourceBuffer && (
          <p className="hint">Load a local audio file to enable export</p>
        )}
      </div>
    </div>
  );
}
