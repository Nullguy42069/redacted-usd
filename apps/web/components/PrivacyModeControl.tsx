"use client";

// The privacy toggle. Two states, one switch:
//   Private  → Umbra (Arcium shielded balances): amount + balance hidden,
//              sender/graph unlinkable.
//   Public   → standard Squads vault (amounts + transfers visible on-chain)
//
// Controlled: parent owns the selected backend id (null = public, the Umbra id =
// private). Used on Assets rows. The parent MUST pass `disabled` when no shield
// backend is live (privacy-protocols.hasLiveShield() === false) so the toggle
// can never route a transfer through an unverified/gated shield path.

import { Box, Switch, Chip, Tooltip } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpen";

export const PRIVATE_BACKEND_ID = "umbra"; // Umbra (Arcium shielded balances)
export const PUBLIC_BACKEND_ID = null; // Squads (public)

const PRIVATE_TIP = "Private — shielded via Umbra (Arcium): amount + balance hidden, sender unlinkable.";
const PUBLIC_TIP = "Public — amounts and transfers are visible on-chain.";
const DISABLED_TIP = "Private shielding is not available yet — coming once the Umbra path is verified.";

export default function PrivacyModeControl({
  value, onChange, size = "small", disabled = false,
}: {
  value: string | null;                 // null = public, PRIVATE_BACKEND_ID = private
  onChange: (id: string | null) => void;
  size?: "small" | "medium";
  disabled?: boolean;                   // true = no live shield backend; force public
}) {
  const on = value !== null && !disabled;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, justifyContent: "flex-end" }}>
      <Tooltip title={disabled ? DISABLED_TIP : on ? PRIVATE_TIP : PUBLIC_TIP} arrow>
        <Chip
          size={size}
          icon={on ? <ShieldOutlinedIcon /> : <LockOpenIcon />}
          label={on ? "Private" : "Public"}
          color={on ? "success" : "default"}
          variant={on ? "filled" : "outlined"}
          sx={{ fontWeight: 600, color: on ? undefined : "text.secondary", opacity: disabled ? 0.5 : 1 }}
        />
      </Tooltip>
      <Switch
        size={size} checked={on} disabled={disabled}
        onChange={(e) => onChange(e.target.checked ? PRIVATE_BACKEND_ID : PUBLIC_BACKEND_ID)}
        slotProps={{ input: { "aria-label": "Toggle private / public" } }}
      />
    </Box>
  );
}
