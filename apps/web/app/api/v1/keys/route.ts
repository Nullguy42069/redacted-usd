import { NextRequest, NextResponse } from 'next/server';
import { generateApiKey, listApiKeys, revokeApiKey } from '@/lib/api-keys';

// SECURITY (2026-06-10 audit): this route mints/lists/revokes API keys and was
// previously UNAUTHENTICATED — anyone could POST to mint a key for an arbitrary
// vault, GET to read every key's cleartext secret, and DELETE to revoke.
// It is now fail-closed behind a server-side admin token. If REDACTED_ADMIN_TOKEN
// is not set, the route is disabled (503). GET never returns secret material.
//
// NOTE: the admin UI at app/api/page.tsx must send `Authorization: Bearer <token>`
// for these calls to work. Longer-term fix tracked in the audit: drop server-side
// stored key secrets entirely in favor of wallet-signed API requests.
function requireAdmin(request: NextRequest): NextResponse | null {
  const expected = process.env.REDACTED_ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'Key management is disabled (REDACTED_ADMIN_TOKEN not configured)' },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  // Return metadata only — never the secret key material.
  return NextResponse.json({ keys: listApiKeys() });
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const { vaults, label } = body;

    if (!Array.isArray(vaults) || vaults.length === 0) {
      return NextResponse.json({ error: 'vaults array is required' }, { status: 400 });
    }

    const key = generateApiKey(vaults, label);
    // The secret is returned exactly once, at creation time, to the admin caller.
    return NextResponse.json({ key, vaults, label });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'key parameter is required' }, { status: 400 });
    }

    const success = revokeApiKey(key);
    return NextResponse.json({ success });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });
  }
}
