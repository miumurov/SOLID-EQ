import { useAudioEngine } from '../audio/AudioEngine';
import TrackLoader from './TrackLoader';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MiniPlayer() {
  const {
    deckA,
    togglePlayA,
    loadFileA,
    volume,
    setVolume,
    safeMode,
    setSafeMode,
    isRecording,
    startRecording,
    stopRecording,
    recordingTime,
    recordingBlob,
  } = useAudioEngine();

  const handleDownloadRecording = () => {
    if (!recordingBlob) return;
    const url = URL.createObjectURL(recordingBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording.webm';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="mini-player">
      <div className="mini-player-left">
        <span className="brand">SOLIDS</span>
      </div>

      <div className="mini-player-center">
        <button
          className="btn-play-mini"
          onClick={togglePlayA}
          aria-label={deckA.isPlaying ? 'Pause' : 'Play'}
        >
          {deckA.isPlaying ? '❚❚' : '▶'}
        </button>

        <span className="mini-time">
          {formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}
        </span>

        <div className="mini-progress">
          <div
            className="mini-progress-fill"
            style={{ width: `${deckA.duration ? (deckA.currentTime / deckA.duration) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="mini-player-right">
        <TrackLoader
          onFileLoad={loadFileA}
          trackLabel={deckA.trackLabel}
          compact
        />

        <div className="volume-group">
          <span className="volume-icon">🔊</span>
          <input
            type="range"
            className="volumeSlider"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </div>

        <button
          className={`btn-safe ${safeMode ? 'active' : ''}`}
          onClick={() => setSafeMode(!safeMode)}
          title="Safe Mode (Limiter)"
        >
          SAFE
        </button>

        <button
          className={`btn-rec ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isRecording ? `⏹ ${formatTime(recordingTime)}` : '⏺ REC'}
        </button>

        {recordingBlob && !isRecording && (
          <button className="btn-glass btn-sm" onClick={handleDownloadRecording}>
            ⬇ Recording
          </button>
        )}
      </div>
    </header>
  );
}
