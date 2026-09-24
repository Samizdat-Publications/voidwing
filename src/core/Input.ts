/**
 * Keyboard and mouse state. Mouse motion is read from movementX/Y, which works with pointer
 * lock (unbounded aim) and without it (tests, or when the browser refuses the lock).
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  lmb = false;
  rmb = false;
  lmbPressed = false;
  rmbPressed = false;
  pointerLocked = false;
  /** Fired when the pointer lock is lost while it was held (Esc in the browser). */
  onPointerLockLost: (() => void) | null = null;

  constructor(private readonly lockTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      } else if (e.button === 2) {
        this.rmb = true;
        this.rmbPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      else if (e.button === 2) this.rmb = false;
    });
    document.addEventListener('mousemove', (e) => {
      // Chrome occasionally reports huge spurious deltas under pointer lock; drop them.
      const dx = e.movementX, dy = e.movementY;
      if (Math.abs(dx) > 600 || Math.abs(dy) > 600) return;
      this.mouseDX += dx;
      this.mouseDY += dy;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.lockTarget;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;
      if (wasLocked && !locked) this.onPointerLockLost?.();
    });
  }

  requestLock(): void {
    try {
      const p = this.lockTarget.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* lock refused: movementX still works without it */
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  releaseAll(): void {
    this.held.clear();
    this.lmb = this.rmb = false;
  }

  /** Call once per frame after the game has read input. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lmbPressed = false;
    this.rmbPressed = false;
  }
}
