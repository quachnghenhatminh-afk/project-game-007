export type VoiceEngineId = 'vosk' | 'webspeech';

export interface RecognitionOutcome {
  /** Best transcript ("" if nothing was heard). */
  text: string;
  /** Extra hypotheses (Web Speech only); used for matching too. */
  alternatives: string[];
  error?: string;
}

/** Push-to-talk recognizer: begin() on key down, end() on key up. */
export interface VoiceEngine {
  readonly id: VoiceEngineId;
  begin(): void;
  end(): Promise<RecognitionOutcome>;
}
