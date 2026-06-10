"use client";

import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  Link,
  IconButton,
} from "@mui/material";
import { Notifications, Settings } from "@mui/icons-material";

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            bgcolor: "#1C1C1E", // Very close to Safe's dark card
            borderRadius: 3,
            border: "1px solid #3A3A3C",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3)",
            color: "#FFFFFF",
          },
        },
        backdrop: {
          sx: { bgcolor: "rgba(0, 0, 0, 0.7)" },
        },
      }}
    >
      <DialogContent sx={{ p: 0, overflow: "hidden" }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2.5, borderBottom: "1px solid #2C2C2E" }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
            Notifications
          </Typography>
        </Box>

        {/* Empty State */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 8,
            px: 2,
          }}
        >
          <Box sx={{ position: "relative", mb: 2 }}>
            <Notifications
              sx={{
                fontSize: 48,
                color: "#8E8E93",
              }}
            />
            {/* Snooze Z's */}
            <Typography
              sx={{
                position: "absolute",
                top: -4,
                right: -8,
                fontSize: "0.9rem",
                color: "#8E8E93",
                fontWeight: 500,
              }}
            >
              z z
            </Typography>
          </Box>

          <Typography sx={{ color: "#8E8E93", fontSize: "0.95rem" }}>
            No notifications
          </Typography>
        </Box>

        {/* Footer - Settings */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderTop: "1px solid #2C2C2E",
            display: "flex",
            alignItems: "center",
            gap: 1,
            cursor: "pointer",
            "&:hover": {
              bgcolor: "rgba(255,255,255,0.03)",
            },
          }}
          onClick={() => {
            // TODO: Open push notification settings modal later
            onClose();
            // For now we can alert or navigate to a settings page
            console.log("Open push notifications settings");
          }}
        >
          <Settings sx={{ fontSize: 18, color: "#30D158" }} />
          <Typography
            sx={{
              color: "#30D158",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Push notifications settings
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
