"use client";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  Typography,
  Alert,
  Box,
  Chip,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { Lock } from "@mui/icons-material";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import type { Policy } from "@redacted-usd/aggregator";
import { detectNetwork } from "@redacted-usd/aggregator";
import { getAggregator } from "@/lib/aggregator";
import { useMultisig } from "./MultisigContext";
import { addVault } from "@/lib/vault-store";
import { getDefaultBackendId, setBackendIdFor } from "@/lib/privacy-prefs";
import { invalidateAll } from "@/lib/rpc-cache";
import Link from "next/link";

type Props = { open: boolean; onClose: () => void };

// "Create vault" flow. The user picks members and threshold. The privacy
// backend (plain Squads / Arcium / TEE / etc.) comes from the user's saved
// preference in Settings → Privacy — keeping the create flow simple and
// letting users change the preference anytime without re-creating vaults.
export function CreateVaultDialog({ open, onClose }: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setAddress, setMode } = useMultisig();

  const [membersText, setMembersText] = useState("");
  const [threshold, setThreshold] = useState("2");
  // Read the user's account-wide voting-privacy preference set in Settings →
  // Privacy. We pin the routing allowList to that backend so the user's pick
  // turns into a real on-chain effect at vault creation (TEE-wrapped vs
  // standard Squads vs Arcium etc.).
  const votingPrefBackend = useMemo(() => {
    if (typeof window === "undefined") return "squads-plain";
    return getDefaultBackendId("voting");
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-member Execute permission toggle. Initiate + Vote are always granted
  // (a member without them is dead weight and can brick the vault). Execute
  // is the only optional bit. Map key = member-address string.
  const [executeBits, setExecuteBits] = useState<Record<string, boolean>>({});
  const setExecuteBit = (addr: string, v: boolean) =>
    setExecuteBits((m) => ({ ...m, [addr]: v }));

  const members = membersText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Per-line validation. Returns either the parsed PublicKey list and no
  // errors, OR a list of (line index, message) errors so we can show the user
  // exactly which lines are wrong instead of silently disabling the button.
  const { validMembers, memberErrors } = useMemo(() => {
    const out: PublicKey[] = [];
    const errors: { line: number; address: string; reason: string }[] = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      // Catch common mistakes that aren't valid Solana addresses but might
      // pass new PublicKey if it's exactly the right base58 length.
      if (m.startsWith("0x")) {
        errors.push({ line: i + 1, address: m, reason: "looks like an Ethereum / EVM address — needs a Solana address" });
        continue;
      }
      try {
        out.push(new PublicKey(m));
      } catch {
        errors.push({ line: i + 1, address: m, reason: "not a valid Solana address (expected base58, 32-44 chars)" });
      }
    }
    return { validMembers: errors.length === 0 ? out : null, memberErrors: errors };
  }, [members]);

  // Dup-check on otherwise-valid input.
  const duplicateAddresses = useMemo(() => {
    if (!validMembers) return [];
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const m of validMembers) {
      const s = m.toBase58();
      if (seen.has(s)) dups.push(s);
      seen.add(s);
    }
    return dups;
  }, [validMembers]);

  const thresholdNum = Number(threshold);
  const thresholdInvalid =
    !Number.isFinite(thresholdNum) ||
    thresholdNum < 1 ||
    (validMembers !== null && thresholdNum > validMembers.length);

  const formValid =
    publicKey !== null &&
    validMembers !== null &&
    validMembers.length >= 1 &&
    validMembers.length <= 8 &&
    duplicateAddresses.length === 0 &&
    !thresholdInvalid;

  // SAFETY RAIL: lock vault creation to squads-plain regardless of the user's
  // saved voting-privacy preference. Privacy-wrapped vault creation (Arcium /
  // MagicBlock TEE) is not yet deployed on mainnet — those backends split
  // permissions in a way that bricks the vault if the off-chain MPC/TEE isn't
  // live to sign. We let users keep their voting-privacy pref for the FUTURE
  // voting flow, but the vault itself must be created with plain Squads on
  // mainnet today.
  const policy: Policy = useMemo(
    () => ({
      weights: { speed: 33, privacy: 0, cost: 67 },
      allowList: ["squads-plain" as any],
    }),
    [],
  );

  // Compute the per-member permission mask for the explicit submit call.
  // Initiate(1) + Vote(2) = 3 always granted; Execute(4) bit is per-member toggle.
  // Defaults to ALL permissions for the creator and Execute=on for everyone.
  const memberPermissions = useMemo(() => {
    if (!validMembers) return undefined;
    return validMembers.map((m) => {
      const addr = m.toBase58();
      const executeOn = executeBits[addr] !== false; // default true unless user toggles off
      return 1 | 2 | (executeOn ? 4 : 0);
    });
  }, [validMembers, executeBits]);

  async function submit() {
    if (!publicKey || !validMembers) return;
    setError(null);
    setSubmitting(true);
    try {
      const agg = await getAggregator(connection);
      const { result } = await agg.execute(
        {
          type: "setup_multisig",
          creator: publicKey,
          members: validMembers,
          threshold: Number(threshold),
          memberPermissions,
        },
        publicKey,
        async (tx) => {
          const sig = await sendTransaction(tx, connection, { maxRetries: 3 });
          // Hand-rolled confirmation poller. The wallet-adapter default
          // confirmTransaction wraps the legacy 30s wall-clock timeout, which
          // fails too often on mainnet during congestion for multi-instruction
          // vault setup. Poll signature status for up to 90s; if confirmed →
          // return, if explicit failure → throw with details, if timeout →
          // throw with the signature so the user can verify on Explorer.
          const start = Date.now();
          const TIMEOUT_MS = 90_000;
          while (Date.now() - start < TIMEOUT_MS) {
            const status = await connection.getSignatureStatus(sig);
            const v = status?.value;
            if (v?.err) {
              throw new Error(`Transaction failed on chain: ${JSON.stringify(v.err)}. Signature: ${sig}`);
            }
            if (v?.confirmationStatus === "confirmed" || v?.confirmationStatus === "finalized") {
              return sig;
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          throw new Error(
            `Confirmation timed out after 90s. The transaction may still confirm — check the signature on Solana Explorer:\nhttps://solscan.io/tx/${sig}\n\nIf it confirmed, your vault is created — just refresh this page.`,
          );
        },
        policy,
      );
      const multisigPda = result.meta?.multisigPda as PublicKey | undefined;
      if (multisigPda) {
        const addr = multisigPda.toBase58();
        // Automatically bookmark the newly created vault so it doesn't disappear
        // after refresh/navigation (it was only being set as the active context
        // before, but not persisted to the user's local vault list).
        addVault({ address: addr, bookmarked: true, readOnly: false });
        // A new vault was created — clear ALL cached state so the discovery /
        // assets / proposal queries refetch fresh against the new account.
        invalidateAll();
        // Persist the chosen voting backend for this brand-new vault so the
        // Approve flow downstream knows to route through it (e.g. TEE).
        try {
          setBackendIdFor(addr, "voting", result.meta?.routedVia ?? votingPrefBackend);
        } catch {}
        setAddress(addr);
        setMode('vault');
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
          <Lock fontSize="small" />
          <span>Create vault</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
            Set the members and threshold. Privacy backend is set in{" "}
            <Link href="/settings" style={{ color: "inherit", textDecoration: "underline" }} onClick={onClose}>
              Settings → Privacy
            </Link>{" "}
            and can be changed any time.
          </Typography>

          {detectNetwork(connection) !== "mainnet" && (
            <Alert severity="warning" sx={{ fontSize: 13 }}>
              You are connected to <strong>devnet</strong>. Vault creation with privacy backends (Arcium / TEE) is only supported on mainnet.
              Switch your RPC to a mainnet endpoint in Settings for reliable vault creation.
            </Alert>
          )}

          <TextField
            multiline
            minRows={3}
            label="Members (one Solana address per line, up to 8)"
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
            fullWidth
            error={memberErrors.length > 0 || duplicateAddresses.length > 0}
          />

          {memberErrors.length > 0 && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              <strong>{memberErrors.length === 1 ? "1 address is invalid:" : `${memberErrors.length} addresses are invalid:`}</strong>
              <Stack component="ul" sx={{ pl: 2, my: 0.5 }}>
                {memberErrors.map((e) => (
                  <li key={e.line}>
                    <strong>Line {e.line}:</strong> {e.reason}
                    <br />
                    <code style={{ fontSize: 11, opacity: 0.8, wordBreak: "break-all" }}>{e.address}</code>
                  </li>
                ))}
              </Stack>
            </Alert>
          )}

          {duplicateAddresses.length > 0 && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              <strong>Duplicate addresses are not allowed.</strong> Each member must be unique:
              <Stack component="ul" sx={{ pl: 2, my: 0.5 }}>
                {duplicateAddresses.map((a) => (
                  <li key={a}>
                    <code style={{ fontSize: 11, wordBreak: "break-all" }}>{a}</code>
                  </li>
                ))}
              </Stack>
            </Alert>
          )}

          {validMembers && validMembers.length > 8 && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              Maximum 8 members per vault. You have {validMembers.length}.
            </Alert>
          )}

          <TextField
            type="number"
            label="Threshold"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            sx={{ width: 160 }}
            error={thresholdInvalid && membersText.length > 0}
            helperText={
              validMembers && validMembers.length > 0
                ? thresholdInvalid
                  ? `Threshold must be between 1 and ${validMembers.length}`
                  : `${thresholdNum} of ${validMembers.length} signers required`
                : undefined
            }
          />

          {validMembers && validMembers.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
                Per-member permissions
              </Typography>
              <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1.5 }}>
                Every member gets <strong>Initiate + Vote</strong> by default — needed to propose and approve. <strong>Execute</strong> (ability to push an approved proposal on chain) is optional per member.
              </Typography>
              <Stack spacing={1}>
                {validMembers.map((m, i) => {
                  const addr = m.toBase58();
                  const isCreator = publicKey && publicKey.equals(m);
                  const executeOn = executeBits[addr] !== false;
                  return (
                    <Box
                      key={addr}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        py: 0.75,
                        px: 1,
                        bgcolor: "rgba(255,255,255,0.04)",
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12, fontFamily: "monospace" }} noWrap>
                          {addr.slice(0, 8)}…{addr.slice(-8)}
                          {isCreator && (
                            <Chip
                              size="small"
                              label="you"
                              sx={{ ml: 1, height: 16, fontSize: 10 }}
                            />
                          )}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Chip size="small" label="Initiate" sx={{ height: 20, fontSize: 10 }} />
                        <Chip size="small" label="Vote" sx={{ height: 20, fontSize: 10 }} />
                      </Stack>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={executeOn}
                            onChange={(e) => setExecuteBit(addr, e.target.checked)}
                          />
                        }
                        label={<Typography sx={{ fontSize: 12 }}>Execute</Typography>}
                        sx={{ m: 0, gap: 0.5 }}
                      />
                    </Box>
                  );
                })}
              </Stack>
              <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 1.5 }}>
                Changing an existing member&apos;s permissions after creation requires a multisig vote.
              </Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              {error}
            </Alert>
          )}
          {!publicKey && <Alert severity="warning">Connect your wallet first.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!formValid || submitting}
        >
          {submitting ? "Creating…" : "Create vault"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
