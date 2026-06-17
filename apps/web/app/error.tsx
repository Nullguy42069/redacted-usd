"use client";

// App-router error boundary. Catches render/runtime errors in any route segment
// and shows a recoverable card instead of a blank/broken page. (A true browser
// renderer crash — e.g. OOM — can't be caught by JS; this handles everything
// else, and surfaces the message so issues are diagnosable.)
import { useEffect } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <Box sx={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
      <Box sx={{ maxWidth: 460, textAlign: "center" }}>
        <Typography variant="h3" sx={{ mb: 1 }}>Something went wrong</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          This page hit an error and stopped. Your funds are safe — nothing was signed.
        </Typography>
        {error?.message && (
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mb: 2, fontFamily: "monospace", wordBreak: "break-word" }}>
            {error.message}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ justifyContent: "center" }}>
          <Button variant="contained" onClick={() => reset()}>Try again</Button>
          <Button variant="outlined" onClick={() => { window.location.href = "/"; }}>Go home</Button>
        </Stack>
      </Box>
    </Box>
  );
}
