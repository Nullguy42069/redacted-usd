"use client";

import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  Button,
  IconButton,
} from "@mui/material";
import { Close, InfoOutlined, ArrowUpward, ArrowDownward } from "@mui/icons-material";
import { useRouter } from "next/navigation";

interface BatchedTransactionsModalProps {
  open: boolean;
  onClose: () => void;
}

export function BatchedTransactionsModal({ open, onClose }: BatchedTransactionsModalProps) {
  const router = useRouter();

  const handleNewTransaction = () => {
    onClose();
    // For now, navigate to the transactions page which has the builder
    // Later we can open a specific "add to batch" flow
    router.push("/transactions");
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
            bgcolor: "#1C1C1E",
            borderRadius: 3,
            border: "1px solid #3A3A3C",
            color: "#FFFFFF",
          },
        },
        backdrop: {
          sx: { bgcolor: "rgba(0,0,0,0.6)" },
        },
      }}
    >
      <DialogContent sx={{ p: 0, position: "relative" }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: "1px solid #2C2C2E", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Batched transactions
          </Typography>
          <IconButton onClick={onClose} sx={{ color: "#8E8E93" }}>
            <Close />
          </IconButton>
        </Box>

        {/* Main content */}
        <Box sx={{ p: 4, textAlign: "center" }}>
          {/* Icon */}
          <Box sx={{ mb: 3, position: "relative", display: "inline-block" }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
              }}
            >
              {/* Three stacked layers */}
              <Box sx={{ width: 48, height: 12, bgcolor: "#3A3A3C", borderRadius: 1 }} />
              <Box sx={{ width: 48, height: 12, bgcolor: "#3A3A3C", borderRadius: 1 }} />
              <Box sx={{ width: 48, height: 12, bgcolor: "#3A3A3C", borderRadius: 1 }} />
            </Box>

            {/* Sparkle and arrows */}
            <Box sx={{ position: "absolute", top: -8, right: -8, color: "#8B5CF6" }}>
              ✨
            </Box>
            <ArrowUpward sx={{ position: "absolute", top: 8, right: -12, fontSize: 16, color: "#8E8E93" }} />
            <ArrowDownward sx={{ position: "absolute", bottom: 8, right: -12, fontSize: 16, color: "#8E8E93" }} />
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
            Add an initial transaction to the batch
          </Typography>

          <Typography sx={{ color: "#8E8E93", fontSize: "0.9rem", mb: 3, lineHeight: 1.5 }}>
            Save gas and signatures by adding multiple Safe transactions to a single batch
            transaction. You can reorder and delete individual transactions in a batch.
          </Typography>

          <Button
            variant="contained"
            onClick={handleNewTransaction}
            sx={{
              bgcolor: "#374151",
              color: "#D1D5DB",
              textTransform: "none",
              borderRadius: 2,
              px: 3,
              py: 1,
              "&:hover": { bgcolor: "#4B5563" },
            }}
          >
            New transaction
          </Button>
        </Box>

        {/* Info section */}
        <Box sx={{ px: 3, pb: 4, borderTop: "1px solid #2C2C2E", pt: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <InfoOutlined sx={{ color: "#6B7280", fontSize: 18 }} />
            <Typography sx={{ color: "#6B7280", fontSize: "0.85rem" }}>
              What type of transactions can you add to the batch?
            </Typography>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            <Box>
              <Box sx={{ fontSize: 20, mb: 0.5 }}>🔗</Box>
              <Typography sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                Token and NFT transfers
              </Typography>
            </Box>
            <Box>
              <Box sx={{ fontSize: 20, mb: 0.5 }}>📱</Box>
              <Typography sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                Safe App transactions
              </Typography>
            </Box>
            <Box>
              <Box sx={{ fontSize: 20, mb: 0.5 }}>⚙️</Box>
              <Typography sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                Vault settings
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
