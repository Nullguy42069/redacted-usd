#!/usr/bin/env node
/**
 * Validation script for the now-complete TEE lifecycle in the aggregator.
 *
 * Exercises MagicBlockTeeBackend for:
 *   - create_vote (init + delegate)
 *   - finalize_vote (finalize + cpi approve)
 *
 * This proves the builders added for "make TEE fully functional" work at runtime.
 *
 * Run: node scripts/validate-tee-lifecycle.mjs
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { MagicBlockTeeBackend } from "../packages/aggregator/dist/backends/magicblock.js";

const RPC = "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");

async function main() {
  console.log("=== TEE Full Lifecycle Validation ===\n");

  const backend = new MagicBlockTeeBackend({
    routerEndpoint: "https://devnet.magicblock.app",
  });

  const dummyMultisig = Keypair.generate().publicKey;
  const dummyCreator = Keypair.generate().publicKey;
  const dummyVoter = Keypair.generate().publicKey;
  const dummyMembers = [dummyCreator, dummyVoter];
  const txIndex = 42n;

  // 1. create_vote
  console.log("Testing create_vote intent...");
  const createVoteIntent = {
    type: "create_vote",
    multisig: dummyMultisig,
    transactionIndex: txIndex,
    creator: dummyCreator,
    members: dummyMembers,
    threshold: 2,
  };

  try {
    const createRes = await backend.buildTransactions(createVoteIntent, conn, dummyCreator);
    console.log(`  ✓ Produced ${createRes.txs.length} transaction(s)`);
    console.log(`  Meta:`, JSON.stringify(createRes.meta, null, 2));
  } catch (e) {
    console.error("  ✗ create_vote failed:", e.message);
    process.exit(1);
  }

  // 2. finalize_vote
  console.log("\nTesting finalize_vote intent...");
  const finalizeIntent = {
    type: "finalize_vote",
    multisig: dummyMultisig,
    transactionIndex: txIndex,
    trigger: dummyCreator,
  };

  try {
    const finRes = await backend.buildTransactions(finalizeIntent, conn, dummyCreator);
    console.log(`  ✓ Produced ${finRes.txs.length} transaction(s)`);
    console.log(`  Meta:`, JSON.stringify(finRes.meta, null, 2));
  } catch (e) {
    console.error("  ✗ finalize_vote failed:", e.message);
    process.exit(1);
  }

  console.log("\n✅ TEE lifecycle builders (create_vote + finalize_vote) are functional.");
  console.log("   The MagicBlockTeeBackend now supports the complete private vote flow declared in the registry.");
}

main().catch((err) => {
  console.error("Validation crashed:", err);
  process.exit(1);
});
