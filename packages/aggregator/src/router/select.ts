import type { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type {
  BackendHealth,
  BackendId,
  Intent,
  Policy,
  PrivacyBackend,
  RoutingDecision,
} from "../types";
import { scoreBackend } from "./scorer";

export type RouterDeps = {
  backends: PrivacyBackend[];
  conn: Connection;
  // Optional. When provided, the router builds each candidate backend's tx and
  // runs `connection.simulateTransaction` to get real compute-unit cost.
  // Without it, we fall back to each backend's static estimateCost.
  signer?: PublicKey;
  // Lamports of priority-fee per compute unit. 0 means "no priority fee",
  // which matches Solana's default — most txs only pay the base sig fee.
  priorityLamportsPerCu?: number;
  getHealth: (id: BackendId) => BackendHealth | null;
};

const BASE_SIG_FEE_LAMPORTS = 5000;

// Asks each capable backend for its own latency/cost estimate, scores them,
// returns a full audit-friendly decision. Ties broken by privacy score then by
// declared baseline latency (faster wins). When deps.signer is set, cost is
// derived from a live simulateTransaction call instead of estimateCost.
export async function selectRoute(
  intent: Intent,
  policy: Policy,
  deps: RouterDeps,
): Promise<RoutingDecision> {
  // SECURITY GATE (default-deny): only "active" backends are ever eligible to
  // route user funds. A backend the weekly scanner catalogued at "monitor", or
  // anything "quarantined", is excluded here — before scoring — so no policy
  // weighting or health quirk can ever surface it as a winner. Promotion to
  // "active" is a deliberate human action (write the adapter, flip the status).
  const eligible = deps.backends.filter((b) => b.meta.selectionStatus === "active");

  const inputs = await Promise.all(
    eligible.map(async (b) => {
      const meta = b.meta;
      const supports = b.canHandle(intent);
      const expectedLatencyMs = supports
        ? await b.estimateLatencyMs(intent, deps.conn).catch(() => meta.baselineLatencyMs)
        : meta.baselineLatencyMs;

      let expectedCostLamports = supports
        ? await b.estimateCost(intent, deps.conn).catch(() => meta.baselineCostLamports)
        : meta.baselineCostLamports;
      let costSimulated = false;

      if (supports && deps.signer) {
        const simResult = await tryLiveSimulation(
          b,
          intent,
          deps.conn,
          deps.signer,
          deps.priorityLamportsPerCu ?? 0,
        );
        if (simResult !== null) {
          expectedCostLamports = simResult;
          costSimulated = true;
        }
      }

      return {
        meta,
        health: deps.getHealth(meta.id),
        expectedLatencyMs,
        expectedCostLamports,
        costSimulated,
      };
    }),
  );

  const scores = inputs
    .map((i) => {
      const base = scoreBackend(i, policy, intent);
      return { ...base, costSimulated: i.costSimulated };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.privacyScore !== a.privacyScore) return b.privacyScore - a.privacyScore;
      return a.expectedLatencyMs - b.expectedLatencyMs;
    });

  const winner = scores.find((s) => !s.eliminatedReason) ?? null;

  return {
    intent,
    policy,
    winner: winner ? winner.backendId : null,
    scores,
    decidedAt: new Date().toISOString(),
  };
}

// Returns the simulated cost in lamports, or null if simulation can't be done
// (backend won't build, RPC errored, simulation returned no unitsConsumed).
async function tryLiveSimulation(
  b: PrivacyBackend,
  intent: Intent,
  conn: Connection,
  signer: PublicKey,
  priorityLamportsPerCu: number,
): Promise<number | null> {
  try {
    const built = await b.buildTransactions(intent, conn, signer);
    if (built.txs.length === 0) return null;
    // Sign with the additional ephemeral signers if any so simulation accepts
    // the tx layout. The user wallet's signature is left blank — we pass
    // sigVerify:false so the simulator skips signature checks.
    const tx = built.txs[0]!;
    if (built.additionalSigners && built.additionalSigners.length > 0) {
      try {
        tx.sign(built.additionalSigners);
      } catch {
        // signing may fail if the additional signers aren't in the tx's account list;
        // simulation will still work with sigVerify:false.
      }
    }
    const sim = await conn.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    // unitsConsumed is the only fee-relevant signal from simulation; the base
    // signature fee is a separate flat charge per signer.
    const cu = sim.value.unitsConsumed ?? null;
    if (cu === null) return null;
    const sigs = countSigs(tx);
    const priorityFee = Math.round(cu * priorityLamportsPerCu);
    return BASE_SIG_FEE_LAMPORTS * sigs + priorityFee;
  } catch {
    return null;
  }
}

function countSigs(tx: VersionedTransaction): number {
  return tx.message.header.numRequiredSignatures || 1;
}
