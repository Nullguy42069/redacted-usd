import type {
  BackendHealth,
  BackendScore,
  BackendStaticMeta,
  Intent,
  Policy,
  PolicyWeights,
} from "../types";

// Normalize a value into a 0-100 score where lower-is-better (latency, cost).
// We cap the worst case at `worst` so a single bad outlier doesn't crush the
// scale for everything else.
function lowerIsBetter(value: number, best: number, worst: number): number {
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return 100 * (1 - (value - best) / (worst - best));
}

// Higher-is-better (privacy). Same shape, inverted.
function higherIsBetter(value: number, low: number, high: number): number {
  if (value <= low) return 0;
  if (value >= high) return 100;
  return 100 * ((value - low) / (high - low));
}

function weightedTotal(
  speedScore: number,
  privacyScore: number,
  costScore: number,
  weights: PolicyWeights,
): number {
  const sum = weights.speed + weights.privacy + weights.cost;
  if (sum === 0) return 0;
  return (
    (speedScore * weights.speed +
      privacyScore * weights.privacy +
      costScore * weights.cost) /
    sum
  );
}

export type ScoringInput = {
  meta: BackendStaticMeta;
  health: BackendHealth | null;
  expectedLatencyMs: number;
  expectedCostLamports: number;
};

// Eliminates by hard policy constraints, returns the reason if eliminated.
function eliminationReason(
  input: ScoringInput,
  policy: Policy,
  intent: Intent,
): string | null {
  const { meta, health, expectedLatencyMs, expectedCostLamports } = input;

  if (!meta.supportedIntents.includes(intent.type)) {
    return `does not support intent "${intent.type}"`;
  }
  if (policy.allowList && policy.allowList.length > 0 && !policy.allowList.includes(meta.id)) {
    return "not on allow-list";
  }
  if (policy.denyList?.includes(meta.id)) {
    return "on deny-list";
  }
  if (policy.minPrivacyScore !== undefined && meta.privacyScore < policy.minPrivacyScore) {
    return `privacy score ${meta.privacyScore} < min ${policy.minPrivacyScore}`;
  }
  if (policy.maxLatencyMs !== undefined && expectedLatencyMs > policy.maxLatencyMs) {
    return `expected latency ${expectedLatencyMs}ms > max ${policy.maxLatencyMs}ms`;
  }
  if (policy.maxCostLamports !== undefined && expectedCostLamports > policy.maxCostLamports) {
    return `expected cost ${expectedCostLamports} lamports > max ${policy.maxCostLamports}`;
  }
  if (health && !health.available) {
    return "backend unhealthy";
  }

  return null;
}

// Score a backend against the policy. Returns a BackendScore even for
// eliminated backends so the routing decision is fully auditable.
export function scoreBackend(
  input: ScoringInput,
  policy: Policy,
  intent: Intent,
): BackendScore {
  const { meta, health, expectedLatencyMs, expectedCostLamports } = input;
  const eliminated = eliminationReason(input, policy, intent);
  if (eliminated) {
    return {
      backendId: meta.id,
      total: 0,
      speed: 0,
      privacy: meta.privacyScore,
      cost: 0,
      expectedLatencyMs,
      expectedCostLamports,
      privacyScore: meta.privacyScore,
      eliminatedReason: eliminated,
    };
  }

  // Score ranges chosen so submillisecond/free is perfect, 60s/0.01 SOL is zero.
  const speed = lowerIsBetter(expectedLatencyMs, 50, 60_000);
  const cost = lowerIsBetter(expectedCostLamports, 1_000, 10_000_000);
  const privacy = higherIsBetter(meta.privacyScore, 0, 100);

  // Health derate: drop the total by up to 50% based on recent success rate.
  const healthMultiplier = health ? 0.5 + 0.5 * health.successRate : 1;

  const total = weightedTotal(speed, privacy, cost, policy.weights) * healthMultiplier;

  return {
    backendId: meta.id,
    total,
    speed,
    privacy,
    cost,
    expectedLatencyMs,
    expectedCostLamports,
    privacyScore: meta.privacyScore,
  };
}
