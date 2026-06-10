import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadMultisig } from '@/lib/squads';

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
    const multisigPda = new PublicKey(vaultAddress);
    const view = await loadMultisig(conn, multisigPda);

    return NextResponse.json({
      address: view.address.toBase58(),
      vault: view.vault.toBase58(),
      vaultIndex: view.vaultIndex,
      threshold: view.threshold,
      members: view.members.map((m) => ({
        pubkey: m.pubkey.toBase58(),
        permissions: m.permissions,
      })),
      transactionIndex: view.transactionIndex.toString(),
      staleTransactionIndex: view.staleTransactionIndex.toString(),
      vaultLamports: view.vaultLamports,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load multisig' },
      { status: 500 }
    );
  }
}
