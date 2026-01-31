import './ShortcutsModal.css';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: 'Space', action: 'Play / Pause' },
  { key: '←', action: 'Seek -5 seconds' },
  { key: '→', action: 'Seek +5 seconds' },
  { key: '1-4', action: 'Trigger hot cue 1-4' },
  { key: 'Shift + 1-4', action: 'Set hot cue 1-4' },
  { key: 'B', action: 'Toggle EQ Bypass' },
  { key: 'S', action: 'Toggle Safe Mode' },
  { key: 'R', action: 'Toggle Recording' },
  { key: 'E', action: 'Go to EQ page' },
  { key: 'D', action: 'Go to DJ page' },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={onClose}>×</button>
        </div>
        <div className="shortcuts-list">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="shortcut-item">
              <kbd className="shortcut-key">{shortcut.key}</kbd>
              <span className="shortcut-action">{shortcut.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
