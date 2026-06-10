// Live stats endpoint for the Perps page books grid.
// Reads each paper book's ledger.json / positions.json / trades.jsonl from
// ~/.jarvis/data/<dir>/ and returns aggregated per-book stats:
//   - deposits (equity)
//   - realized P&L, fees, today's net
//   - lifetime trade count + WR
//   - 1h equity delta (from equity_snapshots when present, else sum of
//     trade pnls closed in the last hour)
//
// Used by /perps to sort books with the best-performing in the last hour at
// the top of the grid (Jarvis stays pinned as captain on top of the page).

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(os.homedir(), ".jarvis", "data");

type BookDef = {
  id: string;
  dir: string;
  name: string;
  tagline: string;
  strategy: string;
  note?: string;
};

// All books except B8 / B9 / B10 / B14 / B20 (user excluded).
const BOOKS: BookDef[] = [
  {
    id: "b2",
    dir: "jarvis-mech",
    name: "Mech C-Spacing",
    tagline: "Funding-rate bot, S2 schedule",
    strategy:
      "10AM + 8PM ET fires. BTC up → short top-positive-funding coin; BTC down → long top-negative-funding. Position-managed as one unit.",
  },
  {
    id: "b7p",
    dir: "jarvis-superconv-mini",
    name: "Superconv Mini",
    tagline: "Concentrated extreme-funding fader",
    strategy:
      "Discretionary $2K × 3x concentrated single-bet. Dynamic funding gate (≥3× vol APR) + ratio ≥1.3 + vol ≥$500K. Hard SL -50% ROE, no DCA on this tier.",
  },
  {
    id: "b11",
    dir: "jarvis-squeeze11",
    name: "Squeeze L+S",
    tagline: "Long+Short with time-decay",
    strategy:
      "Squeeze hunter both directions with hold-time decay. Stairs up on longs, elevator down on shorts. Position management is the alpha; selection is the trigger.",
  },
  {
    id: "b12",
    dir: "jarvis-squeeze12",
    name: "Squeeze Confluence",
    tagline: "FRR × VPVR + spread filter",
    strategy:
      "Fires when funding-rate velocity squeeze and VPVR value-area rejection agree AND spread ≤20bps. Market execution. Highest-conviction single-shot signal.",
  },
  {
    id: "b13",
    dir: "jarvis-squeeze13",
    name: "Squeeze + Asymmetric TD",
    tagline: "B12 base + SHORT-only time-decay",
    strategy:
      "B12's confluence + asymmetric time-decay applied only to SHORTs. Theory: shorts are 'elevators' that drop fast; longs are 'stairs' that climb slow.",
  },
  {
    id: "b16",
    dir: "jarvis-b16-multi",
    name: "Multi-Strategy Default",
    tagline: "Diversified workhorse",
    strategy:
      "Equity SHORT fade-up on AAPL/MSTR/TSLA/META + equity LONG fade-down on GOOGL/NVDA/GOLD. RTH-gated. ATR circuit breaker + vol surface scanner.",
  },
  {
    id: "b17",
    dir: "jarvis-b17-multi-regime",
    name: "Multi-Strategy + Regime",
    tagline: "B16 + F&G/VIX regime flip",
    strategy:
      "B16's signal stack with a regime overlay. Flips bias by Fear & Greed + VIX z-scores to align with macro positioning.",
  },
  {
    id: "b18",
    dir: "jarvis-b18",
    name: "Vol-Rank Breakout",
    tagline: "Top-10 ATR% range extremes",
    strategy:
      "Hourly scan: top-10 most volatile HL perps by ATR%. Limit at 100% of 24h range for any within 85% of extreme. Peak-retracement trail, opposite-extreme stop.",
  },
  {
    id: "b19",
    dir: "jarvis-b19",
    name: "Cascade Fade",
    tagline: "Liquidation reversal",
    strategy:
      "5m bar ≥ 4× ATR + ≥ 4× vol = cascade. Enter opposite direction with 0.3% buffer stop, 1.5R target or trail, 30-min time stop.",
  },
  {
    id: "b21",
    dir: "jarvis-b21",
    name: "Smart Money Divergence",
    tagline: "Funding × whale-flow",
    strategy:
      "Crowd direction (funding extreme) × whale net-flow direction. When they disagree, whales lead. 4 entry templates with funding-velocity inflection gating.",
  },
  {
    id: "b22",
    dir: "jarvis-b22",
    name: "Carry × Vol",
    tagline: "L2 carry/vol top-5 + SHORT confluence",
    strategy:
      "L2 selection of top-5 by carry/vol ratio, dir-agnostic. Layered with the audit-cleared rsi2 ∩ vpvr fade SHORT signal. Tier-C kicker on ultra-extreme funding.",
  },
];

type BookStats = {
  deposits: number;        // current "equity" — renamed for the public-facing card
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
  hourDelta: number | null;   // last-1h equity change (for sort)
  hourDeltaSource: "snapshots" | "trades" | null;
  startedAt: string | null;
};

function readBookStats(b: BookDef): BookStats | null {
  const base = path.join(DATA_DIR, b.dir);
  let ledger: any = {};
  let positions: any[] = [];
  let trades: any[] = [];
  try { ledger = JSON.parse(fs.readFileSync(path.join(base, "ledger.json"), "utf8")); }
  catch { return null; }
  try { positions = JSON.parse(fs.readFileSync(path.join(base, "positions.json"), "utf8")); } catch {}
  try {
    const raw = fs.readFileSync(path.join(base, "trades.jsonl"), "utf8");
    trades = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {}

  const start = ledger.starting_capital_usd ?? ledger.starting_capital ?? 10000;
  const deposits = ledger.equity_usd ?? ledger.current_equity_usd ?? ledger.cash_usd ?? start;
  const realized = ledger.realized_pnl_usd ?? 0;
  const fees = ledger.total_fees_paid ?? 0;
  const open = Array.isArray(positions) ? positions.length : 0;
  const lifetime = trades.length;

  const tradePnl = (t: any) => t.price_pnl_net_usd ?? t.net_pnl_usd ?? t.pnl_usd ?? 0;
  const wins = trades.filter((t) => tradePnl(t) > 0).length;
  const losses = lifetime - wins;
  const wr = lifetime > 0 ? (wins / lifetime) * 100 : 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayTrades = trades.filter((t) => (t.exit_time || "").startsWith(todayIso));
  const todayNet = todayTrades.reduce((s, t) => s + tradePnl(t), 0);

  // 1h delta — prefer snapshots, fallback to summing trades closed in last hour
  let hourDelta: number | null = null;
  let hourDeltaSource: BookStats["hourDeltaSource"] = null;
  if (Array.isArray(ledger.equity_snapshots) && ledger.equity_snapshots.length > 0) {
    const cutoff = Date.now() - 3_600_000;
    const past = [...ledger.equity_snapshots]
      .reverse()
      .find((s: any) => new Date(s.ts).getTime() <= cutoff);
    if (past?.equity != null) {
      hourDelta = deposits - past.equity;
      hourDeltaSource = "snapshots";
    }
  }
  if (hourDelta == null) {
    const cutoff = Date.now() - 3_600_000;
    const recentTrades = trades.filter((t) => {
      const exit = t.exit_time_ms ?? (t.exit_time ? Date.parse(t.exit_time) : 0);
      return exit >= cutoff;
    });
    if (recentTrades.length > 0) {
      hourDelta = recentTrades.reduce((s, t) => s + tradePnl(t), 0);
      hourDeltaSource = "trades";
    }
  }

  return {
    deposits: +deposits.toFixed(2),
    pnl: +(deposits - start).toFixed(2),
    pnlPct: start > 0 ? +(((deposits - start) / start) * 100).toFixed(2) : 0,
    realized: +realized.toFixed(2),
    fees: +fees.toFixed(2),
    open,
    lifetime,
    wins,
    losses,
    wr: +wr.toFixed(1),
    todayClosed: todayTrades.length,
    todayNet: +todayNet.toFixed(2),
    hourDelta: hourDelta != null ? +hourDelta.toFixed(2) : null,
    hourDeltaSource,
    startedAt: ledger.started_at ?? null,
  };
}

export async function GET() {
  const out = BOOKS.map((b) => ({ ...b, stats: readBookStats(b) }));
  return NextResponse.json({ books: out, updatedAt: new Date().toISOString() });
}
