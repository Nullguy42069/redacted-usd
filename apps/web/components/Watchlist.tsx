"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Avatar,
} from "@mui/material";
import { Delete, Search, Refresh, DragIndicator } from "@mui/icons-material";
import { fetchPrices } from "@/lib/jupiter";
import { HELIUS_API_KEY } from "@/lib/env";
import { useMultisig } from "@/components/MultisigContext";
import {
  getWatchlistFavs,
  setWatchlistFavs,
  getWatchlistLayout,
  setWatchlistLayout,
  type WatchlistFav,
  type WatchlistLayout,
} from "@/lib/vault-store";
import { getHeliusTokenMetas } from "@/lib/assets";

interface ListItem {
  id: string; // cg id or ticker or ca
  name: string;
  symbol: string;
  ca?: string; // for tokens
  type: "defi" | "tradfi";
  logoURI?: string;  // for non-Solana items that won't get enriched via Helius DAS
}

const DEFI_LIST: ListItem[] = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", type: "defi", logoURI: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png" },
  { id: "solana", name: "Solana", symbol: "SOL", ca: "So11111111111111111111111111111111111111112", type: "defi" },
  { id: "hyperliquid", name: "Hyperliquid", symbol: "HYPE", type: "defi", logoURI: "https://assets.coingecko.com/coins/images/50882/large/hyperliquid.jpg" },
  { id: "zcash", name: "Zcash", symbol: "ZEC", type: "defi", logoURI: "https://assets.coingecko.com/coins/images/486/large/circle-zcash-color.png" },
  { id: "jupiter-exchange-solana", name: "Jupiter", symbol: "JUP", ca: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", type: "defi" },
  { id: "bonk", name: "Bonk", symbol: "BONK", ca: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", type: "defi" },
  { id: "dogwifcoin", name: "dogwifhat", symbol: "WIF", ca: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", type: "defi" },
  { id: "popcat", name: "Popcat", symbol: "POPCAT", ca: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", type: "defi" },
  { id: "cat-in-a-dogs-world", name: "cat in a dogs world", symbol: "MEW", ca: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", type: "defi" },
  { id: "book-of-meme", name: "Book of Meme", symbol: "BOME", ca: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", type: "defi" },
  { id: "raydium", name: "Raydium", symbol: "RAY", ca: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", type: "defi" },
];

const TRADFI_LIST: ListItem[] = [
  { id: "SPY", name: "S&P 500", symbol: "SPY", ca: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", type: "tradfi" },
  { id: "QQQ", name: "Nasdaq-100", symbol: "QQQ", ca: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", type: "tradfi" },
  { id: "AAPL", name: "Apple", symbol: "AAPL", ca: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", type: "tradfi" },
  { id: "TSLA", name: "Tesla", symbol: "TSLA", ca: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", type: "tradfi" },
  { id: "NVDA", name: "NVIDIA", symbol: "NVDA", ca: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", type: "tradfi" },
  { id: "AMZN", name: "Amazon", symbol: "AMZN", ca: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", type: "tradfi" },
  { id: "MSFT", name: "Microsoft", symbol: "MSFT", ca: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", type: "tradfi" },
  { id: "GOOGL", name: "Alphabet", symbol: "GOOGL", ca: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", type: "tradfi" },
  { id: "META", name: "Meta Platforms", symbol: "META", ca: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", type: "tradfi" },
  { id: "AMD", name: "AMD", symbol: "AMD", ca: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF", type: "tradfi" },
  { id: "NFLX", name: "Netflix", symbol: "NFLX", ca: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", type: "tradfi" },
  { id: "AVGO", name: "Broadcom", symbol: "AVGO", ca: "XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo", type: "tradfi" },
];

const ALL_KNOWN = [...DEFI_LIST, ...TRADFI_LIST];

interface PriceData {
  price: number;
  change24h: number | null;
}

export function Watchlist() {
  // Key watchlist persistence on the *connected wallet* (personalPublicKey)
  // rather than activeOwner. That way the same wallet's customizations follow
  // it whether the user is in Wallet mode or Vault mode — one watchlist per
  // user, not one per (wallet, vault) pair. Switching wallets loads the new
  // wallet's watchlist; switching modes does not reset.
  const { personalPublicKey } = useMultisig();
  const ownerKey = personalPublicKey ? personalPublicKey.toBase58() : null;

  const [favs, setFavs] = useState<WatchlistFav[]>([]);
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Resizable & draggable panels (order + % heights sum to ~100; keyed per owner)
  const [panelHeights, setPanelHeights] = useState<number[]>([38, 37, 25]);
  const [sectionOrder, setSectionOrder] = useState<string[]>(["defi", "tradfi", "favs"]);
  const panelsContainerRef = useRef<HTMLDivElement>(null);

  // Load per-owner layout + favs (with legacy global fallback)
  useEffect(() => {
    const layout = getWatchlistLayout(ownerKey);
    if (layout) {
      if (Array.isArray(layout.order) && layout.order.length === 3) setSectionOrder(layout.order);
      if (Array.isArray(layout.heights) && layout.heights.length === 3) setPanelHeights(layout.heights);
    }
    const savedFavs = getWatchlistFavs(ownerKey);
    if (savedFavs.length) setFavs(savedFavs);
  }, [ownerKey]);

  const saveLayout = (o: string[], h: number[]) => {
    setSectionOrder(o);
    setPanelHeights(h);
    if (ownerKey) {
      setWatchlistLayout(ownerKey, { order: o, heights: h });
    } else {
      // global fallback (rare)
      try {
        localStorage.setItem("watchlist-order", JSON.stringify(o));
        localStorage.setItem("watchlist-heights", JSON.stringify(h));
      } catch {}
    }
  };

  const saveFavs = (newFavs: WatchlistFav[]) => {
    setFavs(newFavs);
    setWatchlistFavs(ownerKey, newFavs);
  };

  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = [...panelHeights];
    const container = panelsContainerRef.current;
    if (!container) return;
    const onMove = (me: MouseEvent) => {
      const deltaY = me.clientY - startY;
      const rect = container.getBoundingClientRect();
      const deltaPct = (deltaY / rect.height) * 100;
      let newH = [...startH];
      newH[index] = Math.max(10, (newH[index] ?? 0) + deltaPct);
      newH[index + 1] = Math.max(10, (newH[index + 1] ?? 0) - deltaPct);
      const sum = newH.reduce((a, b) => a + b, 0);
      newH = newH.map((hh) => (hh / sum) * 100);
      saveLayout(sectionOrder, newH);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove as any);
      document.removeEventListener("mouseup", onUp as any);
    };
    document.addEventListener("mousemove", onMove as any);
    document.addEventListener("mouseup", onUp as any);
  };

  const onSectionDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const onSectionDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onSectionDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const dragIndex = parseInt(raw, 10);
    if (isNaN(dragIndex) || dragIndex === dropIndex) return;
    const newOrder = [...sectionOrder];
    const moved = newOrder.splice(dragIndex, 1)[0];
    if (!moved) return;
    newOrder.splice(dropIndex, 0, moved);
    const newH = [...panelHeights];
    const movedH = newH.splice(dragIndex, 1)[0];
    if (movedH === undefined) return;
    newH.splice(dropIndex, 0, movedH);
    saveLayout(newOrder, newH);
  };

  // Fetch prices periodically. Prefer Helius (DAS price_info + our RPC) for all xStocks/TradFi and token cas.
  // Keeps CG for non-Solana (BTC/HYPE/ZEC) and Jupiter for 24h where available on defi cas.
  const fetchAllPrices = async () => {
    setLoadingPrices(true);
    const newPrices: Record<string, PriceData> = {};

    // Crypto via CoinGecko (BTC, HYPE, ZEC + defi ids)
    const cgIds = DEFI_LIST.map((d) => d.id);
    const favCg = favs.filter((f) => f.type === "defi" && !f.ca).map((f) => f.id);
    const allCg = Array.from(new Set([...cgIds, ...favCg]));
    if (allCg.length) {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${allCg.join(",")}&vs_currencies=usd&include_24hr_change=true`
        );
        const data = await res.json();
        for (const [id, v] of Object.entries(data)) {
          const val = v as any;
          newPrices[id] = {
            price: val.usd || 0,
            change24h: val.usd_24h_change ?? null,
          };
        }
      } catch (e) {
        console.warn("CG price fetch failed", e);
      }
    }

    // Solana tokens + xStocks via Jupiter (gives price + 24h change for liquid ones)
    const allCas = [
      ...DEFI_LIST.filter((d) => d.ca).map((d) => d.ca!),
      ...TRADFI_LIST.filter((t) => t.ca).map((t) => t.ca!),
      ...favs.filter((f) => f.ca).map((f) => f.ca!),
    ];
    const uniqueCas = Array.from(new Set(allCas));
    if (uniqueCas.length) {
      try {
        const jPrices = await fetchPrices(uniqueCas);
        for (const [mint, p] of Object.entries(jPrices)) {
          if (p) {
            newPrices[mint] = { price: p.price, change24h: p.priceChange24h ?? null };
          }
        }
      } catch (e) {
        console.warn("Jupiter prices failed", e);
      }
    }

    // Fallback / extra: xStocks + tradfi cas via Helius DAS price_info (single source, works even if no jup pool yet)
    const tradfiMints = Array.from(
      new Set([
        ...TRADFI_LIST.filter((s) => s.ca).map((s) => s.ca!),
        ...favs.filter((f) => f.type === "tradfi" && f.ca).map((f) => f.ca!),
      ])
    );
    if (tradfiMints.length) {
      try {
        const metas = await getHeliusTokenMetas(tradfiMints);
        for (const [mint, m] of Object.entries(metas)) {
          const p = (m as any)?.priceUsd;
          if (p != null && !newPrices[mint]) {
            newPrices[mint] = { price: Number(p), change24h: null };
          }
        }
      } catch (e) {
        console.warn("Helius xStock price fallback failed", e);
      }
    }

    setPrices((prev) => ({ ...prev, ...newPrices }));
    setLoadingPrices(false);
  };

  useEffect(() => {
    fetchAllPrices();
    const iv = setInterval(fetchAllPrices, 60000); // refresh every 60s
    return () => clearInterval(iv);
  }, [favs]); // refetch when favs change for custom

  // Enrich xStocks (now in TRADFI) and DeFi with Helius DAS metadata (name, logo, priceUsd)
  const [enrichedMeta, setEnrichedMeta] = useState<Record<string, { name?: string; symbol?: string; logoURI?: string; priceUsd?: number | null }>>({});

  useEffect(() => {
    const mints: string[] = [];
    [...DEFI_LIST, ...TRADFI_LIST].forEach((d) => {
      if (d.ca) mints.push(d.ca);
    });
    if (mints.length > 0) {
      getHeliusTokenMetas(mints).then((m) => setEnrichedMeta((prev) => ({ ...prev, ...m })));
    }
  }, []);

  // Also enrich any custom fav cas (e.g. new token adds by CA)
  useEffect(() => {
    const cas = favs.filter((f) => f.ca).map((f) => f.ca!);
    if (cas.length > 0) {
      const missing = cas.filter((c) => !enrichedMeta[c]);
      if (missing.length) {
        getHeliusTokenMetas(missing).then((m) => setEnrichedMeta((prev) => ({ ...prev, ...m })));
      }
    }
  }, [favs]); // eslint will warn on enriched but we guard missing to avoid loops

  const isCA = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

  const filteredKnown = search.trim()
    ? ALL_KNOWN.filter(
        (k) =>
          k.name.toLowerCase().includes(search.toLowerCase()) ||
          k.symbol.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const handleAdd = async (item?: ListItem) => {
    const term = search.trim();
    if (!term) return;

    let toAdd: WatchlistFav | null = null;

    if (item) {
      toAdd = {
        id: item.id,
        name: item.name,
        symbol: item.symbol,
        ca: item.ca,
        type: item.type,
      };
    } else if (isCA(term)) {
      // fetch meta for CA via Helius DAS (preferred, consistent with assets + xstocks)
      let name = term.slice(0, 8);
      let symbol = "???";
      if (HELIUS_API_KEY) {
        try {
          const metas = await getHeliusTokenMetas([term]);
          const m = metas[term];
          if (m) {
            name = (m.name || name).trim();
            symbol = (m.symbol || symbol).trim();
          }
        } catch {}
      }
      toAdd = { id: term, name, symbol, ca: term, type: "defi" };
    } else {
      // try match known, else add as custom tradfi-like
      const match = ALL_KNOWN.find(
        (k) => k.name.toLowerCase() === term.toLowerCase() || k.symbol.toLowerCase() === term.toLowerCase()
      );
      if (match) {
        toAdd = { id: match.id, name: match.name, symbol: match.symbol, ca: match.ca, type: match.type };
      } else {
        toAdd = { id: term, name: term, symbol: term.toUpperCase(), type: "tradfi" };
      }
    }

    if (toAdd && !favs.some((f) => f.id === toAdd!.id)) {
      const next = [...favs, toAdd];
      saveFavs(next);
      // immediately enrich logo/price for new CA
      if (toAdd.ca) {
        getHeliusTokenMetas([toAdd.ca]).then((m) => setEnrichedMeta((prev) => ({ ...prev, ...m })));
      }
    }
    setSearch("");
  };

  const removeFav = (id: string) => {
    saveFavs(favs.filter((f) => f.id !== id));
  };

  const renderItem = (item: ListItem | WatchlistFav, isFav = false) => {
    const key = item.ca || item.id;
    const p = prices[key] || prices[item.id];
    const price = p?.price ?? 0;
    const ch = p?.change24h ?? null;
    const chColor = ch != null ? (ch >= 0 ? "success.main" : "error.main") : "text.secondary";
    const chText = ch != null ? `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%` : "—";
    const enriched = enrichedMeta[key] || enrichedMeta[item.id] || {};
    // Fall back to item.logoURI for non-Solana items (BTC, HYPE, ZEC) that
    // can't be enriched via Helius DAS (no Solana mint).
    const meta = {
      ...enriched,
      logoURI: enriched.logoURI || (item as ListItem).logoURI,
    };

    return (
      <Box
        key={item.id}
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          py: 0.6,
          px: 1,
          borderRadius: 1,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          {meta.logoURI ? (
            <Avatar src={meta.logoURI} sx={{ width: 18, height: 18, fontSize: 9, flexShrink: 0 }}>
              {item.symbol?.[0] || "?"}
            </Avatar>
          ) : null}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500, fontSize: 13 }} noWrap>
              {item.name}
            </Typography>
            <Typography sx={{ color: "text.secondary", fontSize: 11 }} noWrap>
              {item.symbol}
              {item.ca && item.type === "defi" && ` · ${item.ca.slice(0, 4)}...${item.ca.slice(-4)}`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
            ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Typography>
          <Typography sx={{ color: chColor, fontSize: 11 }}>{chText}</Typography>
        </Box>
        {isFav && (
          <IconButton size="small" onClick={() => removeFav(item.id)} sx={{ ml: 0.5, flexShrink: 0 }}>
            <Delete fontSize="small" />
          </IconButton>
        )}
      </Box>
    );
  };

  // Helpers for dynamic sections (order + heights drive the boxes; each fills its % of the tall container)
  const sectionTitles: Record<string, string> = {
    defi: "DeFi Tokens",
    tradfi: "TradFi Stocks & Indices",
    favs: "Favorites",
  };

  const getSectionContent = (key: string) => {
    if (key === "defi") return DEFI_LIST.map((item) => renderItem(item));
    if (key === "tradfi") return TRADFI_LIST.map((item) => renderItem(item));
    if (key === "favs") {
      return (
        <>
          {favs.length === 0 && (
            <Typography sx={{ color: "text.secondary", fontSize: 12, p: 1 }}>No favorites yet. Search above to add.</Typography>
          )}
          {favs.map((f) => renderItem(f, true))}
        </>
      );
    }
    return null;
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Title + global refresh (Helius/Jup/CG all feed here) */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 1, px: 1 }}>
        <Typography variant="h3" sx={{ flex: 1 }}>
          Watchlist
        </Typography>
        <IconButton size="small" onClick={fetchAllPrices} disabled={loadingPrices}>
          <Refresh fontSize="small" />
        </IconButton>
      </Box>

      {/* Search / add / suggestions (for Favorites; always visible so you can add even if favs box is small) */}
      <Box sx={{ px: 1, mb: 1 }}>
        <TextField
          size="small"
          placeholder="Search name or CA (mint)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: search ? 0.5 : 0 }}
        />
        {search && (
          <Button size="small" variant="contained" onClick={() => handleAdd()} sx={{ mt: 0.5, mb: 0.5 }}>
            Add to Favorites
          </Button>
        )}
        {search && filteredKnown.length > 0 && (
          <Box sx={{ mb: 0.5, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider", p: 0.5 }}>
            {filteredKnown.slice(0, 5).map((item) => (
              <Box
                key={item.id}
                onClick={() => handleAdd(item)}
                sx={{ p: 0.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, fontSize: 12 }}
              >
                {item.name} ({item.symbol})
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Resizable + draggable sections container — stretches to bottom of panel */}
      <Box
        ref={panelsContainerRef}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          gap: 0,
        }}
      >
        {sectionOrder.map((key, idx) => {
          const hPct = panelHeights[idx] ?? 33;
          const isLast = idx === sectionOrder.length - 1;
          return (
            <React.Fragment key={key}>
              <Box
                onDragOver={onSectionDragOver}
                onDrop={(e) => onSectionDrop(e, idx)}
                sx={{
                  height: `${hPct}%`,
                  minHeight: 72,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "background.paper",
                  flexShrink: 0,
                }}
              >
                {/* Draggable header (drag by the grip) */}
                <Box
                  draggable
                  onDragStart={(e) => onSectionDragStart(e, idx)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    cursor: "grab",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: "action.hover",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  <DragIndicator sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 600,
                      flex: 1,
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {sectionTitles[key] || key}
                  </Typography>
                </Box>

                {/* Scrollable content area (the list) */}
                <Box sx={{ flex: 1, overflow: "auto", p: 0.25, fontSize: 12 }}>
                  {getSectionContent(key)}
                </Box>
              </Box>

              {/* Vertical resize handle between boxes (drag up/down to stretch) */}
              {!isLast && (
                <Box
                  onMouseDown={(e) => startResize(idx, e)}
                  sx={{
                    height: "6px",
                    cursor: "row-resize",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    mx: "1px",
                    "&:hover": { "& > div": { bgcolor: "primary.main", opacity: 0.5 } },
                  }}
                >
                  <Box sx={{ width: 28, height: 2, bgcolor: "divider", borderRadius: 1 }} />
                </Box>
              )}
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
