import * as THREE from 'three';

// Health bar floating above the crystal (the core). DOM element projected onto the
// screen every frame, so it stays crisp and readable at any distance.

const CSS = `
.core-bar { position: absolute; left: 0; top: 0; width: 170px; transform: translate(-50%, -100%); pointer-events: none;
  font: 700 11px system-ui, sans-serif; color: #e6fbff; text-shadow: 0 1px 2px #000; text-align: center; will-change: transform; }
.core-bar .track { height: 9px; margin-top: 2px; border-radius: 999px; background: rgba(5,15,30,0.75);
  border: 1px solid rgba(140,230,255,0.8); overflow: hidden; box-shadow: 0 0 8px rgba(80,200,255,0.5); }
.core-bar .fill { height: 100%; transform-origin: left; background: linear-gradient(#9ff3ff, #2aa8d8); }
.core-bar.low .fill { background: linear-gradient(#ff9a9a, #c0392b); }
`;

export class CoreBar {
  private el: HTMLElement;
  private fill: HTMLElement;
  private text: HTMLElement;
  private v = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private anchor: THREE.Vector3,
    private getHp: () => { hp: number; max: number },
    /** Never draw above this many px from the top (keeps it clear of a top HUD bar). */
    private minY = 0,
  ) {
    if (!document.getElementById('core-bar-style')) {
      const style = document.createElement('style');
      style.id = 'core-bar-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'core-bar';
    this.el.innerHTML = `<div class="label">💎 Pha lê <span></span></div><div class="track"><div class="fill"></div></div>`;
    container.appendChild(this.el);
    this.fill = this.el.querySelector<HTMLElement>('.fill')!;
    this.text = this.el.querySelector<HTMLElement>('.label span')!;
  }

  update(): void {
    const parent = this.el.parentElement!;
    this.v.copy(this.anchor).project(this.camera);
    const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
    this.el.style.display = visible ? '' : 'none';
    if (!visible) return;
    const x = ((this.v.x + 1) / 2) * parent.clientWidth;
    const y = Math.max(this.minY, ((1 - this.v.y) / 2) * parent.clientHeight);
    const dist = this.camera.position.distanceTo(this.anchor);
    const s = Math.max(0.6, Math.min(1.2, 18 / dist));
    this.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${s})`;
    const { hp, max } = this.getHp();
    this.fill.style.transform = `scaleX(${Math.max(0, hp / max)})`;
    this.text.textContent = `${Math.ceil(hp)} / ${max}`;
    this.el.classList.toggle('low', hp / max < 0.3);
  }
}
