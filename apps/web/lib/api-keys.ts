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

export function validateApiKey(key: string): { valid: boolean; vaults: string[] } {
  const keys = loadKeys();
  const record = keys.find(k => k.key === key);
  if (!record) {
    return { valid: false, vaults: [] };
  }
  return { valid: true, vaults: record.vaults };
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
