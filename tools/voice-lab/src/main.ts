import type * as THREE from 'three';
import {
  COMMANDS,
  buildVoskGrammar,
  commandsForClass,
  compareToPhrase,
  getCommand,
  matchCommand,
  type VoiceCommand,
} from '@game/shared';
import { createWorld } from '@game/client/render/world';
import { buildCitadel } from '@game/client/render/citadel';
import { FpsController } from '@game/client/input/fpsController';
import { SpellEffects } from '@game/client/game/spellEffects';
import { MicInput } from '@game/client/voice/micInput';
import { VoskEngine, clearVoskCache, loadVoskModel } from '@game/client/voice/voskEngine';
import { WebSpeechEngine, isWebSpeechSupported } from '@game/client/voice/webSpeechEngine';
import type { RecognitionOutcome, VoiceEngineId } from '@game/client/voice/types';
import { CRITERIA, loadAttempts, saveAttempts, summarize, type Attempt } from './stats.ts';

const MODEL_URL = 'voice/vosk-model-small-vn-0.4.tar.gz';
const MIN_HOLD_MS = 150; // shorter presses are treated as accidental taps

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// 3D scene
// ---------------------------------------------------------------------------
const world = createWorld($('view'));
const citadel = buildCitadel(world.scene);
const player = new FpsController(world.camera, world.renderer.domElement);
const effects = new SpellEffects(world.scene);
world.renderer.domElement.addEventListener('click', () => player.lock());
player.controls.addEventListener('lock', () => $('lock-hint').classList.add('hidden'));
player.controls.addEventListener('unlock', () => $('lock-hint').classList.remove('hidden'));
world.onUpdate((dt, time) => {
  player.update(dt);
  citadel.update(dt, time);
  effects.update(dt);
});
world.start();
if (import.meta.env.DEV) Object.assign(window, { __world: world, __showHeard: showHeard }); // debug hooks for automated checks

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mic: MicInput | null = null;
let vosk: VoskEngine | null = null;
const webSpeech = new WebSpeechEngine();
let engineId: VoiceEngineId = 'vosk';
let holding = false;
let busy = false;
let holdStart = 0;
let aim: THREE.Vector3 | null = null;
let target: VoiceCommand | null = null;
let deck: VoiceCommand[] = [];
let attempts: Attempt[] = loadAttempts();

const grammarEnabled = () => $<HTMLInputElement>('opt-grammar').checked;
const freeMode = () => $<HTMLInputElement>('opt-free').checked;
const testSet = (): VoiceCommand[] => {
  const v = $<HTMLSelectElement>('opt-set').value;
  if (v === 'mage') return commandsForClass('mage', false);
  if (v === 'mage+common') return commandsForClass('mage', true);
  return [...COMMANDS];
};
const grammarFor = () => buildVoskGrammar(COMMANDS);

// ---------------------------------------------------------------------------
// Diagnostics (helps when testing inside the itch.io iframe)
// ---------------------------------------------------------------------------
function renderDiagnostics(): void {
  const inIframe = window.self !== window.top;
  const policy = (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy;
  const micPolicy = policy ? (policy.allowsFeature('microphone') ? 'cho phép' : 'BỊ CHẶN') : 'không rõ';
  const items = [
    `Trong iframe: ${inIframe ? 'có' : 'không'}`,
    `HTTPS: ${window.isSecureContext ? 'có' : 'KHÔNG'}`,
    `Chính sách micro: ${micPolicy}`,
    `AudioWorklet: ${'AudioWorkletNode' in window ? 'có' : 'KHÔNG'}`,
    `Web Speech: ${isWebSpeechSupported() ? 'có' : 'không'}`,
  ];
  $('diag').textContent = items.join(' · ');
}
renderDiagnostics();

// ---------------------------------------------------------------------------
// Microphone
// ---------------------------------------------------------------------------
async function openMic(deviceId?: string): Promise<void> {
  mic?.close();
  mic = null;
  $('mic-status').textContent = 'Đang xin quyền micro…';
  try {
    mic = await MicInput.open(deviceId);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : String(err);
    $('mic-status').innerHTML =
      name === 'NotAllowedError'
        ? '<span class="bad">Micro bị từ chối.</span> Hãy cho phép micro trong thanh địa chỉ trình duyệt. Nếu đang trong iframe itch.io, có thể itch.io chặn micro.'
        : `<span class="bad">Không mở được micro:</span> ${name}`;
    return;
  }
  mic.onChunk = (s) => vosk?.feed(s);
  mic.onLevel = (rms) => {
    $('mic-level').style.width = `${Math.min(100, rms * 400)}%`;
  };
  $('mic-status').innerHTML = `<span class="good">Micro đã bật:</span> ${mic.label || 'mặc định'} (${mic.sampleRate} Hz)`;
  $<HTMLButtonElement>('btn-mic').textContent = 'Mở lại micro';
  if (vosk) rebuildVosk();
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

// ---------------------------------------------------------------------------
// Vosk model
// ---------------------------------------------------------------------------
let voskModel: Awaited<ReturnType<typeof loadVoskModel>> | null = null;

function rebuildVosk(): void {
  if (!voskModel || !mic) return;
  vosk = new VoskEngine(voskModel, mic.sampleRate, grammarEnabled() ? grammarFor() : null);
  vosk.onPartial = showLive;
}

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
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $('model-status').innerHTML = `<span class="good">Model sẵn sàng</span> (${secs}s)`;
    btn.textContent = 'Model đã tải';
    rebuildVosk();
    if (!mic) $('model-status').innerHTML += ' — hãy bấm "Cho phép micro".';
  } catch (err) {
    $('model-status').innerHTML = `<span class="bad">Lỗi tải model:</span> ${String(err)}`;
    btn.disabled = false;
  }
});

$('opt-grammar').addEventListener('change', () => vosk?.setGrammar(grammarEnabled() ? grammarFor() : null));

$('btn-clear-cache').addEventListener('click', async (e) => {
  e.preventDefault();
  await clearVoskCache();
  $('model-status').textContent = 'Đã xóa cache. Tải lại trang để thử tải model lần đầu.';
});

// ---------------------------------------------------------------------------
// Engine selection
// ---------------------------------------------------------------------------
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="engine"]')) {
  radio.addEventListener('change', () => {
    engineId = radio.value as VoiceEngineId;
    $('vosk-box').classList.toggle('hidden', engineId !== 'vosk');
    $('webspeech-status').textContent =
      engineId === 'webspeech'
        ? isWebSpeechSupported()
          ? 'Web Speech gửi âm thanh lên máy chủ của Google/Microsoft, cần Internet. Không giới hạn câu lệnh.'
          : 'Trình duyệt này KHÔNG hỗ trợ Web Speech API (Firefox không có).'
        : '';
    renderStats();
  });
}

// ---------------------------------------------------------------------------
// Target phrases (shuffled deck so every command gets tested evenly)
// ---------------------------------------------------------------------------
function nextTarget(): void {
  if (freeMode()) {
    target = null;
  } else {
    if (deck.length === 0) deck = shuffle(testSet());
    target = deck.pop() ?? null;
  }
  $('target-text').textContent = target ? target.phrases[0]! : '(tự do)';
  $('hud-target').textContent = target ? `Hãy hô: ${target.phrases[0]!.toUpperCase()}` : '';
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
$('opt-free').addEventListener('change', nextTarget);
nextTarget();

// ---------------------------------------------------------------------------
// Push-to-talk on [V]
// ---------------------------------------------------------------------------
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyV' || e.repeat || isTyping(e)) return;
  e.preventDefault();
  if (holding || busy) return;
  if (engineId === 'vosk' && (!mic || !vosk)) {
    flashResult(!mic ? 'Chưa bật micro' : 'Chưa tải model', '#ffb347');
    return;
  }
  if (engineId === 'webspeech' && !isWebSpeechSupported()) {
    flashResult('Không hỗ trợ Web Speech', '#ffb347');
    return;
  }
  holding = true;
  holdStart = performance.now();
  aim = effects.aimPoint(world.camera); // aim is locked when the key goes down
  effects.showAimRing(aim);
  $('hud-live').textContent = '';
  $('hud-heard').classList.remove('show');
  $('hud-rec').classList.remove('hidden');
  if (engineId === 'vosk') {
    vosk!.begin();
    mic!.startCapture();
  } else {
    webSpeech.begin();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyV') void release();
});
window.addEventListener('blur', () => void release());

async function release(): Promise<void> {
  if (!holding) return;
  holding = false;
  busy = true;
  const releasedAt = performance.now();
  const holdMs = releasedAt - holdStart;
  $('hud-rec').classList.add('hidden');

  let outcome: RecognitionOutcome;
  if (engineId === 'vosk') {
    await mic!.stopCapture();
    outcome = await vosk!.end();
  } else {
    outcome = await webSpeech.end();
  }
  const latencyMs = Math.round(performance.now() - releasedAt);
  effects.showAimRing(null);
  busy = false;

  if (holdMs < MIN_HOLD_MS && !outcome.text) return;
  const spokenTarget = target;

  const match =
    matchCommand(outcome.text, COMMANDS) ??
    outcome.alternatives.map((alt) => matchCommand(alt, COMMANDS)).find((m) => m !== null) ??
    null;
  const attempt: Attempt = {
    at: Date.now(),
    engine: engineId,
    grammar: engineId === 'vosk' && grammarEnabled(),
    target: target?.id ?? null,
    heard: outcome.text,
    matched: match?.command.id ?? null,
    correct: target ? match?.command.id === target.id : null,
    latencyMs,
    holdMs: Math.round(holdMs),
  };
  attempts.push(attempt);
  saveAttempts(attempts);
  console.log('[voice]', { ...attempt, alternatives: outcome.alternatives, error: outcome.error });

  if (match && aim) {
    effects.cast(match.command.id, aim);
    flashResult(match.command.phrases[0]!, attempt.correct === false ? '#ffb347' : '#ffffff');
  } else {
    effects.fizzle(world.camera);
    flashResult('Niệm hỏng', '#aaaaaa');
  }
  showHeard(outcome.text, spokenTarget, match?.command ?? null);
  renderLast(attempt, outcome.error);
  renderStats();
  nextTarget();
}

// ---------------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------------
let flashTimer = 0;
function flashResult(text: string, color: string): void {
  const el = $('hud-result');
  el.textContent = text;
  el.style.color = color;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.classList.remove('show'), 900);
}

/** Live transcript under the crosshair while [V] is held. */
function showLive(text: string): void {
  if (holding) $('hud-live').textContent = text;
}
webSpeech.onPartial = showLive;

/**
 * Pronunciation feedback after release: the expected phrase with each syllable
 * green (heard) or red (missed/wrong tone), plus what the recognizer heard.
 */
let heardTimer = 0;
function showHeard(heard: string, expected: VoiceCommand | null, matched: VoiceCommand | null): void {
  const phrase = expected?.phrases[0] ?? matched?.phrases[0] ?? null;
  const syllables = phrase
    ? compareToPhrase(heard, phrase)
        .map((s) => `<span class="syl ${s.ok ? 'ok' : 'miss'}">${escapeHtml(s.word)}</span>`)
        .join('')
    : '<span class="syl miss">?</span>';
  const label = expected ? 'Câu cần hô' : matched ? 'Khớp lệnh' : 'Không khớp lệnh nào';
  const el = $('hud-heard');
  el.innerHTML = `
    <div class="row muted">${label}</div>
    <div>${syllables}</div>
    <div class="row">Máy nghe được: <b>${escapeHtml(heard || '(không nghe thấy gì)')}</b></div>`;
  el.classList.add('show');
  clearTimeout(heardTimer);
  heardTimer = window.setTimeout(() => el.classList.remove('show'), 2500);
}

function phraseOf(id: string | null): string {
  return id ? (getCommand(id)?.phrases[0] ?? id) : '—';
}

function renderLast(a: Attempt, error?: string): void {
  const verdict = a.correct === null ? '' : a.correct ? '<span class="good">ĐÚNG</span>' : '<span class="bad">SAI</span>';
  $('last').innerHTML = `
    Nghe được: <b>${escapeHtml(a.heard || '(không có gì)')}</b><br>
    Khớp lệnh: <b>${phraseOf(a.matched)}</b> ${verdict}<br>
    Độ trễ: <b>${a.latencyMs} ms</b> · giữ phím ${a.holdMs} ms
    ${error ? `<br><span class="bad">Lỗi: ${escapeHtml(error)}</span>` : ''}`;
}

function renderStats(): void {
  const mine = attempts.filter((a) => a.engine === engineId);
  const s = summarize(mine);
  const fmt = (v: number | null, unit = '') => (v === null ? '—' : `${Math.round(v)}${unit}`);
  const ok = (pass: boolean | null) => (pass === null ? '' : pass ? ' <span class="good">✔</span>' : ' <span class="bad">✘</span>');
  const acc = s.accuracy === null ? null : s.accuracy * 100;
  $('summary').innerHTML = `
    <div class="small muted">Bộ nhận diện: ${engineId === 'vosk' ? 'Vosk' : 'Web Speech'}</div>
    <table>
      <tr><th>Số lần thử</th><td>${s.attempts}${s.attempts < CRITERIA.minAttempts ? ` <span class="muted">(nên ≥ ${CRITERIA.minAttempts})</span>` : ''}</td></tr>
      <tr><th>Tỉ lệ đúng</th><td>${acc === null ? '—' : acc.toFixed(1) + '%'} (${s.correct}/${s.scored})${ok(acc === null ? null : acc / 100 >= CRITERIA.accuracy)} <span class="muted">cần > 90%</span></td></tr>
      <tr><th>Độ trễ TB</th><td>${fmt(s.avgMs, ' ms')}${ok(s.avgMs === null ? null : s.avgMs < CRITERIA.avgMs)} <span class="muted">cần < 500</span></td></tr>
      <tr><th>Độ trễ p95</th><td>${fmt(s.p95Ms, ' ms')}${ok(s.p95Ms === null ? null : s.p95Ms < CRITERIA.p95Ms)} <span class="muted">cần < 800</span></td></tr>
    </table>`;

  const rows = COMMANDS.map((c) => {
    const list = mine.filter((a) => a.target === c.id);
    if (!list.length) return '';
    const cs = summarize(list);
    const wrong = list.filter((a) => !a.correct).map((a) => a.heard || '∅');
    const common = mostCommon(wrong);
    return `<tr><td>${c.phrases[0]}</td><td>${cs.attempts}</td><td>${cs.accuracy === null ? '—' : Math.round(cs.accuracy * 100) + '%'}</td><td>${fmt(cs.avgMs)}</td><td>${escapeHtml(common ?? '')}</td></tr>`;
  }).join('');
  $('per-command').innerHTML = rows
    ? `<table><tr><th>Câu</th><th>Thử</th><th>Đúng</th><th>ms</th><th>Hay nghe nhầm</th></tr>${rows}</table>`
    : '<div class="small muted">Chưa có dữ liệu.</div>';

  $<HTMLTextAreaElement>('export').value = buildExport();
}

function buildExport(): string {
  const byEngine = (['vosk', 'webspeech'] as const).map((id) => {
    const list = attempts.filter((a) => a.engine === id);
    return { engine: id, ...summarize(list) };
  });
  const perCommand = COMMANDS.map((c) => {
    const list = attempts.filter((a) => a.target === c.id);
    return {
      id: c.id,
      phrase: c.phrases[0],
      vosk: summarize(list.filter((a) => a.engine === 'vosk')),
      webspeech: summarize(list.filter((a) => a.engine === 'webspeech')),
      misheard: list.filter((a) => !a.correct).map((a) => `${a.engine}:${a.heard || '∅'}`),
    };
  }).filter((c) => c.vosk.attempts + c.webspeech.attempts > 0);
  return JSON.stringify(
    {
      env: { ua: navigator.userAgent, iframe: window.self !== window.top, url: location.hostname },
      byEngine,
      perCommand,
    },
    null,
    1,
  );
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
  $('last').textContent = 'Đã bỏ lần thử gần nhất.';
  renderStats();
});

$('btn-reset').addEventListener('click', () => {
  if (!confirm('Xóa toàn bộ thống kê?')) return;
  attempts = [];
  saveAttempts(attempts);
  renderStats();
});

renderStats();
