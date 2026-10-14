// Microphone capture via AudioWorklet. The mic stays open after permission is
// granted; audio is only forwarded to the recognizer while push-to-talk is held.
// A short pre-roll buffer keeps the first syllable when speech starts with the key press.

const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048;
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.port.onmessage = () => {
      const out = this.buf.slice(0, this.n);
      this.n = 0;
      this.port.postMessage({ samples: out, flushed: true }, [out.buffer]);
    };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.size) {
          this.port.postMessage({ samples: this.buf, flushed: false }, [this.buf.buffer]);
          this.buf = new Float32Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

const PRE_ROLL_SECONDS = 0.3;

export class MicInput {
  readonly context: AudioContext;
  private stream: MediaStream;
  private node: AudioWorkletNode;
  private capturing = false;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private flushResolve: (() => void) | null = null;

  /** Called with each audio chunk while capturing. */
  onChunk: (samples: Float32Array) => void = () => {};
  /** Called continuously with RMS level 0..1 (for a level meter). */
  onLevel: (rms: number) => void = () => {};

  private constructor(context: AudioContext, stream: MediaStream, node: AudioWorkletNode) {
    this.context = context;
    this.stream = stream;
    this.node = node;
    node.port.onmessage = (e: MessageEvent<{ samples: Float32Array; flushed: boolean }>) =>
      this.handleSamples(e.data.samples, e.data.flushed);
  }

  /** Must be called from a user gesture (click). Throws if permission is denied. */
  static async open(deviceId?: string): Promise<MicInput> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const context = new AudioContext();
    await context.resume();
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'pcm-tap');
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(context.destination);
    return new MicInput(context, stream, node);
  }

  get sampleRate(): number {
    return this.context.sampleRate;
  }

  get label(): string {
    return this.stream.getAudioTracks()[0]?.label ?? '';
  }

  startCapture(): void {
    this.capturing = true;
    for (const chunk of this.preRoll) this.onChunk(chunk);
    this.preRoll = [];
    this.preRollSamples = 0;
  }

  /** Stops forwarding audio after flushing the worklet's partial buffer. */
  stopCapture(): Promise<void> {
    return new Promise((resolve) => {
      this.flushResolve = () => {
        this.capturing = false;
        resolve();
      };
      this.node.port.postMessage('flush');
    });
  }

  close(): void {
    for (const t of this.stream.getTracks()) t.stop();
    void this.context.close();
  }

  private handleSamples(samples: Float32Array, flushed: boolean): void {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
    if (samples.length) this.onLevel(Math.sqrt(sum / samples.length));

    if (this.capturing) {
      if (samples.length) this.onChunk(samples);
    } else if (samples.length) {
      this.preRoll.push(samples);
      this.preRollSamples += samples.length;
      const max = PRE_ROLL_SECONDS * this.sampleRate;
      while (this.preRollSamples - (this.preRoll[0]?.length ?? 0) >= max) {
        this.preRollSamples -= this.preRoll.shift()!.length;
      }
    }
    if (flushed && this.flushResolve) {
      const r = this.flushResolve;
      this.flushResolve = null;
      r();
    }
  }
}
