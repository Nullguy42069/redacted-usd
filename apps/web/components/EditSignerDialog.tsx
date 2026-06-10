"use client";
import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Stack, Avatar, Typography, Box,
} from "@mui/material";
import { getSigner, updateSigner } from "@/lib/signer-store";
import { shortAddress } from "@/lib/squads";

type Props = {
  open: boolean;
  onClose: () => void;
  pubkey: string;
  onSaved?: () => void;
};

export function EditSignerDialog({ open, onClose, pubkey, onSaved }: Props) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const cur = getSigner(pubkey);
    setName(cur.name || "");
    setAvatar(cur.avatar);
  }, [open, pubkey]);

  const handleSave = () => {
    updateSigner(pubkey, {
      name: name.trim() || undefined,
      avatar: avatar || undefined,
    });
    onSaved?.();
    onClose();
  };

  const handleFile = async (file: File) => {
    const resized = await resizeImage(file, 256);
    setAvatar(resized);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Customize signer</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1, alignItems: "center" }}>
          <Avatar
            src={avatar}
            sx={{ width: 80, height: 80, fontSize: 28, bgcolor: "secondary.main", opacity: avatar ? 1 : 0.6 }}
          >
            {(name || pubkey)[0]?.toUpperCase()}
          </Avatar>
          <Box>
            <Button variant="outlined" component="label" size="small" sx={{ mr: 1 }}>
              Upload image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </Button>
            {avatar && (
              <Button size="small" color="error" onClick={() => setAvatar(undefined)}>
                Remove
              </Button>
            )}
          </Box>

          <TextField
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder="e.g. Joe's primary, Alice cold, Treasury bot"
            helperText="Saved in your browser only. Other signers won't see your nickname."
          />

          <Typography variant="caption" sx={{ color: "text.secondary", alignSelf: "flex-start" }}>
            <strong>Address:</strong> <code style={{ wordBreak: "break-all" }}>{pubkey}</code>
            <br />
            <strong>Short:</strong> <code>{shortAddress(pubkey, 8, 8)}</code>
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

async function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
