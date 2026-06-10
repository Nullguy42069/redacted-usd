import type { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type {
  BuildResult,
  Intent,
  Policy,
  PrivacyBackend,
  RoutingDecision,
  SubmitResult,
} from "./types";
import { BALANCED_POLICY } from "./types";
import { HealthMonitor } from "./health/monitor";
import { selectRoute } from "./router/select";
import { detectNetwork, getRecommendedPriorityFee, isMainnet } from "./utils/network";

export type AggregatorConfig = {
  conn: Connection;
  backends: PrivacyBackend[];
  defaultPolicy?: Policy;
  health?: HealthMonitor;
};

export type ExecuteResult = {
  decision: RoutingDecision;
  result: SubmitResult;
};

// User-facing API. Same shape across all backends — the router picks, the
// adapter executes, the monitor learns from the outcome.
export class PrivacyAggregator {
  readonly health: HealthMonitor;
  private readonly defaultPolicy: Policy;
  readonly network: ReturnType<typeof detectNetwork>;

  constructor(private readonly cfg: AggregatorConfig) {
    this.health = cfg.health ?? new HealthMonitor();
    this.defaultPolicy = cfg.defaultPolicy ?? {
      weights: BALANCED_POLICY,
    };
    this.network = detectNetwork(cfg.conn);
  }

  /**
   * Returns true if this aggregator instance is pointed at mainnet.
   * Useful for UI warnings and automatic priority fee behavior.
   */
  get isMainnet(): boolean {
    return isMainnet(this.cfg.conn);
  }

  // Pick the best route without executing — useful for surfacing the decision
  // in the UI before the user signs. When `signer` is provided the router runs
  // a live simulateTransaction per candidate backend; without it, scoring
  // falls back to each backend's static cost estimate.
  async route(
    intent: Intent,
    policy?: Policy,
    opts?: { signer?: PublicKey; priorityLamportsPerCu?: number },
  ): Promise<RoutingDecision> {
    const priorityLamportsPerCu =
      opts?.priorityLamportsPerCu ??
      (this.isMainnet ? getRecommendedPriorityFee(this.network) : 0);

    const decision = await selectRoute(intent, policy ?? this.defaultPolicy, {
      backends: this.cfg.backends,
      conn: this.cfg.conn,
      signer: opts?.signer,
      priorityLamportsPerCu,
      getHealth: (id) => this.health.get(id),
    });

    // Attach mainnet warning metadata so callers (UI) can surface it.
    if (this.isMainnet) {
      (decision as any).__mainnetWarning = true;
      decision.scores.forEach((s) => {
        if (!s.eliminatedReason) {
          // We don't mutate scores deeply, but we can note it in the decision for now.
        }
      });
    }

    return decision;
  }

  // Build the transactions for the winning backend. Caller signs with their
  // wallet adapter after pre-signing with any additionalSigners.
  async build(
    intent: Intent,
    signer: PublicKey,
    policy?: Policy,
  ): Promise<{ decision: RoutingDecision; build: BuildResult }> {
    // On mainnet we want priority fees by default for reliable landing.
    const priorityLamportsPerCu = this.isMainnet
      ? getRecommendedPriorityFee(this.network)
      : 0;

    const decision = await this.route(intent, policy, { signer, priorityLamportsPerCu });

    if (!decision.winner) {
      throw new Error(
        `no backend can satisfy this intent (${decision.scores.length} considered)`,
      );
    }

    const backend = this.cfg.backends.find((b) => b.id === decision.winner)!;
    const built = await backend.buildTransactions(intent, this.cfg.conn, signer);

    // Attach mainnet context so downstream code (UI, logging) knows this is live money.
    if (this.isMainnet) {
      built.meta = {
        ...(built.meta || {}),
        __mainnet: true,
        __network: this.network,
        __priorityFeePerCu: priorityLamportsPerCu,
        __warning: "This transaction was built for MAINNET. Real SOL will be spent.",
      };
    }

    // Pre-sign with the backend's ephemeral keypairs so the wallet only needs
    // to add its own signature.
    if (built.additionalSigners && built.additionalSigners.length > 0) {
      for (const tx of built.txs) {
        tx.sign(built.additionalSigners);
      }
    }

    return { decision, build: built };
  }

  // Submit + record health. The caller's sendAndConfirm wraps their wallet.
  async execute(
    intent: Intent,
    signer: PublicKey,
    sendAndConfirm: (tx: VersionedTransaction) => Promise<string>,
    policy?: Policy,
  ): Promise<ExecuteResult> {
    const { decision, build } = await this.build(intent, signer, policy);
    const backend = this.cfg.backends.find((b) => b.id === decision.winner)!;

    // Extra safety: surface a very clear mainnet warning in the result meta.
    if (this.isMainnet) {
      build.meta = {
        ...(build.meta || {}),
        __mainnetExecutionWarning: "You are about to execute REAL transactions on MAINNET.",
      };
    }

    const started = performance.now();
    try {
      const result: SubmitResult = backend.submit
        ? await backend.submit(build, this.cfg.conn, sendAndConfirm)
        : await defaultSubmit(build, sendAndConfirm);

      if (this.isMainnet) {
        result.meta = {
          ...(result.meta || {}),
          __mainnet: true,
        };
      }

      this.health.record(backend.id, true, performance.now() - started);
      return { decision, result };
    } catch (e) {
      this.health.record(backend.id, false, performance.now() - started);
      throw e;
    }
  }
}

async function defaultSubmit(
  build: BuildResult,
  sendAndConfirm: (tx: VersionedTransaction) => Promise<string>,
): Promise<SubmitResult> {
  let lastSig = "";
  for (const tx of build.txs) {
    lastSig = await sendAndConfirm(tx);
  }
  return { signature: lastSig, status: "confirmed", meta: build.meta };
}
