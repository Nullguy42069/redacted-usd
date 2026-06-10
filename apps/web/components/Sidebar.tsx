"use client";
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography, Tooltip } from "@mui/material";
import {
  Dashboard,
  AccountBalanceWallet,
  SwapHoriz,
  ContactPage,
  Apps,
  Settings,
  CompareArrows,
  CallSplit,
  Savings,
  ShowChart,
  ChevronLeft,
  ChevronRight,
  AccountTree,
} from "@mui/icons-material";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const NAV = [
  { label: "Overview", path: "/", icon: <Dashboard /> },
  { label: "Vaults", path: "/vaults", icon: <AccountTree /> },
  { label: "Assets", path: "/assets", icon: <AccountBalanceWallet /> },
  { label: "Transactions", path: "/transactions", icon: <SwapHoriz /> },
  { label: "Address book", path: "/address-book", icon: <ContactPage /> },
  { label: "Apps", path: "/apps", icon: <Apps /> },
  { label: "Settings", path: "/settings", icon: <Settings /> },
] as const;

const DEFI = [
  { label: "Swap", path: "/swap", icon: <CompareArrows /> },
  { label: "Bridge", path: "/bridge", icon: <CallSplit /> },
  { label: "Earn", path: "/earn", icon: <Savings /> },
  { label: "Perps", path: "/perps", icon: <ShowChart /> },
] as const;

function RedactedMark() {
  return (
    <svg width="52" height="52" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGradNew" x1="0%" y1="15%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="35%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>
        <linearGradient id="lineGradNew" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>
      </defs>

      {/* Left chevron layers */}
      <path d="M8 18 L22 32 L8 46" stroke="url(#logoGradNew)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 18 L28 32 L14 46" stroke="url(#logoGradNew)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />

      {/* Right chevron layers */}
      <path d="M42 18 L56 32 L42 46" stroke="url(#logoGradNew)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 18 L50 32 L36 46" stroke="url(#logoGradNew)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />

      {/* Central circle + $ */}
      <circle cx="32" cy="32" r="8" fill="#0F172A" />
      <text x="32" y="36" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui">$</text>

      {/* Horizontal lines */}
      <line x1="2" y1="32" x2="14" y2="32" stroke="url(#lineGradNew)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="32" x2="62" y2="32" stroke="url(#lineGradNew)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const isInDrawer = !!onNavigate;
  const effectiveCollapsed = isInDrawer ? false : collapsed;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("redacted-sidebar-collapsed");
      if (saved === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("redacted-sidebar-collapsed", String(next));
    } catch {}
  };

  const renderGroup = (items: readonly { label: string; path: string; icon: React.ReactNode }[]) =>
    items.map((item) => {
      if (effectiveCollapsed) {
        return (
          <Tooltip key={item.path} title={item.label} placement="right" arrow>
            <ListItemButton
              selected={pathname === item.path}
              onClick={() => {
                router.push(item.path);
                onNavigate?.();
              }}
              sx={{
                borderRadius: 1,
                mx: effectiveCollapsed ? 0.5 : 1,
                mb: 0.5,
                justifyContent: "center",
                px: 0,
                "&.Mui-selected": {
                  bgcolor: "rgba(124,58,237,0.12)",
                  color: "primary.main",
                  "& .MuiListItemIcon-root": { color: "primary.main" },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 24,
                  color: "text.secondary",
                  justifyContent: "center",
                }}
              >
                {item.icon}
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        );
      }
      return (
        <ListItemButton
          key={item.path}
          selected={pathname === item.path}
          onClick={() => {
            router.push(item.path);
            onNavigate?.();
          }}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: "flex-start",
            px: 1,
            "&.Mui-selected": {
              bgcolor: "rgba(124,58,237,0.12)",
              color: "primary.main",
              "& .MuiListItemIcon-root": { color: "primary.main" },
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
        </ListItemButton>
      );
    });

  return (
    <Box
      sx={{
        width: effectiveCollapsed ? 64 : 232,
        flexShrink: 0,
        bgcolor: "background.paper",
        borderRight: "1px solid",
        borderColor: "divider",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        py: 2,
      }}
    >
      <Box
        sx={{
          px: effectiveCollapsed ? 1 : 2.5,
          mt: 0.5,
          mb: effectiveCollapsed ? 2 : 3,
          display: "flex",
          alignItems: "center",
          gap: effectiveCollapsed ? 0 : 1.25,
          justifyContent: effectiveCollapsed ? "center" : "flex-start",
        }}
      >
        <RedactedMark />
        {!effectiveCollapsed && (
          <Box sx={{ ml: 1.5 }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "1.25rem",
                lineHeight: 1,
                background: "linear-gradient(90deg, #7C3AED 0%, #14B8A6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "0.5px",
              }}
            >
              REDACTED
            </Typography>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: "0.78rem",
                lineHeight: 1,
                color: "#F8FAFC",
                letterSpacing: "1.2px",
                mt: "-2px",
                position: "relative",
                display: "inline-block",
              }}
            >
              USD
              <span
                style={{
                  position: "absolute",
                  bottom: "-2px",
                  left: 0,
                  width: "100%",
                  height: "1.5px",
                  background: "linear-gradient(90deg, #14B8A6 0%, #3B82F6 100%)",
                }}
              />
            </Typography>
          </Box>
        )}
      </Box>
      <List sx={{ p: 0 }}>{renderGroup(NAV)}</List>
      {!effectiveCollapsed && (
        <Typography variant="caption" sx={{ px: 3, mt: 2, mb: 1, color: "text.secondary", textTransform: "uppercase", letterSpacing: 1 }}>
          DeFi
        </Typography>
      )}
      <List sx={{ p: 0 }}>{renderGroup(DEFI)}</List>

      {/* Bottom section - Safe style */}
      <Box sx={{ mt: "auto", px: 1.5, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
        {(() => {
          const apiBtn = (
            <ListItemButton
              onClick={() => {
                window.location.href = "/api";
                onNavigate?.();
              }}
              sx={{
                borderRadius: 1,
                mx: effectiveCollapsed ? 0.5 : 1,
                mb: 0.5,
                color: "text.secondary",
                "&:hover": { bgcolor: "action.hover" },
                justifyContent: effectiveCollapsed ? "center" : "flex-start",
              }}
            >
              <ListItemIcon sx={{ minWidth: effectiveCollapsed ? 24 : 36, color: "text.secondary", justifyContent: "center" }}>
                <Box component="span" sx={{ fontSize: 18 }}>🔗</Box>
              </ListItemIcon>
              {!effectiveCollapsed && <ListItemText primary="API" slotProps={{ primary: { sx: { fontSize: 14 } } }} />}
            </ListItemButton>
          );
          return effectiveCollapsed ? <Tooltip title="API" placement="right" arrow>{apiBtn}</Tooltip> : apiBtn;
        })()}

        {(() => {
          const helpBtn = (
            <ListItemButton
              onClick={() => {
                router.push("/help");
                onNavigate?.();
              }}
              sx={{
                borderRadius: 1,
                mx: effectiveCollapsed ? 0.5 : 1,
                color: "text.secondary",
                "&:hover": { bgcolor: "action.hover" },
                justifyContent: effectiveCollapsed ? "center" : "flex-start",
              }}
            >
              <ListItemIcon sx={{ minWidth: effectiveCollapsed ? 24 : 36, color: "text.secondary", justifyContent: "center" }}>
                <Box component="span" sx={{ fontSize: 18 }}>❓</Box>
              </ListItemIcon>
              {!effectiveCollapsed && <ListItemText primary="Help" slotProps={{ primary: { sx: { fontSize: 14 } } }} />}
            </ListItemButton>
          );
          return effectiveCollapsed ? <Tooltip title="Help" placement="right" arrow>{helpBtn}</Tooltip> : helpBtn;
        })()}

        {/* Collapse/expand arrow below Help (desktop only; drawer always expanded full width) */}
        {!isInDrawer && (
          <Tooltip title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right" arrow>
            <ListItemButton
              onClick={toggleCollapsed}
              sx={{
                borderRadius: 1,
                mx: effectiveCollapsed ? 0.5 : 1,
                mt: 0.5,
                color: "text.secondary",
                "&:hover": { bgcolor: "action.hover" },
                justifyContent: "center",
              }}
            >
              <ListItemIcon sx={{ minWidth: 24, color: "text.secondary", justifyContent: "center" }}>
                {effectiveCollapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
