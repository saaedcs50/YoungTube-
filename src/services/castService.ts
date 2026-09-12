/**
 * Google Cast Sender Service
 *
 * Implements real Google Cast Sender SDK integration:
 * - Loads Cast SDK once (checking window.cast to avoid double-loading)
 * - Initialized with YouTube receiver app ID '233637DE'
 * - Detects device availability via CastContext events
 * - Controls remote playback (play/pause/seek) and notifies on video end
 */

declare global {
  interface Window {
    cast?: any;
    chrome?: any;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
  }
}

export const YOUTUBE_RECEIVER_APP_ID = '233637DE';

export type CastStateName =
  | 'NO_DEVICES_AVAILABLE'
  | 'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED';

export interface CastSessionState {
  isSdkLoaded: boolean;
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  castState: CastStateName;
  deviceName: string | null;
  currentTime: number;
  duration: number;
  isPaused: boolean;
}

type StateListener = (state: CastSessionState) => void;
type EndListener = () => void;

class CastService {
  private scriptLoading = false;
  private stateListeners = new Set<StateListener>();
  private endListeners = new Set<EndListener>();

  private remotePlayer: any = null;
  private remotePlayerController: any = null;
  private lastPlayerState: string | null = null;
  private hasStartedPlaying = false;

  public state: CastSessionState = {
    isSdkLoaded: false,
    isAvailable: false,
    isConnected: false,
    isConnecting: false,
    castState: 'NO_DEVICES_AVAILABLE',
    deviceName: null,
    currentTime: 0,
    duration: 0,
    isPaused: false,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init() {
    if (typeof window === 'undefined') return;

    if (window.cast?.framework) {
      this.onSdkReady();
      return;
    }

    // Wrap any existing __onGCastApiAvailable hook
    const prevHook = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (typeof prevHook === 'function') {
        try {
          prevHook(isAvailable);
        } catch {
          // ignore
        }
      }
      if (isAvailable && window.cast?.framework) {
        this.onSdkReady();
      } else {
        this.updateState({
          isSdkLoaded: false,
          isAvailable: false,
          castState: 'NO_DEVICES_AVAILABLE',
        });
      }
    };

    // Check if script is already present in DOM
    if (
      !this.scriptLoading &&
      !document.querySelector('script[src*="cast_sender.js"]')
    ) {
      this.scriptLoading = true;
      const script = document.createElement('script');
      script.src =
        'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      script.async = true;
      script.onerror = () => {
        this.scriptLoading = false;
        this.updateState({
          isSdkLoaded: false,
          isAvailable: false,
          castState: 'NO_DEVICES_AVAILABLE',
        });
      };
      document.head.appendChild(script);
    }
  }

  private onSdkReady() {
    try {
      const castContext = window.cast.framework.CastContext.getInstance();
      castContext.setOptions({
        receiverApplicationId: YOUTUBE_RECEIVER_APP_ID,
        autoJoinPolicy:
          window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED ||
          'origin_scoped',
        resumeSavedSession: true,
      });

      // Setup RemotePlayer & Controller
      if (!this.remotePlayerController) {
        this.remotePlayer = new window.cast.framework.RemotePlayer();
        this.remotePlayerController = new window.cast.framework.RemotePlayerController(
          this.remotePlayer
        );

        this.setupRemoteListeners();
      }

      // Listen for Cast State changes (Availability)
      castContext.addEventListener(
        window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        (event: any) => {
          this.handleCastStateChanged(event.castState);
        }
      );

      // Listen for Session changes
      castContext.addEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event: any) => {
          this.handleSessionStateChanged(event.sessionState);
        }
      );

      // Read initial state
      const currentCastState = castContext.getCastState();
      this.handleCastStateChanged(currentCastState);

      this.updateState({ isSdkLoaded: true });
    } catch (err) {
      console.warn('Failed to initialize CastContext:', err);
    }
  }

  private handleCastStateChanged(rawState: string) {
    const castFramework = window.cast?.framework;
    if (!castFramework) return;

    let castState: CastStateName = 'NO_DEVICES_AVAILABLE';
    let isAvailable = false;
    let isConnected = false;
    let isConnecting = false;

    if (rawState === castFramework.CastState.NO_DEVICES_AVAILABLE) {
      castState = 'NO_DEVICES_AVAILABLE';
      isAvailable = false;
    } else if (rawState === castFramework.CastState.NOT_CONNECTED) {
      castState = 'NOT_CONNECTED';
      isAvailable = true;
      isConnected = false;
    } else if (rawState === castFramework.CastState.CONNECTING) {
      castState = 'CONNECTING';
      isAvailable = true;
      isConnecting = true;
    } else if (rawState === castFramework.CastState.CONNECTED) {
      castState = 'CONNECTED';
      isAvailable = true;
      isConnected = true;
    }

    const session = castFramework.CastContext.getInstance().getCurrentSession();
    const deviceName =
      session?.getCastDevice?.()?.friendlyName ||
      session?.getSessionObj?.()?.receiver?.friendlyName ||
      null;

    this.updateState({
      isAvailable,
      isConnected,
      isConnecting,
      castState,
      deviceName: isConnected ? deviceName : null,
    });
  }

  private handleSessionStateChanged(rawSessionState: string) {
    const castFramework = window.cast?.framework;
    if (!castFramework) return;

    const session = castFramework.CastContext.getInstance().getCurrentSession();
    const isConnected = !!session;
    const deviceName =
      session?.getCastDevice?.()?.friendlyName ||
      session?.getSessionObj?.()?.receiver?.friendlyName ||
      null;

    this.updateState({
      isConnected,
      deviceName: isConnected ? deviceName : null,
    });
  }

  private setupRemoteListeners() {
    if (!this.remotePlayerController || !window.cast?.framework) return;
    const rpc = this.remotePlayerController;
    const rpe = window.cast.framework.RemotePlayerEventType;

    rpc.addEventListener(rpe.IS_CONNECTED_CHANGED, () => {
      const isConnected = !!this.remotePlayer.isConnected;
      this.updateState({
        isConnected,
        isPaused: this.remotePlayer.isPaused,
        currentTime: this.remotePlayer.currentTime || 0,
        duration: this.remotePlayer.duration || 0,
      });
    });

    rpc.addEventListener(rpe.IS_PAUSED_CHANGED, () => {
      this.updateState({
        isPaused: !!this.remotePlayer.isPaused,
      });
    });

    rpc.addEventListener(rpe.CURRENT_TIME_CHANGED, () => {
      this.state.currentTime = this.remotePlayer.currentTime || 0;
    });

    rpc.addEventListener(rpe.DURATION_CHANGED, () => {
      this.updateState({
        duration: this.remotePlayer.duration || 0,
      });
    });

    rpc.addEventListener(rpe.PLAYER_STATE_CHANGED, () => {
      const playerState = this.remotePlayer.playerState;
      const prev = this.lastPlayerState;
      this.lastPlayerState = playerState;

      if (playerState === 'PLAYING') {
        this.hasStartedPlaying = true;
        this.updateState({ isPaused: false });
      } else if (playerState === 'PAUSED') {
        this.updateState({ isPaused: true });
      } else if (
        playerState === 'IDLE' &&
        this.hasStartedPlaying &&
        (prev === 'PLAYING' || prev === 'PAUSED')
      ) {
        // Video finished on Cast receiver!
        this.hasStartedPlaying = false;
        this.notifyEnd();
      }
    });
  }

  private updateState(partial: Partial<CastSessionState>) {
    this.state = { ...this.state, ...partial };
    this.stateListeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Cast state listener error:', err);
      }
    });
  }

  private notifyEnd() {
    this.endListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Cast end listener error:', err);
      }
    });
  }

  // Public API Methods

  public subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onVideoEnd(listener: EndListener): () => void {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  public async requestSession(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.cast?.framework) return false;
    try {
      const ctx = window.cast.framework.CastContext.getInstance();
      await ctx.requestSession();
      this.handleCastStateChanged(ctx.getCastState());
      return true;
    } catch (err: any) {
      if (err !== 'cancel' && err?.errorCode !== 'cancel') {
        console.warn('Cast request session error:', err);
      }
      return false;
    }
  }

  public async endSession(stopCasting = true): Promise<void> {
    if (typeof window === 'undefined' || !window.cast?.framework) return;
    try {
      const ctx = window.cast.framework.CastContext.getInstance();
      await ctx.endCurrentSession(stopCasting);
      this.updateState({
        isConnected: false,
        deviceName: null,
      });
    } catch (err) {
      console.warn('Cast endSession error:', err);
    }
  }

  public loadVideo(videoId: string, title?: string, currentTime = 0) {
    if (typeof window === 'undefined' || !window.cast?.framework) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    const session = ctx.getCurrentSession();
    if (!session) return;

    this.hasStartedPlaying = false;

    try {
      const mediaInfo = new window.chrome.cast.media.MediaInfo(
        videoId,
        'video/mp4'
      );
      if (window.chrome?.cast?.media?.GenericMediaMetadata) {
        const metadata = new window.chrome.cast.media.GenericMediaMetadata();
        metadata.title = title || 'فيديو أطفال آمن';
        mediaInfo.metadata = metadata;
      }
      mediaInfo.customData = { videoId };

      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      request.currentTime = currentTime || 0;

      session.loadMedia(request).then(
        () => {
          this.hasStartedPlaying = true;
        },
        (err: any) => {
          console.warn('Cast loadMedia warning:', err);
        }
      );
    } catch (err) {
      console.warn('Cast load error:', err);
    }

    // Also send YouTube receiver namespace message
    try {
      session.sendMessage('urn:x-cast:com.google.youtube.mdx', {
        type: 'setPlaylist',
        videoId,
        currentTime: currentTime || 0,
      });
    } catch {
      // ignore
    }
  }

  public play() {
    if (this.remotePlayerController && this.remotePlayer?.isPaused) {
      this.remotePlayerController.playOrPause();
    }
  }

  public pause() {
    if (this.remotePlayerController && !this.remotePlayer?.isPaused) {
      this.remotePlayerController.playOrPause();
    }
  }

  public playOrPause() {
    if (this.remotePlayerController) {
      this.remotePlayerController.playOrPause();
    }
  }

  public seek(seconds: number) {
    if (this.remotePlayer && this.remotePlayerController) {
      this.remotePlayer.currentTime = Math.max(0, seconds);
      this.remotePlayerController.seek();
    }
  }
}

export const castService = new CastService();
