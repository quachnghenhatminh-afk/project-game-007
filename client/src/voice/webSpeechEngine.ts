import type { RecognitionOutcome, VoiceEngine } from './types.ts';

// Fallback engine: the browser's built-in recognizer (Chrome/Edge/Safari).
// Audio is sent to the browser vendor's servers; no grammar restriction.

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  length: number;
  [i: number]: SpeechAlternative;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isWebSpeechSupported(): boolean {
  return getCtor() !== null;
}

const END_TIMEOUT_MS = 5000;

export class WebSpeechEngine implements VoiceEngine {
  readonly id = 'webspeech' as const;
  onPartial: (text: string) => void = () => {};
  private rec: SpeechRecognitionLike | null = null;
  private finals: string[][] = [];
  private interim: string[] = [];
  private error: string | undefined;
  private ended: Promise<void> = Promise.resolve();

  begin(): void {
    const Ctor = getCtor();
    if (!Ctor) return;
    this.rec?.abort();
    const rec = new Ctor();
    rec.lang = 'vi-VN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    this.finals = [];
    this.interim = [];
    this.error = undefined;
    rec.onresult = (e) => {
      this.interim = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const alts: string[] = [];
        for (let j = 0; j < r.length; j++) alts.push(r[j]!.transcript.trim());
        if (r.isFinal) this.finals.push(alts);
        else this.interim = alts;
      }
      if (this.rec === rec) {
        this.onPartial([...this.finals.map((a) => a[0] ?? ''), this.interim[0] ?? ''].join(' ').trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.error = e.error;
    };
    this.ended = new Promise((resolve) => {
      rec.onend = () => resolve();
    });
    this.rec = rec;
    try {
      rec.start();
    } catch (err) {
      this.error = String(err);
    }
  }

  async end(): Promise<RecognitionOutcome> {
    const rec = this.rec;
    if (!rec) return { text: '', alternatives: [], error: 'Web Speech API not supported' };
    rec.stop();
    await Promise.race([this.ended, new Promise((r) => setTimeout(r, END_TIMEOUT_MS))]);
    this.rec = null;
    const pieces = this.finals.length ? this.finals : this.interim.length ? [this.interim] : [];
    const text = pieces.map((alts) => alts[0] ?? '').join(' ').trim();
    const alternatives = pieces.flatMap((alts) => alts.slice(1));
    return { text, alternatives, error: this.error };
  }
}
