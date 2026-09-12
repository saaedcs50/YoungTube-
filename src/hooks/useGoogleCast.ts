import { useState, useEffect, useCallback } from 'react';
import {
  castService,
  type CastSessionState,
} from '../services/castService';

export function useGoogleCast() {
  const [castState, setCastState] = useState<CastSessionState>(castService.state);

  useEffect(() => {
    const unsubscribe = castService.subscribe((nextState) => {
      setCastState(nextState);
    });
    return unsubscribe;
  }, []);

  const requestSession = useCallback(async () => {
    return await castService.requestSession();
  }, []);

  const endSession = useCallback(async () => {
    return await castService.endSession(true);
  }, []);

  const loadVideo = useCallback((videoId: string, title?: string, currentTime?: number) => {
    castService.loadVideo(videoId, title, currentTime);
  }, []);

  const playOrPause = useCallback(() => {
    castService.playOrPause();
  }, []);

  const seek = useCallback((seconds: number) => {
    castService.seek(seconds);
  }, []);

  return {
    ...castState,
    requestSession,
    endSession,
    loadVideo,
    playOrPause,
    seek,
  };
}
