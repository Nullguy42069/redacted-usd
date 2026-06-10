"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  Button,
  IconButton,
  Grid,
  Card,
  CardContent,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useWallet } from "@solana/wallet-adapter-react";

interface WalletSelectionModalProps {
  open: boolean;
  onClose: () => void;
}

interface WalletOption {
  name: string;
  icon: React.ReactNode;
  color: string;
  adapterName?: string;
  isHardware?: boolean;
}

export function WalletSelectionModal({ 
  open, 
  onClose 
}: WalletSelectionModalProps) {
  const { wallets, select } = useWallet();
  const [connecting, setConnecting] = useState<string | null>(null);

  // Curated list of popular wallets (matching the Safe screenshot)
  const walletOptions: WalletOption[] = [
    { name: "Phantom", icon: "👻", color: "#AB9FF2", adapterName: "Phantom", installUrl: "https://phantom.app" },
    { name: "Solflare", icon: "🔥", color: "#FF6B35", adapterName: "Solflare", installUrl: "https://solflare.com" },
    { name: "Backpack", icon: "🎒", color: "#FF4D4D", adapterName: "Backpack", installUrl: "https://backpack.app" },
    { name: "Brave Wallet", icon: "🦁", color: "#FF5500", adapterName: "BraveWallet", installUrl: "https://brave.com/wallet" },
    { name: "Coinbase Wallet", icon: "🔵", color: "#0052FF", adapterName: "CoinbaseWallet", installUrl: "https://wallet.coinbase.com" },
    { name: "Ledger", icon: "🔒", color: "#000000", adapterName: "Ledger", isHardware: true, installUrl: "https://www.ledger.com/ledger-live" },
    { name: "Trezor", icon: "🔐", color: "#000000", adapterName: "Trezor", isHardware: true, installUrl: "https://trezor.io" },
  ];

  const handleSelect = async (option: WalletOption) => {
    setConnecting(option.name);

    try {
      // Try to find a matching detected wallet
      const detected = wallets.find(w =>
        w.adapter.name.toLowerCase().includes((option.adapterName || option.name).toLowerCase())
      );

      if (detected) {
        await select(detected.adapter.name);
        onClose();
      } else if (option.isHardware) {
        alert(
          `${option.name} requires the hardware wallet adapter. ` +
          "Install the official Solana Ledger or Trezor support and refresh the page."
        );
      } else {
        alert(`${option.name} is not detected. Please install the browser extension and refresh.`);
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);
      alert("Failed to connect. Please try again.");
    } finally {
      setConnecting(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            bgcolor: "#1C1C1E",
            borderRadius: 3,
            border: "1px solid #3A3A3C",
            color: "#FFFFFF",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            overflow: "hidden",
          },
        },
      }}
    >
      <DialogContent sx={{ p: 0, display: "flex", flexDirection: { xs: "column", md: "row" }, minHeight: 420 }}>
        {/* Left panel - Info */}
        <Box sx={{ 
          width: { xs: "100%", md: "38%" }, 
          bgcolor: "#161618", 
          p: 4,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center"
        }}>
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Redacted USD logo - matching the clean layered gradient version from the image */}
            <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="10%" x2="100%" y2="90%">
                  <stop offset="0%" stopColor="#7C3AED"/>
                  <stop offset="35%" stopColor="#3B82F6"/>
                  <stop offset="100%" stopColor="#14B8A6"/>
                </linearGradient>
                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7C3AED"/>
                  <stop offset="100%" stopColor="#14B8A6"/>
                </linearGradient>
              </defs>
              
              {/* Layered chevron logo (the main icon) */}
              <path d="M10 14 L20 24 L10 34" stroke="url(#logoGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 14 L25 24 L15 34" stroke="url(#logoGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 14 L30 24 L20 34" stroke="url(#logoGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
              
              {/* Central circle with $ */}
              <circle cx="20" cy="24" r="6" fill="#0F172A" stroke="#0F172A"/>
              <text x="20" y="27.5" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="system-ui">$</text>
              
              {/* Horizontal accent lines */}
              <line x1="2" y1="24" x2="9" y2="24" stroke="url(#lineGrad)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="31" y1="24" x2="46" y2="24" stroke="url(#lineGrad)" strokeWidth="2" strokeLinecap="round"/>
            </svg>

            {/* Wordmark - matching reference */}
            <Box>
              <Typography 
                sx={{ 
                  fontWeight: 700, 
                  fontSize: '1.45rem', 
                  lineHeight: 1,
                  background: 'linear-gradient(90deg, #3B82F6 0%, #14B8A6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.5px'
                }}
              >
                REDACTED
              </Typography>
              <Typography 
                sx={{ 
                  fontWeight: 600, 
                  fontSize: '0.9rem', 
                  lineHeight: 1,
                  color: '#F8FAFC',
                  letterSpacing: '1.5px',
                  mt: '-3px',
                  position: 'relative',
                  display: 'inline-block'
                }}
              >
                USD
                <span style={{
                  position: 'absolute',
                  bottom: '-2px',
                  left: 0,
                  width: '100%',
                  height: '1.5px',
                  background: 'linear-gradient(90deg, #14B8A6 0%, #3B82F6 100%)'
                }} />
              </Typography>
            </Box>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Connect your wallet
          </Typography>

          <Typography sx={{ color: "#8E8E93", fontSize: "0.9rem", mb: 3, lineHeight: 1.5 }}>
            Connecting your wallet is like "logging in" to Web3. Select your wallet from the options to get started.
          </Typography>

          <Typography 
            onClick={() => {
              // Open helpful links for popular wallets
              const urls = [
                "https://phantom.app",
                "https://solflare.com",
                "https://backpack.app"
              ];
              urls.forEach(url => window.open(url, "_blank"));
            }}
            sx={{ 
              color: "#22C55E", 
              fontSize: "0.85rem", 
              display: "flex", 
              alignItems: "center", 
              gap: 0.5,
              cursor: "pointer",
              "&:hover": { textDecoration: "underline" }
            }}
          >
            I don't have a wallet 
            <span style={{ fontSize: 14 }}>ⓘ</span>
          </Typography>

          <Box sx={{ mt: "auto", pt: 4 }}>
            <Typography sx={{ fontSize: "0.7rem", color: "#6B7280" }}>
              powered by <span style={{ color: "#FF4D4D" }}>●</span> Solana
            </Typography>
          </Box>
        </Box>

        {/* Right panel - Wallet grid */}
        <Box sx={{ flex: 1, p: 3, overflow: "auto" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, pr: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "1rem" }}>
              Available Wallets
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button 
                size="small" 
                onClick={() => window.location.reload()} 
                sx={{ textTransform: "none", color: "#8E8E93", fontSize: "0.75rem" }}
              >
                Refresh detection
              </Button>
              <IconButton onClick={onClose} sx={{ color: "#8E8E93" }}>
                <Close />
              </IconButton>
            </Box>
          </Box>

          <Grid container spacing={1.5}>
            {walletOptions.map((wallet) => {
              const isDetected = !wallet.isHardware && 
                wallets.some(w => 
                  w.adapter.name.toLowerCase().includes((wallet.adapterName || wallet.name).toLowerCase()) &&
                  w.readyState === 'Installed'
                );

              const isInstallable = !wallet.isHardware && !isDetected && wallet.installUrl;

              return (
                <Grid size={6} key={wallet.name}>
                  <Card
                    onClick={() => handleSelect(wallet)}
                    sx={{
                      bgcolor: "#2C2C2E",
                      border: "1px solid #3A3A3C",
                      borderRadius: 2,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      opacity: connecting === wallet.name ? 0.6 : 1,
                      "&:hover": {
                        borderColor: isDetected ? "#22C55E" : "#4B5563",
                        transform: "translateY(-1px)",
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box 
                        sx={{ 
                          width: 36, 
                          height: 36, 
                          borderRadius: '50%',
                          bgcolor: 'rgba(255,255,255,0.06)',
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          flexShrink: 0,
                          border: '1px solid rgba(255,255,255,0.08)',
                          overflow: 'hidden'
                        }}
                      >
                        {typeof wallet.icon === 'string' ? (
                          <Box sx={{ 
                            color: wallet.color, 
                            fontSize: 20,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {wallet.icon}
                          </Box>
                        ) : (
                          wallet.icon
                        )}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 500 }}>
                          {wallet.name}
                        </Typography>
                        {isDetected && (
                          <Typography sx={{ fontSize: "0.7rem", color: "#22C55E", fontWeight: 500 }}>
                            Detected — Click to connect
                          </Typography>
                        )}
                        {isInstallable && (
                          <Typography sx={{ fontSize: "0.7rem", color: "#F59E0B" }}>
                            Not installed — Click to get
                          </Typography>
                        )}
                        {wallet.isHardware && (
                          <Typography sx={{ fontSize: "0.7rem", color: "#F59E0B" }}>
                            Connect hardware device
                          </Typography>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Typography sx={{ mt: 3, fontSize: "0.7rem", color: "#6B7280", textAlign: "center" }}>
            More wallets available via browser extensions
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
