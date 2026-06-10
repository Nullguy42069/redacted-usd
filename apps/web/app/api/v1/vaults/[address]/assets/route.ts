import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadAssets } from '@/lib/assets';

const HELIUS_RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const conn = new Connection(HELIUS_RPC, 'confirmed');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const { valid, vaults } = validateApiKey(apiKey);

  if (!valid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const { address: vaultAddress } = await params;

  if (!vaults.includes(vaultAddress)) {
    return NextResponse.json({ error: 'API key does not have access to this vault' }, { status: 403 });
  }

  try {
    const publicKey = new PublicKey(vaultAddress);
    const assets = await loadAssets(conn, publicKey);

    return NextResponse.json({
      vault: vaultAddress,
      assets: assets.map(a => ({
        mint: a.mint,
        symbol: a.symbol,
        amount: a.amount,
        priceUsd: a.priceUsd,
        valueUsd: a.valueUsd,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 });
  }
}
