export type FrameMetric = 'frame' | 'activeFrame' | 'draw' | 'crowd' | 'tick' | 'hud' | 'cache' | 'input' | 'longTask';
/** Opt-in, bounded numeric samples only. No city, account, commands or network data. */
export class FrameProfile {
  private samples = new Map<FrameMetric, number[]>();
  view = '';
  clear() { this.samples.clear(); }
  add(metric: FrameMetric, ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    const values = this.samples.get(metric) ?? [];
    if (values.length === 600) values.shift();
    values.push(ms); this.samples.set(metric, values);
  }
  summary() {
    return [this.view,...[...this.samples].map(([name, samples]) => {
      const sorted = [...samples].sort((a,b) => a-b);
      const q = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length*p)-1)].toFixed(1);
      return `${name}: n=${sorted.length} p50=${q(.5)} p95=${q(.95)} p99=${q(.99)} max=${q(1)} ms`;
    })].filter(Boolean).join('\n');
  }
}
