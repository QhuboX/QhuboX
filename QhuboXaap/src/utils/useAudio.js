// src/utils/useAudio.js
import { useState, useEffect, useCallback } from 'react';

export const useAudio = () => {
  const [audioContext, setAudioContext] = useState(null);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(ctx);
    setIsSuspended(ctx.state === 'suspended');

    const handleStateChange = () => {
      setIsSuspended(ctx.state === 'suspended');
    };

    ctx.addEventListener('statechange', handleStateChange);
    return () => ctx.removeEventListener('statechange', handleStateChange);
  }, []);

  const resumeAudio = useCallback(async () => {
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume();
      setIsSuspended(false);
    }
  }, [audioContext]);

  return { audioContext, isSuspended, resumeAudio };
};