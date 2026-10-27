export type InputAction =
  | 'interact'
  | 'map'
  | 'help'
  | 'goggles'
  | 'time'
  | 'book'
  | 'graph'
  | 'frame'
  | 'rewind'
  | 'builder'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'inventory'
  | 'daynight'
  | 'escape';

type ActionListener = (action: InputAction) => void;

export class Input {
  readonly keys = new Set<string>();
  pointerLocked = false;
  autoLock = true;
  mouseX = 0;
  mouseY = 0;
  leftClick = false;
  rightClick = false;
  private listeners = new Set<ActionListener>();
  private keydownListeners = new Set<(event: KeyboardEvent) => void>();
  private clickListeners = new Set<(event: MouseEvent) => void>();
  private wheelListeners = new Set<(deltaY: number) => void>();
  private disposed = false;
  private actionKeys: Record<string, InputAction> = {
    e: 'interact',
    m: 'map',
    h: 'help',
    v: 'goggles',
    t: 'time',
    b: 'builder',
    i: 'inventory',
    k: 'book',
    g: 'graph',
    f: 'frame',
    r: 'rewind',
    '1': 'slot1',
    '2': 'slot2',
    '3': 'slot3',
    '4': 'slot4',
    '5': 'slot5',
    '6': 'slot6',
    n: 'daynight',
    Escape: 'escape',
  };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', this.preventContextMenu);
    window.addEventListener('wheel', this.onWheelEvent, { passive: true });
  }

  onWheel(listener: (deltaY: number) => void): () => void {
    this.wheelListeners.add(listener);
    return () => this.wheelListeners.delete(listener);
  }

  onAction(listener: ActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onKeydown(listener: (event: KeyboardEvent) => void): () => void {
    this.keydownListeners.add(listener);
    return () => this.keydownListeners.delete(listener);
  }

  onClick(listener: (event: MouseEvent) => void): () => void {
    this.clickListeners.add(listener);
    return () => this.clickListeners.delete(listener);
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    try {
      const res = this.canvas.requestPointerLock?.() as unknown;
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch(() => {
          // Handled gracefully if browser restricts pointer lock without user interaction
        });
      }
    } catch {
      // Ignore if document not allowed to lock pointer
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  consumeMouseDelta(): { x: number; y: number } {
    const result = { x: this.mouseX, y: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return result;
  }

  consumeClicks(): { left: boolean; right: boolean } {
    const result = { left: this.leftClick, right: this.rightClick };
    this.leftClick = false;
    this.rightClick = false;
    return result;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') event.preventDefault();
    if (event.repeat) {
      this.keydownListeners.forEach((listener) => listener(event));
      return;
    }
    this.keys.add(event.code);
    for (const listener of this.keydownListeners) listener(event);
    const action = this.actionKeys[event.key.toLowerCase() === 'escape' ? 'Escape' : event.key.toLowerCase()];
    if (action) {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) return;
      for (const listener of this.listeners) listener(action);
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    document.body.classList.toggle('pointer-locked', this.pointerLocked);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseX += event.movementX;
    this.mouseY += event.movementY;
  };

  private onMouseDown = (event: MouseEvent): void => {
    // If not locked yet, clicking the canvas locks pointer and focuses game
    // without triggering accidental block mining or TNT detonation
    if (!this.pointerLocked) {
      if (this.autoLock && event.button === 0 && !event.defaultPrevented) {
        this.requestPointerLock();
      }
      return;
    }
    if (event.button === 0) this.leftClick = true;
    if (event.button === 2) this.rightClick = true;
    this.clickListeners.forEach((listener) => listener(event));
  };

  private onWindowBlur = (): void => {
    this.keys.clear();
    this.leftClick = false;
    this.rightClick = false;
    this.mouseX = 0;
    this.mouseY = 0;
  };

  private onMouseUp = (): void => {
    // Clicks are consumed on the next simulation tick.
  };

  private preventContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private onWheelEvent = (event: WheelEvent): void => {
    this.wheelListeners.forEach((listener) => listener(event.deltaY));
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
    window.removeEventListener('wheel', this.onWheelEvent);
  }
}
