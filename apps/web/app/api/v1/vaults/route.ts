import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const { valid, vaults } = validateApiKey(apiKey);

  if (!valid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  return NextResponse.json({ vaults });
}
