"use client";
import { createTheme, type Theme } from "@mui/material/styles";

export type ThemeMode = "light" | "dark";

// Redacted palette: violet + cyan accents on neutral surfaces.
// Identical accent colors across modes — only surfaces and text invert.
export function getTheme(mode: ThemeMode): Theme {
  const isDark = mode === "dark";
  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: { main: "#7C3AED" },   // violet
      secondary: { main: "#22D3EE" }, // cyan
      background: {
        default: isDark ? "#0A0A0F" : "#F6F6FA",
        paper:   isDark ? "#121318" : "#FFFFFF",
      },
      divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
      text: {
        primary:   isDark ? "#FFFFFF" : "#0A0A0F",
        secondary: isDark ? "rgba(255,255,255,0.66)" : "rgba(0,0,0,0.62)",
      },
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: { fontSize: "2.5rem", fontWeight: 700 },
      h2: { fontSize: "2rem", fontWeight: 700 },
      h3: { fontSize: "1.5rem", fontWeight: 700 },
      body1: { fontSize: "0.95rem" },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600 },
        },
        variants: [
          {
            props: { variant: "contained", color: "primary" },
            style: {
              background: "linear-gradient(90deg, #7C3AED 0%, #22D3EE 100%)",
              color: "#0A0A0F",
              "&:hover": { filter: "brightness(1.1)" },
            },
          },
        ],
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
    },
  });
}
