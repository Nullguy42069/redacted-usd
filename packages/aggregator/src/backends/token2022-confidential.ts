// Token-2022 Confidential Transfers backend.
//
// Skeleton: only canHandle a vault_transfer when the mint is a Token-2022
// confidential-transfer-enabled mint. Actual buildTransactions is unimplemented
// — full integration requires ElGamal key registration on the vault PDA and a
// range proof bundle, which is a multi-week implementation. Tracked for when
// the product needs hidden-amount transfers.
//
// The router still scores this backend so users can SEE that the option exists
// (or doesn't apply, depending on the mint) when they pick a recipient.

import type { Connection, PublicKey } from "@solana/web3.js";
import type {
  BackendStaticMeta,
  BuildResult,
  Intent,
  PrivacyBackend,
} from "../types";
import { getMeta } from "./registry";

const META: BackendStaticMeta = getMeta("token2022-confidential");

// Spl Token-2022 program ID (mainnet).
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export class Token2022ConfidentialBackend implements PrivacyBackend {
  readonly id = "token2022-confidential" as const;
  readonly meta = META;

  canHandle(intent: Intent): boolean {
    if (!META.supportedIntents.includes(intent.type)) return false;
    // For vault_transfer we need a Token-2022 mint specifically. SOL and legacy
    // SPL don't have confidential transfers, so the router shouldn't even
    // consider this backend for them.
    if (intent.type === "vault_transfer") {
      if (intent.mint === null) return false;
      // True mint-program check requires an RPC call; canHandle is sync. We
      // accept the optimistic answer and let estimateLatencyMs / build fail
      // loudly if the mint isn't actually Token-2022. The UI passes the mint
      // owner program ID separately so we don't pay the RPC twice.
      return true;
    }
    return true;
  }

  async estimateLatencyMs(_intent: Intent, _conn: Connection): Promise<number> {
    return META.baselineLatencyMs;
  }

  async estimateCost(_intent: Intent, _conn: Connection): Promise<number> {
    return META.baselineCostLamports;
  }

  async buildTransactions(
    _intent: Intent,
    _conn: Connection,
    _signer: PublicKey,
  ): Promise<BuildResult> {
    throw new Error(
      "Token2022ConfidentialBackend.buildTransactions not yet implemented. Tracked: full ElGamal keypair + range proof flow for vault PDAs.",
    );
  }
}

export { TOKEN_2022_PROGRAM_ID };
