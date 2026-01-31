import { useState, useEffect } from 'react';
import './WelcomeSplash.css';

interface WelcomeSplashProps {
  onComplete: () => void;
}

export function WelcomeSplash({ onComplete }: WelcomeSplashProps) {
  const [showTitle, setShowTitle] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // Check if already seen this session
    const seen = sessionStorage.getItem('solidsSplashSeen');
    if (seen) {
      onComplete();
      return;
    }

    // Show "SOLIDS" after delay
    const titleTimer = setTimeout(() => setShowTitle(true), 350);
    // Show continue button after title animation
    const buttonTimer = setTimeout(() => setShowButton(true), 1200);

    return () => {
      clearTimeout(titleTimer);
      clearTimeout(buttonTimer);
    };
  }, [onComplete]);

  const handleContinue = () => {
    sessionStorage.setItem('solidsSplashSeen', 'true');
    onComplete();
  };

  return (
    <div className="splash-overlay">
      <div className="splash-content">
        <p className="splash-welcome">WELCOME TO</p>
        <h1 className={`splash-title ${showTitle ? 'visible' : ''}`}>SOLIDS</h1>
        <button 
          className={`splash-continue ${showButton ? 'visible' : ''}`}
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
      <div className="splash-noise"></div>
    </div>
  );
}
