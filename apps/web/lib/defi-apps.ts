export type DefiApp = {
  name: string;
  desc: string;
  tags: string[];
  url: string;
  logo?: string; // direct URL to logo (PNG/SVG preferred)
  // Which kinds of positions this app can contribute to the DeFi Positions tab
  positionTypes?: Array<'LP' | 'Perp' | 'Lending' | 'Borrow' | 'Prediction' | 'Staking'>;
};

export const DEFI_APPS: DefiApp[] = [
  {
    name: "Jupiter",
    desc: "Best-execution swap aggregator across Solana DEXs.",
    tags: ["DEX", "Aggregator"],
    url: "https://jup.ag",
    logo: "https://jup.ag/svg/jupiter-logo.svg",
    positionTypes: ["Perp"],
  },
  {
    name: "Kamino",
    desc: "Concentrated liquidity vaults and lending markets.",
    tags: ["Yield", "Lending"],
    url: "https://kamino.finance",
    logo: "https://d392zik6ho62y0.cloudfront.net/images/kamino-finance-logo.png",
    positionTypes: ["LP", "Lending"],
  },
  {
    name: "Project 0",
    desc: "Decentralized lending and yield on Solana (formerly Marginfi).",
    tags: ["Lending"],
    url: "https://marginfi.com",
    logo: "https://mma.prnewswire.com/media/2794241/Project_0_logo_Logo.jpg",
    positionTypes: ["Lending", "Borrow"],
  },
  {
    name: "Drift",
    desc: "Perpetual futures and spot trading.",
    tags: ["Perps", "DEX"],
    url: "https://drift.trade",
    logo: "https://api.phantom.app/image-proxy/?image=https://phantom-portal20240925173430423400000001.s3.ca-central-1.amazonaws.com/icons/e9ecfb2e-89d3-41b8-aa41-267da215ce85.png&anim=true",
    positionTypes: ["Perp"],
  },
  {
    name: "Orca",
    desc: "Concentrated liquidity AMM.",
    tags: ["DEX"],
    url: "https://orca.so",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
    positionTypes: ["LP"],
  },
  {
    name: "Meteora",
    desc: "Dynamic liquidity pools and vaults.",
    tags: ["DEX", "Yield"],
    url: "https://meteora.ag",
    logo: "https://assets.meteora.ag/met-token.svg",
    positionTypes: ["LP"],
  },
  {
    name: "Raydium",
    desc: "AMM and concentrated liquidity DEX.",
    tags: ["DEX"],
    url: "https://raydium.io",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
    positionTypes: ["LP"],
  },
  {
    name: "Marinade",
    desc: "Liquid staking for SOL.",
    tags: ["Staking"],
    url: "https://marinade.finance",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey/logo.png",
    positionTypes: ["Staking"],
  },
  {
    name: "Save",
    desc: "Leading lending protocol on Solana (formerly Solend).",
    tags: ["Lending"],
    url: "https://save.finance",
    logo: "/logos/save.svg",
    positionTypes: ["Lending", "Borrow"],
  },
  {
    name: "Sanctum",
    desc: "Liquid staking infrastructure and LST aggregator.",
    tags: ["Staking", "Yield"],
    url: "https://sanctum.so",
    logo: "https://files.swissborg.com/product/wealth-app/assets/ic_crypto_cloud.png",
    positionTypes: ["Staking"],
  },
  {
    name: "Jito",
    desc: "MEV-enhanced staking and liquid staking.",
    tags: ["Staking"],
    url: "https://jito.wtf",
    logo: "https://metadata.jito.network/token/jto/image",
    positionTypes: ["Staking"],
  },
  {
    name: "Lulo",
    desc: "Automated yield optimization across lending markets.",
    tags: ["Lending", "Yield"],
    url: "https://lulo.fi",
    logo: "/logos/lulo.svg",
    positionTypes: ["Lending"],
  },
];

// Helper to get apps that can produce DeFi positions (used on Assets page)
export function getDeFiPositionApps() {
  return DEFI_APPS.filter((app) => app.positionTypes && app.positionTypes.length > 0);
}
