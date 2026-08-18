// lib/webcallClient.ts
//
// Self-contained audio engine for the "Talk to Your Agent" live webcall
// widget. Nothing here touches any other part of the app — it owns its
// own AudioContext, MediaStream, and WebSocket, and cleans all three up
// completely on stop(). Safe to mount/unmount repeatedly.
//
// Protocol (matches agently-ws-server/lib/webcall-stream.js):
//   -> { type: "input_audio", audio: "<base64 PCM16 24kHz mono>" }
//   -> { type: "session.end" }
//   <- { type: "session.ready", agentName, greeting, voiceProvider }
//   <- { type: "output_audio", audio: "<base64 PCM16 24kHz mono>" }
//   <- { type: "transcript.user", text }
//   <- { type: "transcript.agent", text, partial?: boolean }
//   <- { type: "agent.interrupted", source }   caller barged in: flush playback
//   <- { type: "user.speaking", speaking }     from the server's VAD
//   <- { type: "session.error", code, message }
//   <- { type: "session.ended", reason }

const TARGET_SAMPLE_RATE = 24000;

export type WebcallStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "ended"
  | "error";

export interface WebcallCallbacks {
  onStatusChange?: (status: WebcallStatus) => void;
  onReady?: (info: {
    agentName: string;
    greeting: string;
    voiceProvider: string;
    voiceConfigured: string | null;
    voiceUsed: string | null;
    voiceHonoured: boolean;
    voiceFallbackReason: string | null;
  }) => void;
  onTranscriptUser?: (text: string) => void;
  onTranscriptAgent?: (text: string, partial: boolean) => void;
  onAgentSpeakingChange?: (speaking: boolean) => void;
  onUserSpeakingChange?: (speaking: boolean) => void;
  onError?: (code: string, message: string) => void;
  onEnded?: (reason: string) => void;
}

function base64ToInt16Array(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // 16-bit PCM is two bytes per sample. `new Int16Array(buffer)` throws on an
  // odd byte length, which silently killed the whole chunk. The server now
  // guarantees even, sample-aligned chunks; this stays as a belt-and-braces
  // guard so a stray odd payload degrades to one dropped sample instead of
  // dropping the entire chunk.
  const usable = bytes.length - (bytes.length % 2);
  if (!usable) return new Int16Array(0);
  return new Int16Array(bytes.buffer, 0, usable / 2);
}

function int16ArrayToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return btoa(binary);
}

function downsampleTo24k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, input.length - 1);
    const frac = srcIndex - lower;
    const sample = input[lower] + (input[upper] - input[lower]) * frac;
    const s = Math.max(-1, Math.min(1, sample));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class WebcallClient {
  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private captureContext: AudioContext | null = null;
  private captureNode: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackCursor = 0;
  // Every chunk is scheduled ahead on the WebAudio timeline, so at any moment
  // there can be seconds of agent speech already queued. Nothing used to hold
  // a reference to those nodes, which meant they ALWAYS played to completion —
  // that, not the TTS model, is why the agent could not be interrupted. Keep
  // them so flushPlayback() can actually stop them.
  private activeSources = new Set<AudioBufferSourceNode>();
  private muted = false;
  private stopped = false;
  private agentSpeaking = false;
  // The server (agently-ws-server/lib/webcall-stream.js) always sends a
  // specific session.error or session.ended message BEFORE it closes the
  // socket — every rejection reason (invalid token, insufficient credit,
  // agent not found, concurrency limit, missing provider key, context load
  // failure, normal hangup) is reported this way. This flag remembers that
  // a real, specific reason already arrived, so the close event below never
  // overwrites it with a generic status. Without this guard every one of
  // those specific failures was invisible: the UI briefly showed the real
  // reason, then the close event a moment later silently flipped it to a
  // blank "Call Ended, 0:00" no matter what actually went wrong.
  private terminalReported = false;
  private speakingResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private wsUrl: string,
    private callbacks: WebcallCallbacks = {},
  ) {}

  get isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
    this.callbacks.onUserSpeakingChange?.(false);
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.callbacks.onStatusChange?.("connecting");

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioContextCtor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;

    this.captureContext = new AudioContextCtor();
    this.playbackContext = new AudioContextCtor();
    this.playbackCursor = this.playbackContext.currentTime;

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.micSource = this.captureContext!.createMediaStreamSource(this.micStream!);
      // ScriptProcessorNode is deprecated but universally supported and is
      // the simplest single-file way to get raw PCM frames without shipping
      // a separate AudioWorklet module through the Vite build.
      this.captureNode = this.captureContext!.createScriptProcessor(4096, 1, 1);
      this.captureNode.onaudioprocess = (event) => {
        if (this.stopped || this.muted) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm16 = downsampleTo24k(input, this.captureContext!.sampleRate);
        if (!pcm16.length) return;
        this.ws.send(
          JSON.stringify({ type: "input_audio", audio: int16ArrayToBase64(pcm16) }),
        );
      };
      this.micSource.connect(this.captureNode);
      // Required by the WebAudio spec for ScriptProcessorNode to fire, but
      // we don't want mic audio actually reaching the speakers.
      const silentGain = this.captureContext!.createGain();
      silentGain.gain.value = 0;
      this.captureNode.connect(silentGain);
      silentGain.connect(this.captureContext!.destination);
    };

    this.ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    this.ws.onerror = () => {
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(
        "CONNECTION_ERROR",
        "Lost connection to the voice test server.",
      );
    };

    this.ws.onclose = () => {
      if (this.stopped || this.terminalReported) return;
      // The socket closed without the server ever sending session.error or
      // session.ended first — a genuine unexpected disconnect (network drop,
      // server crash), not one of the reported rejection reasons. Surface it
      // honestly rather than as a blank "Call Ended".
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(
        "CONNECTION_CLOSED_UNEXPECTEDLY",
        "The call disconnected unexpectedly. Please try again.",
      );
    };
  }

  private handleServerMessage(msg: any) {
    switch (msg.type) {
      case "session.ready":
        this.callbacks.onStatusChange?.("ready");
        this.callbacks.onReady?.({
          agentName: msg.agentName || "Your Agent",
          greeting: msg.greeting || "",
          voiceProvider: msg.voiceProvider || "openai",
          voiceConfigured: msg.voiceConfigured ?? null,
          voiceUsed: msg.voiceUsed ?? null,
          // Absent field means an older server; assume nothing is wrong
          // rather than showing a spurious warning.
          voiceHonoured: msg.voiceHonoured !== false,
          voiceFallbackReason: msg.voiceFallbackReason ?? null,
        });
        break;
      case "output_audio":
        if (msg.audio) this.playAudioChunk(msg.audio);
        break;
      case "agent.interrupted":
        this.flushPlayback();
        break;
      case "user.speaking":
        // Authoritative, from the server's VAD. The capture callback below
        // used to report "speaking" on every single audio frame, so the
        // indicator was on permanently and meant nothing.
        this.callbacks.onUserSpeakingChange?.(Boolean(msg.speaking));
        break;
      case "transcript.user":
        if (msg.text) this.callbacks.onTranscriptUser?.(msg.text);
        break;
      case "transcript.agent":
        if (msg.text) this.callbacks.onTranscriptAgent?.(msg.text, Boolean(msg.partial));
        break;
      case "session.error":
        // The server always sends this with the real rejection reason
        // (bad token, no credit, agent not found, concurrency limit, missing
        // provider key, context load failure) right before closing the
        // socket. Mark it reported so the close event doesn't clobber it.
        this.terminalReported = true;
        this.callbacks.onStatusChange?.("error");
        this.callbacks.onError?.(msg.code || "UNKNOWN", msg.message || "Something went wrong.");
        break;
      case "session.ended":
        this.terminalReported = true;
        this.callbacks.onStatusChange?.("ended");
        this.callbacks.onEnded?.(msg.reason || "ended");
        break;
      default:
        break;
    }
  }

  private playAudioChunk(base64: string) {
    if (!this.playbackContext) return;
    const int16 = base64ToInt16Array(base64);
    if (!int16.length) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    const buffer = this.playbackContext.createBuffer(1, float32.length, TARGET_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackContext.destination);

    const now = this.playbackContext.currentTime;
    const startAt = Math.max(now, this.playbackCursor);
    source.start(startAt);
    this.playbackCursor = startAt + buffer.duration;
    this.activeSources.add(source);

    this.setAgentSpeaking(true);
    source.onended = () => {
      this.activeSources.delete(source);
      if (this.speakingResetTimer) clearTimeout(this.speakingResetTimer);
      this.speakingResetTimer = setTimeout(() => {
        if (this.playbackContext && this.playbackCursor <= this.playbackContext.currentTime + 0.05) {
          this.setAgentSpeaking(false);
        }
      }, 120);
    };
  }

  /**
   * Barge-in: drop everything the agent has queued so the caller is heard
   * immediately. Called when the server reports the caller started speaking.
   */
  private flushPlayback() {
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        /* already finished — fine */
      }
    }
    this.activeSources.clear();
    if (this.playbackContext) {
      this.playbackCursor = this.playbackContext.currentTime;
    }
    if (this.speakingResetTimer) clearTimeout(this.speakingResetTimer);
    this.setAgentSpeaking(false);
  }

  private setAgentSpeaking(speaking: boolean) {
    if (this.agentSpeaking === speaking) return;
    this.agentSpeaking = speaking;
    this.callbacks.onAgentSpeakingChange?.(speaking);
  }

  hangup() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "session.end" }));
      } catch {
        /* ignore */
      }
    }
    this.stop();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.speakingResetTimer) clearTimeout(this.speakingResetTimer);
    this.flushPlayback();

    try {
      this.captureNode?.disconnect();
    } catch {}
    try {
      this.micSource?.disconnect();
    } catch {}
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      if (this.captureContext && this.captureContext.state !== "closed") {
        void this.captureContext.close();
      }
    } catch {}
    try {
      if (this.playbackContext && this.playbackContext.state !== "closed") {
        void this.playbackContext.close();
      }
    } catch {}
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close(1000);
    } catch {}

    this.ws = null;
    this.micStream = null;
    this.captureContext = null;
    this.captureNode = null;
    this.micSource = null;
    this.playbackContext = null;
  }
}
