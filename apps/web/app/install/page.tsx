"use client";
import { useState, useEffect } from "react";
import { Box, Typography, Button, Stack, Card, CardContent, Chip, Alert, IconButton } from "@mui/material";
import { Download, ContentCopy, CheckCircle, OpenInNew } from "@mui/icons-material";

const EXTENSION_URL = "/extension/redacted-multisig.zip";
const CHROME_EXT_URL = "chrome://extensions";

export default function InstallPage() {
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);

  // Detect if the extension has been installed by checking for the global it injects.
  // wallet-provider.js sets window.__redactedInjected = true at document_start.
  useEffect(() => {
    const check = () => {
      if (typeof window !== "undefined" && (window as any).__redactedInjected) {
        setExtensionDetected(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const id = setInterval(() => { if (check()) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = EXTENSION_URL;
    a.download = "redacted-multisig.zip";
    a.click();
    setDownloaded(true);
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(CHROME_EXT_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", py: 6, px: 3 }}>
      <Typography variant="h2" sx={{ mb: 1 }}>Install Redacted Multisig</Typography>
      <Typography variant="body1" sx={{ color: "text.secondary", mb: 4 }}>
        Connect your Squads multisig to any Solana dApp.
      </Typography>

      {extensionDetected ? (
        <Alert
          severity="success"
          icon={<CheckCircle />}
          sx={{ mb: 4, fontSize: 16 }}
        >
          <b>Extension installed.</b> You can close this tab and use Redacted on any Solana dApp.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 4 }}>
          The extension is pending Chrome Web Store review. In the meantime, install it directly in three steps below.
        </Alert>
      )}

      {/* 45-second walkthrough. Hides once they've started the download
          (downloaded=true), since by then they've seen what they need and
          the steps below are clear enough. Also hides immediately if the
          extension is already detected as installed. */}
      {!downloaded && !extensionDetected && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
            45-second walkthrough:
          </Typography>
          <Box
            component="video"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            poster=""
            sx={{
              width: "100%",
              maxWidth: 720,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              display: "block",
            }}
          >
            <source src="/extension/install-demo.webm" type="video/webm" />
            <source src="/extension/install-demo.mp4" type="video/mp4" />
            Your browser does not support embedded video.
          </Box>
        </Box>
      )}

      <Stack spacing={3}>
        {/* Step 1 */}
        <Card sx={{ border: downloaded ? "1px solid" : "none", borderColor: downloaded ? "success.main" : "transparent" }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Chip
                label="1"
                color={downloaded ? "success" : "primary"}
                sx={{ fontWeight: 700, fontSize: 18, width: 36, height: 36 }}
              />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ mb: 0.5 }}>
                  Download the extension {downloaded && <CheckCircle sx={{ fontSize: 18, verticalAlign: "middle", color: "success.main" }} />}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  16 KB zip. The file appears in your Downloads folder.
                </Typography>
              </Box>
              <Button
                variant={downloaded ? "outlined" : "contained"}
                size="large"
                startIcon={<Download />}
                onClick={handleDownload}
              >
                {downloaded ? "Download again" : "Download"}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardContent>
            <Stack direction="row" alignItems="flex-start" spacing={2}>
              <Chip label="2" color="primary" sx={{ fontWeight: 700, fontSize: 18, width: 36, height: 36 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ mb: 1 }}>
                  Unzip the file
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Double-click <code>redacted-multisig.zip</code> in your Downloads folder.
                  This creates a folder called <code>redacted-multisig</code> with the extension files inside.
                  On macOS this happens automatically. On Windows, right-click and choose &quot;Extract All&quot;.
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card>
          <CardContent>
            <Stack direction="row" alignItems="flex-start" spacing={2}>
              <Chip label="3" color="primary" sx={{ fontWeight: 700, fontSize: 18, width: 36, height: 36 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ mb: 1 }}>
                  Open Chrome&apos;s extensions page and drag the folder in
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                  Chrome blocks websites from opening <code>chrome://extensions</code> directly (security policy).
                  Copy the URL below, paste it into a new tab&apos;s address bar, then drag the unzipped folder onto that page.
                </Typography>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  {/* Click anywhere on the URL to copy. We can't make it a real link —
                      Chrome blocks web pages from navigating to chrome://* URLs. */}
                  <Box
                    onClick={handleCopyUrl}
                    sx={{
                      flex: 1,
                      bgcolor: copied ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                      border: "1px solid",
                      borderColor: copied ? "success.main" : "divider",
                      borderRadius: 1,
                      px: 2,
                      py: 1,
                      fontFamily: "monospace",
                      fontSize: 14,
                      cursor: "pointer",
                      color: copied ? "success.main" : "primary.main",
                      textDecoration: "underline",
                      textDecorationStyle: "dotted",
                      transition: "all 120ms ease",
                      "&:hover": {
                        bgcolor: "rgba(255,255,255,0.10)",
                        borderColor: "primary.main",
                      },
                      userSelect: "none",
                    }}
                    title="Click to copy"
                  >
                    {copied ? "✓ Copied — paste into a new tab's address bar" : CHROME_EXT_URL}
                  </Box>
                  <Button
                    variant={copied ? "contained" : "outlined"}
                    color={copied ? "success" : "primary"}
                    startIcon={copied ? <CheckCircle /> : <ContentCopy />}
                    onClick={handleCopyUrl}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </Stack>

                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Once you&apos;re on <code>chrome://extensions</code>:
                </Typography>
                <ol style={{ marginTop: 4, paddingLeft: 20, color: "var(--mui-palette-text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
                  <li>Toggle <b>Developer mode</b> on (top-right of the page)</li>
                  <li>Click <b>Load unpacked</b> (top-left), OR just drag the unzipped folder onto the page</li>
                  <li>Done — &quot;Redacted Multisig&quot; appears in your toolbar</li>
                </ol>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Aftercare */}
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
            After install:
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<OpenInNew />}
              href="https://jup.ag"
              target="_blank"
            >
              Test on Jupiter
            </Button>
            <Button
              variant="outlined"
              startIcon={<OpenInNew />}
              href="/privacy"
              target="_blank"
            >
              Privacy policy
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
