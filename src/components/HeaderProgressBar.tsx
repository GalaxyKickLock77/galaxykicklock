'use client';

import React, { useState, useEffect } from 'react';

interface HeaderProgressBarProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export default function HeaderProgressBar({ isVisible, onComplete }: HeaderProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setIsActive(false);
      return;
    }

    // Simulate deployment progress
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.random() * 3 + 1; // Random increment between 1-4
      
      if (currentProgress >= 100) {
        currentProgress = 100;
        setProgress(100);
        setIsActive(true);
        
        // Hide after deployment becomes active
        setTimeout(() => {
          onComplete?.();
        }, 1000);
        
        clearInterval(interval);
      } else {
        setProgress(currentProgress);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <>
      <div className="header-progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <style jsx>{`
        .header-progress-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          z-index: 9999;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #00ccff, #ff6b6b);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
          transition: width 0.3s ease-out;
          position: relative;
        }

        .progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          width: 30px;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
          animation: sweep 1.5s infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </>
  );
}
