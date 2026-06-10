import type { BackendHealth, BackendId } from "../types";

// In-memory ring buffer per backend. Backed up to localStorage in the browser
// and to a JSON file when used from Node. Persistence is opt-in via the load /
// save methods so we don't have a hard dependency on either runtime.
type Sample = { okay: boolean; latencyMs: number; at: number };

const WINDOW = 50; // last N attempts feed the rolling stats

export class HealthMonitor {
  private samples = new Map<BackendId, Sample[]>();

  record(id: BackendId, okay: boolean, latencyMs: number): void {
    const arr = this.samples.get(id) ?? [];
    arr.push({ okay, latencyMs, at: Date.now() });
    if (arr.length > WINDOW) arr.shift();
    this.samples.set(id, arr);
  }

  get(id: BackendId): BackendHealth | null {
    const arr = this.samples.get(id);
    if (!arr || arr.length === 0) return null;
    const oks = arr.filter((s) => s.okay);
    const sorted = arr.map((s) => s.latencyMs).sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const lastFailure = [...arr].reverse().find((s) => !s.okay);
    return {
      available: oks.length > 0 || arr.length === 0,
      successRate: oks.length / arr.length,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      lastFailureAt: lastFailure ? new Date(lastFailure.at).toISOString() : null,
      sampleCount: arr.length,
    };
  }

  snapshot(): Record<BackendId, BackendHealth | null> {
    const out: Partial<Record<BackendId, BackendHealth | null>> = {};
    for (const id of this.samples.keys()) out[id] = this.get(id);
    return out as Record<BackendId, BackendHealth | null>;
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
  return sortedAsc[idx]!;
}
