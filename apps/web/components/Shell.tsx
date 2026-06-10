"use client";
import { useState } from "react";
import { Box, Drawer, IconButton, useMediaQuery, useTheme } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function Shell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = <Sidebar onNavigate={() => setMobileOpen(false)} />;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Permanent left sidebar (Safe style). Always in DOM; CSS hides on small screens so it doesn't get "deleted" on narrow viewports or hydration timing.
          The JS media query below only controls whether to show the hamburger + temporary drawer. */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <Sidebar />
      </Box>

      {/* Mobile / narrow drawer (always available) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        slotProps={{ paper: { sx: { width: 232, bgcolor: "background.paper", borderRight: "1px solid", borderColor: "divider" } } }}
      >
        {sidebarContent}
      </Drawer>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <Box sx={{ flex: 1, p: { xs: 2, sm: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
