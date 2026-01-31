import './ShortcutsModal.css';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcutGroups = [
  {
    title: 'Decks',
    shortcuts: [
      { key: 'Tab', action: 'Switch active deck' },
      { key: 'Z / /', action: 'Nudge crossfader ←/→' },
    ],
  },
  {
    title: 'Transport',
    shortcuts: [
      { key: 'Space / K', action: 'Play / Pause (active)' },
      { key: '← / J', action: 'Seek -5s' },
      { key: '→ / L', action: 'Seek +5s' },
      { key: 'Shift + ←/→', action: 'Nudge ±0.2s' },
    ],
  },
  {
    title: 'Hot Cues',
    shortcuts: [
      { key: '1–4', action: 'Trigger cue (active deck)' },
      { key: 'Shift + 1–4', action: 'Set cue (active deck)' },
    ],
  },
  {
    title: 'Tempo',
    shortcuts: [
      { key: '+ / =', action: 'Tempo +1%' },
      { key: '- / _', action: 'Tempo -1%' },
      { key: '0', action: 'Reset tempo to 100%' },
    ],
  },
  {
    title: 'FX & Filter',
    shortcuts: [
      { key: 'F', action: 'Toggle FX bypass' },
      { key: 'X', action: 'Panic (kill all FX)' },
      { key: 'Q / E', action: 'Filter ∓10' },
      { key: 'Shift + Q/E', action: 'Filter ∓2' },
    ],
  },
  {
    title: 'Scenes & Morph',
    shortcuts: [
      { key: 'A / D', action: 'Load Scene A / B' },
      { key: 'Shift + A/D', action: 'Store Scene A / B' },
      { key: 'M', action: 'Morph to other scene' },
    ],
  },
  {
    title: 'Loop',
    shortcuts: [
      { key: 'I', action: 'Set Loop IN' },
      { key: 'O', action: 'Set Loop OUT' },
      { key: 'P', action: 'Toggle Loop' },
      { key: '[ / ]', action: 'Move loop ±0.5s' },
      { key: 'Backspace', action: 'Clear loop' },
    ],
  },
  {
    title: 'Global',
    shortcuts: [
      { key: 'B', action: 'Toggle EQ bypass' },
      { key: 'S', action: 'Toggle Safe Mode' },
      { key: 'R', action: 'Toggle Recording' },
      { key: 'Ctrl+Alt+1', action: 'Go to EQ page' },
      { key: 'Ctrl+Alt+2', action: 'Go to DJ page' },
      { key: 'Ctrl+Alt+3', action: 'Go to Stems page' },
      { key: '?', action: 'Show this help' },
      { key: 'Esc', action: 'Close modal' },
    ],
  },
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
        <div className="shortcuts-body">
          {shortcutGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="shortcut-group">
              <h3 className="shortcut-group-title">{group.title}</h3>
              <div className="shortcut-list">
                {group.shortcuts.map((shortcut, index) => (
                  <div key={index} className="shortcut-item">
                    <kbd className="shortcut-key">{shortcut.key}</kbd>
                    <span className="shortcut-action">{shortcut.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
