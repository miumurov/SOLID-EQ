import { useState, useRef, useCallback } from 'react';
import { useAudioEngine } from '../context/AudioEngineContext';
import './MiniPlayer.css';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface MiniPlayerProps {
  onShowShortcuts: () => void;
}

export function MiniPlayer({ onShowShortcuts }: MiniPlayerProps) {
  const {
    state,
    togglePlay,
    setVolume,
    loadFile,
    loadUrl,
    toggleSafeMode,
    toggleRecording,
    downloadRecording,
    clearRecording,
  } = useAudioEngine();

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadFile(file);
    }
  }, [loadFile]);

  const handleUrlSubmit = useCallback(() => {
    if (urlValue.trim()) {
      loadUrl(urlValue.trim());
      setUrlValue('');
      setShowUrlInput(false);
    }
  }, [urlValue, loadUrl]);

  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  return (
    <div className="mini-player">
      <div className="mini-player-content">
        {/* Brand */}
        <div className="mini-brand">SOLIDS</div>

        {/* Transport Controls */}
        <div className="mini-transport">
          <button 
            className="mini-play-btn"
            onClick={togglePlay}
            disabled={!state.audioSrc}
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
          >
            {state.isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          <div className="mini-time">
            {formatTime(state.currentTime)} / {formatTime(state.duration)}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mini-progress-container">
          <div className="mini-progress-bar">
            <div 
              className="mini-progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Track Name */}
        <div className="mini-track-name" title={state.fileName || 'No track loaded'}>
          {state.fileName || 'No track loaded'}
        </div>

        {/* Volume */}
        <div className="mini-volume">
          <svg className="mini-volume-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
          <input
            type="range"
            className="mini-volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </div>

        {/* Actions */}
        <div className="mini-actions">
          {/* Safe Mode */}
          <button
            className={`mini-action-btn ${state.safeModeEnabled ? 'active' : ''}`}
            onClick={toggleSafeMode}
            title={state.safeModeEnabled ? 'Safe Mode ON' : 'Safe Mode OFF'}
          >
            {state.safeModeEnabled && <span className="safe-indicator">SAFE</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
          </button>

          {/* Recording */}
          <button
            className={`mini-action-btn ${state.isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            title={state.isRecording ? `Recording (${formatTime(state.recordingDuration)})` : 'Start Recording'}
          >
            <span className={`rec-dot ${state.isRecording ? 'active' : ''}`}></span>
            REC
          </button>

          {/* Download Recording */}
          {state.recordingBlob && !state.isRecording && (
            <>
              <button
                className="mini-action-btn download"
                onClick={downloadRecording}
                title="Download Recording"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                className="mini-action-btn"
                onClick={clearRecording}
                title="Discard Recording"
              >
                ×
              </button>
            </>
          )}

          {/* Load File */}
          <button
            className="mini-action-btn"
            onClick={handleFileClick}
            title="Load File"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,audio/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* URL Input Toggle */}
          <button
            className={`mini-action-btn ${showUrlInput ? 'active' : ''}`}
            onClick={() => setShowUrlInput(!showUrlInput)}
            title="Load URL"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Shortcuts Help */}
          <button
            className="mini-action-btn"
            onClick={onShowShortcuts}
            title="Keyboard Shortcuts"
          >
            ?
          </button>
        </div>
      </div>

      {/* URL Input Popover */}
      {showUrlInput && (
        <div className="mini-url-popover">
          <input
            type="text"
            className="mini-url-input"
            placeholder="Paste audio URL..."
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            autoFocus
          />
          <button className="mini-url-btn" onClick={handleUrlSubmit}>
            Load
          </button>
          <button className="mini-url-close" onClick={() => setShowUrlInput(false)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
