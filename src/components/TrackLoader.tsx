import { useRef, useCallback } from 'react';

interface TrackLoaderProps {
  onFileLoad: (file: File) => void;
  onUrlLoad?: (url: string) => void;
  trackLabel?: string | null;
  showUrlInput?: boolean;
  compact?: boolean;
  disabled?: boolean;
}

export default function TrackLoader({
  onFileLoad,
  onUrlLoad,
  trackLabel,
  showUrlInput = false,
  compact = false,
  disabled = false,
}: TrackLoaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileLoad(file);
        e.target.value = '';
      }
    },
    [onFileLoad]
  );

  const handleUrlSubmit = useCallback(() => {
    const url = urlInputRef.current?.value?.trim();
    if (url && onUrlLoad) {
      onUrlLoad(url);
      if (urlInputRef.current) urlInputRef.current.value = '';
    }
  }, [onUrlLoad]);

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleUrlSubmit();
    },
    [handleUrlSubmit]
  );

  if (compact) {
    return (
      <div className="track-loader-compact">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="btn-glass btn-sm"
          onClick={handleFileClick}
          disabled={disabled}
        >
          Load File
        </button>
        {trackLabel && <span className="track-label-compact">{trackLabel}</span>}
      </div>
    );
  }

  return (
    <div className="track-loader-card glass-card">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div className="track-loader-row">
        <button
          className="btn-glass"
          onClick={handleFileClick}
          disabled={disabled}
        >
          Load File
        </button>
        {showUrlInput && onUrlLoad && (
          <div className="url-input-group">
            <input
              ref={urlInputRef}
              type="text"
              className="input-glass"
              placeholder="Paste audio URL..."
              onKeyDown={handleUrlKeyDown}
            />
            <button className="btn-glass btn-sm" onClick={handleUrlSubmit}>
              Load
            </button>
          </div>
        )}
      </div>
      {trackLabel && (
        <div className="track-label">
          <span className="track-icon">♪</span>
          <span className="track-name">{trackLabel}</span>
        </div>
      )}
    </div>
  );
}
