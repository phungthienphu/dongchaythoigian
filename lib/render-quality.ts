/** Frame pacing is measured only during interaction; idle throttling is intentional. */
export class RenderQuality {
  cap = 2;
  private slow = 0;
  private fastSince: number | null = null;
  private changedAt = -Infinity;
  sample(at: number, frameMs: number, active: boolean, deviceDpr: number): boolean {
    if (!active || frameMs <= 0 || frameMs > 250) {
      this.slow = 0; this.fastSince = null; return false;
    }
    this.slow = frameMs > 28 ? this.slow + 1 : Math.max(0, this.slow - 1);
    if (frameMs <= 20) this.fastSince ??= at;
    else this.fastSince = null;
    const ceiling = Math.max(1, Math.min(2, deviceDpr));
    if (this.slow >= 90 && Math.min(this.cap, ceiling) > 1 && at - this.changedAt > 5000) {
      this.cap = Math.max(1, Math.min(this.cap, ceiling) - 0.5);
    } else if (this.fastSince !== null && at - this.fastSince >= 15000 && this.cap < ceiling && at - this.changedAt > 20000) {
      this.cap = Math.min(ceiling, this.cap + 0.5);
    } else return false;
    this.changedAt = at; this.slow = 0; this.fastSince = null; return true;
  }
}

/** Separate thresholds keep trackpad zoom near the boundary from flickering actors. */
export function mapDetailLow(tileWidth: number, previous?: boolean): boolean {
  return previous === undefined ? tileWidth < 26 : previous ? tileWidth < 28 : tileWidth < 24;
}
