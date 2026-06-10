"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  TextField,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Divider,
} from "@mui/material";
import {
  Search as SearchIcon,
  Send,
  SwapHoriz,
  Build,
  AccountBalance,
  Close,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  description?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Send",
    icon: <Send fontSize="small" />,
    path: "/send",
    description: "Send tokens or assets",
  },
  {
    label: "Swap",
    icon: <SwapHoriz fontSize="small" />,
    path: "/swap",
    description: "Swap tokens",
  },
  {
    label: "Transaction builder",
    icon: <Build fontSize="small" />,
    path: "/transactions",
    description: "Build custom transactions",
  },
  {
    label: "Assets",
    icon: <AccountBalance fontSize="small" />,
    path: "/assets",
    description: "View all assets",
  },
  // Add more as you build features (e.g. Private Vote, Bridge, Earn, etc.)
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filteredItems = NAV_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = (path: string) => {
    router.push(path);
    onClose();
    setSearch(""); // reset for next time
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            bgcolor: "background.paper",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
            mt: -10, // position it nicely like Safe's floating palette
          },
        },
        backdrop: {
          sx: { bgcolor: "rgba(0,0,0,0.6)" },
        },
      }}
    >
      <DialogContent sx={{ p: 0, overflow: "hidden" }}>
        {/* Search Input */}
        <Box sx={{ p: 2, pb: 1 }}>
          <TextField
            autoFocus
            fullWidth
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: "rgba(255,255,255,0.04)",
                borderRadius: 2,
              },
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: "text.secondary", mr: 1 }} />,
            }}
            variant="outlined"
          />
        </Box>

        {/* Navigate to section */}
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontWeight: 600, pl: 1 }}
          >
            Navigate to
          </Typography>
        </Box>

        <List dense sx={{ py: 0 }}>
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <ListItemButton
                key={item.label}
                onClick={() => handleSelect(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 2,
                  "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  secondary={item.description}
                  primaryTypographyProps={{ fontSize: "0.95rem" }}
                  secondaryTypographyProps={{ fontSize: "0.75rem" }}
                />
              </ListItemButton>
            ))
          ) : (
            <Box sx={{ px: 2, py: 2, color: "text.secondary", fontSize: "0.9rem" }}>
              No results found
            </Box>
          )}
        </List>

        {/* Trusted safes section (placeholder for now) */}
        <Divider sx={{ my: 1, mx: 2 }} />
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontWeight: 600, pl: 1 }}
          >
            Trusted safes
          </Typography>
        </Box>

        <Box sx={{ px: 2, pb: 2, color: "text.secondary", fontSize: "0.85rem" }}>
          (Coming soon — your other multisigs will appear here)
        </Box>
      </DialogContent>
    </Dialog>
  );
}
