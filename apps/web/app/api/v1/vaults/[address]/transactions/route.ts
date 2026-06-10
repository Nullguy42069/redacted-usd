import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadMultisig, loadTransactions, type TxRow } from '@/lib/squads';

const HELIUS_RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const conn = new Connection(HELIUS_RPC, 'confirmed');

function serializeTxRow(row: TxRow) {
  return {
    index: row.index.toString(),
    proposalPda: row.proposalPda.toBase58(),
    transactionPda: row.transactionPda.toBase58(),
    kind: row.kind,
    status: row.status,
    approvals: row.approvals.map((p) => p.toBase58()),
    rejections: row.rejections.map((p) => p.toBase58()),
    cancellations: row.cancellations.map((p) => p.toBase58()),
    createdAt: row.createdAt,
  };
}

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
    const rows = await loadTransactions(conn, multisigPda, view);

    return NextResponse.json({
      vault: vaultAddress,
      transactions: rows.map(serializeTxRow),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load transactions' },
      { status: 500 }
    );
  }
}
