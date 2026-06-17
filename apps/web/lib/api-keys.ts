import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), '.data');
const KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');

interface ApiKeyRecord {
  key: string;
  vaults: string[]; // array of multisig addresses this key can access
  createdAt: string;
  label?: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadKeys(): ApiKeyRecord[] {
  ensureDataDir();
  if (!fs.existsSync(KEYS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(raw) as ApiKeyRecord[];
  } catch {
    return [];
  }
}

function saveKeys(keys: ApiKeyRecord[]) {
  ensureDataDir();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

export function generateApiKey(vaultAddresses: string[], label?: string): string {
  const key = 'rdu_' + crypto.randomBytes(32).toString('hex');
  const keys = loadKeys();

  keys.push({
    key,
    vaults: vaultAddresses,
    createdAt: new Date().toISOString(),
    label,
  });

  saveKeys(keys);
  return key;
}

// Constant-time string compare — avoids leaking how many leading characters of a
// candidate key match via response-timing. (A `===` short-circuits on first
// mismatch.) crypto.timingSafeEqual requires equal-length buffers, so we length-
// gate first; key length itself isn't the secret (fixed format: rdu_ + 64 hex).
function timingSafeStrEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function validateApiKey(key: string): { valid: boolean; vaults: string[] } {
  if (!key) return { valid: false, vaults: [] };
  const keys = loadKeys();
  // Scan ALL records (no early break) and compare each in constant time, so the
  // total work doesn't depend on which key (if any) matched.
  let match: ApiKeyRecord | null = null;
  for (const record of keys) {
    if (timingSafeStrEqual(record.key, key)) match = record;
  }
  if (!match) return { valid: false, vaults: [] };
  return { valid: true, vaults: match.vaults };
}

export function revokeApiKey(key: string): boolean {
  const keys = loadKeys();
  const filtered = keys.filter(k => k.key !== key);
  if (filtered.length === keys.length) return false;
  saveKeys(filtered);
  return true;
}

export function listApiKeys(): Omit<ApiKeyRecord, 'key'>[] {
  return loadKeys().map(({ key, ...rest }) => rest);
}

// REMOVED 2026-06-10 (security audit): this function returned cleartext key
// secrets. It is no longer exported. Use listApiKeys() for metadata-only listing.
// If you need a key value, you must hold it from the one-shot return at creation.
