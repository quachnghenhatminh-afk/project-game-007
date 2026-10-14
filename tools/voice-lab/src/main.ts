import {
  CLASS_NAMES,
  COMMANDS,
  PlayerState,
  buildVoskGrammar,
  commandsForClass,
  compareToPhrase,
  getCommand,
  type VoiceCommand,
} from '@game/shared';
import { createWorld } from '@game/client/render/world';
import { buildCitadel } from '@game/client/render/citadel';
import { buildNightEnvironment } from '@game/client/render/environment';
import { FpArms } from '@game/client/render/fpArms';
import { FpsController } from '@game/client/input/fpsController';
import { SpellEffects } from '@game/client/game/spellEffects';
import { SpellCaster, type CastAttempt, type VoiceInput } from '@game/client/game/spellCaster';
import { Hud } from '@game/client/ui/hud';
import { MicInput } from '@game/client/voice/micInput';
import { VoskEngine, clearVoskCache, loadVoskModel } from '@game/client/voice/voskEngine';
import { WebSpeechEngine, isWebSpeechSupported } from '@game/client/voice/webSpeechEngine';
import type { VoiceEngineId } from '@game/client/voice/types';
import { CRITERIA, loadAttempts, saveAttempts, summarize, type Attempt } from './stats.ts';

const MODEL_URL = 'voice/vosk-model-small-vn-0.4.tar.gz';
/** Mic RMS above this counts as "speaking" (used to time speech-end → spell). */
const VOICE_RMS = 0.02;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// 3D scene + game systems
// ---------------------------------------------------------------------------
const world = createWorld($('view'));
const env = buildNightEnvironment(world.scene, world.fpScene);
const citadel = buildCitadel(world.scene);
const player = new FpsController(world.camera, world.renderer.domElement, citadel.colliders);
const effects = new SpellEffects(world.scene);
const arms = new FpArms(world.fpScene);
const state = new PlayerState();
const hud = new Hud($('stage'), state);
const caster = new SpellCaster(state, arms, effects, hud, world.camera);
player.sprintAllowed = () => state.canSprint;
let fogHintAt = 0;
player.onBlockedByFog = () => {
  if (performance.now() - fogHintAt > 4000) hud.flash('Sương mù quá dày, không thể đi tiếp', '#b8c6e0');
  fogHintAt = performance.now();
};

const canvas = world.renderer.domElement;
canvas.addEventListener('click', () => player.lock());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
player.controls.addEventListener('lock', () => $('lock-hint').classList.add('hidden'));
player.controls.addEventListener('unlock', () => $('lock-hint').classList.remove('hidden'));

world.onUpdate((dt, time) => {
  player.update(dt);
  caster.update(dt, player.wantsSprint);
  env.update(dt, time, world.camera);
  citadel.update(dt, time);
  effects.update(dt);
  arms.update(dt, time, world.camera, player.speed);
  hud.update();
});
world.start();
if (import.meta.env.DEV) Object.assign(window, { __world: world, __caster: caster, __state: state, __arms: arms }); // debug hooks

// ---------------------------------------------------------------------------
// Cast input: hold right mouse (or V), keys 1–5 replace the voice
// ---------------------------------------------------------------------------
function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) caster.press();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) caster.release();
});
window.addEventListener('keydown', (e) => {
  if (isTyping(e) || e.repeat) return;
  if (e.code === 'KeyV') {
    e.preventDefault();
    caster.press();
  } else if (/^Digit[1-5]$/.test(e.code)) {
    caster.hotkey(Number(e.code.slice(5)));
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyV') caster.release();
});
window.addEventListener('blur', () => caster.cancel());

// ---------------------------------------------------------------------------
// Voice setup: mic + engine → caster.voice
// ---------------------------------------------------------------------------
let mic: MicInput | null = null;
let vosk: VoskEngine | null = null;
let voskModel: Awaited<ReturnType<typeof loadVoskModel>> | null = null;
const webSpeech = new WebSpeechEngine();
let engineId: VoiceEngineId = 'vosk';
let lastVoiceAt = 0;

const grammarEnabled = () => $<HTMLInputElement>('opt-grammar').checked;

function refreshVoice(): void {
  let voice: VoiceInput | null = null;
  if (engineId === 'vosk' && mic && vosk) {
    const m = mic;
    voice = { engine: vosk, startAudio: () => m.startCapture(), stopAudio: () => m.stopCapture(), lastVoiceAt: () => lastVoiceAt };
  } else if (engineId === 'webspeech' && isWebSpeechSupported()) {
    voice = { engine: webSpeech, startAudio: () => {}, stopAudio: () => Promise.resolve(), lastVoiceAt: () => lastVoiceAt };
  }
  caster.voice = voice;
}

function rebuildVosk(): void {
  if (!voskModel || !mic) return;
  vosk = new VoskEngine(voskModel, mic.sampleRate, grammarEnabled() ? buildVoskGrammar(COMMANDS) : null);
  refreshVoice();
}

function renderDiagnostics(): void {
  const inIframe = window.self !== window.top;
  const policy = (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy;
  const micPolicy = policy ? (policy.allowsFeature('microphone') ? 'cho phép' : 'BỊ CHẶN') : 'không rõ';
  $('diag').textContent = [
    `Trong iframe: ${inIframe ? 'có' : 'không'}`,
    `HTTPS: ${window.isSecureContext ? 'có' : 'KHÔNG'}`,
    `Chính sách micro: ${micPolicy}`,
    `AudioWorklet: ${'AudioWorkletNode' in window ? 'có' : 'KHÔNG'}`,
    `Web Speech: ${isWebSpeechSupported() ? 'có' : 'không'}`,
  ].join(' · ');
}
renderDiagnostics();

async function openMic(deviceId?: string): Promise<void> {
  mic?.close();
  mic = null;
  refreshVoice();
  $('mic-status').textContent = 'Đang xin quyền micro…';
  try {
    mic = await MicInput.open(deviceId);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : String(err);
    $('mic-status').innerHTML =
      name === 'NotAllowedError'
        ? '<span class="bad">Micro bị từ chối.</span> Hãy cho phép micro trong thanh địa chỉ trình duyệt. Nếu đang trong iframe itch.io, có thể itch.io chặn micro.'
        : `<span class="bad">Không mở được micro:</span> ${escapeHtml(name)}`;
    return;
  }
  mic.onChunk = (s) => vosk?.feed(s);
  mic.onLevel = (rms) => {
    $('mic-level').style.width = `${Math.min(100, rms * 400)}%`;
    if (rms > VOICE_RMS) lastVoiceAt = performance.now();
  };
  $('mic-status').innerHTML = `<span class="good">Micro đã bật:</span> ${escapeHtml(mic.label || 'mặc định')} (${mic.sampleRate} Hz)`;
  $<HTMLButtonElement>('btn-mic').textContent = 'Mở lại micro';
  rebuildVosk();
  refreshVoice();
  await fillDeviceList();
}

async function fillDeviceList(): Promise<void> {
  const sel = $<HTMLSelectElement>('mic-device');
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const current = sel.value;
  sel.innerHTML = devices.map((d) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Micro')}</option>`).join('');
  if (current) sel.value = current;
  sel.classList.toggle('hidden', devices.length < 2);
}

$('btn-mic').addEventListener('click', () => void openMic($<HTMLSelectElement>('mic-device').value || undefined));
$('mic-device').addEventListener('change', (e) => void openMic((e.target as HTMLSelectElement).value));

$('btn-model').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('btn-model');
  btn.disabled = true;
  const t0 = performance.now();
  try {
    voskModel = await loadVoskModel(MODEL_URL, (stage, f) => {
      if (stage === 'download') {
        $('model-bar').style.width = `${Math.round((f ?? 0) * 100)}%`;
        $('model-status').textContent = f === null ? 'Đang tải…' : `Đang tải… ${Math.round(f * 100)}%`;
      } else {
        $('model-bar').style.width = '100%';
        $('model-status').textContent = 'Đang khởi tạo model (giải nén lần đầu có thể mất vài giây)…';
      }
    });
    $('model-status').innerHTML = `<span class="good">Model sẵn sàng</span> (${((performance.now() - t0) / 1000).toFixed(1)}s)`;
    btn.textContent = 'Model đã tải';
    rebuildVosk();
    if (!mic) $('model-status').innerHTML += ' — hãy bấm "Cho phép micro".';
  } catch (err) {
    $('model-status').innerHTML = `<span class="bad">Lỗi tải model:</span> ${escapeHtml(String(err))}`;
    btn.disabled = false;
  }
});

$('opt-grammar').addEventListener('change', () => vosk?.setGrammar(grammarEnabled() ? buildVoskGrammar(COMMANDS) : null));
$('btn-clear-cache').addEventListener('click', async (e) => {
  e.preventDefault();
  await clearVoskCache();
  $('model-status').textContent = 'Đã xóa cache. Tải lại trang để thử tải model lần đầu.';
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="engine"]')) {
  radio.addEventListener('change', () => {
    caster.cancel();
    engineId = radio.value as VoiceEngineId;
    $('vosk-box').classList.toggle('hidden', engineId !== 'vosk');
    $('webspeech-status').textContent =
      engineId === 'webspeech'
        ? isWebSpeechSupported()
          ? 'Web Speech gửi âm thanh lên máy chủ của Google/Microsoft, cần Internet. Không giới hạn câu lệnh.'
          : 'Trình duyệt này KHÔNG hỗ trợ Web Speech API (Firefox không có).'
        : '';
    refreshVoice();
    renderStats();
  });
}

// ---------------------------------------------------------------------------
// Spell list + optional guided practice
// ---------------------------------------------------------------------------
$('spell-list').innerHTML = (Object.keys(CLASS_NAMES) as Array<keyof typeof CLASS_NAMES>)
  .map((cls) => {
    const list = commandsForClass(cls, false)
      .map((c) => `<b>${c.phrases[0]}</b>${c.hotkey && cls === 'mage' ? ` <kbd>${c.hotkey}</kbd>` : ''}`)
      .join(' · ');
    return `<div><span class="muted">${CLASS_NAMES[cls]}:</span> ${list}</div>`;
  })
  .join('');

let target: VoiceCommand | null = null;
let deck: VoiceCommand[] = [];
const guided = () => $<HTMLInputElement>('opt-guided').checked;
const testSet = (): VoiceCommand[] => {
  const v = $<HTMLSelectElement>('opt-set').value;
  if (v === 'mage') return commandsForClass('mage', false);
  if (v === 'mage+common') return commandsForClass('mage', true);
  return [...COMMANDS];
};
function nextTarget(): void {
  $('guided-box').classList.toggle('hidden', !guided());
  if (!guided()) {
    target = null;
  } else {
    if (deck.length === 0) deck = shuffle(testSet());
    target = deck.pop() ?? null;
  }
  $('target-text').textContent = target?.phrases[0] ?? '—';
  $('hud-target').textContent = target ? `Hãy đọc: ${target.phrases[0]!.toUpperCase()}` : '';
}
function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}
$('btn-skip').addEventListener('click', nextTarget);
$('opt-set').addEventListener('change', () => {
  deck = [];
  nextTarget();
});
$('opt-guided').addEventListener('change', nextTarget);
nextTarget();

// ---------------------------------------------------------------------------
// Recording attempts
// ---------------------------------------------------------------------------
let attempts: Attempt[] = loadAttempts();

caster.onAttempt = (a: CastAttempt) => {
  const attempt: Attempt = {
    ...a,
    at: Date.now(),
    grammar: a.source === 'vosk' && grammarEnabled(),
    target: target?.id ?? null,
    correct: target ? a.matched === target.id : null,
  };
  attempts.push(attempt);
  saveAttempts(attempts);
  console.log('[voice]', attempt);
  if (target) showComparison(a.heard, target);
  renderLast(attempt);
  renderStats();
  if (target) nextTarget();
};

let heardTimer = 0;
/** Guided mode: target phrase with each syllable green (heard) or red (missed). */
function showComparison(heard: string, expected: VoiceCommand): void {
  const syl = compareToPhrase(heard, expected.phrases[0]!)
    .map((s) => `<span class="syl ${s.ok ? 'ok' : 'miss'}">${escapeHtml(s.word)}</span>`)
    .join('');
  const el = $('hud-heard');
  el.innerHTML = `<div class="row muted">Câu mẫu</div><div>${syl}</div>`;
  el.classList.add('show');
  clearTimeout(heardTimer);
  heardTimer = window.setTimeout(() => el.classList.remove('show'), 2000);
}

function phraseOf(id: string | null): string {
  return id ? (getCommand(id)?.phrases[0] ?? id) : '—';
}

function renderLast(a: Attempt): void {
  const verdict = a.correct === null ? '' : a.correct ? ' <span class="good">ĐÚNG</span>' : ' <span class="bad">SAI</span>';
  const result =
    a.result === 'spell'
      ? `<b>${phraseOf(a.matched)}</b>${a.empowered ? ' <span class="gold">✦ cường hóa</span>' : ''}`
      : `<span class="bad">${a.result === 'no-mana' ? 'hết mana' : 'không khớp'}</span>`;
  const lat = a.latencyMs === null ? '—' : `${a.latencyMs} ms (${a.latencyFrom === 'release' ? 'từ lúc thả chuột' : 'từ lúc ngừng nói'})`;
  $('last').innerHTML = `
    Nghe được: <b>${escapeHtml(a.heard || '(không có gì)')}</b><br>
    Kết quả: ${result}${verdict}<br>
    Độ trễ: <b>${lat}</b> · niệm mất ${a.channelMs} ms · nguồn: ${a.source}`;
}

function renderStats(): void {
  const mine = attempts.filter((a) => a.source === engineId);
  const s = summarize(mine);
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);
  const fmt = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`);
  const ok = (pass: boolean | null) => (pass === null ? '' : pass ? ' <span class="good">✔</span>' : ' <span class="bad">✘</span>');
  $('summary').innerHTML = `
    <div class="small muted">Bộ nhận diện: ${engineId === 'vosk' ? 'Vosk' : 'Web Speech'}</div>
    <table>
      <tr><th>Số lần niệm</th><td>${s.attempts}${s.attempts < CRITERIA.minAttempts ? ` <span class="muted">(nên ≥ ${CRITERIA.minAttempts})</span>` : ''}</td></tr>
      <tr><th>Ra được phép</th><td>${pct(s.matchRate)}</td></tr>
      <tr><th>Cường hóa ✦</th><td>${pct(s.empoweredRate)} <span class="muted">số phép ra được</span></td></tr>
      <tr><th>Đúng câu mẫu</th><td>${s.scored ? `${pct(s.accuracy)} (${s.correct}/${s.scored})${ok(s.accuracy === null ? null : s.accuracy >= CRITERIA.accuracy)}` : '<span class="muted">bật "Luyện theo câu mẫu"</span>'}</td></tr>
      <tr><th>Độ trễ TB</th><td>${fmt(s.avgMs)}${ok(s.avgMs === null ? null : s.avgMs < CRITERIA.avgMs)} <span class="muted">cần < 500</span></td></tr>
      <tr><th>Độ trễ p95</th><td>${fmt(s.p95Ms)}${ok(s.p95Ms === null ? null : s.p95Ms < CRITERIA.p95Ms)} <span class="muted">cần < 800</span></td></tr>
    </table>`;

  const rows = COMMANDS.map((c) => {
    const list = mine.filter((a) => a.matched === c.id || a.target === c.id);
    if (!list.length) return '';
    const cs = summarize(list);
    const wrong = mostCommon(list.filter((a) => a.target === c.id && !a.correct).map((a) => a.heard || '∅'));
    return `<tr><td>${c.phrases[0]}</td><td>${list.filter((a) => a.matched === c.id).length}</td><td>${pct(cs.empoweredRate)}</td><td>${fmt(cs.avgMs)}</td><td>${escapeHtml(wrong ?? '')}</td></tr>`;
  }).join('');
  $('per-command').innerHTML = rows
    ? `<table><tr><th>Câu</th><th>Ra phép</th><th>✦</th><th>Trễ TB</th><th>Hay nghe nhầm</th></tr>${rows}</table>`
    : '<div class="small muted">Chưa có dữ liệu.</div>';
  $<HTMLTextAreaElement>('export').value = buildExport();
}

function buildExport(): string {
  const byEngine = (['vosk', 'webspeech', 'hotkey'] as const).map((id) => ({ source: id, ...summarize(attempts.filter((a) => a.source === id)) }));
  const recent = attempts.slice(-60).map((a) => ({
    s: a.source,
    heard: a.heard,
    got: a.matched,
    want: a.target,
    emp: a.empowered,
    ms: a.latencyMs,
    from: a.latencyFrom,
  }));
  return JSON.stringify({ env: { ua: navigator.userAgent, iframe: window.self !== window.top, host: location.hostname }, byEngine, recent }, null, 1);
}

function mostCommon(list: string[]): string | null {
  const counts = new Map<string, number>();
  for (const s of list) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [s, c] of counts) if (c > n) [best, n] = [s, c];
  return best;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

$('btn-copy').addEventListener('click', async () => {
  const ta = $<HTMLTextAreaElement>('export');
  ta.value = buildExport();
  try {
    await navigator.clipboard.writeText(ta.value);
  } catch {
    ta.select();
    document.execCommand('copy');
  }
  $<HTMLButtonElement>('btn-copy').textContent = 'Đã sao chép ✔';
  setTimeout(() => ($<HTMLButtonElement>('btn-copy').textContent = 'Sao chép kết quả'), 1500);
});

$('btn-undo').addEventListener('click', () => {
  attempts.pop();
  saveAttempts(attempts);
  $('last').textContent = 'Đã bỏ lần niệm gần nhất.';
  renderStats();
});

$('btn-reset').addEventListener('click', () => {
  if (!confirm('Xóa toàn bộ thống kê?')) return;
  attempts = [];
  saveAttempts(attempts);
  renderStats();
});

renderStats();
