import type { Metadata } from "next";
import { Providers } from "./providers";
import { Shell } from "@/components/Shell";

const SITE_URL = "https://redacted-usd.xyz";
const TITLE = "Redacted USD — Private multisig vaults on Solana";
const DESCRIPTION =
  "Non-custodial Squads multisig with one-tap private transactions via Umbra (Arcium shielded balances). Open source, self-hostable, no tracking.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Redacted USD",
  authors: [{ name: "Redacted USD" }],
  keywords: [
    "Solana",
    "multisig",
    "Squads",
    "vault",
    "privacy",
    "Umbra",
    "Arcium",
    "non-custodial",
    "DeFi",
  ],
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-128.png", sizes: "128x128", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Redacted USD",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/icon-128.png",
        width: 128,
        height: 128,
        alt: "Redacted USD",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icon-128.png"],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
