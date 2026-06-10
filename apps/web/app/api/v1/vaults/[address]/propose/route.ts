import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys';
import { Connection, PublicKey } from '@solana/web3.js';
import { buildProposeSolTransfer, loadMultisig } from '@/lib/squads';

const HELIUS_RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const conn = new Connection(HELIUS_RPC, 'confirmed');

export async function POST(
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
    const body = await request.json();
    const { recipient, amountLamports, creator, memo } = body;

    if (!recipient || !amountLamports) {
      return NextResponse.json({ error: 'recipient and amountLamports are required' }, { status: 400 });
    }
    if (!creator) {
      return NextResponse.json({ error: 'creator (a multisig member pubkey) is required to sign the proposal creation' }, { status: 400 });
    }

    const multisigPda = new PublicKey(vaultAddress);
    const recipientPubkey = new PublicKey(recipient);
    const creatorPubkey = new PublicKey(creator);

    // Load on-chain state so we know the next transaction index and vault PDA
    const view = await loadMultisig(conn, multisigPda);

    // Verify creator is actually a member
    const isMember = view.members.some((m) => m.pubkey.equals(creatorPubkey));
    if (!isMember) {
      return NextResponse.json({ error: 'creator must be a member of this multisig' }, { status: 400 });
    }

    const { tx, transactionIndex } = await buildProposeSolTransfer({
      conn,
      multisigPda,
      view,
      creator: creatorPubkey,
      recipient: recipientPubkey,
      amountLamports: BigInt(amountLamports),
      memo,
    });

    const serializedTx = Buffer.from(tx.serialize()).toString('base64');

    return NextResponse.json({
      success: true,
      message: 'Proposal transaction built. Sign and submit with the creator member wallet. It will appear in the UI queue with 1 approval.',
      transactionIndex: transactionIndex.toString(),
      serializedTx,
      vault: vaultAddress,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create proposal' }, { status: 500 });
  }
}
