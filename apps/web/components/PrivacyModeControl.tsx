"use client";

// The privacy toggle. Two states, one switch:
//   Private  → Light Protocol (Helius-aligned: cheap + fast via ZK compression;
//              full shielding rolling out with Helius's encrypted-payments layer)
//   Public   → standard Squads vault (amounts + transfers visible on-chain)
//
// Controlled: parent owns the selected backend id (null = public, the Light id =
// private). Used identically on Assets rows and the Swap flow.

import { Box, Switch, Chip, Tooltip } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpen";

export const PRIVATE_BACKEND_ID = "light-compressed"; // Light
export const PUBLIC_BACKEND_ID = null; // Squads (public)

const PRIVATE_TIP = "Private — routed via Light Protocol (ZK-compressed: cheaper & faster). Full shielding rolls out with Helius.";
const PUBLIC_TIP = "Public — standard Squads vault. Amounts and transfers are visible on-chain.";

export default function PrivacyModeControl({
  value, onChange, size = "small",
}: {
  value: string | null;                 // null = public, PRIVATE_BACKEND_ID = private
  onChange: (id: string | null) => void;
  size?: "small" | "medium";
}) {
  const on = value !== null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, justifyContent: "flex-end" }}>
      <Tooltip title={on ? PRIVATE_TIP : PUBLIC_TIP} arrow>
        <Chip
          size={size}
          icon={on ? <ShieldOutlinedIcon /> : <LockOpenIcon />}
          label={on ? "Private" : "Public"}
          color={on ? "success" : "default"}
          variant={on ? "filled" : "outlined"}
          sx={{ fontWeight: 600, color: on ? undefined : "text.secondary" }}
        />
      </Tooltip>
      <Switch
        size={size} checked={on}
        onChange={(e) => onChange(e.target.checked ? PRIVATE_BACKEND_ID : PUBLIC_BACKEND_ID)}
        slotProps={{ input: { "aria-label": "Toggle private / public" } }}
      />
    </Box>
  );
}
