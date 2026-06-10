"use client";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { RoutingDecision } from "@redacted-usd/aggregator";
import { getMeta } from "@redacted-usd/aggregator";

// Shows the routing decision so the user (and any auditor) can see which
// backend got picked, why, and what the runners-up looked like.
export function RoutingDisplay({ decision }: { decision: RoutingDecision }) {
  if (!decision.winner) {
    return (
      <Box sx={{ p: 1.5, bgcolor: "rgba(255,0,0,0.08)", borderRadius: 1 }}>
        <Typography sx={{ color: "error.main", fontSize: 13 }}>
          No backend can satisfy this intent under the current policy.
        </Typography>
      </Box>
    );
  }
  const winnerMeta = getMeta(decision.winner);
  const winnerScore = decision.scores.find((s) => s.backendId === decision.winner)!;
  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: "rgba(124,58,237,0.08)",
        border: "1px solid",
        borderColor: "rgba(34,211,238,0.25)",
        borderRadius: 1,
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Routing via
        </Typography>
        <Chip
          size="small"
          label={winnerMeta.displayName}
          sx={{ bgcolor: "primary.main", color: "background.paper", fontWeight: 700 }}
        />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
        <Stat label="Privacy" value={`${winnerMeta.privacyScore}/100`} />
        <Stat label="Latency" value={fmtLatency(winnerScore.expectedLatencyMs)} />
        <Stat
          label="Cost"
          value={fmtLamports(winnerScore.expectedCostLamports)}
          badge={winnerScore.costSimulated ? "simulated" : "estimate"}
        />
        <Stat label="Trust" value={winnerMeta.trustModel} />
      </Stack>
      {decision.scores.filter((s) => !s.eliminatedReason && s.backendId !== decision.winner).length > 0 && (
        <Tooltip
          title={
            <Box>
              {decision.scores
                .filter((s) => s.backendId !== decision.winner)
                .map((s) => {
                  const m = getMeta(s.backendId);
                  const priv = `privacy ${m.privacyScore}`;
                  return (
                    <Box key={s.backendId} sx={{ fontSize: 11, my: 0.5 }}>
                      {m.displayName}: {s.eliminatedReason ?? `${priv}, score ${s.total.toFixed(1)}`}
                    </Box>
                  );
                })}
            </Box>
          }
        >
          <Typography
            sx={{ mt: 1, fontSize: 11, color: "text.secondary", cursor: "help" }}
          >
            +{decision.scores.filter((s) => s.backendId !== decision.winner).length} other backend{decision.scores.filter((s) => s.backendId !== decision.winner).length > 1 ? "s" : ""} considered
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}

function Stat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "simulated" | "estimate";
}) {
  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <Typography sx={{ fontSize: 10, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </Typography>
        {badge && (
          <Chip
            size="small"
            label={badge}
            sx={{
              height: 14,
              fontSize: 9,
              "& .MuiChip-label": { px: 0.5 },
              bgcolor: badge === "simulated" ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.06)",
              color: badge === "simulated" ? "secondary.main" : "text.secondary",
            }}
          />
        )}
      </Stack>
      <Typography sx={{ fontSize: 13, fontFamily: "monospace" }}>{value}</Typography>
    </Box>
  );
}

function fmtLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `~${(ms / 1000).toFixed(1)}s`;
  return `~${(ms / 60_000).toFixed(1)}m`;
}

function fmtLamports(lamports: number): string {
  if (lamports < 1_000_000) return `${lamports.toLocaleString()} lamports`;
  return `~${(lamports / 1e9).toFixed(4)} SOL`;
}
