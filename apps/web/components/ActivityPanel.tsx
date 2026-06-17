"use client";

import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
} from "@mui/material";
import { History, CheckCircle, HourglassEmpty } from "@mui/icons-material";

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ActivityPanel({ open, onClose }: ActivityPanelProps) {
  // Placeholder data - will be replaced with real transaction/activity data later
  const activities: { type: string; description: string; status: string; timestamp: string }[] = [
    // Example structure for when we wire real data:
    // {
    //   id: "tx-123",
    //   type: "Transaction executed",
    //   description: "Send 0.5 SOL to alice.sol",
    //   status: "executed",
    //   timestamp: "2 min ago",
    // },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            bgcolor: "#1C1C1E",
            borderRadius: 3,
            border: "1px solid #3A3A3C",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3)",
            color: "#FFFFFF",
            maxHeight: "70vh",
          },
        },
        backdrop: {
          sx: { bgcolor: "rgba(0, 0, 0, 0.7)" },
        },
      }}
    >
      <DialogContent sx={{ p: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2.5, borderBottom: "1px solid #2C2C2E", display: "flex", alignItems: "center", gap: 1.5 }}>
          <History sx={{ color: "#8E8E93" }} />
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
            Activity
          </Typography>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {activities.length === 0 ? (
            // Empty state (matching Safe style)
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 10,
                px: 4,
                textAlign: "center",
              }}
            >
              <HourglassEmpty sx={{ fontSize: 56, color: "#8E8E93", mb: 2 }} />
              <Typography sx={{ color: "#8E8E93", fontSize: "1rem", mb: 1 }}>
                No recent activity
              </Typography>
              <Typography sx={{ color: "#636366", fontSize: "0.875rem" }}>
                Transactions and vault activity will appear here
              </Typography>
            </Box>
          ) : (
            <List sx={{ py: 0 }}>
              {activities.map((activity, index) => (
                <ListItem
                  key={index}
                  sx={{
                    borderBottom: "1px solid #2C2C2E",
                    px: 3,
                    py: 2,
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: "rgba(255,255,255,0.08)", color: "#8E8E93" }}>
                      {activity.status === "executed" ? <CheckCircle /> : <HourglassEmpty />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={activity.type}
                    secondary={activity.description}
                    slotProps={{ primary: { sx: { fontWeight: 500 } } }}
                  />
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: "#8E8E93" }}>
                      {activity.timestamp}
                    </Typography>
                    <Chip
                      label={activity.status}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.7rem",
                        bgcolor: activity.status === "executed" ? "rgba(48, 209, 88, 0.15)" : "rgba(255, 204, 0, 0.15)",
                        color: activity.status === "executed" ? "#30D158" : "#FFCC00",
                      }}
                    />
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Footer (optional - can add "View all activity" link later) */}
        <Box sx={{ px: 3, py: 2, borderTop: "1px solid #2C2C2E", textAlign: "center" }}>
          <Typography
            variant="caption"
            sx={{ color: "#8E8E93", cursor: "pointer", "&:hover": { color: "#FFFFFF" } }}
            onClick={() => {
              onClose();
              // Future: navigate to full activity/transactions page
            }}
          >
            View full transaction history
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
