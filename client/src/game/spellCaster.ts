import type * as THREE from 'three';
import {
  CASTING,
  COMMANDS,
  getCommand,
  matchCommand,
  type ClassId,
  type CommandMatch,
  type PlayerState,
  type VoiceCommand,
} from '@game/shared';
import type { FpArms } from '../render/fpArms.ts';
import type { Hud } from '../ui/hud.ts';
import type { RecognitionOutcome, VoiceEngine, VoiceEngineId } from '../voice/types.ts';
import { spellColor, type SpellEffects } from './spellEffects.ts';

// Glue between input, voice recognition, PlayerState rules, arms, effects and HUD.
//
// Voice is streamed while the cast button is held. As soon as the live (partial)
// transcript contains a full spell phrase, the recognizer is finalized; if the
// final text confirms a spell, it goes into the player's hands (PlayerState.recognize).
// If not, listening resumes. Releasing early waits for the final result instead.

export interface VoiceInput {
  engine: VoiceEngine;
  /** Start/stop feeding microphone audio to the engine (no-op for Web Speech). */
  startAudio(): void;
  stopAudio(): Promise<void>;
  /** performance.now() of the last moment the mic heard speech-level sound. */
  lastVoiceAt(): number;
}

export interface CastAttempt {
  source: VoiceEngineId | 'hotkey';
  heard: string;
  matched: string | null;
  /** 'spell' = a command was recognized; otherwise why nothing was cast. */
  result: 'spell' | 'misheard' | 'no-mana';
  empowered: boolean;
  /** ms from end of speech (or from button release) to the spell being recognized. */
  latencyMs: number | null;
  latencyFrom: 'speech-end' | 'release' | null;
  /** ms from pressing the button to recognition (or failure). */
  channelMs: number;
}

const FIZZLE_TEXT: Record<string, string> = {
  'no-mana': 'Hết mana — phép tan biến',
  misheard: 'Niệm hỏng',
  exhausted: 'Kiệt sức — phép tan biến',
  cancelled: 'Đã hủy phép',
};

export class SpellCaster {
  /** Current voice input, or null when the mic/model is not ready (hotkeys still work). */
  voice: VoiceInput | null = null;
  /** Class whose hotkeys 1–4 are active. */
  classId: ClassId = 'mage';
  onAttempt: (a: CastAttempt) => void = () => {};

  private token = 0;
  private listening = false;
  private finalizing = false;
  private engineIdle: Promise<void> = Promise.resolve();
  private channelStart = 0;
  private releasedAt = 0;
  private lastHeard = '';

  constructor(
    private state: PlayerState,
    private arms: FpArms,
    private effects: SpellEffects,
    private hud: Hud,
    private camera: THREE.Camera,
    private commands: readonly VoiceCommand[] = COMMANDS,
  ) {}

  /** Cast button (right mouse / V) pressed. */
  press(): void {
    if (!this.state.startChannel()) return;
    const tok = ++this.token;
    this.channelStart = performance.now();
    this.lastHeard = '';
    if (!this.voice) {
      this.hud.setListening(true, '(micro chưa bật — bấm phím 1–4)');
      return;
    }
    this.hud.setListening(true, '');
    // Never begin a new session while the previous one is still finishing.
    void this.engineIdle.then(() => {
      if (tok === this.token && this.state.phase === 'channeling') this.startListening(tok);
    });
  }

  /** Cast button released. */
  release(): void {
    const r = this.state.release();
    if (r === 'awaiting') {
      this.releasedAt = performance.now();
      this.hud.setListening(true, this.lastHeard ? `${this.lastHeard}…` : '…');
      if (this.finalizing) return; // the pending result will resolve it
      if (this.listening) void this.finalize(this.token);
      else this.state.resolveFailed();
    } else if (r === 'tap') {
      this.stopListening();
    }
  }

  /** Fallback keys 1–4: stand in for the voice while the cast button is held. */
  hotkey(n: number): void {
    if (this.state.phase !== 'channeling' && this.state.phase !== 'resolving') return;
    const cmd = this.commands.find((c) => c.classId === this.classId && c.hotkey === n);
    if (!cmd) return;
    this.stopListening();
    const empowered = this.state.empowerWindowOpen;
    if (this.state.recognize(cmd.id)) this.report('hotkey', cmd.phrases[0]!, cmd.id, 'spell', empowered, null, null);
  }

  /** Focus lost, pointer unlocked, etc. */
  cancel(): void {
    this.state.cancel();
    this.stopListening();
  }

  update(dt: number, wantsSprint: boolean): void {
    this.state.update(dt, wantsSprint);
    for (const e of this.state.drainEvents()) {
      switch (e.type) {
        case 'channel-start':
          this.arms.startChannel();
          break;
        case 'channel-refused':
          if (e.reason === 'no-mana') {
            this.hud.flash('Không đủ mana', '#6fc3ff');
            this.hud.flashBar('mana');
          }
          break;
        case 'charged':
          this.stopListening();
          this.arms.hold(spellColor(e.commandId), e.empowered);
          this.hud.setCharged(this.phrase(e.commandId), e.empowered);
          break;
        case 'fired': {
          this.stopListening();
          const aim = this.effects.aimPoint(this.camera);
          this.effects.cast(e.commandId, aim, e.empowered ? CASTING.empowerScale : 1);
          this.arms.release(true, spellColor(e.commandId));
          this.hud.setCharged(null);
          break;
        }
        case 'fizzle':
          if (e.reason === 'no-mana') this.report(this.voice?.engine.id ?? 'hotkey', this.lastHeard, null, 'no-mana', false, null, null);
          this.stopListening();
          this.arms.release(false);
          this.effects.fizzle(this.camera);
          this.hud.setCharged(null);
          this.hud.flash(FIZZLE_TEXT[e.reason] ?? 'Niệm hỏng', e.reason === 'exhausted' ? '#ffb347' : '#aaaaaa');
          if (e.reason === 'exhausted') this.hud.flashBar('stamina');
          if (e.reason === 'no-mana') this.hud.flashBar('mana');
          break;
        case 'tap-cancelled':
          this.stopListening();
          this.arms.release(false);
          break;
        case 'awaiting-result':
          break;
      }
    }

    // Aim ring follows the crosshair while casting; gold and bigger for an empowered spell.
    const s = this.state;
    if (s.phase === 'idle') {
      this.effects.showAimRing(null);
    } else {
      const emp = s.phase === 'charged' && s.charged?.empowered === true;
      this.effects.showAimRing(this.effects.aimPoint(this.camera), emp ? CASTING.empowerScale : 1, emp ? 0xffd75a : 0xfff1a8);
    }
    const lowFrac = CASTING.staminaLowWarning * s.maxStamina;
    this.arms.setShake(s.phase === 'charged' && s.stamina < lowFrac ? 1 - s.stamina / lowFrac : 0);
  }

  // --- Voice session -----------------------------------------------------------

  private startListening(tok: number): void {
    const voice = this.voice;
    if (!voice) return;
    this.listening = true;
    voice.engine.onPartial = (text) => {
      if (tok !== this.token || !this.listening) return;
      if (text) this.lastHeard = text; // a fresh session starts with "", keep what was heard before
      this.hud.setListening(true, text || this.lastHeard);
      if (this.state.phase === 'channeling' && this.match(text)) void this.finalize(tok);
    };
    voice.engine.begin();
    voice.startAudio();
  }

  /** Ends the current utterance and acts on the final transcript. */
  private async finalize(tok: number): Promise<void> {
    const voice = this.voice;
    if (!voice || this.finalizing) return;
    this.finalizing = true;
    this.listening = false;
    let done!: () => void;
    this.engineIdle = new Promise((r) => (done = r));
    let outcome: RecognitionOutcome;
    try {
      await voice.stopAudio();
      outcome = await voice.engine.end();
    } finally {
      this.finalizing = false;
      done();
    }
    if (tok !== this.token) return; // the cast ended meanwhile (fizzle, cancel…)

    const now = performance.now();
    const text = outcome.text;
    if (text) this.lastHeard = text;
    const m = this.match(text) ?? outcome.alternatives.map((a) => this.match(a)).find((x) => x !== null) ?? null;
    const phase = this.state.phase;
    if (m && (phase === 'channeling' || phase === 'resolving')) {
      const fromRelease = phase === 'resolving';
      const spokeAt = voice.lastVoiceAt();
      const latency = fromRelease ? now - this.releasedAt : spokeAt > this.channelStart ? now - spokeAt : null;
      const empowered = this.state.empowerWindowOpen;
      this.state.recognize(m.command.id);
      this.hud.subtitle(text, m.command.phrases[0]!);
      this.report(voice.engine.id, text, m.command.id, 'spell', empowered, latency, fromRelease ? 'release' : latency === null ? null : 'speech-end');
    } else if (phase === 'channeling') {
      // Partial looked like a spell but the final text disagrees: keep listening.
      if (text) this.hud.subtitle(text, null);
      void this.engineIdle.then(() => {
        if (tok === this.token && this.state.phase === 'channeling') this.startListening(tok);
      });
    } else if (phase === 'resolving') {
      this.hud.subtitle(text, null);
      this.report(voice.engine.id, text, null, 'misheard', false, now - this.releasedAt, 'release');
      this.state.resolveFailed();
    }
  }

  /** Stops listening and discards whatever the engine is still processing. */
  private stopListening(): void {
    this.hud.setListening(false);
    if (!this.listening) return;
    this.listening = false;
    this.token++;
    const voice = this.voice;
    if (!voice || this.finalizing) return;
    this.finalizing = true;
    this.engineIdle = (async () => {
      try {
        await voice.stopAudio();
        await voice.engine.end();
      } finally {
        this.finalizing = false;
      }
    })();
  }

  private match(text: string): CommandMatch | null {
    return text ? matchCommand(text, this.commands) : null;
  }

  private phrase(id: string): string {
    return getCommand(id)?.phrases[0] ?? id;
  }

  private report(
    source: CastAttempt['source'],
    heard: string,
    matched: string | null,
    result: CastAttempt['result'],
    empowered: boolean,
    latencyMs: number | null,
    latencyFrom: CastAttempt['latencyFrom'],
  ): void {
    this.onAttempt({
      source,
      heard,
      matched,
      result,
      empowered,
      latencyMs: latencyMs === null ? null : Math.round(latencyMs),
      latencyFrom,
      channelMs: Math.round(performance.now() - this.channelStart),
    });
  }
}
