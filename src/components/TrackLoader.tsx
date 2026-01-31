import { useRef, useCallback, useState } from 'react';
import './TrackLoader.css';

interface TrackLoaderProps {
  trackName: string | null;
  onLoadFile: (file: File) => void;
  onLoadUrl?: (url: string) => void;
  compact?: boolean;
  label?: string;
}

export function TrackLoader({ 
  trackName, 
  onLoadFile, 
  onLoadUrl, 
  compact = false,
  label = 'Load Track'
}: TrackLoaderProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadFile(file);
      // Reset input so same file can be loaded again
      e.target.value = '';
    }
  }, [onLoadFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onLoadFile(file);
    }
  }, [onLoadFile]);

  const handleUrlSubmit = useCallback(() => {
    if (urlValue.trim() && onLoadUrl) {
      onLoadUrl(urlValue.trim());
      setUrlValue('');
      setShowUrlInput(false);
    }
  }, [urlValue, onLoadUrl]);

  if (compact) {
    return (
      <div className="track-loader-compact">
        <button className="track-loader-btn" onClick={handleFileClick} title="Load File">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {onLoadUrl && (
          <button 
            className={`track-loader-btn ${showUrlInput ? 'active' : ''}`}
            onClick={() => setShowUrlInput(!showUrlInput)}
            title="Load URL"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <span className="track-loader-name" title={trackName || 'No track'}>
          {trackName || 'No track'}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,audio/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {showUrlInput && (
          <div className="track-loader-url-popup">
            <input
              type="text"
              placeholder="Paste URL..."
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              autoFocus
            />
            <button onClick={handleUrlSubmit}>Load</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`track-loader ${isDraggingOver ? 'dragging' : ''} ${trackName ? 'has-track' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {trackName ? (
        <div className="track-loader-loaded">
          <div className="track-loader-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13M9 18c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zM21 16c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="track-loader-info">
            <span className="track-loader-name" title={trackName}>{trackName}</span>
            <span className="track-loader-hint">Click to change</span>
          </div>
          <button className="track-loader-change" onClick={handleFileClick}>
            Change
          </button>
        </div>
      ) : (
        <div className="track-loader-empty">
          <svg className="track-loader-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M12 1.5v13.5m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="track-loader-text">{label}</p>
          <p className="track-loader-subtext">Drop file or click to browse</p>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a,audio/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {onLoadUrl && (
        <div className="track-loader-url-section">
          {showUrlInput ? (
            <div className="track-loader-url-form">
              <input
                type="text"
                placeholder="Paste audio URL..."
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                autoFocus
              />
              <button onClick={handleUrlSubmit}>Load</button>
              <button onClick={() => setShowUrlInput(false)}>×</button>
            </div>
          ) : (
            <button className="track-loader-url-btn" onClick={() => setShowUrlInput(true)}>
              or paste URL
            </button>
          )}
        </div>
      )}
    </div>
  );
}
