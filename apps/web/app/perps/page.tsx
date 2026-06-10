"use client";
import {
  Box, Card, CardContent, Typography, Stack, Chip, TextField, Button,
  CircularProgress, Alert,
} from "@mui/material";
import { Bolt, TrendingUp, TrendingDown } from "@mui/icons-material";
import { useEffect, useState } from "react";

type BookStats = {
  deposits: number;
  pnl: number;
  pnlPct: number;
  realized: number;
  fees: number;
  open: number;
  lifetime: number;
  wins: number;
  losses: number;
  wr: number;
  todayClosed: number;
  todayNet: number;
  hourDelta: number | null;
  hourDeltaSource: "snapshots" | "trades" | null;
  startedAt: string | null;
};

type Book = {
  id: string;
  dir: string;
  name: string;
  tagline: string;
  strategy: string;
  note?: string;
  stats: BookStats | null;
};

const REFRESH_MS = 60 * 60 * 1000;   // 1h refresh per user spec

export default function PerpsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch("/api/v1/books", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (cancelled) return;
        setBooks(json.books || []);
        setUpdatedAt(json.updatedAt);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Sort by 1h delta DESC (best first). Books with null hourDelta fall to
  // the bottom but keep their own internal order by lifetime PnL %.
  const sorted = [...books].sort((a, b) => {
    const av = a.stats?.hourDelta;
    const bv = b.stats?.hourDelta;
    if (av != null && bv != null) return bv - av;
    if (av != null) return -1;
    if (bv != null) return 1;
    return (b.stats?.pnlPct ?? 0) - (a.stats?.pnlPct ?? 0);
  });

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 1 }}>Perps</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        Automated trading strategies running on Hyperliquid today.
      </Typography>

      <Box sx={{ maxWidth: 1180, mx: "auto" }}>
        <PerpsBanner />

        <Box sx={{ mt: 2 }}>
          <CaptainCard />
        </Box>

        {error && <Alert severity="error" sx={{ mt: 2 }}>Failed to load live stats: {error}</Alert>}

        {loading && (
          <Box sx={{ mt: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={20} />
          </Box>
        )}

        {!loading && (
          <Box
            sx={{
              mt: 2,
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                lg: "repeat(3, 1fr)",
              },
              gap: 2,
            }}
          >
            {sorted.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </Box>
        )}

        {updatedAt && (
          <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "text.secondary", mt: 3 }}>
            Updated {fmtRelative(updatedAt)} · cards refresh hourly, sorted by last-1h P&amp;L
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function PerpsBanner() {
  return (
    <Box
      sx={{
        p: 2.5, borderRadius: 1.5,
        background: "linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(34,211,238,0.06) 100%)",
        border: "1px solid rgba(124,58,237,0.30)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Bolt sx={{ color: "primary.main", fontSize: 18 }} />
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
          Hyperliquid books running — coming soon to Percolator
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
        Each book is a vault. Deposit USDC, earn your share of the book&apos;s daily P&amp;L pro-rata. The agent trades — your principal stays on chain, withdraw any time.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" },
          gap: 1,
        }}
      >
        <FeeBullet k="Your share" v="Pro-rata of deposits" />
        <FeeBullet k="Daily P&L"  v="Distributed to vault" />
        <FeeBullet k="Mgmt fee"   v="10% of new profits" highlight />
        <FeeBullet k="High-water" v="Fee only on new highs" />
      </Box>
    </Box>
  );
}

function FeeBullet({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <Box
      sx={{
        p: 1, borderRadius: 0.75,
        bgcolor: highlight ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
        border: "1px solid",
        borderColor: highlight ? "primary.main" : "rgba(255,255,255,0.05)",
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {k}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
        {v}
      </Typography>
    </Box>
  );
}

function CaptainCard() {
  const [amount, setAmount] = useState("");
  return (
    <Card sx={{ border: "1px solid", borderColor: "primary.main", overflow: "visible" }}>
      <CardContent>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 1.5 }}>
          <CaptainAvatar />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
              <Typography variant="h3" sx={{ fontSize: 20 }}>Jarvis</Typography>
              <Chip size="small" label="Captain" color="primary" sx={{ height: 18 }} />
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Captain</Typography>
          </Box>
        </Box>

        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Strategy-of-strategies. Allocates capital across the books that are working this week, rotates as edges decay. Watches funding, whale flow, regime, F&amp;G — picks the right tool for the regime, not the loudest narrative.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr auto" },
            gap: 1,
            alignItems: "stretch",
          }}
        >
          <TextField
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Deposit amount (USDC)"
            size="small"
            disabled
            slotProps={{ input: { sx: { fontFamily: "monospace" } } }}
          />
          <Button variant="outlined" disabled sx={{ minWidth: 140 }}>
            Coming soon
          </Button>
        </Box>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 1, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          10% mgmt fee on new profits · high-water mark · withdraw any time
        </Typography>
      </CardContent>
    </Card>
  );
}

function BookCard({ book }: { book: Book }) {
  const s = book.stats;
  const hourPositive = (s?.hourDelta ?? 0) > 0;
  const lifePositive = (s?.pnlPct ?? 0) > 0;
  return (
    <Card sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5, gap: 1 }}>
          <Typography variant="h3" sx={{ fontSize: 16, lineHeight: 1.3 }}>
            {book.name}
          </Typography>
          {s && (
            <Box sx={{ textAlign: "right", flexShrink: 0 }}>
              <Typography
                sx={{
                  fontWeight: 700, fontSize: 16,
                  color: lifePositive ? "secondary.main" : "error.light",
                }}
              >
                {lifePositive ? "+" : ""}{s.pnlPct.toFixed(2)}%
              </Typography>
              {s.hourDelta != null && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, justifyContent: "flex-end" }}>
                  {hourPositive
                    ? <TrendingUp sx={{ fontSize: 12, color: "secondary.main" }} />
                    : <TrendingDown sx={{ fontSize: 12, color: "error.light" }} />}
                  <Typography variant="caption" sx={{ color: hourPositive ? "secondary.main" : "error.light", fontFamily: "monospace" }}>
                    {hourPositive ? "+" : ""}${s.hourDelta.toFixed(2)} / 1h
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>

        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
          {book.tagline}
        </Typography>

        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1.5,
            fontSize: 13,
            lineHeight: 1.45,
            flex: 1,
          }}
        >
          {book.strategy}
        </Typography>

        {s && (
          <Box
            sx={{
              p: 1, mb: 1.5, borderRadius: 0.75,
              bgcolor: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: 11,
            }}
          >
            <Row k="Deposits" v={`$${s.deposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <Row k="Open" v={`${s.open}`} />
            <Row k="Realized" v={`${s.realized >= 0 ? "+" : ""}$${s.realized.toFixed(2)}`} />
            <Row k="Lifetime" v={`${s.lifetime} trades · ${s.wr.toFixed(0)}% WR`} />
            {s.todayClosed > 0 && (
              <Row k="Today" v={`${s.todayClosed} closed · ${s.todayNet >= 0 ? "+" : ""}$${s.todayNet.toFixed(2)}`} />
            )}
          </Box>
        )}

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: "auto", gap: 1 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
            10% mgmt fee · HWM
          </Typography>
          <Button variant="outlined" disabled size="small" sx={{ flexShrink: 0 }}>
            Coming soon
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>{k}</Typography>
      <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{v}</Typography>
    </Box>
  );
}

function CaptainAvatar() {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <Box
        sx={{
          width: 56, height: 56, borderRadius: "50%",
          flexShrink: 0,
          display: "grid", placeItems: "center",
          color: "white", fontWeight: 700, fontSize: 22,
          background: "linear-gradient(135deg, #7C3AED 0%, #22D3EE 100%)",
          boxShadow: "0 0 0 2px rgba(124,58,237,0.40)",
        }}
      >
        J
      </Box>
    );
  }
  return (
    <Box
      sx={{
        width: 56, height: 56, borderRadius: "50%",
        flexShrink: 0, overflow: "hidden",
        boxShadow: "0 0 0 2px rgba(124,58,237,0.40)",
        bgcolor: "rgba(0,0,0,0.4)",
      }}
    >
      <Box
        component="img"
        src="/jarvis.jpg"
        alt="Jarvis"
        onError={() => setErrored(true)}
        sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </Box>
  );
}

function fmtRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "just now";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}
