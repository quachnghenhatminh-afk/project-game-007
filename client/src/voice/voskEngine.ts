import { Model, type KaldiRecognizer } from 'vosk-browser';
import type { RecognitionOutcome, VoiceEngine } from './types.ts';

// vosk-browser caches the extracted model in IndexedDB (database "/vosk"),
// keyed by the model URL, so the model must always be loaded from a stable URL.
// That cache plays the role of the Cache Storage API here. Our own fetch below
// exists only to show download progress (vosk-browser reports none).

const VOSK_DB = '/vosk';
const FINAL_RESULT_TIMEOUT_MS = 5000;

export type LoadStage = 'download' | 'init';

export async function loadVoskModel(
  url: string,
  onProgress: (stage: LoadStage, fraction: number | null) => void,
): Promise<Model> {
  const absolute = new URL(url, document.baseURI).href;
  if (!(await isModelCached(absolute))) await prefetch(absolute, (f) => onProgress('download', f));
  onProgress('init', null);
  return new Promise((resolve, reject) => {
    const model = new Model(absolute, -1);
    model.on('load', (msg) => {
      if ('result' in msg && msg.result) resolve(model);
      else reject(new Error('Vosk model failed to load'));
    });
    model.on('error', (msg) => reject(new Error('error' in msg ? msg.error : 'Vosk error')));
  });
}

/** Deletes vosk-browser's IndexedDB cache (to re-test a first-time load). */
export function clearVoskCache(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(VOSK_DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function isModelCached(absoluteUrl: string): Promise<boolean> {
  const key = `${VOSK_DB}/${absoluteUrl.replace(/[\W]/g, '_')}/extracted.ok`;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(VOSK_DB);
      // Don't create the database if it doesn't exist yet.
      req.onupgradeneeded = () => req.transaction?.abort();
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const get = db.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA').count(key);
          get.onsuccess = () => {
            resolve(get.result > 0);
            db.close();
          };
          get.onerror = () => {
            resolve(false);
            db.close();
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
    } catch {
      resolve(false);
    }
  });
}

async function prefetch(url: string, onFraction: (f: number | null) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    onFraction(total ? loaded / total : null);
  }
}

/**
 * Each audio chunk sent to the vosk worker produces exactly one message
 * (result or partialresult), and retrieveFinalResult() produces one more.
 * Counting messages tells us which "result" is the final one for this utterance;
 * any mid-utterance results (Vosk endpointing on a pause) are joined in.
 */
export class VoskEngine implements VoiceEngine {
  readonly id = 'vosk' as const;
  onPartial: (text: string) => void = () => {};
  private recognizer: KaldiRecognizer | null = null;
  private sent = 0;
  private received = 0;
  private texts: string[] = [];
  private capturing = false;
  private waiter: { expected: number; resolve: (o: RecognitionOutcome) => void } | null = null;

  constructor(
    private model: Model,
    private sampleRate: number,
    private grammar: string[] | null,
  ) {
    this.createRecognizer();
  }

  setGrammar(grammar: string[] | null): void {
    this.grammar = grammar;
    this.createRecognizer();
  }

  feed(samples: Float32Array): void {
    if (!this.capturing || !this.recognizer) return;
    this.recognizer.acceptWaveformFloat(samples, this.sampleRate);
    this.sent++;
  }

  begin(): void {
    this.sent = 0;
    this.received = 0;
    this.texts = [];
    this.capturing = true;
  }

  end(): Promise<RecognitionOutcome> {
    this.capturing = false;
    const rec = this.recognizer;
    if (!rec) return Promise.resolve({ text: '', alternatives: [], error: 'recognizer not ready' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        this.createRecognizer(); // drop any late messages from the stuck recognizer
        resolve({ text: this.texts.join(' '), alternatives: [], error: 'timeout' });
      }, FINAL_RESULT_TIMEOUT_MS);
      this.waiter = {
        expected: this.sent + 1,
        resolve: (o) => {
          clearTimeout(timer);
          resolve(o);
        },
      };
      rec.retrieveFinalResult();
      this.check();
    });
  }

  private createRecognizer(): void {
    this.recognizer?.remove();
    const rec = this.grammar
      ? new this.model.KaldiRecognizer(this.sampleRate, JSON.stringify(this.grammar))
      : new this.model.KaldiRecognizer(this.sampleRate);
    rec.on('result', (msg) => {
      if (rec !== this.recognizer) return;
      if (msg.event === 'result') {
        const t = msg.result.text.trim();
        if (t) this.texts.push(t);
        if (this.capturing) this.onPartial(this.texts.join(' '));
      }
      this.received++;
      this.check();
    });
    rec.on('partialresult', (msg) => {
      if (rec !== this.recognizer) return;
      if (this.capturing && msg.event === 'partialresult') {
        this.onPartial([...this.texts, msg.result.partial].join(' ').trim());
      }
      this.received++;
      this.check();
    });
    rec.on('error', (msg) => {
      if (rec !== this.recognizer) return;
      console.error('[vosk]', msg.event === 'error' ? msg.error : msg);
      this.received++;
      this.check();
    });
    this.recognizer = rec;
  }

  private check(): void {
    if (this.waiter && this.received >= this.waiter.expected) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve({ text: this.texts.join(' '), alternatives: [] });
    }
  }
}
