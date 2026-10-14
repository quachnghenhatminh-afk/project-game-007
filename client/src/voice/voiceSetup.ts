import { COMMANDS, buildVoskGrammar } from '@game/shared';
import type { VoiceInput } from '../game/spellCaster.ts';
import { MicInput } from './micInput.ts';
import { WebSpeechEngine, isWebSpeechSupported } from './webSpeechEngine.ts';

// One-call voice setup for the game: open the mic, load the recognizer, return a
// VoiceInput for SpellCaster. Call from a click handler (mic + audio need a user gesture).

export type VoiceChoice = 'vosk' | 'webspeech' | 'off';

export const VOSK_MODEL_URL = 'voice/vosk-model-small-vn-0.4.tar.gz';
/** Mic RMS above this counts as speech (times "end of speech → spell"). */
const VOICE_RMS = 0.02;

export interface VoiceSetupResult {
  voice: VoiceInput | null;
  /** Human-readable (Vietnamese) problem, if any. The game still works with buttons/keys. */
  error?: string;
}

export function defaultVoiceChoice(isMobile: boolean): VoiceChoice {
  // Phones: the browser recognizer avoids a 34MB download and heavy WASM; desktop: offline Vosk.
  return isMobile && isWebSpeechSupported() ? 'webspeech' : 'vosk';
}

export async function setupVoice(
  choice: VoiceChoice,
  onProgress: (text: string, fraction: number | null) => void,
): Promise<VoiceSetupResult> {
  if (choice === 'off') return { voice: null };

  if (choice === 'webspeech') {
    if (!isWebSpeechSupported()) return { voice: null, error: 'Trình duyệt này không có nhận diện giọng nói của Google (hãy dùng Chrome).' };
    // Ask for the mic up front so the permission prompt appears now, not mid-fight. Release it
    // right away: on Android a second open mic can block the browser recognizer.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of stream.getTracks()) t.stop();
    } catch (err) {
      return { voice: null, error: micError(err) };
    }
    return {
      voice: {
        engine: new WebSpeechEngine(),
        startAudio: () => {},
        stopAudio: () => Promise.resolve(),
        lastVoiceAt: () => 0,
      },
    };
  }

  // Vosk: mic first (needs the click's user activation), then the model.
  onProgress('Đang xin quyền micro…', null);
  let mic: MicInput;
  try {
    mic = await MicInput.open();
  } catch (err) {
    return { voice: null, error: micError(err) };
  }
  try {
    // Loaded on demand: the recognizer (~6MB incl. WASM) only downloads for players who pick it.
    const { VoskEngine, loadVoskModel } = await import('./voskEngine.ts');
    const model = await loadVoskModel(VOSK_MODEL_URL, (stage, f) =>
      onProgress(stage === 'download' ? 'Đang tải giọng nói tiếng Việt (34MB, chỉ lần đầu)…' : 'Đang khởi động nhận diện…', stage === 'download' ? f : null),
    );
    const engine = new VoskEngine(model, mic.sampleRate, buildVoskGrammar(COMMANDS));
    let lastVoiceAt = 0;
    mic.onChunk = (s) => engine.feed(s);
    mic.onLevel = (rms) => {
      if (rms > VOICE_RMS) lastVoiceAt = performance.now();
    };
    return {
      voice: {
        engine,
        startAudio: () => mic.startCapture(),
        stopAudio: () => mic.stopCapture(),
        lastVoiceAt: () => lastVoiceAt,
      },
    };
  } catch (err) {
    mic.close();
    return { voice: null, error: `Không tải được nhận diện giọng nói: ${String(err)}` };
  }
}

function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : String(err);
  return name === 'NotAllowedError'
    ? 'Micro bị chặn. Hãy cho phép micro (biểu tượng ổ khóa trên thanh địa chỉ). Nếu đang chơi trên itch.io, có thể itch.io chặn micro trong khung game.'
    : `Không mở được micro (${name}).`;
}
