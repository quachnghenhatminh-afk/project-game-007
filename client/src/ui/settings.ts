import { MAP_NAMES, type MapId } from '../render/gameMap.ts';
import { Sfx } from '../audio/sfx.ts';

// Gear button + settings panel: pick the battle map (reloads the page) and SFX volume.
// Choices are remembered in localStorage (wrapped in try/catch: storage can be blocked in iframes).

const MAP_KEY = 'pg007-map';
const VOLUME_KEY = 'pg007-volume';

const CSS = `
.set-btn { position: fixed; right: 12px; top: 12px; z-index: 40; width: 42px; height: 42px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.4); background: rgba(10,15,30,0.6); color: #fff; font-size: 22px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; touch-action: manipulation; }
.set-panel { position: fixed; inset: 0; z-index: 41; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55); font-family: system-ui, sans-serif; color: #fff; }
.set-panel[hidden] { display: none; }
.set-card { width: min(420px, 92vw); background: #1b2030; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
  padding: 16px 18px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
.set-card h2 { margin: 0 0 10px; font-size: 18px; color: #bfe9ff; }
.set-card h3 { margin: 12px 0 6px; font-size: 13px; color: #9fb3d1; font-weight: 600; }
.set-card label.map { display: flex; gap: 10px; align-items: center; padding: 8px 10px; margin: 6px 0; border-radius: 8px;
  background: rgba(255,255,255,0.05); cursor: pointer; font-size: 14px; }
.set-card label.map.sel { outline: 2px solid #4fc3f7; background: rgba(79,195,247,0.12); }
.set-card input[type=range] { width: 100%; }
.set-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.set-row button { border: 0; border-radius: 999px; padding: 8px 16px; font: 700 14px system-ui; cursor: pointer; }
.set-row .ok { background: #4fc3f7; color: #06233a; }
.set-row .cancel { background: rgba(255,255,255,0.12); color: #fff; }
.set-note { font-size: 12px; color: #9fb3d1; margin-top: 4px; }
`;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: the URL parameter still carries the map choice
  }
}

/** Map chosen by URL (?map=…) or the last saved choice. */
export function chosenMap(): MapId {
  const fromUrl = new URLSearchParams(location.search).get('map');
  const id = fromUrl ?? load(MAP_KEY);
  return id && id in MAP_NAMES ? (id as MapId) : 'citadel';
}

/** Reloads the page with another map. */
export function switchMap(id: MapId): void {
  save(MAP_KEY, id);
  const url = new URL(location.href);
  url.searchParams.set('map', id);
  location.href = url.toString();
}

export function applySavedVolume(): void {
  const v = Number(load(VOLUME_KEY));
  if (load(VOLUME_KEY) !== null && Number.isFinite(v)) Sfx.setVolume(v);
}

export class Settings {
  /** Called when the panel opens/closes (the game pauses input meanwhile). */
  onToggle: (open: boolean) => void = () => {};
  private panel: HTMLElement;

  constructor(current: MapId) {
    if (!document.getElementById('set-style')) {
      const style = document.createElement('style');
      style.id = 'set-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const btn = document.createElement('button');
    btn.className = 'set-btn';
    btn.title = 'Cài đặt';
    btn.textContent = '⚙';
    document.body.appendChild(btn);

    this.panel = document.createElement('div');
    this.panel.className = 'set-panel';
    this.panel.hidden = true;
    const maps = (Object.keys(MAP_NAMES) as MapId[])
      .map((id) => `<label class="map${id === current ? ' sel' : ''}"><input type="radio" name="set-map" value="${id}" ${id === current ? 'checked' : ''}/> ${MAP_NAMES[id]}</label>`)
      .join('');
    this.panel.innerHTML = `<div class="set-card">
        <h2>⚙ Cài đặt</h2>
        <h3>Bối cảnh chiến đấu</h3>${maps}
        <div class="set-note">Đổi bối cảnh sẽ tải lại trang.</div>
        <h3>Âm lượng hiệu ứng</h3>
        <input type="range" min="0" max="1" step="0.05" value="${Sfx.getVolume()}" class="vol" />
        <div class="set-row"><button class="cancel">Đóng</button><button class="ok">Áp dụng</button></div>
      </div>`;
    document.body.appendChild(this.panel);

    const q = <T extends HTMLElement>(s: string) => this.panel.querySelector<T>(s)!;
    this.panel.querySelectorAll<HTMLInputElement>('input[name="set-map"]').forEach((r) =>
      r.addEventListener('change', () => {
        this.panel.querySelectorAll('label.map').forEach((l) => l.classList.toggle('sel', l.contains(r) && r.checked));
      }),
    );
    q<HTMLInputElement>('.vol').addEventListener('input', (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      Sfx.setVolume(v);
      save(VOLUME_KEY, String(v));
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.open();
    });
    q('.cancel').addEventListener('click', () => this.close());
    q('.ok').addEventListener('click', () => {
      const id = this.panel.querySelector<HTMLInputElement>('input[name="set-map"]:checked')?.value as MapId | undefined;
      if (id && id !== current) switchMap(id);
      else this.close();
    });
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  open(): void {
    this.panel.hidden = false;
    this.onToggle(true);
  }

  close(): void {
    this.panel.hidden = true;
    this.onToggle(false);
  }
}
